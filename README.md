# via-api-client-js
API Wrapper for Montra Via SaaS Application

#### @trash-bandits/via-api-client

The via-api-client is an API client for interacting with the Montra API. It allows you to easily make authenticated API requests using Axios under the hood. This package supports GET, POST, and PUT requests with both query parameters and JSON data in the request body.

### Installation
You can install the package using npm:

```
npm install @trash-bandits/via-api-client
```

### Usage
Here’s a sample usage of the via-api-client package in your project:

```javascript
import MontraAPI from '@trash-bandits/via-api-client';

const apiClient = new MontraAPI(
  '<base-API-URL>', // Replace with the actual base API URL
  '<tokenHash>' // Replace with your API token hash
);

// Example POST request with <Body Payload> and  in the body
const bodyPayload = <Body Payload here>; // Replace with your actual body payload

apiClient.post('/integration/feed/onboard/import', bodyPayload, {})
  .then((response) => {
    console.log('Response:', response);
  })
  .catch((error) => {
    console.error('Error:', error);
  });
```

### API Methods
The via-api-client provides methods for making GET, POST, and PUT requests.

#### `MontraAPI(apiUrl, tokenHash, options = {})`
- `apiUrl`: The base URL of the API (replace `<base-API-URL>` with your API URL).
- `tokenHash`: The token hash used for authentication (replace `<tokenHash>` with your actual token hash).
- `options` (optional): how the auth token request is retried.
  - `tokenRetries` (default `3`): retries after the first attempt.
  - `tokenRetryDelayMs` (default `1000`): delay before the first retry; it doubles on each retry (1s, 2s, 4s).
  - `tokenTimeoutMs` (default `10000`): timeout for each token attempt.
  - An unset, blank, negative or non-numeric value falls back to the default; numeric strings such as `'2'` are accepted.

#### Auth token failures
Every request first fetches a token from `/auth/token`. A 5xx, a timeout or a network error is retried with backoff; a 401 (a missing, unknown or expired hash) is not. If no token can be issued, the request is **not sent** and the method resolves with:

```javascript
{ TotalRecords: 0, Result: [], ResponseCode: 401 | 503, Status: 'Error', Error: 'Montra auth token unavailable: …' }
```

Methods still resolve rather than reject, so check `Status`/`ResponseCode` to detect a failure.

When the request itself fails, `Error` is `{ status, statusText, data }` from the API's response (or the error message when there was no response). The request's headers, including the bearer token, are never returned or logged.

#### `post(url, data, params = {})`
- `url`: The API endpoint (relative to the base URL).
- `data`: The body payload to be sent in the request body (replace `<Body Payload>` with your actual payload).
- `params`: Optional query parameters to be appended to the URL.

#### `get(url, params = {})`
- `url`: The API endpoint (relative to the base URL).
- `params`: Optional query parameters to be appended to the URL.

#### `put(url, data, params = {})`
- `url`: The API endpoint (relative to the base URL).
- `data`: The body payload to be sent in the request body (replace `<Body Payload>` with your actual payload).
- `params`: Optional query parameters to be appended to the URL.
