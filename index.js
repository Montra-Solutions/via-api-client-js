import axios from "axios";

// Network failures worth retrying: a dropped connection, the API restarting, a timeout, a DNS blip.
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN'];

// A real access token is a JWT. Older API builds answered a failed /auth/token with 201 and an
// empty or random `ftw…` token, so anything else is treated as a failed (retryable) request.
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]*$/;

class MontraTokenError extends Error {
    constructor(message, status, retryable) {
        super(message);
        this.name = 'MontraTokenError';
        this.status = status;
        this.retryable = retryable;
    }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Options are often wired from scenario data, so an unset, blank or non-numeric value (which
// would otherwise make the retry loop endless) falls back to the default.
const toOption = (value, fallback) => {
    const n = value === undefined || value === null || value === '' ? NaN : Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// The parts of a failed response worth returning; axios's `config` and `request` carry the bearer token.
const safeErrorDetails = (error) =>
    error.response
        ? { status: error.response.status, statusText: error.response.statusText, data: error.response.data }
        : error.message;

class MontraAPI {
    constructor(apiUrl, tokenHash, options = {}) {
        this.env = {
            api: {
                url: apiUrl || 'https://via-api.montra.io', // Default API URL
                tokenHash: tokenHash || null, // Default token hash
            },
        };
        this.options = {
            tokenRetries: toOption(options?.tokenRetries, 3), // Retries after the first attempt, for 5xx and network failures only
            tokenRetryDelayMs: toOption(options?.tokenRetryDelayMs, 1000), // Doubles on each retry: 1s, 2s, 4s
            tokenTimeoutMs: toOption(options?.tokenTimeoutMs, 10000), // Per attempt
        };
    }

    // Function to capture auth token; returns '' when no token could be issued
    async captureAuthToken() {
        try {
            return await this.fetchAuthToken();
        } catch (err) {
            return '';
        }
    }

    // Fetch an access token, retrying 5xx and network failures with backoff. Never retries a 401
    // (a bad hash will not fix itself). Throws a MontraTokenError when no token could be issued.
    async fetchAuthToken() {
        const { tokenRetries, tokenRetryDelayMs } = this.options;
        for (let attempt = 0; ; attempt++) {
            try {
                return await this.requestAuthToken();
            } catch (err) {
                if (!err.retryable || attempt >= tokenRetries) {
                    console.error('Error with Montra Auth Token request:', err.message);
                    throw err;
                }
                console.warn(`Montra Auth Token request failed (attempt ${attempt + 1}), retrying:`, err.message);
                await sleep(tokenRetryDelayMs * 2 ** attempt);
            }
        }
    }

    async requestAuthToken() {
        const auth = { hash: this.env.api.tokenHash, email: 'via@montra.io' };
        let response;
        try {
            response = await axios.post(`${this.env.api.url}/auth/token`, auth, { timeout: this.options.tokenTimeoutMs });
        } catch (err) {
            const status = err.response?.status;
            const retryable = status ? status >= 500 : RETRYABLE_ERROR_CODES.includes(err.code);
            throw new MontraTokenError(err.message, status || 503, retryable);
        }
        const accessToken = response?.data?.token?.access_token;
        if (typeof accessToken !== 'string' || !JWT_SHAPE.test(accessToken)) {
            throw new MontraTokenError('Montra auth token response had no usable access_token', 503, true);
        }
        return accessToken;
    }

    // Helper function to handle requests with authorization
    async montraRequest(config) {
        let access_token;
        try {
            access_token = await this.fetchAuthToken();
        } catch (err) {
            // Sending the request without a token only earns a misleading 403; report the token failure instead.
            return {
                TotalRecords: 0,
                Result: [],
                ResponseCode: err.status || 503,
                Status: 'Error',
                Error: `Montra auth token unavailable: ${err.message}`,
            };
        }
        try {
            config.baseURL = this.env.api.url;
            config.headers = { Authorization: `Bearer ${access_token}` };
            config.responseType = 'json';

            const response = await axios.request(config);
            return response.data;
        } catch (error) {
            const details = safeErrorDetails(error);
            console.error(`Montra API request failed: ${config.method} ${config.url}`, details);
            return {
                TotalRecords: 0,
                Result: [],
                ResponseCode: 400,
                Status: 'Error',
                Error: details,
            };
        }
    }

    // GET request
    async get(url, params) {
        const config = {
            url: url,
            method: 'GET',
            params: params || {},
        };
        return this.montraRequest(config);
    }

  // POST request
  async post(url, data, params = {}, config = {}) {
      config = {
          ...config,
          url: url,
          method: 'post',
          data: data, // Body data (JSON payload)
          params: params, // Query parameters
      };
  
      return this.montraRequest(config);
  }

    // PUT request
    async put(url, data, config) {
        if (!config) {
            config = {
                url: url,
                method: 'put',
                data: data,
            };
        }
        return this.montraRequest(config);
    }

    // Optionally, allow setting API URL and token hash dynamically
    setApiUrl(apiUrl) {
        this.env.api.url = apiUrl;
    }

    setTokenHash(tokenHash) {
        this.env.api.tokenHash = tokenHash;
    }
}

export default MontraAPI;
