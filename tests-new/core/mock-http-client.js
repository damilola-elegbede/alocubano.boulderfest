/**
 * Mock HTTP Client for CI Testing
 * Intercepts HTTP requests and returns mock responses
 */
import { mockServer } from './mock-server.js';

class MockHttpClient {
  constructor() {
    this.baseUrl = null;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Integration-Test-Client'
    };
  }

  initialize() {
    if (!mockServer.isServerRunning()) {
      throw new Error('Mock server not running. Call mockServer.start() first.');
    }
    this.baseUrl = mockServer.getUrl();
  }

  async get(path, options = {}) {
    return this._request('GET', path, null, options);
  }

  async post(path, data, options = {}) {
    return this._request('POST', path, data, options);
  }

  async put(path, data, options = {}) {
    return this._request('PUT', path, data, options);
  }

  async delete(path, options = {}) {
    return this._request('DELETE', path, null, options);
  }

  async patch(path, data, options = {}) {
    return this._request('PATCH', path, data, options);
  }

  async request(method, path, data, options = {}) {
    return this._request(method, path, data, options);
  }

  async _request(method, path, data, options = {}) {
    if (!this.baseUrl) {
      this.initialize();
    }

    // Log the request
    mockServer.logRequest(method, path, data);

    // Get mock response
    const mockResponse = mockServer.getMockResponse(method, path);

    // Simulate network delay (10-50ms)
    const delay = 10 + Math.random() * 40;
    await new Promise(resolve => setTimeout(resolve, delay));

    // Build response object matching real HTTP client interface
    const result = {
      status: mockResponse.status || 200,
      statusText: this._getStatusText(mockResponse.status || 200),
      headers: mockResponse.headers || {},
      ok: (mockResponse.status || 200) >= 200 && (mockResponse.status || 200) < 300,
      url: `${this.baseUrl}${path}`,
      data: mockResponse.data || null
    };

    // Handle error responses
    if (!result.ok && options.throwOnError) {
      const error = new Error(`Mock request failed: ${result.status} ${result.statusText}`);
      error.response = result;
      throw error;
    }

    return result;
  }

  _getStatusText(status) {
    const statusTexts = {
      200: 'OK',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    return statusTexts[status] || 'Unknown';
  }

  _buildUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  setDefaultHeaders(headers) {
    this.defaultHeaders = {
      ...this.defaultHeaders,
      ...headers
    };
  }

  clearDefaultHeaders() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Integration-Test-Client'
    };
  }

  async postForm(path, formData, options = {}) {
    const headers = {
      ...options.headers
    };
    
    // Simulate form data handling
    if (formData instanceof FormData) {
      delete headers['Content-Type'];
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    return this._request('POST', path, formData, {
      ...options,
      headers
    });
  }

  async uploadFile(path, file, fieldName = 'file', additionalFields = {}, options = {}) {
    const data = {
      [fieldName]: file,
      ...additionalFields
    };
    return this._request('POST', path, data, options);
  }

  async authenticatedRequest(method, path, data, adminToken, options = {}) {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${adminToken}`
    };
    return this._request(method, path, data, { ...options, headers });
  }

  async webhookRequest(path, payload, signature, options = {}) {
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };

    if (path.includes('stripe')) {
      headers['stripe-signature'] = signature;
    } else if (path.includes('brevo')) {
      headers['x-sib-signature'] = signature;
    }

    return this.post(path, payload, { ...options, headers });
  }
}

// Export singleton instance
export const mockHttpClient = new MockHttpClient();

// Export class for creating additional instances if needed
export { MockHttpClient };