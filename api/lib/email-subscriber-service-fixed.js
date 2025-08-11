/**
 * Fixed Email Subscriber Service
 * Properly integrates with database instead of simulating operations
 */

import { getDatabase } from "./database.js";
import { getBrevoService } from "./brevo-service.js";
import { createHmac, randomBytes } from "crypto";

class EmailSubscriberService {
  constructor() {
    this.brevoService = null;
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize service with proper database and Brevo connections
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      this.db = getDatabase();
      this.brevoService = getBrevoService();

      // Test database connection
      await this.db.execute("SELECT 1");
      this.initialized = true;

      console.log("✅ EmailSubscriberService initialized");
    } catch (error) {
      console.error("❌ Failed to initialize EmailSubscriberService:", error);
      throw error;
    }
  }

  /**
   * Ensure service is initialized
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Create new subscriber with proper database integration
   */
  async createSubscriber(subscriberData) {
    await this.ensureInitialized();

    const {
      email,
      firstName,
      lastName,
      phone,
      status = "active", // Changed default to active
      listIds = [1],
      attributes = {},
      consentSource = "website",
      consentIp,
      verificationToken,
    } = subscriberData;

    try {
      // Check if subscriber already exists
      const existing = await this.getByEmail(email);
      if (existing) {
        throw new Error("Email address is already subscribed");
      }

      // Create in Brevo first
      const brevoResult = await this.brevoService.subscribeToNewsletter({
        email,
        firstName,
        lastName,
        phone,
        source: consentSource,
        attributes,
      });

      // Then create in database
      const result = await this.db.execute(
        `INSERT INTO email_subscribers (
          email, first_name, last_name, phone, status, brevo_contact_id,
          source, consent_date, consent_source, consent_ip,
          verification_token, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *`,
        [
          email,
          firstName || null,
          lastName || null,
          phone || null,
          status,
          brevoResult.id || null,
          consentSource,
          new Date().toISOString(),
          consentSource,
          consentIp || null,
          verificationToken || null,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );

      const subscriber = result.rows[0];

      // Log the event
      await this.logEmailEvent(subscriber.id, "subscribed", {
        source: consentSource,
        lists: listIds,
      });

      return {
        id: subscriber.id,
        email: subscriber.email,
        first_name: subscriber.first_name,
        last_name: subscriber.last_name,
        phone: subscriber.phone,
        status: subscriber.status,
        brevo_contact_id: subscriber.brevo_contact_id,
        created_at: subscriber.created_at,
        updated_at: subscriber.updated_at,
      };
    } catch (error) {
      if (
        error.message.includes("UNIQUE constraint failed") ||
        error.message.includes("duplicate key")
      ) {
        throw new Error("Email address is already subscribed");
      }
      throw error;
    }
  }

  /**
   * Subscribe user (wrapper for createSubscriber with validation)
   */
  async subscribe(subscriberData) {
    await this.ensureInitialized();

    const { email } = subscriberData;

    // Validate email format
    if (!this.isValidEmail(email)) {
      return { success: false, error: "Invalid email format" };
    }

    try {
      const subscriber = await this.createSubscriber(subscriberData);
      return {
        success: true,
        subscriber,
        message: "Successfully subscribed to newsletter",
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get subscriber by email with proper database query
   */
  async getByEmail(email) {
    await this.ensureInitialized();

    try {
      const result = await this.db.execute(
        "SELECT * FROM email_subscribers WHERE email = ?",
        [email],
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      console.error("Failed to get subscriber by email:", error);
      return null;
    }
  }

  /**
   * Update subscriber with proper database operations
   */
  async updateSubscriber(email, updateData) {
    await this.ensureInitialized();

    const {
      firstName,
      lastName,
      phone,
      status,
      attributes,
      verificationToken,
      verifiedAt,
      unsubscribedAt,
    } = updateData;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = ?`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = ?`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      updates.push(`phone = ?`);
      values.push(phone);
    }
    if (status !== undefined) {
      updates.push(`status = ?`);
      values.push(status);
    }
    if (attributes !== undefined) {
      updates.push(`attributes = ?`);
      values.push(JSON.stringify(attributes));
    }
    if (verificationToken !== undefined) {
      updates.push(`verification_token = ?`);
      values.push(verificationToken);
    }
    if (verifiedAt !== undefined) {
      updates.push(`verified_at = ?`);
      values.push(
        verifiedAt instanceof Date ? verifiedAt.toISOString() : verifiedAt,
      );
    }
    if (unsubscribedAt !== undefined) {
      updates.push(`unsubscribed_at = ?`);
      values.push(
        unsubscribedAt instanceof Date
          ? unsubscribedAt.toISOString()
          : unsubscribedAt,
      );
    }

    if (updates.length === 0) {
      throw new Error("No update data provided");
    }

    updates.push(`updated_at = ?`);
    values.push(new Date().toISOString());
    values.push(email);

    const query = `
      UPDATE email_subscribers 
      SET ${updates.join(", ")}
      WHERE email = ?
      RETURNING *
    `;

    const result = await this.db.execute(query, values);
    return result.rows[0];
  }

  /**
   * Unsubscribe user with proper integration
   */
  async unsubscribe(email, reason = "user_request") {
    await this.ensureInitialized();

    try {
      // Update in Brevo first
      await this.brevoService.unsubscribeContact(email);

      // Update in database
      const subscriber = await this.updateSubscriber(email, {
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      });

      // Log the event
      if (subscriber) {
        await this.logEmailEvent(subscriber.id, "unsubscribed", { reason });
      }

      return subscriber;
    } catch (error) {
      if (error.message.includes("contact_not_exist")) {
        // Still update local database
        return this.updateSubscriber(email, {
          status: "unsubscribed",
          unsubscribedAt: new Date(),
        });
      }
      throw error;
    }
  }

  /**
   * Handle email bounce with proper database update
   */
  async handleBounce(email, bounceType = "hard_bounce") {
    await this.ensureInitialized();

    const subscriber = await this.getByEmail(email);
    if (!subscriber) {
      console.warn(`Bounce received for unknown subscriber: ${email}`);
      return null;
    }

    const newBounceCount = (subscriber.bounce_count || 0) + 1;
    const shouldMarkBounced =
      bounceType === "hard_bounce" || newBounceCount >= 3;

    const updateData = {
      bounce_count: newBounceCount,
    };

    if (shouldMarkBounced) {
      updateData.status = "bounced";
    }

    return this.updateSubscriber(email, updateData);
  }

  /**
   * Log email event with proper database insertion
   */
  async logEmailEvent(subscriberId, eventType, eventData, brevoEventId = null) {
    await this.ensureInitialized();

    try {
      const result = await this.db.execute(
        `INSERT INTO email_events (
          subscriber_id, event_type, event_data, brevo_event_id, occurred_at
        ) VALUES (?, ?, ?, ?, ?)
        RETURNING *`,
        [
          subscriberId,
          eventType,
          JSON.stringify(eventData),
          brevoEventId,
          new Date().toISOString(),
        ],
      );

      return result.rows[0];
    } catch (error) {
      console.error("Failed to log email event:", error);
      return null;
    }
  }

  /**
   * Process Brevo webhook event with proper database integration
   */
  async processWebhookEvent(webhookData) {
    await this.ensureInitialized();

    const processedEvent =
      await this.brevoService.processWebhookEvent(webhookData);

    // Find subscriber by email
    const subscriber = await this.getByEmail(processedEvent.email);
    if (!subscriber) {
      console.warn(
        `Subscriber not found for webhook event: ${processedEvent.email}`,
      );
      return {
        success: true,
        message: "Webhook processed (subscriber not found)",
      };
    }

    // Log the event
    await this.logEmailEvent(
      subscriber.id,
      processedEvent.eventType,
      processedEvent.data,
      webhookData.id,
    );

    // Update subscriber status if needed
    if (
      processedEvent.eventType === "hard_bounce" ||
      processedEvent.eventType === "spam"
    ) {
      await this.updateSubscriber(processedEvent.email, { status: "bounced" });
      return {
        success: true,
        message: `${processedEvent.eventType === "hard_bounce" ? "Hard bounce" : "Spam complaint"} processed, contact marked as bounced`,
      };
    } else if (processedEvent.eventType === "unsubscribed") {
      await this.updateSubscriber(processedEvent.email, {
        status: "unsubscribed",
        unsubscribedAt: processedEvent.occurredAt,
      });
      return {
        success: true,
        message: "Unsubscribe processed",
      };
    } else if (processedEvent.eventType === "delivered") {
      return {
        success: true,
        message: "Email delivery recorded",
      };
    } else if (processedEvent.eventType === "opened") {
      return {
        success: true,
        message: "Email open recorded",
      };
    }

    return {
      success: true,
      message: `Unknown event type processed: ${processedEvent.eventType}`,
    };
  }

  /**
   * Email validation utility
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Generate verification token
   */
  generateVerificationToken() {
    return randomBytes(32).toString("hex");
  }

  /**
   * Generate unsubscribe token
   */
  generateUnsubscribeToken(email) {
    const secret = process.env.UNSUBSCRIBE_SECRET || "default-secret";
    return createHmac("sha256", secret).update(email).digest("hex");
  }

  /**
   * Validate unsubscribe token
   */
  validateUnsubscribeToken(email, token) {
    const expectedToken = this.generateUnsubscribeToken(email);
    return token === expectedToken;
  }

  /**
   * Get subscriber statistics with real database queries
   */
  async getSubscriberStats() {
    await this.ensureInitialized();

    try {
      const result = await this.db.execute(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'unsubscribed' THEN 1 END) as unsubscribed,
          COUNT(CASE WHEN status = 'bounced' THEN 1 END) as bounced
        FROM email_subscribers
      `);

      return result.rows[0];
    } catch (error) {
      console.error("Failed to get subscriber stats:", error);
      return { total: 0, active: 0, pending: 0, unsubscribed: 0, bounced: 0 };
    }
  }
}

// Export singleton instance with lazy initialization
let emailSubscriberServiceInstance = null;

export function getEmailSubscriberService() {
  if (!emailSubscriberServiceInstance) {
    emailSubscriberServiceInstance = new EmailSubscriberService();
  }
  return emailSubscriberServiceInstance;
}

export { EmailSubscriberService };
