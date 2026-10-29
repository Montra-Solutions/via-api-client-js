import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import MontraAPI from '../index.js';

const JWT = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJmbi10ZXN0In0.c2lnbmF0dXJl';
const tokenOk = { status: 201, body: { token: { access_token: JWT, expires_in: 86400, token_type: 'Bearer' } } };

// A stand-in Via API: /auth/token answers from a scripted queue, any other path echoes the request.
function startApi() {
    const api = { tokenReplies: [], tokenCalls: 0, requests: [] };
    api.server = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk) => (raw += chunk));
        req.on('end', () => {
            if (req.url === '/auth/token') {
                api.tokenCalls++;
                const reply = api.tokenReplies.shift() || tokenOk;
                if (reply === 'hang') return;
                res.writeHead(reply.status, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify(reply.body ?? {}));
            }
            api.requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: raw });
            if (req.url.startsWith('/forbidden')) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ statusCode: 403, path: req.url }));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ TotalRecords: 1, Results: [{ id: 7 }] }));
        });
    });
    return new Promise((resolve) => {
        api.server.listen(0, '127.0.0.1', () => {
            api.url = `http://127.0.0.1:${api.server.address().port}`;
            resolve(api);
        });
    });
}

const client = (api, options = {}) => new MontraAPI(api.url, 'aa11:bb22', { tokenRetryDelayMs: 1, ...options });

describe('MontraAPI token handling', () => {
    let api;

    beforeEach(async (t) => {
        t.mock.method(console, 'warn', () => {});
        t.mock.method(console, 'error', () => {});
        api = await startApi();
    });

    afterEach(() => {
        api.server.closeAllConnections();
        api.server.close();
    });

    it('sends the request with the issued token and returns the response body as-is', async () => {
        const result = await client(api).post('/integration/feed/onboard/sync', { a: 1 }, { tenantId: 5 });

        assert.deepEqual(result, { TotalRecords: 1, Results: [{ id: 7 }] });
        assert.equal(api.tokenCalls, 1);
        assert.deepEqual(api.requests, [
            {
                method: 'POST',
                url: '/integration/feed/onboard/sync?tenantId=5',
                authorization: `Bearer ${JWT}`,
                body: '{"a":1}',
            },
        ]);
    });

    it('retries a 503 from /auth/token and then succeeds', async () => {
        api.tokenReplies.push({ status: 503 }, { status: 503 });

        const result = await client(api).get('/core/thing');

        assert.deepEqual(result, { TotalRecords: 1, Results: [{ id: 7 }] });
        assert.equal(api.tokenCalls, 3);
        assert.equal(api.requests[0].authorization, `Bearer ${JWT}`);
    });

    it('gives up after the configured retries and does not send the request', async () => {
        api.tokenReplies.push(...Array(10).fill({ status: 503 }));

        const result = await client(api, { tokenRetries: 2 }).get('/core/thing');

        assert.equal(api.tokenCalls, 3);
        assert.equal(api.requests.length, 0);
        assert.deepEqual(result, {
            TotalRecords: 0,
            Result: [],
            ResponseCode: 503,
            Status: 'Error',
            Error: 'Montra auth token unavailable: Request failed with status code 503',
        });
    });

    it('does not retry a 401 (bad hash) and reports it as a 401', async () => {
        api.tokenReplies.push({ status: 401, body: { statusCode: 401, errorCode: 'M2M_HASH_INVALID' } });

        const result = await client(api).get('/core/thing');

        assert.equal(api.tokenCalls, 1);
        assert.equal(api.requests.length, 0);
        assert.equal(result.ResponseCode, 401);
        assert.equal(result.Status, 'Error');
    });

    it('retries the placeholder tokens older API builds answered with 201', async () => {
        api.tokenReplies.push(
            { status: 201, body: { token: '' } },
            { status: 201, body: { token: { access_token: 'ftw\u0000ÿjunk', expires_in: 86400 } } },
        );

        const result = await client(api).get('/core/thing');

        assert.equal(api.tokenCalls, 3);
        assert.equal(result.TotalRecords, 1);
        assert.equal(api.requests[0].authorization, `Bearer ${JWT}`);
    });

    it('retries a token request that times out', async () => {
        api.tokenReplies.push('hang');

        const result = await client(api, { tokenTimeoutMs: 50 }).get('/core/thing');

        assert.equal(api.tokenCalls, 2);
        assert.equal(result.TotalRecords, 1);
    });

    it('retries when the API cannot be reached, then reports 503', async () => {
        const closed = await startApi();
        closed.server.close();
        const warn = console.warn;

        const result = await client(closed, { tokenRetries: 2 }).get('/core/thing');

        assert.equal(warn.mock.callCount(), 2);
        assert.equal(result.ResponseCode, 503);
        assert.match(result.Error, /^Montra auth token unavailable: /);
    });

    it('falls back to the defaults for unset, blank or invalid options', () => {
        const defaults = { tokenRetries: 3, tokenRetryDelayMs: 1000, tokenTimeoutMs: 10000 };
        const odd = { tokenRetries: undefined, tokenRetryDelayMs: '', tokenTimeoutMs: 'abc' };

        assert.deepEqual(new MontraAPI(api.url, 'h', odd).options, defaults);
        assert.deepEqual(new MontraAPI(api.url, 'h', { tokenRetries: null, tokenRetryDelayMs: -1 }).options, defaults);
        assert.deepEqual(new MontraAPI(api.url, 'h', { tokenRetries: Infinity }).options, defaults);
        assert.deepEqual(new MontraAPI(api.url, 'h', null).options, defaults);
        assert.equal(new MontraAPI(api.url, 'h', { tokenRetries: '1' }).options.tokenRetries, 1);
    });

    it('still stops retrying when tokenRetries is passed as undefined', async () => {
        api.tokenReplies.push(...Array(10).fill({ status: 503 }));

        const result = await client(api, { tokenRetries: undefined }).get('/core/thing');

        assert.equal(api.tokenCalls, 4);
        assert.equal(result.ResponseCode, 503);
    });

    it('keeps the bearer token out of a failed request envelope and its log', async () => {
        const error = console.error;

        const result = await client(api).post('/forbidden', { a: 1 });

        assert.deepEqual(result.Error, { status: 403, statusText: 'Forbidden', data: { statusCode: 403, path: '/forbidden' } });
        assert.equal(result.Status, 'Error');
        assert.ok(!JSON.stringify(result).includes(JWT));
        assert.equal(error.mock.callCount(), 1);
        assert.ok(!JSON.stringify(error.mock.calls[0].arguments).includes(JWT));
    });

    it('keeps captureAuthToken returning a token, or an empty string on failure', async () => {
        assert.equal(await client(api).captureAuthToken(), JWT);
        api.tokenReplies.push({ status: 401 });
        assert.equal(await client(api).captureAuthToken(), '');
    });
});
