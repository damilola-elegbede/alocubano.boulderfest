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
import { getTicketColorService } from "./ticket-color-service.js";

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
      // First, check if a dedicated PKCS#12 bundle is provided
      const p12Input = process.env.APPLE_PASS_P12 || process.env.APPLE_PASS_CERT;
      let pkcs12Result = null;
      if (p12Input && !p12Input.includes("-----BEGIN")) {
        // Input isn't PEM text, attempt PKCS#12 extraction
        const p12Buffer = Buffer.from(p12Input, "base64");
        pkcs12Result = this.tryExtractFromPKCS12(p12Buffer, process.env.APPLE_PASS_PASSWORD);
      }

      if (pkcs12Result) {
        console.log("[Apple Wallet] PKCS#12 bundle detected, extracted certificate and key");
        this.signerCert = pkcs12Result.certificate;
        this.signerKey = pkcs12Result.privateKey;
      } else {
        // Handle as separate PEM/DER/base64 inputs
        this.signerCert = process.env.APPLE_PASS_CERT
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
   * Normalize environment-provided cert/key into PEM Buffer.
   * Accepts: raw PEM string OR base64-encoded PEM/DER.
   */
  decodeCertificate(input, expectedType) {
    if (typeof input !== "string" || input.trim() === "") {
      throw new Error(`Missing ${expectedType} in environment variable`);
    }

    const raw = input.trim();

    // Path 1: Check if already a PEM string (BEFORE base64 decoding)
    if (raw.includes("-----BEGIN") && raw.includes("-----END")) {
      const pem = raw.replace(/\r\n/g, "\n").trim();
      const beginMatch = pem.match(/-----BEGIN ([^-]+)-----/);
      const endMatch = pem.match(/-----END ([^-]+)-----/);

      if (!beginMatch || !endMatch || beginMatch[1] !== endMatch[1]) {
        throw new Error("Invalid PEM: mismatched BEGIN/END headers");
      }

      const actualType = beginMatch[1];

      // Validate compatibility with expected type
      const isCompatible = (actual, expected) => {
        if (!expected) return true;
        if (actual === expected) return true;
        // Accept any private key variant
        const keySet = new Set(["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"]);
        if (keySet.has(actual) && keySet.has(expected)) return true;
        // Accept any certificate variant
        return expected === "CERTIFICATE" && actual.endsWith("CERTIFICATE");
      };

      if (!isCompatible(actualType, expectedType)) {
        throw new Error(`Unexpected PEM type: got "${actualType}", expected "${expectedType}"`);
      }

      return Buffer.from(pem, "utf8");
    }

    // Path 2: Try base64 decode (for base64-encoded PEM or DER)
    try {
      const base64 = raw.replace(/\s+/g, "");
      const decodedBuffer = Buffer.from(base64, "base64");
      const asText = decodedBuffer.toString("utf8");

      // Check if base64-decoded content is PEM text
      if (asText.includes("-----BEGIN") && asText.includes("-----END")) {
        const pem = asText.replace(/\r\n/g, "\n").trim();
        return Buffer.from(pem, "utf8");
      }

      // Check if it's DER format (binary)
      const isDerFormat = decodedBuffer[0] === 0x30 && (decodedBuffer[1] === 0x82 || decodedBuffer[1] === 0x81 || decodedBuffer[1] === 0x83);

      if (isDerFormat) {
        // Validate DER structure
        const derLength = this.getDerLength(decodedBuffer);
        if (derLength > decodedBuffer.length) {
          throw new Error(
            `DER ${expectedType} is corrupted or incomplete (header claims ${derLength} bytes, only ${decodedBuffer.length} available)`
          );
        }

        // Convert DER to PEM
        const derAsBase64 = decodedBuffer.toString("base64");
        const lines = [];
        for (let i = 0; i < derAsBase64.length; i += 64) {
          lines.push(derAsBase64.substring(i, i + 64));
        }
        const formattedBase64 = lines.join("\n");
        const headerType = expectedType || "CERTIFICATE";
        const pemContent = `-----BEGIN ${headerType}-----\n${formattedBase64}\n-----END ${headerType}-----`;

        return Buffer.from(pemContent, "utf8");
      }

      // Assume base64-encoded DER without wrapper, wrap it
      const headerType = expectedType || "CERTIFICATE";
      const formatted = base64.match(/.{1,64}/g)?.join("\n") || base64;
      const pemContent = `-----BEGIN ${headerType}-----\n${formatted}\n-----END ${headerType}-----`;

      return Buffer.from(pemContent, "utf8");
    } catch (error) {
      throw new Error(
        `Failed to decode ${expectedType}: ${error.message}. Supply a PEM string or base64-encoded PEM/DER.`
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
      this.signerKey
      // WWDR cert is optional - not required for passes
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


    // Build pass configuration object (third parameter in v3 API)
    const passProps = {
      // Apple Wallet Required Fields
      formatVersion: 1,
      passTypeIdentifier: this.passTypeId,
      teamIdentifier: this.teamId,
      organizationName: this.organizationName,
      serialNumber: serialNumber,
      description: `${ticket.event_name} Ticket`,

      // Visual Styling (Black background with white text and brand blue labels)
      // NOTE: Apple Wallet requires rgb() format with spaces, not hex
      foregroundColor: "rgb(255, 255, 255)",   // White text for field values
      backgroundColor: "rgb(0, 0, 0)",         // Black background (ignored when background image present)
      labelColor: "rgb(91, 107, 181)",         // Brand blue labels (#5b6bb5)

      // Logo: wallet-logo.png banner image (Apple controls positioning)
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
    console.log(`  - preferredStyleSchemes: ${JSON.stringify(passProps.preferredStyleSchemes)}`);
    console.log(`  - useAutomaticColor: ${passProps.useAutomaticColor}`);

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
      return `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    };

    // Header fields (displayed in header area with logo)
    console.log(`[Apple Wallet] Adding header fields`);
    pass.headerFields.push({
      key: "date",
      label: "DATE",
      value: formatDateRange(ticket.start_date, ticket.end_date),
    });

    // Primary field (most prominent - EVENT name)
    console.log(`[Apple Wallet] Adding primary field`);
    pass.primaryFields.push({
      key: "event",
      label: "EVENT",
      value: ticket.event_name,
    });

    // Secondary field (TICKET name from database)
    console.log(`[Apple Wallet] Adding secondary field`);
    pass.secondaryFields.push({
      key: "ticket",
      label: "TICKET",
      value: ticket.ticket_type_name || this.formatTicketType(ticket.ticket_type),
    });

    // Auxiliary fields (ATTENDEE | COLOR and VENUE)
    console.log(`[Apple Wallet] Adding auxiliary fields`);

    // Get color for ticket type
    const colorService = getTicketColorService();
    const ticketColor = await colorService.getColorForTicketType(ticket.ticket_type);
    console.log(`[Apple Wallet] Ticket color: ${ticketColor.name} (${ticketColor.rgb})`);

    // Attendee name with colored circle emoji
    const attendeeName = `${ticket.attendee_first_name || ""} ${ticket.attendee_last_name || ""}`.trim() || "Guest";
    pass.auxiliaryFields.push({
      key: "attendee",
      label: "ATTENDEE",
      value: `${attendeeName} ${ticketColor.emoji}`, // Colored circle based on ticket type
    });

    // Venue (with label)
    pass.auxiliaryFields.push({
      key: "venue",
      label: "VENUE",
      value: `${ticket.venue_name || this.venueName}\n${ticket.venue_address || this.venueAddress}`,
    });

    // Back fields (flip side of pass)
    pass.backFields.push({
      key: "order",
      label: "ORDER",
      value: ticket.order_number || ticket.transaction_id,
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

    // Add images (icon, logo, background)
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

      // Logo - wallet-logo.png banner (320x50 points)
      const logoPath = path.join(projectRoot, "public", "wallet", "wallet-logo.png");
      const logoBuffer = await fs.readFile(logoPath);
      pass.addBuffer("logo.png", logoBuffer);

      const logo2xPath = path.join(projectRoot, "public", "wallet", "wallet-logo@2x.png");
      const logo2xBuffer = await fs.readFile(logo2xPath);
      pass.addBuffer("logo@2x.png", logo2xBuffer);

      const logo3xPath = path.join(projectRoot, "public", "wallet", "wallet-logo@3x.png");
      const logo3xBuffer = await fs.readFile(logo3xPath);
      pass.addBuffer("logo@3x.png", logo3xBuffer);

      // Background image - full pass watermark (375x466 points, 5% opacity logo)
      // Background won't block QR code (QR overlays the background)
      const backgroundPath = path.join(projectRoot, "public", "wallet", "background.png");
      const backgroundBuffer = await fs.readFile(backgroundPath);
      pass.addBuffer("background.png", backgroundBuffer);

      const background2xPath = path.join(projectRoot, "public", "wallet", "background@2x.png");
      const background2xBuffer = await fs.readFile(background2xPath);
      pass.addBuffer("background@2x.png", background2xBuffer);

      const background3xPath = path.join(projectRoot, "public", "wallet", "background@3x.png");
      const background3xBuffer = await fs.readFile(background3xPath);
      pass.addBuffer("background@3x.png", background3xBuffer);
    } catch (error) {
      if (error.code === "ENOENT") {
        console.log("Wallet images not found, using defaults");
      } else {
        // Re-throw unexpected errors for proper error handling
        console.error("Unexpected error loading wallet images:", error);
        throw error;
      }
    }

    // DEBUG: Log the actual pass.json props to verify colors are set
    console.log('[Apple Wallet] DEBUG - Final pass.props:');
    console.log(JSON.stringify(pass.props, null, 2));

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
