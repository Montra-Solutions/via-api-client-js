import axios from "axios";

class MontraAPI {
    constructor(apiUrl, tokenHash) {
        this.env = {
            api: {
                url: apiUrl || 'https://via-api.montra.io', // Default API URL
                tokenHash: tokenHash || null, // Default token hash
            },
        };
    }

    // Function to capture auth token
    async captureAuthToken() {
        try {
            const auth = { hash: this.env.api.tokenHash, email: 'via@montra.io' };
            const response = await axios.post(`${this.env.api.url}/auth/token`, auth);
            const token = response?.data?.token;
            return token?.access_token;
        } catch (err) {
            console.error('Error with Montra Auth Token request:', err?.message);
            return '';
        }
    }

    // Helper function to handle requests with authorization
    async montraRequest(config) {
        try {
            const access_token = await this.captureAuthToken();
            config.baseURL = this.env.api.url;
            config.headers = { Authorization: `Bearer ${access_token}` };
            config.responseType = 'json';

            const response = await axios.request(config);
            return response.data;
        } catch (error) {
            console.error(error);
            return {
                TotalRecords: 0,
                Result: [],
                ResponseCode: 400,
                Status: 'Error',
                Error: error.response || error.message,
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
