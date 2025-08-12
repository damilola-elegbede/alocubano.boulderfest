/**
 * Email Subscriber Service
 * Handles database operations for email subscribers
 */

import { getBrevoService } from "./brevo-service.js";
import { getDatabase } from "./database.js";
import { createHmac, randomBytes } from "crypto";

class EmailSubscriberService {
  constructor() {
    this.brevoService = getBrevoService();
    this.database = getDatabase();
    this.initialized = false;
  }

  /**
   * Ensure service is properly initialized
   * @returns {Promise<EmailSubscriberService>} This service instance
   */
  async ensureInitialized() {
    // Return immediately if already initialized (fast path)
    if (this.initialized) {
      return this;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      await this.initializationPromise;
      return this;
    } catch (error) {
      // Clear the failed promise so next call can retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform the actual service initialization
   */
  async _performInitialization() {
    try {
      // Test database connection first
      await this.database.testConnection();

      // Initialize Brevo service if it has an ensureInitialized method
      if (this.brevoService.ensureInitialized) {
        await this.brevoService.ensureInitialized();
      }

      this.initialized = true;
      return this;
    } catch (error) {
      console.error("EmailSubscriberService initialization failed:", {
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      throw new Error(
        `Email subscriber service initialization failed: ${error.message}`,
      );
    }
  }

  /**
   * Get database client
   */
  async getDb() {
    await this.ensureInitialized();
    return await this.database.getClient();
  }

  /**
   * Create new subscriber
   */
  async createSubscriber(subscriberData) {
    const {
      email,
      firstName,
      lastName,
      phone,
      status = "pending",
      listIds = [],
      attributes = {},
      consentSource = "website",
      consentIp,
      verificationToken,
    } = subscriberData;

    try {
      const db = await this.getDb();

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
      const query = `
                INSERT INTO email_subscribers (
                    email, first_name, last_name, phone, status, brevo_contact_id,
                    list_ids, attributes, consent_date, consent_source, consent_ip,
                    verification_token
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            `;

      const values = [
        email,
        firstName || null,
        lastName || null,
        phone || null,
        status,
        brevoResult.id || null,
        JSON.stringify(listIds),
        JSON.stringify(attributes),
        new Date().toISOString(),
        consentSource,
        consentIp || null,
        verificationToken || null,
      ];

      const result = await db.execute(query, values);
      const subscriber = {
        id: result.lastInsertRowid,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        phone: phone || null,
        status,
        brevo_contact_id: brevoResult.id || null,
        list_ids: listIds,
        attributes,
        consent_date: new Date().toISOString(),
        consent_source: consentSource,
        consent_ip: consentIp || null,
        verification_token: verificationToken || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Log the event
      await this.logEmailEvent(subscriber.id, "subscribed", {
        source: consentSource,
        lists: listIds,
      });

      // Audit log
      await this.auditLog(
        "email_subscribers",
        subscriber.id,
        "create",
        "system",
        "api",
        {
          email,
          source: consentSource,
        },
        consentIp,
      );

      return subscriber;
    } catch (error) {
      if (
        error.message.includes("UNIQUE constraint failed") ||
        error.message.includes("duplicate key value")
      ) {
        // Handle duplicate email
        throw new Error("Email address is already subscribed");
      }
      throw error;
    }
  }

  /**
   * Get subscriber by email
   */
  async getSubscriberByEmail(email) {
    const db = await this.getDb();
    const query = "SELECT * FROM email_subscribers WHERE email = ?1";

    try {
      const result = await db.execute(query, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        status: row.status,
        brevo_contact_id: row.brevo_contact_id,
        list_ids: row.list_ids ? JSON.parse(row.list_ids) : [],
        attributes: row.attributes ? JSON.parse(row.attributes) : {},
        consent_date: row.consent_date,
        consent_source: row.consent_source,
        consent_ip: row.consent_ip,
        verification_token: row.verification_token,
        verified_at: row.verified_at,
        unsubscribed_at: row.unsubscribed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } catch (error) {
      throw new Error(`Failed to get subscriber: ${error.message}`);
    }
  }

  /**
   * Update subscriber
   */
  async updateSubscriber(email, updateData) {
    const {
      firstName,
      lastName,
      phone,
      status,
      listIds,
      attributes,
      verificationToken,
      verifiedAt,
      unsubscribedAt,
    } = updateData;

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = ?${paramCount++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = ?${paramCount++}`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      updates.push(`phone = ?${paramCount++}`);
      values.push(phone);
    }
    if (status !== undefined) {
      updates.push(`status = ?${paramCount++}`);
      values.push(status);
    }
    if (listIds !== undefined) {
      updates.push(`list_ids = ?${paramCount++}`);
      values.push(JSON.stringify(listIds));
    }
    if (attributes !== undefined) {
      updates.push(`attributes = ?${paramCount++}`);
      values.push(JSON.stringify(attributes));
    }
    if (verificationToken !== undefined) {
      updates.push(`verification_token = ?${paramCount++}`);
      values.push(verificationToken);
    }
    if (verifiedAt !== undefined) {
      updates.push(`verified_at = ?${paramCount++}`);
      values.push(verifiedAt);
    }
    if (unsubscribedAt !== undefined) {
      updates.push(`unsubscribed_at = ?${paramCount++}`);
      values.push(unsubscribedAt);
    }

    if (updates.length === 0) {
      throw new Error("No update data provided");
    }

    values.push(email);

    const query = `
            UPDATE email_subscribers 
            SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
            WHERE email = ?${paramCount}
        `;

    const db = await this.getDb();
    await db.execute(query, values);

    // Get updated subscriber
    const updatedSubscriber = await this.getSubscriberByEmail(email);

    if (!updatedSubscriber) {
      throw new Error("Subscriber not found after update");
    }

    // Audit log
    await this.auditLog(
      "email_subscribers",
      updatedSubscriber.id,
      "update",
      "system",
      "api",
      updateData,
    );

    return updatedSubscriber;
  }

  /**
   * Unsubscribe user
   */
  async unsubscribeSubscriber(email, reason = "user_request") {
    try {
      // Update in Brevo
      await this.brevoService.unsubscribeContact(email);

      // Update in database
      const subscriber = await this.updateSubscriber(email, {
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      });

      // Log the event
      await this.logEmailEvent(subscriber.id, "unsubscribed", { reason });

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
   * Verify subscriber email
   */
  async verifySubscriber(email, token) {
    const subscriber = await this.getSubscriberByEmail(email);

    if (!subscriber) {
      throw new Error("Subscriber not found");
    }

    if (subscriber.verification_token !== token) {
      throw new Error("Invalid verification token");
    }

    if (subscriber.verified_at) {
      throw new Error("Email already verified");
    }

    // Update subscriber as verified
    const verifiedSubscriber = await this.updateSubscriber(email, {
      status: "active",
      verifiedAt: new Date(),
      verificationToken: null,
    });

    // Log the event
    await this.logEmailEvent(subscriber.id, "verified", {});

    return verifiedSubscriber;
  }

  /**
   * Log email event
   */
  async logEmailEvent(subscriberId, eventType, eventData, brevoEventId = null) {
    try {
      const db = await this.getDb();
      const query = `
              INSERT INTO email_events (subscriber_id, event_type, event_data, brevo_event_id, occurred_at)
              VALUES (?1, ?2, ?3, ?4, ?5)
          `;

      const values = [
        subscriberId,
        eventType,
        JSON.stringify(eventData),
        brevoEventId,
        new Date().toISOString(),
      ];

      const result = await db.execute(query, values);

      return {
        id: result.lastInsertRowid,
        subscriber_id: subscriberId,
        event_type: eventType,
        event_data: eventData,
        brevo_event_id: brevoEventId,
        occurred_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to log email event: ${error.message}`);
      // Don't throw - logging failure shouldn't break the main operation
      return null;
    }
  }

  /**
   * Audit log
   */
  async auditLog(
    entityType,
    entityId,
    action,
    actorType,
    actorId,
    changes,
    ipAddress = null,
    userAgent = null,
  ) {
    try {
      const db = await this.getDb();
      const query = `
              INSERT INTO email_audit_log (entity_type, entity_id, action, actor_type, actor_id, changes, ip_address, user_agent, created_at)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
          `;

      const values = [
        entityType,
        entityId,
        action,
        actorType,
        actorId,
        JSON.stringify(changes),
        ipAddress,
        userAgent,
        new Date().toISOString(),
      ];

      const result = await db.execute(query, values);

      return {
        id: result.lastInsertRowid,
        entity_type: entityType,
        entity_id: entityId,
        action,
        actor_type: actorType,
        actor_id: actorId,
        changes,
        ip_address: ipAddress,
        user_agent: userAgent,
        created_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`Failed to create audit log: ${error.message}`);
      // Don't throw - audit logging failure shouldn't break the main operation
      return null;
    }
  }

  /**
   * Get subscriber statistics
   */
  async getSubscriberStats() {
    try {
      const db = await this.getDb();
      const query = `
              SELECT 
                  COUNT(*) as total,
                  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
                  SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                  SUM(CASE WHEN status = 'unsubscribed' THEN 1 ELSE 0 END) as unsubscribed,
                  SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END) as bounced
              FROM email_subscribers
          `;

      const result = await db.execute(query);
      const row = result.rows[0];

      return {
        total: Number(row.total) || 0,
        active: Number(row.active) || 0,
        pending: Number(row.pending) || 0,
        unsubscribed: Number(row.unsubscribed) || 0,
        bounced: Number(row.bounced) || 0,
      };
    } catch (error) {
      console.error(`Failed to get subscriber stats: ${error.message}`);
      // Return default stats on error
      return {
        total: 0,
        active: 0,
        pending: 0,
        unsubscribed: 0,
        bounced: 0,
      };
    }
  }

  /**
   * Get recent events
   */
  async getRecentEvents(limit = 100) {
    try {
      const db = await this.getDb();
      const query = `
              SELECT e.*, s.email
              FROM email_events e
              JOIN email_subscribers s ON e.subscriber_id = s.id
              ORDER BY e.occurred_at DESC
              LIMIT ?1
          `;

      const result = await db.execute(query, [limit]);

      return result.rows.map((row) => ({
        id: row.id,
        subscriber_id: row.subscriber_id,
        event_type: row.event_type,
        event_data: row.event_data ? JSON.parse(row.event_data) : {},
        brevo_event_id: row.brevo_event_id,
        occurred_at: row.occurred_at,
        email: row.email,
      }));
    } catch (error) {
      console.error(`Failed to get recent events: ${error.message}`);
      return [];
    }
  }

  /**
   * Process Brevo webhook event
   */
  async processWebhookEvent(webhookData) {
    const processedEvent =
      await this.brevoService.processWebhookEvent(webhookData);

    // Find subscriber by email
    let subscriber;
    try {
      subscriber = await this.getSubscriberByEmail(processedEvent.email);
      if (!subscriber) {
        console.warn(
          `Subscriber not found for webhook event: ${processedEvent.email}`,
        );
        return null;
      }
    } catch (error) {
      console.warn(
        `Error finding subscriber for webhook event: ${processedEvent.email}`,
        error.message,
      );
      return null;
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
      try {
        await this.updateSubscriber(processedEvent.email, {
          status: "bounced",
        });
      } catch (error) {
        console.error(
          `Failed to update subscriber status to bounced: ${error.message}`,
        );
      }
    } else if (processedEvent.eventType === "unsubscribed") {
      try {
        await this.updateSubscriber(processedEvent.email, {
          status: "unsubscribed",
          unsubscribedAt: processedEvent.occurredAt,
        });
      } catch (error) {
        console.error(
          `Failed to update subscriber status to unsubscribed: ${error.message}`,
        );
      }
    }

    return processedEvent;
  }

  /**
   * Sync with Brevo (reconcile differences)
   */
  async syncWithBrevo() {
    // This would implement a sync process to reconcile
    // differences between local database and Brevo
    const stats = await this.brevoService.getAllListStats();
    return stats;
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
   * Generate verification token
   * @returns {string} Random verification token
   */
  generateVerificationToken() {
    return randomBytes(32).toString("hex");
  }
}

// Export singleton instance
let emailSubscriberServiceInstance = null;

export function getEmailSubscriberService() {
  if (!emailSubscriberServiceInstance) {
    emailSubscriberServiceInstance = new EmailSubscriberService();
  }
  return emailSubscriberServiceInstance;
}

/**
 * Reset singleton instance for testing
 */
export function resetEmailSubscriberService() {
  emailSubscriberServiceInstance = null;
}

export { EmailSubscriberService };
