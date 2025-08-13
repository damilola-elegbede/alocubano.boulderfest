/**
 * QR Code Generator for Testing
 *
 * Provides QR code generation and validation utilities for ticket testing
 * Includes mock QR code data, validation scenarios, and security testing
 */

import { vi } from "vitest";

/**
 * QR Code Test Generator
 * Creates QR codes for testing ticket validation scenarios
 */
export class QRCodeTestGenerator {
  constructor() {
    this.generatedCodes = new Map();
    this.validationAttempts = [];
    this.securityEvents = [];
  }

  /**
   * Generate a test QR code for a ticket
   */
  generateTicketQRCode(ticketData = {}) {
    const {
      ticketId = `ALO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      eventId = "alocubano-boulderfest-2026",
      type = "full-pass",
      validFrom = "2026-05-15T00:00:00.000Z",
      validTo = "2026-05-17T23:59:59.000Z",
      userId = null,
      price = 195.0,
    } = ticketData;

    // Create QR code data payload
    const qrData = {
      v: "1.0", // Version
      tid: ticketId, // Ticket ID
      eid: eventId, // Event ID
      typ: type, // Ticket type
      vf: validFrom, // Valid from
      vt: validTo, // Valid to
      uid: userId, // User ID (optional)
      pr: price, // Price
      ts: Date.now(), // Timestamp
      sig: this.generateSignature(ticketId, eventId), // Digital signature
    };

    const qrCode = `QR-${ticketId}-${this.hashData(JSON.stringify(qrData))}`;

    // Store for validation
    this.generatedCodes.set(qrCode, {
      ...qrData,
      qrCode,
      createdAt: new Date(),
      validationCount: 0,
      status: "active",
    });

    return {
      qrCode,
      data: qrData,
      displayUrl: `https://alocubanoboulderfest.vercel.app/api/tickets/validate?qr=${encodeURIComponent(qrCode)}`,
      scanUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrCode)}`,
    };
  }

  /**
   * Generate bulk QR codes for testing
   */
  generateBulkQRCodes(
    count = 10,
    ticketTypes = ["full-pass", "single-day", "workshops-only"],
  ) {
    const qrCodes = [];

    for (let i = 0; i < count; i++) {
      const type = ticketTypes[i % ticketTypes.length];
      const ticketId = `ALO-BULK-${Date.now()}-${i.toString().padStart(3, "0")}`;

      const qrCode = this.generateTicketQRCode({
        ticketId,
        type,
        price: this.getPriceForType(type),
      });

      qrCodes.push(qrCode);
    }

    return qrCodes;
  }

  /**
   * Generate expired QR code for testing
   */
  generateExpiredQRCode(daysExpired = 1) {
    const expiredDate = new Date();
    expiredDate.setDate(expiredDate.getDate() - daysExpired);

    return this.generateTicketQRCode({
      ticketId: `ALO-EXPIRED-${Date.now()}`,
      validFrom: "2025-05-15T00:00:00.000Z",
      validTo: expiredDate.toISOString(),
    });
  }

  /**
   * Generate already used QR code for testing
   */
  generateUsedQRCode() {
    const qrCode = this.generateTicketQRCode({
      ticketId: `ALO-USED-${Date.now()}`,
    });

    // Mark as used
    const codeData = this.generatedCodes.get(qrCode.qrCode);
    if (codeData) {
      codeData.status = "used";
      codeData.validationCount = 1;
      codeData.usedAt = new Date();
    }

    return qrCode;
  }

  /**
   * Generate invalid QR code for testing
   */
  generateInvalidQRCode(invalidationType = "malformed") {
    const baseTicketId = `ALO-INVALID-${Date.now()}`;

    switch (invalidationType) {
      case "malformed":
        return {
          qrCode: "INVALID-QR-CODE-FORMAT",
          data: null,
          displayUrl: null,
          scanUrl: null,
        };

      case "wrong_signature":
        const validQR = this.generateTicketQRCode({ ticketId: baseTicketId });
        validQR.data.sig = "WRONG_SIGNATURE";
        validQR.qrCode = `QR-${baseTicketId}-WRONG_SIG`;
        return validQR;

      case "tampered_data":
        const tamperedQR = this.generateTicketQRCode({
          ticketId: baseTicketId,
        });
        tamperedQR.data.pr = 0.01; // Tampered price
        return tamperedQR;

      case "non_existent":
        return {
          qrCode: `QR-NONEXISTENT-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
          data: null,
          displayUrl: null,
          scanUrl: null,
        };

      default:
        throw new Error(`Unknown invalidation type: ${invalidationType}`);
    }
  }

  /**
   * Simulate QR code validation
   */
  simulateValidation(qrCode, validatorInfo = {}) {
    const {
      validatedBy = "test-validator",
      ipAddress = "192.168.1.1",
      userAgent = "TestAgent/1.0",
      timestamp = new Date(),
    } = validatorInfo;

    const validationAttempt = {
      id: `val-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      qrCode,
      validatedBy,
      ipAddress,
      userAgent,
      timestamp,
      result: null,
      reason: null,
      metadata: {},
    };

    // Get QR code data
    const codeData = this.generatedCodes.get(qrCode);

    if (!codeData) {
      validationAttempt.result = "invalid";
      validationAttempt.reason = "QR code not found";
    } else if (codeData.status === "used") {
      validationAttempt.result = "used";
      validationAttempt.reason = "Ticket already used";
    } else if (this.isExpired(codeData)) {
      validationAttempt.result = "expired";
      validationAttempt.reason = "Ticket expired";
    } else if (codeData.status === "cancelled") {
      validationAttempt.result = "cancelled";
      validationAttempt.reason = "Ticket cancelled";
    } else {
      validationAttempt.result = "valid";
      validationAttempt.reason = "Ticket is valid";

      // Mark as used
      codeData.status = "used";
      codeData.validationCount++;
      codeData.usedAt = new Date();
      codeData.validatedBy = validatedBy;
    }

    this.validationAttempts.push(validationAttempt);
    return validationAttempt;
  }

  /**
   * Simulate concurrent validation attempts (race condition testing)
   */
  async simulateConcurrentValidation(qrCode, concurrentAttempts = 5) {
    const promises = [];

    for (let i = 0; i < concurrentAttempts; i++) {
      const promise = new Promise((resolve) => {
        // Simulate network delay
        setTimeout(() => {
          const result = this.simulateValidation(qrCode, {
            validatedBy: `concurrent-validator-${i}`,
            ipAddress: `192.168.1.${10 + i}`,
          });
          resolve(result);
        }, Math.random() * 100); // Random delay up to 100ms
      });

      promises.push(promise);
    }

    const results = await Promise.all(promises);

    // Analyze results for race conditions
    const validResults = results.filter((r) => r.result === "valid");
    const usedResults = results.filter((r) => r.result === "used");

    return {
      results,
      validCount: validResults.length,
      usedCount: usedResults.length,
      hasRaceCondition: validResults.length > 1, // Multiple valid results indicate race condition
      summary: {
        total: results.length,
        valid: validResults.length,
        used: usedResults.length,
        invalid: results.filter((r) => r.result === "invalid").length,
        expired: results.filter((r) => r.result === "expired").length,
      },
    };
  }

  /**
   * Generate security test scenarios
   */
  generateSecurityTestScenarios() {
    return {
      // SQL Injection attempts
      sqlInjection: {
        qrCode: "QR-TEST'; DROP TABLE tickets; --",
        expectedResult: "invalid",
        testType: "sql_injection",
      },

      // XSS attempts
      xssAttempt: {
        qrCode: 'QR-<script>alert("xss")</script>',
        expectedResult: "invalid",
        testType: "xss_attempt",
      },

      // Buffer overflow
      bufferOverflow: {
        qrCode: "QR-" + "A".repeat(10000),
        expectedResult: "invalid",
        testType: "buffer_overflow",
      },

      // Null bytes
      nullBytes: {
        qrCode: "QR-TEST\x00INJECTION",
        expectedResult: "invalid",
        testType: "null_byte_injection",
      },

      // Unicode normalization
      unicodeNormalization: {
        qrCode: "QR-TESТ", // Contains Cyrillic T
        expectedResult: "invalid",
        testType: "unicode_normalization",
      },

      // Path traversal
      pathTraversal: {
        qrCode: "QR-../../../etc/passwd",
        expectedResult: "invalid",
        testType: "path_traversal",
      },
    };
  }

  /**
   * Generate load testing scenarios
   */
  generateLoadTestScenarios(ticketCount = 1000) {
    const scenarios = {
      normalLoad: [],
      peakLoad: [],
      stressLoad: [],
    };

    // Normal load - 30% of tickets
    const normalCount = Math.floor(ticketCount * 0.3);
    for (let i = 0; i < normalCount; i++) {
      scenarios.normalLoad.push(
        this.generateTicketQRCode({
          ticketId: `ALO-NORMAL-${i.toString().padStart(4, "0")}`,
        }),
      );
    }

    // Peak load - 60% of tickets
    const peakCount = Math.floor(ticketCount * 0.6);
    for (let i = 0; i < peakCount; i++) {
      scenarios.peakLoad.push(
        this.generateTicketQRCode({
          ticketId: `ALO-PEAK-${i.toString().padStart(4, "0")}`,
        }),
      );
    }

    // Stress load - remaining tickets
    const stressCount = ticketCount - normalCount - peakCount;
    for (let i = 0; i < stressCount; i++) {
      scenarios.stressLoad.push(
        this.generateTicketQRCode({
          ticketId: `ALO-STRESS-${i.toString().padStart(4, "0")}`,
        }),
      );
    }

    return scenarios;
  }

  /**
   * Generate signature for QR code data
   */
  generateSignature(ticketId, eventId) {
    // Simple test signature - in production this would use proper cryptographic signing
    const data = `${ticketId}:${eventId}:${process.env.WALLET_AUTH_SECRET || "test-secret"}`;
    return this.hashData(data);
  }

  /**
   * Hash data for test signatures
   */
  hashData(data) {
    // Simple hash function for testing - not cryptographically secure
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if QR code is expired
   */
  isExpired(codeData) {
    const now = new Date();
    const validTo = new Date(codeData.vt);
    return now > validTo;
  }

  /**
   * Get price for ticket type
   */
  getPriceForType(type) {
    const prices = {
      "full-pass": 195.0,
      "single-day": 75.0,
      "workshops-only": 125.0,
      "socials-only": 85.0,
      vip: 295.0,
    };
    return prices[type] || 195.0;
  }

  /**
   * Get QR code validation statistics
   */
  getValidationStats() {
    const stats = {
      totalCodes: this.generatedCodes.size,
      totalValidations: this.validationAttempts.length,
      validValidations: 0,
      invalidValidations: 0,
      usedValidations: 0,
      expiredValidations: 0,
      securityEvents: this.securityEvents.length,
    };

    this.validationAttempts.forEach((attempt) => {
      switch (attempt.result) {
        case "valid":
          stats.validValidations++;
          break;
        case "invalid":
          stats.invalidValidations++;
          break;
        case "used":
          stats.usedValidations++;
          break;
        case "expired":
          stats.expiredValidations++;
          break;
      }
    });

    return stats;
  }

  /**
   * Get all generated QR codes
   */
  getAllQRCodes() {
    return Array.from(this.generatedCodes.entries()).map(([qrCode, data]) => ({
      qrCode,
      ...data,
    }));
  }

  /**
   * Get all validation attempts
   */
  getAllValidationAttempts() {
    return [...this.validationAttempts];
  }

  /**
   * Reset generator state
   */
  reset() {
    this.generatedCodes.clear();
    this.validationAttempts = [];
    this.securityEvents = [];
  }

  /**
   * Export data for analysis
   */
  exportData() {
    return {
      codes: this.getAllQRCodes(),
      validations: this.getAllValidationAttempts(),
      stats: this.getValidationStats(),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * QR Code Mock Service
 * Provides mocking capabilities for QR code related APIs
 */
export class QRCodeMockService {
  constructor() {
    this.generator = new QRCodeTestGenerator();
    this.isConfigured = false;
  }

  /**
   * Configure QR code mocks
   */
  configure() {
    if (this.isConfigured) return;

    // Mock QR code validation API
    global.fetch = vi.fn((url, options) => {
      if (url.includes("/api/tickets/validate")) {
        return this.handleValidationRequest(url, options);
      }

      // Pass through other requests
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    this.isConfigured = true;
  }

  /**
   * Handle QR code validation requests
   */
  async handleValidationRequest(url, options) {
    const urlObj = new URL(url);
    const qrCode =
      urlObj.searchParams.get("qr") || urlObj.searchParams.get("code");

    if (!qrCode) {
      return {
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: "Missing QR code parameter",
            code: "MISSING_QR_CODE",
          }),
      };
    }

    // Simulate validation
    const validationResult = this.generator.simulateValidation(qrCode, {
      validatedBy: "api-validator",
      ipAddress: "127.0.0.1",
      userAgent: "TestRunner/1.0",
    });

    // Return appropriate response based on validation result
    switch (validationResult.result) {
      case "valid":
        return {
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              valid: true,
              ticket: {
                id: validationResult.qrCode,
                status: "validated",
                validatedAt: validationResult.timestamp.toISOString(),
              },
            }),
        };

      case "used":
        return {
          ok: false,
          status: 409,
          json: () =>
            Promise.resolve({
              error: "Ticket already used",
              code: "TICKET_ALREADY_USED",
              usedAt: validationResult.timestamp.toISOString(),
            }),
        };

      case "expired":
        return {
          ok: false,
          status: 410,
          json: () =>
            Promise.resolve({
              error: "Ticket expired",
              code: "TICKET_EXPIRED",
            }),
        };

      case "invalid":
      default:
        return {
          ok: false,
          status: 404,
          json: () =>
            Promise.resolve({
              error: "Invalid QR code",
              code: "INVALID_QR_CODE",
            }),
        };
    }
  }

  /**
   * Reset mock service
   */
  reset() {
    this.generator.reset();
    vi.clearAllMocks();
  }

  /**
   * Get generator instance
   */
  getGenerator() {
    return this.generator;
  }
}

/**
 * Test utilities for QR code testing
 */
export const QRTestUtils = {
  /**
   * Create test QR code with specific properties
   */
  createTestQRCode(properties = {}) {
    const generator = new QRCodeTestGenerator();
    return generator.generateTicketQRCode(properties);
  },

  /**
   * Create batch of test QR codes
   */
  createTestQRCodeBatch(count = 10, properties = {}) {
    const generator = new QRCodeTestGenerator();
    const codes = [];

    for (let i = 0; i < count; i++) {
      const qrCode = generator.generateTicketQRCode({
        ticketId: `BATCH-${i.toString().padStart(3, "0")}-${Date.now()}`,
        ...properties,
      });
      codes.push(qrCode);
    }

    return codes;
  },

  /**
   * Validate QR code format
   */
  validateQRCodeFormat(qrCode) {
    // Basic format validation for test QR codes
    const pattern = /^QR-[A-Z0-9\-]+-[a-z0-9]+$/;
    return pattern.test(qrCode);
  },

  /**
   * Extract ticket ID from QR code
   */
  extractTicketId(qrCode) {
    const match = qrCode.match(/^QR-(.+)-[a-z0-9]+$/);
    return match ? match[1] : null;
  },

  /**
   * Generate QR code URL for scanning
   */
  generateQRCodeUrl(data, size = 200) {
    const encodedData = encodeURIComponent(data);
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodedData}`;
  },

  /**
   * Simulate QR code scanning delay
   */
  simulateScanDelay(minMs = 100, maxMs = 500) {
    const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    return new Promise((resolve) => setTimeout(resolve, delay));
  },
};

// Export singleton instances
export const qrGenerator = new QRCodeTestGenerator();
export const qrMockService = new QRCodeMockService();

// Export all utilities
export default {
  QRCodeTestGenerator,
  QRCodeMockService,
  QRTestUtils,
  qrGenerator,
  qrMockService,
};
