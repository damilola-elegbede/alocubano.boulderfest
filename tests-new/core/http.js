/**
 * HTTP Request Helpers for Integration Tests
 * Provides utilities for making authenticated requests to the test server
 */
import { serverManager } from './server.js';

class HttpClient {
  constructor() {
    this.baseUrl = null;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Integration-Test-Client'
    };
  }

  /**
   * Initialize HTTP client with server URL
   */
  initialize() {
    this.baseUrl = serverManager.getUrl();
  }

  /**
   * Make a GET request
   */
  async get(path, options = {}) {
    return this._request('GET', path, null, options);
  }

  /**
   * Make a POST request
   */
  async post(path, data, options = {}) {
    return this._request('POST', path, data, options);
  }

  /**
   * Make a PUT request
   */
  async put(path, data, options = {}) {
    return this._request('PUT', path, data, options);
  }

  /**
   * Make a DELETE request
   */
  async delete(path, options = {}) {
    return this._request('DELETE', path, null, options);
  }

  /**
   * Make a PATCH request
   */
  async patch(path, data, options = {}) {
    return this._request('PATCH', path, data, options);
  }

  /**
   * Make a raw request with full control
   */
  async request(method, path, data, options = {}) {
    return this._request(method, path, data, options);
  }

  /**
   * Internal request method
   * @private
   */
  async _request(method, path, data, options = {}) {
    if (!this.baseUrl) {
      this.initialize();
    }

    const url = this._buildUrl(path);
    const requestOptions = this._buildRequestOptions(method, data, options);

    try {
      const response = await fetch(url, requestOptions);
      return await this._processResponse(response, options);
    } catch (error) {
      throw new Error(`HTTP request failed: ${error.message}`);
    }
  }

  /**
   * Build full URL from path
   * @private
   */
  _buildUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  /**
   * Build fetch options
   * @private
   */
  _buildRequestOptions(method, data, options) {
    const headers = {
      ...this.defaultHeaders,
      ...options.headers
    };

    const requestOptions = {
      method,
      headers
    };

    // Add body for methods that support it
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      if (typeof data === 'object') {
        requestOptions.body = JSON.stringify(data);
      } else {
        requestOptions.body = data;
      }
    }

    // Add additional fetch options
    if (options.timeout) {
      requestOptions.signal = AbortSignal.timeout(options.timeout);
    }

    return requestOptions;
  }

  /**
   * Process response and handle different content types
   * @private
   */
  async _processResponse(response, options = {}) {
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      url: response.url
    };

    // Handle empty responses
    if (response.status === 204 || 
        response.headers.get('content-length') === '0') {
      result.data = null;
      return result;
    }

    // Parse response based on content type
    const contentType = response.headers.get('content-type') || '';
    
    try {
      if (contentType.includes('application/json')) {
        result.data = await response.json();
      } else if (contentType.includes('text/')) {
        result.data = await response.text();
      } else if (options.responseType === 'blob') {
        result.data = await response.blob();
      } else if (options.responseType === 'arrayBuffer') {
        result.data = await response.arrayBuffer();
      } else {
        // Default to text for unknown types
        result.data = await response.text();
      }
    } catch (parseError) {
      result.data = null;
      result.parseError = parseError.message;
    }

    return result;
  }

  /**
   * Set default headers for all requests
   */
  setDefaultHeaders(headers) {
    this.defaultHeaders = {
      ...this.defaultHeaders,
      ...headers
    };
  }

  /**
   * Clear default headers
   */
  clearDefaultHeaders() {
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': 'Integration-Test-Client'
    };
  }

  /**
   * Make a form-encoded POST request
   */
  async postForm(path, formData, options = {}) {
    const headers = {
      ...options.headers
    };
    
    // Remove content-type to let fetch set it automatically for FormData
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

  /**
   * Upload a file
   */
  async uploadFile(path, file, fieldName = 'file', additionalFields = {}, options = {}) {
    const formData = new FormData();
    formData.append(fieldName, file);
    
    // Add additional form fields
    Object.entries(additionalFields).forEach(([key, value]) => {
      formData.append(key, value);
    });

    return this.postForm(path, formData, options);
  }

  /**
   * Helper for making authenticated API requests with admin token
   */
  async authenticatedRequest(method, path, data, adminToken, options = {}) {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${adminToken}`
    };

    return this._request(method, path, data, {
      ...options,
      headers
    });
  }

  /**
   * Helper for webhook requests with proper signature
   */
  async webhookRequest(path, payload, signature, options = {}) {
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json'
    };

    // Add signature header based on service
    if (path.includes('stripe')) {
      headers['stripe-signature'] = signature;
    } else if (path.includes('brevo')) {
      headers['x-sib-signature'] = signature;
    }

    return this.post(path, payload, {
      ...options,
      headers
    });
  }
}

// Export singleton instance
export const httpClient = new HttpClient();

// Export class for creating additional instances if needed
export { HttpClient };