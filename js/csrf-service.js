/**
 * Frontend CSRF Service
 * Manages CSRF token fetching and caching for admin operations
 */

class CSRFService {
  constructor() {
    this.token = null;
    this.expiresAt = null;
    this.fetchPromise = null; // Prevent duplicate fetches
  }

  /**
   * Get a valid CSRF token
   * Fetches a new token if needed, otherwise returns cached token
   * @returns {Promise<string>} CSRF token
   */
  async getCSRFToken() {
    // Check if we have a valid cached token
    if (this.token && this.expiresAt && Date.now() < this.expiresAt) {
      return this.token;
    }

    // If a fetch is already in progress, wait for it
    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    // Fetch a new token
    this.fetchPromise = this._fetchNewToken();

    try {
      const token = await this.fetchPromise;
      return token;
    } finally {
      this.fetchPromise = null;
    }
  }

  /**
   * Fetch a new CSRF token from the server
   * @returns {Promise<string>} CSRF token
   * @private
   */
  async _fetchNewToken() {
    try {
      // Use cookie-based authentication (admin_session cookie)
      const response = await fetch('/api/admin/csrf-token', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Unauthorized - redirect to login
          window.location.href = '/admin/login';
          throw new Error('Session expired. Please log in again.');
        }

        throw new Error(`Failed to fetch CSRF token: ${response.status}`);
      }

      const data = await response.json();

      // Cache the token with a 5-minute buffer before expiration
      this.token = data.csrfToken;
      const expiresIn = (data.expiresIn || 3600) * 1000; // Convert to milliseconds
      this.expiresAt = Date.now() + expiresIn - (5 * 60 * 1000); // 5-minute buffer

      return this.token;

    } catch (error) {
      console.error('Error fetching CSRF token:', error);
      // Clear cached token on error
      this.token = null;
      this.expiresAt = null;
      throw error;
    }
  }

  /**
   * Clear cached CSRF token
   * Use this after logout or when you need to force a token refresh
   */
  clearToken() {
    this.token = null;
    this.expiresAt = null;
  }

  /**
   * Check if a valid token is cached
   * @returns {boolean} True if a valid token is cached
   */
  hasValidToken() {
    return !!(this.token && this.expiresAt && Date.now() < this.expiresAt);
  }
}

// Create a singleton instance
const csrfService = new CSRFService();

// Export as default
export default csrfService;

// Also export the class for testing
export { CSRFService };
