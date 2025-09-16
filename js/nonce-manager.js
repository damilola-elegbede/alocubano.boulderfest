/**
 * CSP Nonce Manager
 * Manages nonces for dynamic script injection and Content Security Policy compliance
 */

class NonceManager {
  constructor() {
    this.currentNonce = null;
    this.noncePromise = null;
    this.cache = new Map();
  }

  /**
   * Get the current nonce, fetching a new one if needed
   * @returns {Promise<string>} The current nonce
   */
  async getNonce() {
    // Return cached nonce if it exists and is less than 5 minutes old
    if (this.currentNonce && this.cache.has(this.currentNonce)) {
      const cacheEntry = this.cache.get(this.currentNonce);
      if (Date.now() - cacheEntry.timestamp < 5 * 60 * 1000) {
        return this.currentNonce;
      }
    }

    // If a request is already in progress, wait for it
    if (this.noncePromise) {
      return this.noncePromise;
    }

    // Fetch a new nonce
    this.noncePromise = this._fetchNewNonce();
    return this.noncePromise;
  }

  /**
   * Fetch a new nonce from the API
   * @private
   * @returns {Promise<string>} The new nonce
   */
  async _fetchNewNonce() {
    try {
      const response = await fetch('/api/security/nonce-generator');
      if (!response.ok) {
        throw new Error(`Failed to fetch nonce: ${response.status}`);
      }

      const data = await response.json();
      const nonce = data.nonce;

      // Cache the nonce
      this.currentNonce = nonce;
      this.cache.set(nonce, {
        timestamp: Date.now(),
        used: false
      });

      // Clear old cache entries (keep only last 10)
      if (this.cache.size > 10) {
        const entries = Array.from(this.cache.entries()).slice(-10);
        this.cache.clear();
        entries.forEach(([key, value]) => this.cache.set(key, value));
      }

      return nonce;
    } catch (error) {
      console.error('Error fetching nonce:', error);
      // Fail safely - don't return a predictable nonce
      throw new Error('Failed to fetch CSP nonce: ' + error.message);
    } finally {
      this.noncePromise = null;
    }
  }

  /**
   * Create a script element with the current nonce
   * @param {string} scriptContent - The script content
   * @param {string} [id] - Optional script ID
   * @returns {Promise<HTMLScriptElement>} The script element with nonce
   */
  async createNoncedScript(scriptContent, id = null) {
    const nonce = await this.getNonce();
    const script = document.createElement('script');

    script.nonce = nonce;
    script.textContent = scriptContent;

    if (id) {
      script.id = id;
    }

    return script;
  }

  /**
   * Execute a script with the current nonce
   * @param {string} scriptContent - The script content to execute
   * @param {string} [id] - Optional script ID
   * @returns {Promise<void>}
   */
  async executeNoncedScript(scriptContent, id = null) {
    const script = await this.createNoncedScript(scriptContent, id);
    document.head.appendChild(script);
  }

  /**
   * Get the current nonce for use in inline event handlers
   * @returns {string|null} The current nonce or null if not available
   */
  getCurrentNonce() {
    return this.currentNonce;
  }

  /**
   * Mark a nonce as used (for cleanup purposes)
   * @param {string} nonce - The nonce to mark as used
   */
  markNonceAsUsed(nonce) {
    if (this.cache.has(nonce)) {
      const entry = this.cache.get(nonce);
      entry.used = true;
      this.cache.set(nonce, entry);
    }
  }

  /**
   * Clear all cached nonces
   */
  clearCache() {
    this.cache.clear();
    this.currentNonce = null;
    this.noncePromise = null;
  }
}

// Export singleton instance
const nonceManager = new NonceManager();
export default nonceManager;

// Also make it available globally for non-module scripts
if (typeof window !== 'undefined') {
  window.nonceManager = nonceManager;
}