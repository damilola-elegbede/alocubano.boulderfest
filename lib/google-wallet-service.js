import { GoogleAuth } from "google-auth-library";
import { v4 as uuidv4 } from "uuid";
import { getDatabaseClient } from "./database.js";
import jwt from "jsonwebtoken";
import { getQRTokenService } from "./qr-token-service.js";
import { isTestMode, getTestModeFlag } from "./test-mode-utils.js";
import { getTicketColorService } from "./ticket-color-service.js";

export class GoogleWalletService {
  constructor() {
    // Database client will be obtained when needed
    this.issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
    this.classId =
      process.env.GOOGLE_WALLET_CLASS_ID || "alocubano_tickets_2026";

    // Smart URL resolution: Production uses custom domain, previews use Vercel URL
    this.baseUrl = (process.env.VERCEL_ENV === 'production' && process.env.WALLET_BASE_URL)
      ? process.env.WALLET_BASE_URL
      : (process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://alocubano.vercel.app');

    // Initialize Google Auth
    if (process.env.GOOGLE_WALLET_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(
          Buffer.from(
            process.env.GOOGLE_WALLET_SERVICE_ACCOUNT,
            "base64",
          ).toString(),
        );

        this.auth = new GoogleAuth({
          credentials: serviceAccount,
          scopes: ["https://www.googleapis.com/auth/wallet_object.issuer"],
        });

        this.serviceAccount = serviceAccount;
      } catch (error) {
        console.error("Failed to initialize Google Auth:", error);
        this.auth = null;
        this.serviceAccount = null;
      }
    } else {
      this.auth = null;
      this.serviceAccount = null;
    }

    this.client = null;
    this.initializationPromise = null;
    this.walletApiUrl = "https://walletobjects.googleapis.com/walletobjects/v1";
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
   * Check if Google Wallet is configured
   */
  isConfigured() {
    return !!(this.issuerId && this.auth && this.serviceAccount);
  }

  /**
   * Get or create unified QR token for ticket
   */
  async getQRToken(ticketId) {
    const qrTokenService = getQRTokenService();
    return await qrTokenService.getOrCreateToken(ticketId);
  }

  /**
   * Initialize the authenticated client with concurrency-safe promise caching
   */
  async initClient() {
    if (!this.isConfigured()) {
      throw new Error(
        "Google Wallet is not configured. Please set required environment variables.",
      );
    }

    // Fast path: already initialized
    if (this.client) {
      return this.client;
    }

    // If initialization is in progress, return the existing promise
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performClientInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      // Clear promise on error to allow retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Perform actual client initialization
   */
  async _performClientInitialization() {
    try {
      this.client = await this.auth.getClient();
      return this.client;
    } catch (error) {
      this.client = null;
      throw error;
    }
  }

  /**
   * Create or update the event ticket class (template)
   */
  async createOrUpdateClass() {
    await this.initClient();

    const classDefinition = {
      id: `${this.issuerId}.${this.classId}`,
      issuerName: "A Lo Cubano Boulder Fest",
      reviewStatus: "UNDER_REVIEW",
      logo: {
        sourceUri: {
          uri: `${this.baseUrl}/images/logo.png`,
        },
        contentDescription: {
          defaultValue: {
            language: "en",
            value: "A Lo Cubano Boulder Fest Logo",
          },
        },
      },
      wideLogo: {
        sourceUri: {
          uri: `${this.baseUrl}/wallet/wallet-logo-2x.png`,
        },
        contentDescription: {
          defaultValue: {
            language: "en",
            value: "A Lo Cubano Boulder Fest Banner",
          },
        },
      },
      // Black background to match Apple Wallet design
      hexBackgroundColor: "#000000", // Black background
      homepageUri: {
        uri: this.baseUrl,
      },
      // Template customization to display object fields prominently
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            // Row 1: Attendee name and Ticket type
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['attendee']",
                      },
                    ],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['ticket-type']",
                      },
                    ],
                  },
                },
              },
            },
            // Row 2: Venue and Date
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['venue']",
                      },
                    ],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: "object.textModulesData['date']",
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };

    try {
      // Try to get existing class
      const response = await this.client.request({
        url: `${this.walletApiUrl}/eventTicketClass/${this.issuerId}.${this.classId}`,
        method: "GET",
      });

      // Update existing class
      await this.client.request({
        url: `${this.walletApiUrl}/eventTicketClass/${this.issuerId}.${this.classId}`,
        method: "PATCH",
        data: classDefinition,
      });

      console.log("Google Wallet class updated");
    } catch (error) {
      if (error.response?.status === 404) {
        // Create new class
        await this.client.request({
          url: `${this.walletApiUrl}/eventTicketClass`,
          method: "POST",
          data: classDefinition,
        });

        console.log("Google Wallet class created");
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate Google Wallet pass for a ticket
   */
  async generatePass(ticketId) {
    if (!this.isConfigured()) {
      throw new Error(
        "Google Wallet is not configured. Please set required environment variables.",
      );
    }

    try {
      await this.initClient();

      // Ensure class exists
      await this.createOrUpdateClass();

      // Get ticket details with validation
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT t.*, tr.transaction_id as order_number, tr.amount_cents, tr.status as transaction_status,
                     e.name as event_name, e.status as event_status,
                     e.start_date, e.end_date, e.venue_name, e.venue_address,
                     tt.name as ticket_type_name
              FROM tickets t
              JOIN transactions tr ON t.transaction_id = tr.id
              JOIN events e ON t.event_id = e.id
              LEFT JOIN ticket_types tt ON t.ticket_type_id = tt.id
              WHERE t.ticket_id = ?`,
        args: [ticketId],
      });

      if (result.rows.length === 0) {
        throw new Error("Ticket not found");
      }

      const ticket = result.rows[0];

      // DEBUG: Log actual date values from database
      console.log('[GoogleWallet] Ticket dates:', {
        ticket_id: ticketId,
        start_date: ticket.start_date,
        end_date: ticket.end_date,
        event_name: ticket.event_name,
        event_id: ticket.event_id
      });

      // Validate required fields - no fallbacks allowed
      if (!ticket.attendee_first_name || !ticket.attendee_last_name) {
        throw new Error(`Attendee name is required for ticket ${ticketId}`);
      }
      if (!ticket.event_name) {
        throw new Error(`Event name is required for ticket ${ticketId}`);
      }
      if (!ticket.venue_name) {
        throw new Error(`Venue name is required for ticket ${ticketId}`);
      }
      if (!ticket.start_date || !ticket.end_date) {
        throw new Error(`Event dates are required for ticket ${ticketId}`);
      }

      // Detect test mode
      const isTest = this.isTestTicket(ticket);

      // Get ticket color for visual indicators
      const colorService = getTicketColorService();
      const ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);

      // Validate ticket status before generating pass
      if (ticket.status === "cancelled") {
        throw new Error("Cannot generate pass for cancelled ticket");
      }
      if (ticket.status === "refunded") {
        throw new Error("Cannot generate pass for refunded ticket");
      }
      if (
        ticket.transaction_status === "pending" ||
        ticket.transaction_status === "failed"
      ) {
        throw new Error("Cannot generate pass for unpaid ticket");
      }

      // Check if pass already exists
      let objectId = ticket.google_pass_id;
      if (!objectId) {
        objectId = `${this.issuerId}.${uuidv4()}`;

        // Save pass ID to database with transaction support
        await db.batch(
          [
            {
              sql: `UPDATE tickets
                  SET google_pass_id = ?,
                      wallet_pass_generated_at = CURRENT_TIMESTAMP,
                      updated_at = CURRENT_TIMESTAMP
                  WHERE ticket_id = ?`,
              args: [objectId, ticketId],
            },
          ],
          "write",
        );
      }

      // Create pass object matching Apple Wallet design
      const passObject = {
        id: objectId,
        classId: `${this.issuerId}.${this.classId}`,
        state: "ACTIVE",
        ticketHolderName:
          `${ticket.attendee_first_name || ""} ${ticket.attendee_last_name || ""}`.trim() ||
          "Guest",
        ticketNumber: ticket.ticket_id,
        barcode: {
          type: "QR_CODE",
          value: await this.getQRToken(ticket.ticket_id),
          alternateText: ticket.ticket_id,
        },
        // Ticket type
        ticketType: {
          defaultValue: {
            language: "en",
            value: this.formatTicketType(ticket.ticket_type).toUpperCase(),
          },
        },
        groupingInfo: {
          groupingId: ticket.order_number || ticket.transaction_id,
          sortIndex: 1,
        },
        linkedOfferIds: [],
        validTimeInterval: {
          start: {
            dateTime: this.formatDateTimeForWallet(ticket.start_date, false),
          },
          end: {
            dateTime: this.formatDateTimeForWallet(ticket.end_date, true),
          },
        },
        // Custom styled fields to match Apple Wallet
        textModulesData: [
          {
            header: "ATTENDEE",
            body: `${ticket.attendee_first_name} ${ticket.attendee_last_name}`.trim(),
            id: "attendee",
          },
          {
            header: "TICKET",
            body: this.formatTicketType(ticket.ticket_type).toUpperCase(),
            id: "ticket-type",
          },
          {
            header: "VENUE",
            body: ticket.venue_name,
            id: "venue",
          },
          {
            header: "DATE",
            body: this.formatEventDate(ticket.start_date, ticket.end_date),
            id: "date",
          },
        ],
        // Info module for back of pass
        infoModuleData: {
          labelValueRows: [
            {
              columns: [
                {
                  label: "VENUE",
                  value: `${ticket.venue_name}\n${ticket.venue_address}`,
                },
              ],
            },
            {
              columns: [
                {
                  label: "TICKET ID",
                  value: ticket.ticket_id,
                },
              ],
            },
            {
              columns: [
                {
                  label: "CHECK-IN INSTRUCTIONS",
                  value: "Present this pass at the entrance. Have your ID ready. The QR code will be scanned for entry.",
                },
              ],
            },
            {
              columns: [
                {
                  label: "SUPPORT",
                  value:
                    "Email: alocubanoboulderfest@gmail.com\nWebsite: alocubano.vercel.app",
                },
              ],
            },
          ],
        },
        messages: [
          {
            header: "Welcome to A Lo Cubano!",
            body: "Show this ticket at the entrance for scanning.",
            displayInterval: {
              start: {
                dateTime: this.formatDateTimeForWallet(ticket.start_date, false),
              },
            },
          },
        ],
        // Hero image with branding and colored indicator (matching Apple Wallet design)
        heroImage: {
          sourceUri: {
            uri: `${this.baseUrl}/api/wallet/hero/${encodeURIComponent(ticket.ticket_type)}`,
          },
          contentDescription: {
            defaultValue: {
              language: "en",
              value: ticket.event_name,
            },
          },
        },
        // Colored circle indicator (matching Apple Wallet thumbnail)
        imageModulesData: [
          {
            mainImage: {
              sourceUri: {
                uri: `${this.baseUrl}/api/wallet/circle?rgb=${encodeURIComponent(ticketColor.rgb)}&size=90`,
              },
              contentDescription: {
                defaultValue: {
                  language: "en",
                  value: `${ticketColor.name} ticket indicator`,
                },
              },
            },
            id: "ticket-color-indicator",
          },
        ],
      };

      // Create or update the pass object
      try {
        await this.client.request({
          url: `${this.walletApiUrl}/eventTicketObject/${objectId}`,
          method: "PUT",
          data: passObject,
        });
      } catch (error) {
        if (error.response?.status === 404) {
          await this.client.request({
            url: `${this.walletApiUrl}/eventTicketObject`,
            method: "POST",
            data: passObject,
          });
        } else {
          throw error;
        }
      }

      // Generate save link
      const saveUrl = await this.generateSaveUrl(objectId);

      // Log the event
      await this.logPassEvent(ticket.id, "created", { objectId });

      return {
        objectId,
        saveUrl,
      };
    } catch (error) {
      console.error("Failed to generate Google Wallet pass:", error);
      throw error;
    }
  }

  /**
   * Generate a signed JWT for the "Add to Google Wallet" link
   */
  async generateSaveUrl(objectId) {
    if (!this.serviceAccount) {
      throw new Error("Google Wallet service account not configured");
    }

    const claims = {
      iss: this.serviceAccount.client_email,
      aud: "google",
      origins: [this.baseUrl],
      typ: "savetowallet",
      payload: {
        eventTicketObjects: [
          {
            id: objectId,
          },
        ],
      },
    };

    const token = jwt.sign(claims, this.serviceAccount.private_key, {
      algorithm: "RS256",
    });

    return `https://pay.google.com/gp/v/save/${token}`;
  }

  /**
   * Format ticket type for display (matching Apple Wallet uppercase style)
   */
  formatTicketType(type) {
    const typeMap = {
      "vip-pass": "VIP PASS",
      "weekend-pass": "WEEKEND PASS",
      "friday-pass": "FRIDAY PASS",
      "saturday-pass": "SATURDAY PASS",
      "sunday-pass": "SUNDAY PASS",
      "workshop-beginner": "BEGINNER WORKSHOP",
      "workshop-intermediate": "INTERMEDIATE WORKSHOP",
      "workshop-advanced": "ADVANCED WORKSHOP",
      workshop: "WORKSHOP",
      "social-dance": "SOCIAL DANCE",
      "general-admission": "GENERAL ADMISSION",
    };

    return typeMap[type] || type.toUpperCase();
  }

  /**
   * Format event date range
   */
  formatEventDate(startDate, endDate) {
    if (!startDate || !endDate) {
      throw new Error('Event dates are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Same month and year
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${monthNames[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
    }

    // Different months or years
    return `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  }

  /**
   * Format date to ISO 8601 datetime with Mountain Time offset for Google Wallet
   * Google Wallet requires ISO 8601 extended format: "2028-01-01T00:00:00-07:00"
   * @param {string} dateString - Date string in format "2028-01-01"
   * @param {boolean} isEndDate - If true, set time to 23:59:59 (end of day)
   * @returns {string} ISO 8601 datetime string with Mountain Time offset
   */
  formatDateTimeForWallet(dateString, isEndDate = false) {
    if (!dateString) {
      throw new Error('Date string is required');
    }

    const date = new Date(dateString);

    // Set time based on whether it's start or end of day
    const hours = isEndDate ? 23 : 0;
    const minutes = isEndDate ? 59 : 0;
    const seconds = isEndDate ? 59 : 0;

    // Mountain Time is UTC-7 (MST) or UTC-6 (MDT)
    // For simplicity, use MST (-07:00) as it's the standard time
    // Google Wallet accepts any valid timezone offset
    const timezoneOffset = '-07:00';

    // Format: YYYY-MM-DDTHH:mm:ss-07:00
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hoursStr = String(hours).padStart(2, '0');
    const minutesStr = String(minutes).padStart(2, '0');
    const secondsStr = String(seconds).padStart(2, '0');

    return `${year}-${month}-${day}T${hoursStr}:${minutesStr}:${secondsStr}${timezoneOffset}`;
  }

  /**
   * Update pass
   */
  async updatePass(objectId, updates) {
    if (!this.isConfigured()) {
      throw new Error("Google Wallet is not configured");
    }

    await this.initClient();

    try {
      await this.client.request({
        url: `${this.walletApiUrl}/eventTicketObject/${objectId}`,
        method: "PATCH",
        data: updates,
      });

      const db = await getDatabaseClient();
      await db.batch(
        [
          {
            sql: `UPDATE tickets
                SET wallet_pass_updated_at = CURRENT_TIMESTAMP
                WHERE google_pass_id = ?`,
            args: [objectId],
          },
        ],
        "write",
      );

      console.log(`Google Wallet pass updated: ${objectId}`);
    } catch (error) {
      console.error("Failed to update Google Wallet pass:", error);
      throw error;
    }
  }

  /**
   * Revoke a pass
   */
  async revokePass(ticketId, reason) {
    const db = await getDatabaseClient();
    const result = await db.execute({
      sql: `SELECT * FROM tickets WHERE ticket_id = ?`,
      args: [ticketId],
    });

    if (result.rows.length === 0) {
      throw new Error("Ticket not found");
    }

    const ticket = result.rows[0];

    if (ticket.google_pass_id && this.isConfigured()) {
      await this.updatePass(ticket.google_pass_id, {
        state: "EXPIRED",
        disableExpirationNotification: true,
      });
    }

    await db.batch(
      [
        {
          sql: `UPDATE tickets
              SET wallet_pass_revoked_at = CURRENT_TIMESTAMP,
                  wallet_pass_revoked_reason = ?
              WHERE ticket_id = ?`,
          args: [reason, ticketId],
        },
      ],
      "write",
    );

    await this.logPassEvent(ticket.id, "revoked", { reason });
  }

  /**
   * Log wallet pass event
   */
  async logPassEvent(ticketId, eventType, eventData = {}) {
    const db = await getDatabaseClient();
    await db.batch(
      [
        {
          sql: `INSERT INTO wallet_pass_events (
          pass_serial, ticket_id, pass_type, event_type, event_data
        ) VALUES (?, ?, ?, ?, ?)`,
          args: [
            `google-${ticketId}`,
            ticketId,
            "google",
            eventType,
            JSON.stringify(eventData),
          ],
        },
      ],
      "write",
    );
  }
}

export default new GoogleWalletService();
