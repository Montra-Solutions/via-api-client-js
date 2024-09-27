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

#### `MontraAPI(apiUrl, tokenHash)`
- `apiUrl`: The base URL of the API (replace `<base-API-URL>` with your API URL).
- `tokenHash`: The token hash used for authentication (replace `<tokenHash>` with your actual token hash).

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
