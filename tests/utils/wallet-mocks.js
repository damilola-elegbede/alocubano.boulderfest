/**
 * Wallet Service Mocks
 *
 * Provides comprehensive mocking for Apple Wallet and Google Wallet services
 * Includes pass generation, validation, and security testing capabilities
 */

import { vi } from "vitest";

/**
 * Apple Wallet Mock Service
 * Mocks Apple Wallet Passkit functionality
 */
export class AppleWalletMock {
  constructor() {
    this.passes = new Map();
    this.certificates = new Map();
    this.devices = new Map();
    this.registrations = new Map();
    this.isConfigured = false;

    this.setupDefaultCertificates();
  }

  /**
   * Setup default test certificates
   */
  setupDefaultCertificates() {
    this.certificates.set("pass_cert", {
      certificate: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t", // Mock certificate
      privateKey: "LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0t", // Mock private key
      passTypeId: "pass.com.alocubano.boulderfest",
      teamId: "TESTTEAMID",
    });

    this.certificates.set("wwdr_cert", {
      certificate: "LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0t", // Mock WWDR certificate
      type: "wwdr",
    });
  }

  /**
   * Configure Apple Wallet mocks
   */
  configure() {
    if (this.isConfigured) return;

    // Mock crypto operations
    vi.mock("crypto", () => ({
      createSign: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        sign: vi.fn(() => Buffer.from("mock-signature", "utf8")),
      })),
      createHash: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        digest: vi.fn(() => "mock-hash"),
      })),
      randomBytes: vi.fn((size) => Buffer.alloc(size, "mock-random")),
    }));

    // Mock archiver for .pkpass creation
    vi.mock("archiver", () => ({
      create: vi.fn(() => ({
        append: vi.fn(),
        file: vi.fn(),
        finalize: vi.fn(),
        pipe: vi.fn(),
        on: vi.fn(),
        pointer: vi.fn(() => 1024),
      })),
    }));

    this.isConfigured = true;
  }

  /**
   * Generate Apple Wallet pass
   */
  generatePass(passData) {
    const {
      ticketId,
      serialNumber = ticketId,
      description = "A Lo Cubano Boulder Fest Ticket",
      organizationName = "A Lo Cubano Boulder Fest",
      passTypeIdentifier = "pass.com.alocubano.boulderfest",
      teamIdentifier = "TESTTEAMID",
      relevantDate = "2026-05-15T09:00-06:00",
      expirationDate = "2026-05-18T00:00-06:00",
      foregroundColor = "rgb(255, 255, 255)",
      backgroundColor = "rgb(206, 84, 57)",
      labelColor = "rgb(255, 255, 255)",
      logoText = "A Lo Cubano",
      userInfo = {},
    } = passData;

    const pass = {
      formatVersion: 1,
      passTypeIdentifier,
      serialNumber,
      teamIdentifier,
      organizationName,
      description,
      logoText,
      foregroundColor,
      backgroundColor,
      labelColor,
      relevantDate,
      expirationDate,
      maxDistance: 1000,
      locations: [
        {
          latitude: 40.0176,
          longitude: -105.2797,
          relevantText: "Welcome to A Lo Cubano Boulder Fest!",
        },
      ],
      barcode: {
        message: ticketId,
        format: "PKBarcodeFormatQR",
        messageEncoding: "iso-8859-1",
        altText: ticketId,
      },
      eventTicket: {
        primaryFields: [
          {
            key: "event",
            label: "EVENT",
            value: "A Lo Cubano Boulder Fest",
          },
        ],
        secondaryFields: [
          {
            key: "date",
            label: "DATE",
            value: "May 15-17, 2026",
            textAlignment: "PKTextAlignmentLeft",
          },
          {
            key: "time",
            label: "TIME",
            value: "9:00 AM - 11:00 PM",
            textAlignment: "PKTextAlignmentRight",
          },
        ],
        auxiliaryFields: [
          {
            key: "location",
            label: "LOCATION",
            value: "Avalon Ballroom, Boulder, CO",
          },
          {
            key: "ticket_type",
            label: "TYPE",
            value: this.formatTicketType(passData.type || "full-pass"),
          },
        ],
        backFields: [
          {
            key: "terms",
            label: "Terms and Conditions",
            value:
              "This ticket is valid for the specified event dates only. No refunds or exchanges. Please arrive early for check-in.",
          },
          {
            key: "contact",
            label: "Contact Information",
            value: "For questions, email alocubanoboulderfest@gmail.com",
          },
          {
            key: "website",
            label: "Website",
            value: "https://alocubanoboulderfest.vercel.app",
          },
        ],
      },
      authenticationToken: this.generateAuthToken(serialNumber),
      webServiceURL: "https://alocubanoboulderfest.vercel.app/api/passbook",
      userInfo,
    };

    // Store pass
    this.passes.set(serialNumber, {
      ...pass,
      createdAt: new Date(),
      updatedAt: new Date(),
      downloadCount: 0,
      registeredDevices: [],
    });

    return pass;
  }

  /**
   * Generate .pkpass file data
   */
  async generatePkpassFile(passData) {
    const pass = this.generatePass(passData);

    // Mock manifest.json
    const manifest = {
      "pass.json": this.generateHash(JSON.stringify(pass)),
      "logo.png": "mock-logo-hash",
      "logo@2x.png": "mock-logo-2x-hash",
      "icon.png": "mock-icon-hash",
      "icon@2x.png": "mock-icon-2x-hash",
    };

    // Mock signature
    const signature = Buffer.from("mock-signature-data");

    // Return mock .pkpass data
    return {
      pass: pass,
      manifest: manifest,
      signature: signature.toString("base64"),
      files: {
        "pass.json": JSON.stringify(pass),
        "manifest.json": JSON.stringify(manifest),
        signature: signature,
        "logo.png": Buffer.alloc(100, "mock-logo"),
        "logo@2x.png": Buffer.alloc(200, "mock-logo-2x"),
        "icon.png": Buffer.alloc(50, "mock-icon"),
        "icon@2x.png": Buffer.alloc(100, "mock-icon-2x"),
      },
      size: 2048,
      serialNumber: pass.serialNumber,
    };
  }

  /**
   * Register device for pass updates
   */
  registerDevice(
    deviceLibraryIdentifier,
    passTypeIdentifier,
    serialNumber,
    pushToken,
  ) {
    const registrationKey = `${deviceLibraryIdentifier}-${passTypeIdentifier}-${serialNumber}`;

    const registration = {
      deviceLibraryIdentifier,
      passTypeIdentifier,
      serialNumber,
      pushToken,
      registeredAt: new Date(),
      lastModified: new Date(),
    };

    this.registrations.set(registrationKey, registration);

    // Update pass with device registration
    const pass = this.passes.get(serialNumber);
    if (pass) {
      if (!pass.registeredDevices.includes(deviceLibraryIdentifier)) {
        pass.registeredDevices.push(deviceLibraryIdentifier);
      }
    }

    return { status: "registered" };
  }

  /**
   * Unregister device from pass updates
   */
  unregisterDevice(deviceLibraryIdentifier, passTypeIdentifier, serialNumber) {
    const registrationKey = `${deviceLibraryIdentifier}-${passTypeIdentifier}-${serialNumber}`;

    const existed = this.registrations.has(registrationKey);
    this.registrations.delete(registrationKey);

    // Update pass registration
    const pass = this.passes.get(serialNumber);
    if (pass) {
      pass.registeredDevices = pass.registeredDevices.filter(
        (device) => device !== deviceLibraryIdentifier,
      );
    }

    return existed ? { status: "unregistered" } : { status: "not_found" };
  }

  /**
   * Get passes for device
   */
  getPassesForDevice(
    deviceLibraryIdentifier,
    passTypeIdentifier,
    passesUpdatedSince,
  ) {
    const devicePasses = [];
    const lastUpdated = passesUpdatedSince
      ? new Date(passesUpdatedSince)
      : new Date(0);

    for (const [serialNumber, pass] of this.passes) {
      if (
        pass.registeredDevices.includes(deviceLibraryIdentifier) &&
        pass.updatedAt > lastUpdated &&
        pass.passTypeIdentifier === passTypeIdentifier
      ) {
        devicePasses.push(serialNumber);
      }
    }

    return {
      serialNumbers: devicePasses,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Update pass data
   */
  updatePass(serialNumber, updates) {
    const pass = this.passes.get(serialNumber);
    if (!pass) {
      return { error: "Pass not found" };
    }

    // Apply updates
    Object.assign(pass, updates, {
      updatedAt: new Date(),
    });

    this.passes.set(serialNumber, pass);

    // Simulate push notification to registered devices
    this.sendPushNotifications(serialNumber);

    return { status: "updated", serialNumber };
  }

  /**
   * Simulate push notifications to registered devices
   */
  sendPushNotifications(serialNumber) {
    const pass = this.passes.get(serialNumber);
    if (!pass) return;

    pass.registeredDevices.forEach((deviceId) => {
      // Mock push notification
      console.log(
        `[MOCK] Sending push notification to device ${deviceId} for pass ${serialNumber}`,
      );
    });
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    const typeMap = {
      "full-pass": "Full Festival Pass",
      "single-day": "Single Day Pass",
      "workshops-only": "Workshops Only",
      "socials-only": "Social Events Only",
      vip: "VIP Experience",
    };
    return typeMap[type] || "Festival Pass";
  }

  /**
   * Generate authentication token
   */
  generateAuthToken(serialNumber) {
    return `token-${serialNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  }

  /**
   * Generate hash for manifest
   */
  generateHash(data) {
    // Simple mock hash
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Reset mock state
   */
  reset() {
    this.passes.clear();
    this.registrations.clear();
    this.devices.clear();
    this.setupDefaultCertificates();
    vi.clearAllMocks();
  }

  /**
   * Get all passes for testing
   */
  getAllPasses() {
    return Array.from(this.passes.entries()).map(([serialNumber, pass]) => ({
      serialNumber,
      ...pass,
    }));
  }

  /**
   * Get mock state for debugging
   */
  getState() {
    return {
      passes: this.getAllPasses(),
      registrations: Array.from(this.registrations.values()),
      devices: Array.from(this.devices.values()),
    };
  }
}

/**
 * Google Wallet Mock Service
 * Mocks Google Wallet Pass functionality
 */
export class GoogleWalletMock {
  constructor() {
    this.passes = new Map();
    this.classes = new Map();
    this.issuers = new Map();
    this.isConfigured = false;

    this.setupDefaultIssuer();
  }

  /**
   * Setup default test issuer
   */
  setupDefaultIssuer() {
    this.issuers.set("test-issuer-id", {
      issuerId: "test-issuer-id",
      name: "A Lo Cubano Boulder Fest Test Issuer",
      homepageUrl: "https://alocubanoboulderfest.vercel.app",
      contactInfo: {
        email: "alocubanoboulderfest@gmail.com",
        phone: "+1-555-0123",
      },
    });
  }

  /**
   * Configure Google Wallet mocks
   */
  configure() {
    if (this.isConfigured) return;

    // Mock Google Auth
    vi.mock("google-auth-library", () => ({
      JWT: vi.fn(() => ({
        authorize: vi.fn().mockResolvedValue(),
        getAccessToken: vi.fn().mockResolvedValue({
          token: "mock-access-token",
          res: { data: { access_token: "mock-access-token" } },
        }),
      })),
    }));

    this.isConfigured = true;
  }

  /**
   * Create or update event ticket class
   */
  createEventTicketClass(classData) {
    const {
      id = `alocubano.boulderfest.${Date.now()}`,
      issuerId = "test-issuer-id",
      eventName = "A Lo Cubano Boulder Fest",
      venue = "Avalon Ballroom",
      dateTime = "2026-05-15T09:00-06:00",
      logo = null,
      heroImage = null,
    } = classData;

    const eventTicketClass = {
      id,
      classTemplateInfo: {
        cardTemplateOverride: {
          cardRowTemplateInfos: [
            {
              twoItems: {
                startItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: 'object.textModulesData["event_name"]',
                      },
                    ],
                  },
                },
                endItem: {
                  firstValue: {
                    fields: [
                      {
                        fieldPath: 'object.textModulesData["venue"]',
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      eventName: {
        defaultValue: {
          language: "en-US",
          value: eventName,
        },
      },
      venue: {
        name: {
          defaultValue: {
            language: "en-US",
            value: venue,
          },
        },
        address: {
          defaultValue: {
            language: "en-US",
            value: "Avalon Ballroom, Boulder, CO",
          },
        },
      },
      dateTime: {
        start: dateTime,
        end: "2026-05-17T23:00-06:00",
      },
      reviewStatus: "UNDER_REVIEW",
      issuerName: "A Lo Cubano Boulder Fest",
      homepageUri: {
        uri: "https://alocubanoboulderfest.vercel.app",
        description: "Festival Website",
      },
      hexBackgroundColor: "#CE5439",
      logo: logo || {
        sourceUri: {
          uri: "https://alocubanoboulderfest.vercel.app/images/logo.png",
        },
        contentDescription: {
          defaultValue: {
            language: "en-US",
            value: "A Lo Cubano Logo",
          },
        },
      },
      heroImage: heroImage || {
        sourceUri: {
          uri: "https://alocubanoboulderfest.vercel.app/images/hero.jpg",
        },
        contentDescription: {
          defaultValue: {
            language: "en-US",
            value: "Festival Hero Image",
          },
        },
      },
    };

    this.classes.set(id, {
      ...eventTicketClass,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return eventTicketClass;
  }

  /**
   * Create event ticket object (pass)
   */
  createEventTicketObject(objectData) {
    const {
      id,
      classId,
      ticketId,
      ticketHolderName,
      ticketType = "FULL_PASS",
      barcode,
      seatInfo = null,
    } = objectData;

    const eventTicketObject = {
      id,
      classId,
      state: "ACTIVE",
      hexBackgroundColor: "#CE5439",
      logo: {
        sourceUri: {
          uri: "https://alocubanoboulderfest.vercel.app/images/logo.png",
        },
        contentDescription: {
          defaultValue: {
            language: "en-US",
            value: "A Lo Cubano Logo",
          },
        },
      },
      barcode: barcode || {
        type: "QR_CODE",
        value: ticketId,
        alternateText: ticketId,
      },
      textModulesData: [
        {
          id: "event_name",
          header: "EVENT",
          body: "A Lo Cubano Boulder Fest",
        },
        {
          id: "venue",
          header: "VENUE",
          body: "Avalon Ballroom, Boulder, CO",
        },
        {
          id: "ticket_type",
          header: "TICKET TYPE",
          body: this.formatTicketType(ticketType),
        },
        {
          id: "ticket_id",
          header: "TICKET ID",
          body: ticketId,
        },
      ],
      linksModuleData: {
        uris: [
          {
            uri: "https://alocubanoboulderfest.vercel.app",
            description: "Festival Website",
          },
          {
            uri: "mailto:alocubanoboulderfest@gmail.com",
            description: "Contact Us",
          },
        ],
      },
      imageModulesData: [
        {
          id: "event_image",
          mainImage: {
            sourceUri: {
              uri: "https://alocubanoboulderfest.vercel.app/images/event.jpg",
            },
            contentDescription: {
              defaultValue: {
                language: "en-US",
                value: "Event Image",
              },
            },
          },
        },
      ],
      locations: [
        {
          latitude: 40.0176,
          longitude: -105.2797,
        },
      ],
      hasUsers: true,
    };

    // Add seat info if provided
    if (seatInfo) {
      eventTicketObject.seatInfo = seatInfo;
    }

    // Add ticket holder name if provided
    if (ticketHolderName) {
      eventTicketObject.textModulesData.push({
        id: "ticket_holder",
        header: "TICKET HOLDER",
        body: ticketHolderName,
      });
    }

    this.passes.set(id, {
      ...eventTicketObject,
      createdAt: new Date(),
      updatedAt: new Date(),
      downloadCount: 0,
    });

    return eventTicketObject;
  }

  /**
   * Generate Google Wallet save URL
   */
  generateSaveUrl(objectId) {
    const pass = this.passes.get(objectId);
    if (!pass) {
      throw new Error(`Pass with ID ${objectId} not found`);
    }

    // Create JWT payload
    const payload = {
      iss: "test-service-account@alocubano-boulderfest.iam.gserviceaccount.com",
      aud: "google",
      typ: "savetowallet",
      origins: ["https://alocubanoboulderfest.vercel.app"],
      payload: {
        eventTicketObjects: [pass],
      },
    };

    // Mock JWT token
    const mockJWT = `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(payload)).toString("base64")}.mock-signature`;

    return `https://pay.google.com/gp/v/save/${mockJWT}`;
  }

  /**
   * Update pass state
   */
  updatePassState(objectId, newState, message = null) {
    const pass = this.passes.get(objectId);
    if (!pass) {
      return { error: "Pass not found" };
    }

    pass.state = newState;
    pass.updatedAt = new Date();

    if (message) {
      pass.messages = pass.messages || [];
      pass.messages.push({
        header: "Status Update",
        body: message,
        kind: "walletobjects#walletObjectMessage",
        messageType: "TEXT",
        displayInterval: {
          start: {
            date: new Date().toISOString(),
          },
        },
      });
    }

    this.passes.set(objectId, pass);
    return { status: "updated", objectId, newState };
  }

  /**
   * Expire pass
   */
  expirePass(objectId) {
    return this.updatePassState(objectId, "EXPIRED", "This pass has expired.");
  }

  /**
   * Activate pass
   */
  activatePass(objectId) {
    return this.updatePassState(objectId, "ACTIVE", "This pass is now active.");
  }

  /**
   * Invalidate pass
   */
  invalidatePass(objectId, reason = "Pass has been invalidated.") {
    return this.updatePassState(objectId, "INACTIVE", reason);
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    const typeMap = {
      FULL_PASS: "Full Festival Pass",
      SINGLE_DAY: "Single Day Pass",
      WORKSHOPS_ONLY: "Workshops Only",
      SOCIALS_ONLY: "Social Events Only",
      VIP: "VIP Experience",
    };
    return typeMap[type] || "Festival Pass";
  }

  /**
   * Get pass by ID
   */
  getPass(objectId) {
    return this.passes.get(objectId);
  }

  /**
   * Get class by ID
   */
  getClass(classId) {
    return this.classes.get(classId);
  }

  /**
   * Reset mock state
   */
  reset() {
    this.passes.clear();
    this.classes.clear();
    this.issuers.clear();
    this.setupDefaultIssuer();
    vi.clearAllMocks();
  }

  /**
   * Get all passes for testing
   */
  getAllPasses() {
    return Array.from(this.passes.entries()).map(([id, pass]) => ({
      id,
      ...pass,
    }));
  }

  /**
   * Get mock state for debugging
   */
  getState() {
    return {
      passes: this.getAllPasses(),
      classes: Array.from(this.classes.entries()).map(([id, cls]) => ({
        id,
        ...cls,
      })),
      issuers: Array.from(this.issuers.values()),
    };
  }
}

/**
 * Wallet Mock Manager
 * Centralized management of both Apple and Google Wallet mocks
 */
export class WalletMockManager {
  constructor() {
    this.appleWallet = new AppleWalletMock();
    this.googleWallet = new GoogleWalletMock();
    this.isInitialized = false;
  }

  /**
   * Initialize all wallet mocks
   */
  initialize() {
    if (this.isInitialized) return;

    this.appleWallet.configure();
    this.googleWallet.configure();

    this.isInitialized = true;
  }

  /**
   * Create passes for both platforms
   */
  createPasses(ticketData) {
    const {
      ticketId,
      ticketType = "full-pass",
      ticketHolderName,
      eventName = "A Lo Cubano Boulder Fest",
      venue = "Avalon Ballroom, Boulder, CO",
      validFrom = "2026-05-15T09:00-06:00",
      validTo = "2026-05-17T23:00-06:00",
    } = ticketData;

    // Create Apple Wallet pass
    const applePass = this.appleWallet.generatePass({
      ticketId,
      serialNumber: ticketId,
      type: ticketType,
      organizationName: eventName,
      description: `${eventName} - ${this.formatTicketType(ticketType)}`,
      relevantDate: validFrom,
      expirationDate: validTo,
      userInfo: { ticketHolderName },
    });

    // Create Google Wallet class and object
    const classId = `alocubano.boulderfest.${ticketType}.2026`;

    let googleClass = this.googleWallet.getClass(classId);
    if (!googleClass) {
      this.googleWallet.createEventTicketClass({
        id: classId,
        eventName,
        venue,
        dateTime: validFrom,
      });
    }

    const googlePass = this.googleWallet.createEventTicketObject({
      id: `alocubano.boulderfest.ticket.${ticketId}`,
      classId,
      ticketId,
      ticketHolderName,
      ticketType: ticketType.toUpperCase().replace("-", "_"),
      barcode: {
        type: "QR_CODE",
        value: ticketId,
        alternateText: ticketId,
      },
    });

    return {
      apple: {
        pass: applePass,
        downloadUrl: `/api/tickets/apple-wallet/${ticketId}`,
        serialNumber: applePass.serialNumber,
      },
      google: {
        pass: googlePass,
        saveUrl: this.googleWallet.generateSaveUrl(googlePass.id),
        objectId: googlePass.id,
      },
    };
  }

  /**
   * Update passes for both platforms
   */
  updatePasses(ticketId, updates) {
    // Update Apple pass
    const appleResult = this.appleWallet.updatePass(ticketId, updates);

    // Update Google pass
    const googleObjectId = `alocubano.boulderfest.ticket.${ticketId}`;
    const googleResult = this.googleWallet.updatePassState(
      googleObjectId,
      updates.state || "ACTIVE",
      updates.message,
    );

    return {
      apple: appleResult,
      google: googleResult,
    };
  }

  /**
   * Invalidate passes for both platforms
   */
  invalidatePasses(ticketId, reason = "Ticket has been invalidated") {
    // Invalidate Apple pass
    const appleResult = this.appleWallet.updatePass(ticketId, {
      voided: true,
      userInfo: { invalidationReason: reason },
    });

    // Invalidate Google pass
    const googleObjectId = `alocubano.boulderfest.ticket.${ticketId}`;
    const googleResult = this.googleWallet.invalidatePass(
      googleObjectId,
      reason,
    );

    return {
      apple: appleResult,
      google: googleResult,
    };
  }

  /**
   * Format ticket type consistently
   */
  formatTicketType(type) {
    const typeMap = {
      "full-pass": "Full Festival Pass",
      "single-day": "Single Day Pass",
      "workshops-only": "Workshops Only",
      "socials-only": "Social Events Only",
      vip: "VIP Experience",
    };
    return typeMap[type] || "Festival Pass";
  }

  /**
   * Reset all wallet mocks
   */
  resetAll() {
    this.appleWallet.reset();
    this.googleWallet.reset();
  }

  /**
   * Get state of all wallet services
   */
  getAllStates() {
    return {
      apple: this.appleWallet.getState(),
      google: this.googleWallet.getState(),
    };
  }
}

/**
 * Wallet test utilities
 */
export const WalletTestUtils = {
  /**
   * Create test wallet passes
   */
  createTestPasses(ticketData) {
    const manager = new WalletMockManager();
    manager.initialize();
    return manager.createPasses(ticketData);
  },

  /**
   * Validate Apple pass structure
   */
  validateApplePassStructure(pass) {
    const requiredFields = [
      "formatVersion",
      "passTypeIdentifier",
      "serialNumber",
      "teamIdentifier",
      "organizationName",
      "description",
    ];

    const errors = [];

    requiredFields.forEach((field) => {
      if (!pass[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (!pass.eventTicket) {
      errors.push("Missing eventTicket structure");
    }

    if (!pass.barcode || !pass.barcode.message) {
      errors.push("Missing or invalid barcode");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Validate Google pass structure
   */
  validateGooglePassStructure(pass) {
    const requiredFields = ["id", "classId", "state"];
    const errors = [];

    requiredFields.forEach((field) => {
      if (!pass[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    if (!pass.barcode || !pass.barcode.value) {
      errors.push("Missing or invalid barcode");
    }

    if (!pass.textModulesData || !Array.isArray(pass.textModulesData)) {
      errors.push("Missing or invalid textModulesData");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Simulate wallet pass download
   */
  simulatePassDownload(passType = "apple", delay = 100) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          passType,
          downloadTime: delay,
          timestamp: new Date().toISOString(),
        });
      }, delay);
    });
  },

  /**
   * Generate test certificate data
   */
  generateTestCertificate() {
    return {
      certificate: Buffer.from("mock-certificate-data").toString("base64"),
      privateKey: Buffer.from("mock-private-key-data").toString("base64"),
      passTypeId: "pass.com.alocubano.boulderfest.test",
      teamId: "TESTTEAMID",
    };
  },
};

// Export singleton instances
export const appleWalletMock = new AppleWalletMock();
export const googleWalletMock = new GoogleWalletMock();
export const walletMockManager = new WalletMockManager();

// Export all classes and utilities
export default {
  AppleWalletMock,
  GoogleWalletMock,
  WalletMockManager,
  WalletTestUtils,
  appleWalletMock,
  googleWalletMock,
  walletMockManager,
};
