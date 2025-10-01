import { PKPass } from "passkit-generator";
import { v4 as uuidv4 } from "uuid";
import { getDatabaseClient } from "./database.js";
import jwt from "jsonwebtoken";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getQRTokenService } from "./qr-token-service.js";
import { isTestMode, getTestModeFlag } from "./test-mode-utils.js";
import forge from "node-forge";

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
    if (!process.env.APPLE_PASS_CERT) {
      throw new Error("❌ FATAL: APPLE_PASS_CERT secret not configured");
    }
    if (!process.env.WALLET_AUTH_SECRET) {
      throw new Error("❌ FATAL: WALLET_AUTH_SECRET secret not configured");
    }

    this.initializationError = null;

    // Decode certificates from base64 and ensure PEM format
    try {
      // Check if APPLE_PASS_CERT or APPLE_PASS_KEY contains a PKCS#12 bundle
      const certData = process.env.APPLE_PASS_CERT ? Buffer.from(process.env.APPLE_PASS_CERT, "base64") : null;
      const keyData = Buffer.from(process.env.APPLE_PASS_KEY, "base64");

      // Try to detect PKCS#12 format (check if either contains a .p12 bundle)
      const pkcs12Result = this.tryExtractFromPKCS12(certData || keyData, process.env.APPLE_PASS_PASSWORD);

      if (pkcs12Result) {
        console.log("[Apple Wallet] PKCS#12 bundle detected, extracted certificate and key");
        this.signerCert = pkcs12Result.certificate;
        this.signerKey = pkcs12Result.privateKey;
      } else {
        // Handle as separate DER/PEM files
        this.signerCert = certData
          ? this.decodeCertificate(process.env.APPLE_PASS_CERT, "CERTIFICATE")
          : null;
        this.signerKey = this.decodeCertificate(process.env.APPLE_PASS_KEY, "PRIVATE KEY");
      }

      this.wwdrCert = process.env.APPLE_WWDR_CERT
        ? this.decodeCertificate(process.env.APPLE_WWDR_CERT, "CERTIFICATE")
        : null;
    } catch (error) {
      this.initializationError = error;
      console.error("Failed to decode Apple Wallet certificates:", error.message);
    }

    // Convert empty string to undefined (Joi rejects empty strings but accepts undefined)
    this.signerKeyPassphrase = process.env.APPLE_PASS_PASSWORD || undefined;

    // JWT authentication secret for wallet updates
    this.walletAuthSecret = process.env.WALLET_AUTH_SECRET;
  }

  /**
   * Get the declared length from a DER-encoded object
   * Used to validate certificate integrity before conversion
   */
  getDerLength(buffer) {
    // DER format: TAG (1 byte) + LENGTH (1+ bytes) + VALUE
    // For certificates: 0x30 (SEQUENCE tag)

    if (buffer.length < 2) {
      return 0;
    }

    // Second byte indicates length encoding
    const lengthByte = buffer[1];

    if (lengthByte < 0x80) {
      // Short form: length is in the byte itself
      // Total length = tag (1) + length (1) + value (lengthByte)
      return 2 + lengthByte;
    } else {
      // Long form: lengthByte & 0x7F = number of length bytes
      const numLengthBytes = lengthByte & 0x7F;

      if (buffer.length < 2 + numLengthBytes) {
        return buffer.length; // Not enough data to read length
      }

      // Read the actual length from the following bytes
      let length = 0;
      for (let i = 0; i < numLengthBytes; i++) {
        length = (length << 8) | buffer[2 + i];
      }

      // Total length = tag (1) + length indicator (1) + length bytes + value
      return 2 + numLengthBytes + length;
    }
  }

  /**
   * Try to extract certificate and private key from PKCS#12 bundle
   * Returns null if not PKCS#12 format
   */
  tryExtractFromPKCS12(buffer, password) {
    if (!buffer) return null;

    try {
      console.log("[Apple Wallet] Checking for PKCS#12 format...");

      // Convert Buffer to node-forge format
      const asn1 = forge.asn1.fromDer(buffer.toString("binary"));

      // Try to parse as PKCS#12
      const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password || "");

      console.log("[Apple Wallet] Successfully parsed PKCS#12 bundle!");

      // Extract certificate and private key bags
      const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
      const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

      // Get the first certificate and key
      const certBag = certBags[forge.pki.oids.certBag]?.[0];
      const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];

      if (!certBag || !keyBag) {
        console.warn("[Apple Wallet] PKCS#12 is valid but missing certificate or key bags");
        return null;
      }

      // Convert to PEM format
      const certificate = forge.pki.certificateToPem(certBag.cert);
      const privateKey = forge.pki.privateKeyToPem(keyBag.key);

      console.log("[Apple Wallet] Extracted certificate and key from PKCS#12");

      return {
        certificate: Buffer.from(certificate, "utf8"),
        privateKey: Buffer.from(privateKey, "utf8")
      };
    } catch (error) {
      // Not PKCS#12 or invalid format - this is OK, just return null
      console.log("[Apple Wallet] Not PKCS#12 format, will try DER/PEM");
      return null;
    }
  }

  /**
   * Decode base64 certificate and ensure proper PEM format
   * Handles both DER (binary) and PEM (text) formats
   */
  decodeCertificate(base64String, certType) {
    if (!base64String) {
      throw new Error(`Missing ${certType} in environment variable`);
    }

    try {
      // Decode from base64 to get the raw content
      const decodedBuffer = Buffer.from(base64String, "base64");

      console.log(`[Apple Wallet] Decoding ${certType}...`);

      // Try to interpret as UTF-8 text (for PEM format)
      const asText = decodedBuffer.toString("utf8");

      // Check if it's already in PEM format (text-based)
      const isPemFormat = asText.includes("-----BEGIN") && asText.includes("-----END");

      if (isPemFormat) {
        console.log(`[Apple Wallet] ${certType} is already in PEM format`);

        // Extract and validate the PEM headers
        const beginMatch = asText.match(/-----BEGIN ([^-]+)-----/);
        const endMatch = asText.match(/-----END ([^-]+)-----/);

        if (beginMatch && endMatch) {
          const actualType = beginMatch[1];
          console.log(`[Apple Wallet] Detected PEM type: ${actualType}`);

          if (beginMatch[1] !== endMatch[1]) {
            throw new Error(
              `Mismatched PEM headers: BEGIN has "${beginMatch[1]}" but END has "${endMatch[1]}"`
            );
          }

          // Normalize and return
          const normalized = asText.trim().replace(/\r\n/g, "\n");
          console.log(`[Apple Wallet] PEM format validated, type: ${actualType}`);
          return Buffer.from(normalized, "utf8");
        } else {
          throw new Error("Could not parse PEM headers");
        }
      }

      // Check if it's DER format (binary) by looking at the first bytes
      // DER certificates/keys start with 0x30 0x82 or 0x30 0x81 (ASN.1 SEQUENCE)
      const isDerFormat = decodedBuffer[0] === 0x30 && (decodedBuffer[1] === 0x82 || decodedBuffer[1] === 0x81 || decodedBuffer[1] === 0x83);

      if (isDerFormat) {
        console.log(`[Apple Wallet] ${certType} is in DER format (binary), converting to PEM...`);

        // Validate DER structure before conversion
        const derLength = this.getDerLength(decodedBuffer);
        if (derLength > decodedBuffer.length) {
          throw new Error(
            `DER certificate is corrupted or incomplete. ` +
            `Header claims ${derLength} bytes, but only ${decodedBuffer.length} bytes available. ` +
            `Please re-download the certificate from Apple and update the environment variable.`
          );
        }

        console.log(`[Apple Wallet] DER validation passed`);

        // Convert DER buffer to base64 string
        const derAsBase64 = decodedBuffer.toString("base64");

        // Split into 64-character lines (PEM standard)
        const lines = [];
        for (let i = 0; i < derAsBase64.length; i += 64) {
          lines.push(derAsBase64.substring(i, i + 64));
        }
        const formattedBase64 = lines.join("\n");

        // Determine appropriate PEM header
        let headerType = certType;

        // Wrap in PEM headers
        const pemContent = `-----BEGIN ${headerType}-----\n${formattedBase64}\n-----END ${headerType}-----`;

        console.log(`[Apple Wallet] Converted DER to PEM format, type: ${headerType}`);

        // Validate the generated PEM by trying to parse it
        try {
          if (certType === "CERTIFICATE") {
            forge.pki.certificateFromPem(pemContent);
            console.log(`[Apple Wallet] PEM validation passed: certificate is valid`);
          }
        } catch (validationError) {
          throw new Error(
            `Generated PEM is invalid: ${validationError.message}. ` +
            `The ${certType} may be corrupted. Please re-download from Apple.`
          );
        }

        return Buffer.from(pemContent, "utf8");
      }

      // If we get here, the format is unclear - try to handle gracefully
      console.warn(`[Apple Wallet] ${certType} format unclear, attempting as base64 text...`);

      // Assume it's base64 text without headers, clean and wrap
      const cleanText = asText.replace(/\s/g, "");

      // Check if it looks like base64
      if (!/^[A-Za-z0-9+/=]+$/.test(cleanText)) {
        throw new Error(
          `Certificate content is neither valid PEM nor DER format. ` +
          `First bytes: ${Array.from(decodedBuffer.slice(0, 10)).map(b => `0x${b.toString(16)}`).join(" ")}`
        );
      }

      // Format as PEM
      const lines = [];
      for (let i = 0; i < cleanText.length; i += 64) {
        lines.push(cleanText.substring(i, i + 64));
      }
      const formattedBase64 = lines.join("\n");
      const pemContent = `-----BEGIN ${certType}-----\n${formattedBase64}\n-----END ${certType}-----`;

      console.log(`[Apple Wallet] Formatted as PEM, type: ${certType}`);
      return Buffer.from(pemContent, "utf8");

    } catch (error) {
      console.error(`[Apple Wallet] Certificate decode failed for ${certType}:`, error.message);
      throw new Error(
        `Failed to decode ${certType}: ${error.message}. ` +
        `Ensure the environment variable contains valid base64-encoded certificate.`
      );
    }
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
    // NOT USED - All passes use same styling regardless of test mode
    if (!isTest) {
      return {
        foregroundColor: "rgb(0, 0, 0)",        // Black text
        backgroundColor: "rgb(255, 255, 255)",  // White background
        labelColor: "rgb(206, 17, 38)",         // Cuban flag red for labels
      };
    }

    return {
      backgroundColor: "rgb(255, 248, 220)",    // Light yellow background
      foregroundColor: "rgb(139, 69, 19)",      // Dark brown text
      labelColor: "rgb(255, 140, 0)",           // Orange labels
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
    const hasValidPassphrase = true; // Passphrase is optional for unencrypted keys
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
      // Get ticket details with event information
      const db = await getDatabaseClient();
      const result = await db.execute({
        sql: `SELECT t.*, tr.transaction_id as order_number, tr.amount_cents,
                     e.name as event_name, e.status as event_status,
                     e.start_date, e.end_date, e.venue_name, e.venue_address
              FROM tickets t
              JOIN transactions tr ON t.transaction_id = tr.id
              JOIN events e ON t.event_id = e.id
              WHERE t.ticket_id = ?`,
        args: [ticketId],
      });

      if (result.rows.length === 0) {
        throw new Error("Ticket not found");
      }

      const ticket = result.rows[0];

      // DIAGNOSTIC: Log ticket data being used for pass generation
      console.log('[Apple Wallet] Ticket data for pass generation:');
      console.log(`  - ticket_id: ${ticket.ticket_id}`);
      console.log(`  - event_name: "${ticket.event_name}"`);
      console.log(`  - ticket_type: "${ticket.ticket_type}"`);
      console.log(`  - attendee: "${ticket.attendee_first_name || ''} ${ticket.attendee_last_name || ''}"`);
      console.log(`  - dates: ${ticket.start_date} to ${ticket.end_date}`);
      console.log(`  - order_number: ${ticket.order_number || ticket.transaction_id}`);

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
    // Build certificate configuration
    const certificateConfig = {
      signerCert: this.signerCert,
      signerKey: this.signerKey,
      wwdr: this.wwdrCert,
    };

    // Only include passphrase if explicitly set (not undefined)
    // Joi validation rejects empty strings but accepts undefined
    if (this.signerKeyPassphrase !== undefined) {
      certificateConfig.signerKeyPassphrase = this.signerKeyPassphrase;
    }

    // Get or create unified QR token
    const qrTokenService = getQRTokenService();
    const qrToken = await qrTokenService.getOrCreateToken(ticket.ticket_id);

    if (!qrToken) {
      throw new Error(`Failed to generate QR token for ticket ${ticket.ticket_id}`);
    }

    console.log(`[Apple Wallet] QR token: ${qrToken.substring(0, 20)}...`);

    // Build pass configuration object (third parameter in v3 API)
    const passProps = {
      // Apple Wallet Required Fields
      formatVersion: 1,
      passTypeIdentifier: this.passTypeId,
      teamIdentifier: this.teamId,
      organizationName: this.organizationName,
      serialNumber: serialNumber,
      description: `${ticket.event_name} Ticket`,

      // Visual Styling (Cuban flag colors)
      // NOTE: Apple Wallet requires rgb() format with spaces, not hex
      foregroundColor: "rgb(0, 0, 0)",         // Black text for field values
      backgroundColor: "rgb(255, 255, 255)",   // White background
      labelColor: "rgb(206, 17, 38)",          // Cuban red labels only
      // logoText removed - logo image stands alone for proper color control
      // Barcodes removed from constructor - will be set after pass.type using setBarcodes()

      // Relevance information
      relevantDate: this.eventStartDate,
      locations: [
        {
          latitude: this.venueLatitude,
          longitude: this.venueLongitude,
          relevantText: `Welcome to ${ticket.event_name}!`,
        },
      ],
    };

    // Add web service configuration if enabled
    if (process.env.WALLET_ENABLE_UPDATES === "true") {
      passProps.webServiceURL = `${this.baseUrl}/api/tickets/apple-wallet`;
      passProps.authenticationToken = this.generateAuthToken(ticket.ticket_id);
    }

    // DIAGNOSTIC: Log pass configuration
    console.log('[Apple Wallet] Pass configuration:');
    console.log(`  - foregroundColor: ${passProps.foregroundColor}`);
    console.log(`  - backgroundColor: ${passProps.backgroundColor}`);
    console.log(`  - labelColor: ${passProps.labelColor}`);

    // CORRECT v3 API usage:
    // new PKPass(buffers, certificates, props)
    const pass = new PKPass({}, certificateConfig, passProps);

    // CRITICAL: Set the pass type BEFORE adding barcodes and fields
    // Setting type initializes empty field arrays and must come first
    pass.type = "eventTicket";

    // CRITICAL: Add barcode AFTER setting type (setting type deletes constructor barcodes)
    pass.setBarcodes({
      format: "PKBarcodeFormatQR",
      message: qrToken,
      messageEncoding: "iso-8859-1",
      altText: ticket.ticket_id,
    });
    console.log(`[Apple Wallet] Barcode set: QR format, message length ${qrToken.length} chars`);

    // Add fields using .push() method (v3 requirement)
    // DO NOT use pass.eventTicket = {...} as it doesn't persist

    // Helper function to format date range
    const formatDateRange = (startDate, endDate) => {
      if (!startDate || !endDate) return this.eventDatesDisplay;

      const start = new Date(startDate);
      const end = new Date(endDate);
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
        return `${monthNames[start.getMonth()]} ${start.getDate()}-${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[end.getMonth()]} ${end.getDate()}, ${start.getFullYear()}`;
    };

    // No primary fields - all info in secondary fields to avoid overlaying strip

    // Secondary fields (displayed below strip image)
    console.log(`[Apple Wallet] Adding secondary fields`);
    pass.secondaryFields.push({
      key: "event",
      label: "EVENT",
      value: ticket.event_name,
    });
    pass.secondaryFields.push({
      key: "ticket-type",
      label: "TICKET TYPE",
      value: this.formatTicketType(ticket.ticket_type),
    });

    pass.secondaryFields.push({
      key: "name",
      label: "ATTENDEE",
      value:
        `${ticket.attendee_first_name || ""} ${ticket.attendee_last_name || ""}`.trim() ||
        "Guest",
    });

    pass.secondaryFields.push({
      key: "date",
      label: "DATES",
      value: formatDateRange(ticket.start_date, ticket.end_date),
    });

    // No auxiliary fields - all important info in secondary fields

    // Back fields (flip side of pass)
    pass.backFields.push({
      key: "order",
      label: "ORDER",
      value: ticket.order_number || ticket.transaction_id,
    });
    pass.backFields.push({
      key: "venue",
      label: "VENUE",
      value: `${ticket.venue_name || this.venueName}\n${ticket.venue_address || this.venueAddress}`,
    });

    pass.backFields.push({
      key: "ticket-id",
      label: "TICKET ID",
      value: ticket.ticket_id,
    });

    pass.backFields.push({
      key: "instructions",
      label: "CHECK-IN INSTRUCTIONS",
      value: "Present this pass at the entrance. Have your ID ready. The QR code will be scanned for entry.",
    });

    pass.backFields.push({
      key: "support",
      label: "SUPPORT",
      value:
        "Email: alocubanoboulderfest@gmail.com\nWebsite: alocubano.vercel.app",
    });

    pass.backFields.push({
      key: "terms",
      label: "TERMS & CONDITIONS",
      value: "This ticket is non-refundable and non-transferable unless otherwise stated. " +
        "Must be 21+ with valid ID. Subject to venue capacity.",
    });

    // Add images (icon, strip)
    // Logo removed - displayed at 100% opacity in strip image instead
    try {
      const projectRoot = path.join(__dirname, "..");

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

      const icon3xPath = path.join(
        projectRoot,
        "public",
        "wallet",
        "icon@3x.png",
      );
      const icon3xBuffer = await fs.readFile(icon3xPath);
      pass.addBuffer("icon@3x.png", icon3xBuffer);

      // Strip image - 375x98 points (with watermark, behind primary fields)
      // Strip won't block QR code like background would
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

      const strip3xPath = path.join(
        projectRoot,
        "public",
        "wallet",
        "strip@3x.png",
      );
      const strip3xBuffer = await fs.readFile(strip3xPath);
      pass.addBuffer("strip@3x.png", strip3xBuffer);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("Wallet images not found, using defaults");
      } else {
        // Re-throw unexpected errors for proper error handling
        console.error("Unexpected error loading wallet images:", error);
        throw error;
      }
    }

    const passBuffer = pass.getAsBuffer();
    console.log(`[Apple Wallet] Pass buffer created successfully: ${passBuffer.length} bytes`);
    return passBuffer;
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

    // Get the pass serial number from the ticket
    const ticket = await db.execute({
      sql: 'SELECT apple_pass_serial FROM tickets WHERE id = ?',
      args: [ticketId]
    });

    const passSerial = ticket.rows[0]?.apple_pass_serial || 'unknown';

    await db.execute({
      sql: `INSERT INTO wallet_pass_events (
        pass_serial, event_type, event_data
      ) VALUES (?, ?, ?)`,
      args: [passSerial, eventType, JSON.stringify(eventData)],
    });
  }
}

// Export singleton instance using lazy initialization
let appleWalletServiceInstance = null;

export function getAppleWalletService() {
  if (!appleWalletServiceInstance) {
    appleWalletServiceInstance = new AppleWalletService();
  }
  return appleWalletServiceInstance;
}

export default getAppleWalletService();
