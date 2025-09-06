/**
 * Brevo Email Service
 * Handles all Brevo API interactions for email list management
 */

import { createHmac, timingSafeEqual } from "crypto";

class BrevoService {
  constructor() {
    this.apiKey = process.env.BREVO_API_KEY;
    this.baseUrl = "https://api.brevo.com/v3";

    if (!this.apiKey) {
      console.error("❌ FATAL: BREVO_API_KEY not found in environment");
      throw new Error("BREVO_API_KEY environment variable is required and cannot be empty");
    }

    // List configuration
    this.lists = {
      newsletter: parseInt(process.env.BREVO_NEWSLETTER_LIST_ID) || 1,
      ticketHolders: parseInt(process.env.BREVO_TICKET_HOLDERS_LIST_ID) || 2,
      vip: parseInt(process.env.BREVO_VIP_LIST_ID) || 3,
      workshops: parseInt(process.env.BREVO_WORKSHOPS_LIST_ID) || 4,
    };

    // Template configuration
    this.templates = {
      welcome: parseInt(process.env.BREVO_WELCOME_TEMPLATE_ID) || 1,
      verification: parseInt(process.env.BREVO_VERIFICATION_TEMPLATE_ID) || 2,
      unsubscribe: parseInt(process.env.BREVO_UNSUBSCRIBE_TEMPLATE_ID) || 3,
    };
  }

  /**
   * Create HTTP request headers
   */
  getHeaders() {
    return {
      "Content-Type": "application/json",
      "api-key": this.apiKey,
    };
  }

  /**
   * Make API request to Brevo
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const config = {
      method: "GET",
      headers: this.getHeaders(),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `Brevo API error: ${response.status} - ${data.message || "Unknown error"}`,
        );
      }

      return data;
    } catch (error) {
      console.error("Brevo API request failed:", {
        endpoint,
        method: config.method,
        error: error.message,
      });
      throw error;
    }
  }


  /**
   * Create or update a contact
   */
  async createOrUpdateContact(contactData) {
    const {
      email,
      firstName,
      lastName,
      phone,
      attributes = {},
      listIds = [],
      updateEnabled = true,
    } = contactData;

    const payload = {
      email,
      attributes: {
        FNAME: firstName || "",
        LNAME: lastName || "",
        PHONE: phone || "",
        ...attributes,
      },
      listIds,
      updateEnabled,
    };

    // Remove empty attributes
    Object.keys(payload.attributes).forEach((key) => {
      if (!payload.attributes[key]) {
        delete payload.attributes[key];
      }
    });

    return this.makeRequest("/contacts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get contact by email
   */
  async getContact(email) {
    return this.makeRequest(`/contacts/${encodeURIComponent(email)}`);
  }

  /**
   * Update contact
   */
  async updateContact(email, updateData) {
    const { attributes, listIds } = updateData;

    const payload = {};
    if (attributes) payload.attributes = attributes;
    if (listIds) payload.listIds = listIds;

    return this.makeRequest(`/contacts/${encodeURIComponent(email)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Delete contact
   */
  async deleteContact(email) {
    return this.makeRequest(`/contacts/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
  }

  /**
   * Add contact to lists
   */
  async addContactToLists(email, listIds) {
    const addRequests = listIds.map((listId) =>
      this.makeRequest(`/contacts/lists/${listId}/contacts/add`, {
        method: "POST",
        body: JSON.stringify({ emails: [email] }),
      }),
    );

    return Promise.all(addRequests);
  }

  /**
   * Remove contact from lists
   */
  async removeContactFromLists(email, listIds) {
    const removeRequests = listIds.map((listId) =>
      this.makeRequest(`/contacts/lists/${listId}/contacts/remove`, {
        method: "POST",
        body: JSON.stringify({ emails: [email] }),
      }),
    );

    return Promise.all(removeRequests);
  }

  /**
   * Subscribe to newsletter
   */
  async subscribeToNewsletter(subscriberData) {
    const {
      email,
      firstName,
      lastName,
      phone,
      source = "website",
      attributes = {},
    } = subscriberData;

    const contactData = {
      email,
      firstName,
      lastName,
      phone,
      attributes: {
        SIGNUP_SOURCE: source,
        SIGNUP_DATE: new Date().toISOString(),
        ...attributes,
      },
      listIds: [this.lists.newsletter],
      updateEnabled: true,
    };

    try {
      const result = await this.createOrUpdateContact(contactData);

      // Send welcome email if enabled
      if (process.env.SEND_WELCOME_EMAIL === "true") {
        await this.sendWelcomeEmail(email, firstName);
      }

      return result;
    } catch (error) {
      // Handle duplicate contact gracefully
      if (error.message.includes("duplicate_parameter")) {
        console.log(`Contact ${email} already exists, updating instead`);
        return this.updateContact(email, {
          attributes: contactData.attributes,
          listIds: contactData.listIds,
        });
      }
      throw error;
    }
  }

  /**
   * Unsubscribe from all lists
   */
  async unsubscribeContact(email) {
    try {
      // Get current contact to see which lists they're on
      const contact = await this.getContact(email);
      const currentListIds = contact.listIds || [];

      // Remove from all lists
      if (currentListIds.length > 0) {
        await this.removeContactFromLists(email, currentListIds);
      }

      // Update contact with unsubscribe timestamp
      await this.updateContact(email, {
        attributes: {
          UNSUBSCRIBED_AT: new Date().toISOString(),
        },
      });

      return { success: true, message: "Successfully unsubscribed" };
    } catch (error) {
      if (error.message.includes("contact_not_exist")) {
        return {
          success: true,
          message: "Contact not found (already unsubscribed)",
        };
      }
      throw error;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(email, firstName = "") {
    const payload = {
      to: [{ email, name: firstName }],
      templateId: this.templates.welcome,
      params: {
        FNAME: firstName,
        FESTIVAL_YEAR: "2026",
        FESTIVAL_DATES: "May 15-17, 2026",
      },
    };

    return this.makeRequest("/smtp/email", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(email, token, firstName = "") {
    const verificationUrl = `${process.env.SITE_URL}/api/email/verify?token=${token}&email=${encodeURIComponent(email)}`;

    const payload = {
      to: [{ email, name: firstName }],
      templateId: this.templates.verification,
      params: {
        FNAME: firstName,
        VERIFICATION_URL: verificationUrl,
      },
    };

    return this.makeRequest("/smtp/email", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Get list statistics
   */
  async getListStats(listId) {
    return this.makeRequest(`/contacts/lists/${listId}`);
  }

  /**
   * Get all list statistics
   */
  async getAllListStats() {
    const statPromises = Object.entries(this.lists).map(
      async ([name, listId]) => {
        try {
          const stats = await this.getListStats(listId);
          return { name, listId, stats };
        } catch (error) {
          console.error(
            `Failed to get stats for list ${name} (${listId}):`,
            error,
          );
          return { name, listId, error: error.message };
        }
      },
    );

    return Promise.all(statPromises);
  }

  /**
   * Validate webhook signature
   */
  validateWebhookSignature(payload, signature) {
    const secret = process.env.BREVO_WEBHOOK_SECRET;

    if (!secret) {
      throw new Error("❌ FATAL: BREVO_WEBHOOK_SECRET not found in environment");
    }

    const expectedSignature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = Buffer.from(expectedSignature, "hex");
    const signatureBuffer = Buffer.from(signature, "hex");

    // Ensure buffers are the same length before comparison
    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
  }

  /**
   * Process webhook event
   */
  async processWebhookEvent(event) {
    const { event: eventType, email, date, ...eventData } = event;

    return {
      eventType,
      email,
      occurredAt: date
        ? new Date(date).toISOString()
        : new Date().toISOString(),
      data: eventData,
    };
  }

  /**
   * Health check - verify API connectivity
   */
  async healthCheck() {
    try {
      await this.makeRequest("/account");
      return { status: "healthy", timestamp: new Date().toISOString() };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

// Export singleton instance
let brevoServiceInstance = null;

export function getBrevoService() {
  if (!brevoServiceInstance) {
    brevoServiceInstance = new BrevoService();
  }
  return brevoServiceInstance;
}

/**
 * Reset singleton instance for testing
 */
export function resetBrevoService() {
  brevoServiceInstance = null;
}

export { BrevoService };
