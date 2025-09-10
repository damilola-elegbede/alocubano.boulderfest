/**
 * Brevo Client Wrapper
 * Provides simplified interface for transactional email sending
 * Used by registration endpoints for confirmation emails
 */

import { getBrevoService } from './brevo-service.js';

/**
 * Brevo client wrapper for registration system
 */
class BrevoClient {
  constructor() {
    this.service = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  /**
   * Initialize the Brevo service
   */
  async initialize() {
    if (this.initialized && this.service) {
      return this.service;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  async _performInitialization() {
    try {
      this.service = getBrevoService();
      this.initialized = true;
      return this;
    } catch (error) {
      console.error('Failed to initialize Brevo client:', error);
      throw new Error('Brevo client initialization failed: ' + error.message);
    }
  }

  /**
   * Send transactional email using Brevo templates
   * @param {Object} options Email sending options
   * @param {Array} options.to Recipient array [{email, name}]
   * @param {number} options.templateId Brevo template ID
   * @param {Object} options.params Template parameters
   * @returns {Promise<Object>} Brevo API response
   */
  async sendTransactionalEmail(options) {
    if (!this.initialized) {
      await this.initialize();
    }

    const { to, templateId, params } = options;

    if (!to || !Array.isArray(to) || to.length === 0) {
      throw new Error('Recipients array is required');
    }

    if (!templateId) {
      throw new Error('Template ID is required');
    }

    // Prepare the request payload for Brevo's transactional email API
    const payload = {
      to: to.map(recipient => ({
        email: recipient.email,
        name: recipient.name || ''
      })),
      templateId: templateId,
      params: params || {}
    };

    try {
      // Use the Brevo service to make the API request
      const response = await this.service.makeRequest('/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      return response;
    } catch (error) {
      console.error('Failed to send transactional email:', error);
      throw new Error('Failed to send email: ' + error.message);
    }
  }

  /**
   * Verify Brevo webhook signature
   * @param {string} payload Request body as string
   * @param {string} signature Signature from X-Brevo-Signature header
   * @returns {boolean} Whether signature is valid
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.service) {
      throw new Error('Brevo client not initialized');
    }

    return this.service.verifyWebhookSignature(payload, signature);
  }
}

// Singleton instance
let brevoClientInstance = null;

/**
 * Get or create the Brevo client instance
 * @returns {Promise<BrevoClient>} Initialized Brevo client
 */
export async function getBrevoClient() {
  if (!brevoClientInstance) {
    brevoClientInstance = new BrevoClient();
  }
  
  await brevoClientInstance.initialize();
  return brevoClientInstance;
}

/**
 * Reset the Brevo client (for testing)
 */
export function resetBrevoClient() {
  brevoClientInstance = null;
}

export { BrevoClient };