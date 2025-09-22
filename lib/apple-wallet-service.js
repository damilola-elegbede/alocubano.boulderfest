import { PKPass } from "passkit-generator";
import { v4 as uuidv4 } from "uuid";
import { getDatabaseClient } from "./database.js";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getQRTokenService } from "./qr-token-service.js";
import { isTestMode, getTestModeFlag } from "./test-mode-utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AppleWalletService {
  constructor() {
    // Database client will be obtained when needed
    this.passTypeId = process.env.APPLE_PASS_TYPE_ID;
    this.teamId = process.env.APPLE_TEAM_ID;
    this.organizationName =
      process.env.APPLE_PASS_ORGANIZATION || "A Lo Cubano Boulder Fest";
    this.baseUrl =
      process.env.WALLET_BASE_URL || "https://alocubano.vercel.app";

    // Event and venue configuration
    this.eventStartDate =
      process.env.EVENT_START_DATE || "2026-05-15T10:00:00-06:00";
    this.eventEndDate =
      process.env.EVENT_END_DATE || "2026-05-17T23:00:00-06:00";
    this.eventDatesDisplay =
      process.env.EVENT_DATES_DISPLAY || "May 15-17, 2026";
    this.venueName = process.env.VENUE_NAME || "Avalon Ballroom";
    this.venueAddress =
      process.env.VENUE_ADDRESS || "6185 Arapahoe Road, Boulder, CO 80303";
    this.venueLatitude = parseFloat(process.env.VENUE_LATITUDE || "40.014984");
    this.venueLongitude = parseFloat(
      process.env.VENUE_LONGITUDE || "-105.219544",
    );

    // Critical wallet secrets - fail immediately if missing
    if (!process.env.APPLE_PASS_KEY) {
      throw new Error("❌ FATAL: APPLE_PASS_KEY secret not configured");
    }
    if (!process.env.WALLET_AUTH_SECRET) {
      throw new Error("❌ FATAL: WALLET_AUTH_SECRET secret not configured");
    }

    this.initializationError = null;

    // Decode certificates from base64
    this.signerCert = process.env.APPLE_PASS_CERT
      ? Buffer.from(process.env.APPLE_PASS_CERT, "base64")
      : null;
    this.signerKey = Buffer.from(process.env.APPLE_PASS_KEY, "base64");
    this.signerKeyPassphrase = process.env.APPLE_PASS_PASSWORD;
    this.wwdrCert = process.env.APPLE_WWDR_CERT
      ? Buffer.from(process.env.APPLE_WWDR_CERT, "base64")
      : null;

    // JWT authentication secret for wallet updates
    this.walletAuthSecret = process.env.WALLET_AUTH_SECRET;
  }

  /**
   * Detect if a ticket is a test ticket
   */
  isTestTicket(ticket) {
    if (!ticket) return false;

    // Primary check: is_test field
    if (typeof ticket.is_test === 'number') {
      return ticket.is_test === 1;
    }

    // Fallback: check patterns in ticket ID
    const ticketId = ticket.ticket_id || ticket.id || '';
    return /test[_-]?ticket|^TEST[_-]|[_-]TEST$/i.test(ticketId);
  }

  /**
   * Get test mode styling for wallet passes
   */
  getTestModeWalletStyling(isTest) {
    if (!isTest) {
      return {
        foregroundColor: "rgb(0, 0, 0)", // Black text
        backgroundColor: "rgb(255, 255, 255)", // White background
        labelColor: "rgb(206, 17, 38)", // Cuban flag red for labels
      };
    }

    return {
      backgroundColor: "rgb(255, 248, 220)", // Light yellow background
      foregroundColor: "rgb(139, 69, 19)",   // Dark brown text
      labelColor: "rgb(255, 140, 0)",        // Orange labels
    };
  }

  /**
   * Check if Apple Wallet is configured
   */
  isConfigured() {
    // Check for initialization errors first
    if (this.initializationError) {
      return false;
    }

    const hasCertificates = !!(
      this.passTypeId &&
      this.teamId &&
      this.signerCert &&
      this.signerKey &&
      this.wwdrCert
    );
    const hasValidPassphrase = this.signerKeyPassphrase !== undefined; // Allow empty passphrase
    const hasWalletAuthSecret = !!this.walletAuthSecret;

    return hasCertificates && hasValidPassphrase && hasWalletAuthSecret;
  }

  /**
   * Generate Apple Wallet pass for a ticket
   */
  async generatePass(ticketId) {
    if (!this.isConfigured()) {
      throw new Error(
        "Apple Wallet is not configured. Please set required environment variables.",
      );
    }

    try {
      // Get ticket details
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT t.*, tr.transaction_id as order_number, tr.amount_cents
              FROM tickets t
              JOIN transactions tr ON t.transaction_id = tr.id
              WHERE t.ticket_id = ?`,
        args: [ticketId],
      });

      if (result.rows.length === 0) {
        throw new Error("Ticket not found");
      }

      const ticket = result.rows[0];

      // Check if pass already exists
      if (ticket.apple_pass_serial) {
        console.log(`Apple pass already exists for ticket ${ticketId}`);
        // Regenerate with same serial number
        return await this.createPassFile(ticket, ticket.apple_pass_serial);
      }

      // Generate cryptographically secure serial number using full UUID
      const serialNumber = `ALO26-${uuidv4().toUpperCase()}`;

      // Create the pass
      const passBuffer = await this.createPassFile(ticket, serialNumber);

      // Save serial number to database
      await db.execute({
        sql: `UPDATE tickets
              SET apple_pass_serial = ?,
                  wallet_pass_generated_at = CURRENT_TIMESTAMP,
                  updated_at = CURRENT_TIMESTAMP
              WHERE ticket_id = ?`,
        args: [serialNumber, ticketId],
      });

      // Log the event
      await this.logPassEvent(ticket.id, "created", { serialNumber });

      return passBuffer;
    } catch (error) {
      console.error("Failed to generate Apple Wallet pass:", error);
      throw error;
    }
  }

  /**
   * Create the actual .pkpass file
   */
  async createPassFile(ticket, serialNumber) {
    const pass = new PKPass(
      {},
      {
        signerCert: this.signerCert,
        signerKey: this.signerKey,
        signerKeyPassphrase: this.signerKeyPassphrase,
        wwdr: this.wwdrCert,
      },
    );

    // Detect test mode and get styling
    const isTest = this.isTestTicket(ticket);
    const styling = this.getTestModeWalletStyling(isTest);

    // Set pass fields
    pass.passTypeIdentifier = this.passTypeId;
    pass.teamIdentifier = this.teamId;
    pass.organizationName = this.organizationName;
    pass.serialNumber = serialNumber;
    pass.description = isTest ?
      "A Lo Cubano Boulder Fest Ticket (TEST MODE)" :
      "A Lo Cubano Boulder Fest Ticket";
    pass.foregroundColor = styling.foregroundColor;
    pass.backgroundColor = styling.backgroundColor;
    pass.labelColor = styling.labelColor;
    pass.logoText = isTest ? "A Lo Cubano (TEST)" : "A Lo Cubano";

    // Pass structure for event ticket
    pass.eventTicket = {
      // Primary fields
      primaryFields: [
        {
          key: "event",
          label: "EVENT",
          value: isTest ?
            "A Lo Cubano Boulder Fest 2026 (TEST)" :
            "A Lo Cubano Boulder Fest 2026",
        },
      ],

      // Secondary fields
      secondaryFields: [
        {
          key: "ticket-type",
          label: "TICKET TYPE",
          value: this.formatTicketType(ticket.ticket_type),
        },
        {
          key: "name",
          label: "ATTENDEE",
          value:
            `${ticket.attendee_first_name || ""} ${ticket.attendee_last_name || ""}`.trim() ||
            "Guest",
        },
      ],

      // Auxiliary fields
      auxiliaryFields: [
        {
          key: "date",
          label: "DATES",
          value: this.eventDatesDisplay,
        },
        {
          key: "order",
          label: "ORDER",
          value: ticket.order_number || ticket.transaction_id,
        },
      ],

      // Back fields
      backFields: [
        {
          key: "venue",
          label: "VENUE",
          value: `${this.venueName}\n${this.venueAddress}`,
        },
        {
          key: "ticket-id",
          label: "TICKET ID",
          value: ticket.ticket_id,
        },
        ...(isTest ? [{
          key: "test-notice",
          label: "⚠️ TEST MODE NOTICE",
          value:
            "This is a TEST ticket for development/testing purposes. " +
            "NOT VALID for actual event entry. Test data may be cleaned up periodically.",
        }] : []),
        {
          key: "instructions",
          label: "CHECK-IN INSTRUCTIONS",
          value: isTest ?
            "⚠️ TEST MODE: This ticket will NOT grant entry to the actual event. For testing purposes only." :
            "Present this pass at the entrance. Have your ID ready. The QR code will be scanned for entry.",
        },
        {
          key: "support",
          label: "SUPPORT",
          value:
            "Email: alocubanoboulderfest@gmail.com\nWebsite: alocubano.vercel.app",
        },
        {
          key: "terms",
          label: "TERMS & CONDITIONS",
          value: isTest ?
            "TEST MODE: This ticket is for testing purposes only and grants no access to the actual event. " +
            "Test data may be automatically cleaned up periodically." :
            "This ticket is non-refundable and non-transferable unless otherwise stated. " +
            "Must be 21+ with valid ID. Subject to venue capacity.",
        },
      ],
    };

    // Get or create unified QR token
    const qrTokenService = getQRTokenService();
    const qrToken = await qrTokenService.getOrCreateToken(ticket.ticket_id);

    // Barcode (QR code with ticket validation token)
    pass.barcodes = [
      {
        format: "PKBarcodeFormatQR",
        message: qrToken,
        messageEncoding: "iso-8859-1",
        altText: ticket.ticket_id,
      },
    ];

    // Relevance information
    pass.relevantDate = this.eventStartDate;
    pass.locations = [
      {
        latitude: this.venueLatitude,
        longitude: this.venueLongitude,
        relevantText: "Welcome to A Lo Cubano Boulder Fest!",
      },
    ];

    // Web service for updates (optional)
    if (process.env.WALLET_ENABLE_UPDATES === "true") {
      pass.webServiceURL = `${this.baseUrl}/api/wallet/apple`;
      pass.authenticationToken = this.generateAuthToken(ticket.ticket_id);
    }

    // Add images (logo, icon, etc.)
    // These should be added to your project
    try {
      const projectRoot = path.join(__dirname, "..", "..");

      // Logo - 160x50 points
      const logoPath = path.join(projectRoot, "public", "wallet", "logo.png");
      const logoBuffer = await fs.readFile(logoPath);
      pass.addBuffer("logo.png", logoBuffer);

      const logo2xPath = path.join(
        projectRoot,
        "public",
        "wallet",
        "logo@2x.png",
      );
      const logo2xBuffer = await fs.readFile(logo2xPath);
      pass.addBuffer("logo@2x.png", logo2xBuffer);

      // Icon - 29x29 points
      const iconPath = path.join(projectRoot, "public", "wallet", "icon.png");
      const iconBuffer = await fs.readFile(iconPath);
      pass.addBuffer("icon.png", iconBuffer);

      const icon2xPath = path.join(
        projectRoot,
        "public",
        "wallet",
        "icon@2x.png",
      );
      const icon2xBuffer = await fs.readFile(icon2xPath);
      pass.addBuffer("icon@2x.png", icon2xBuffer);

      // Strip image - 375x98 points (optional)
      const stripPath = path.join(projectRoot, "public", "wallet", "strip.png");
      const stripBuffer = await fs.readFile(stripPath);
      pass.addBuffer("strip.png", stripBuffer);

      const strip2xPath = path.join(
        projectRoot,
        "public",
        "wallet",
        "strip@2x.png",
      );
      const strip2xBuffer = await fs.readFile(strip2xPath);
      pass.addBuffer("strip@2x.png", strip2xBuffer);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("Wallet images not found, using defaults");
      } else {
        // Re-throw unexpected errors for proper error handling
        console.error("Unexpected error loading wallet images:", error);
        throw error;
      }
    }

    return await pass.generate();
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    const typeMap = {
      "vip-pass": "VIP Pass",
      "weekend-pass": "Weekend Pass",
      "friday-pass": "Friday Pass",
      "saturday-pass": "Saturday Pass",
      "sunday-pass": "Sunday Pass",
      "workshop-beginner": "Beginner Workshop",
      "workshop-intermediate": "Intermediate Workshop",
      "workshop-advanced": "Advanced Workshop",
      workshop: "Workshop",
      "social-dance": "Social Dance",
      "general-admission": "General Admission",
    };

    return typeMap[type] || type;
  }

  /**
   * Generate JWT authentication token for pass updates
   */
  generateAuthToken(ticketId) {
    // WALLET_AUTH_SECRET should already be validated in constructor
    // This is a safety check
    if (!this.walletAuthSecret) {
      throw new Error("❌ FATAL: WALLET_AUTH_SECRET secret not configured");
    }

    const payload = {
      ticketId,
      type: "wallet_pass",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year expiry
    };

    return jwt.sign(payload, this.walletAuthSecret, {
      algorithm: "HS256",
      issuer: "alocubano-boulderfest",
      audience: "apple-wallet",
    });
  }

  /**
   * Verify JWT authentication token
   */
  verifyAuthToken(token) {
    // WALLET_AUTH_SECRET should already be validated in constructor
    // This is a safety check
    if (!this.walletAuthSecret) {
      throw new Error("❌ FATAL: WALLET_AUTH_SECRET secret not configured");
    }

    try {
      return jwt.verify(token, this.walletAuthSecret, {
        algorithms: ["HS256"],
        issuer: "alocubano-boulderfest",
        audience: "apple-wallet",
      });
    } catch (error) {
      console.error("JWT verification failed:", error.message);
      return null;
    }
  }

  /**
   * Update pass (push notification to device)
   */
  async updatePass(serialNumber, changes) {
    // This would require implementing Apple Push Notification service
    // For now, log the update request
    console.log(`Pass update requested for ${serialNumber}:`, changes);

    const db = await getDatabaseClient();
    await db.execute({
      sql: `UPDATE tickets
            SET wallet_pass_updated_at = CURRENT_TIMESTAMP
            WHERE apple_pass_serial = ?`,
      args: [serialNumber],
    });
  }

  /**
   * Revoke a pass
   */
  async revokePass(ticketId, reason) {
    // First get the ticket id for logging
    const db = await getDatabaseClient();
    const ticket = await db.execute({
      sql: "SELECT id FROM tickets WHERE ticket_id = ?",
      args: [ticketId],
    });

    if (ticket.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    // Update the ticket with revocation info
    await db.execute({
      sql: `UPDATE tickets
            SET wallet_pass_revoked_at = CURRENT_TIMESTAMP,
                wallet_pass_revoked_reason = ?
            WHERE ticket_id = ?`,
      args: [reason, ticketId],
    });

    // Log the revocation event
    await this.logPassEvent(ticket.rows[0].id, "revoked", { reason });
  }

  /**
   * Log wallet pass event
   */
  async logPassEvent(ticketId, eventType, eventData = {}) {
    const db = await getDatabaseClient();
    await db.execute({
      sql: `INSERT INTO wallet_pass_events (
        ticket_id, pass_type, event_type, event_data
      ) VALUES (?, ?, ?, ?)`,
      args: [ticketId, "apple", eventType, JSON.stringify(eventData)],
    });
  }
}

export default new AppleWalletService();
