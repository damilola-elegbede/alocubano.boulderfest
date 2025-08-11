/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock crypto module - must be before imports that use it
vi.mock("crypto", () => {
  return {
    createHmac: vi.fn(() => {
      let data = "";
      return {
        update: vi.fn((input) => {
          data = input;
          return { digest: vi.fn(() => "mocked-" + data) };
        }),
        digest: vi.fn(() => "mocked-token"),
      };
    }),
    randomBytes: vi.fn(() => ({
      toString: vi.fn(() => "mocked-verification-token"),
    })),
  };
});

import {
  EmailSubscriberService,
  getEmailSubscriberService,
} from "../../api/lib/email-subscriber-service.js";

// Create persistent mock instance
const mockBrevoServiceInstance = {
  subscribeToNewsletter: vi.fn(),
  unsubscribeContact: vi.fn(),
  sendVerificationEmail: vi.fn(),
  processWebhookEvent: vi.fn(),
};

// Mock the Brevo service to always return the same instance
vi.mock("../../api/lib/brevo-service.js", () => ({
  getBrevoService: vi.fn(() => mockBrevoServiceInstance),
}));

// Mock the database service
const mockDatabaseService = {
  testConnection: vi.fn(),
  execute: vi.fn(),
  getClient: vi.fn(),
};

vi.mock("../../api/lib/database.js", () => ({
  getDatabase: vi.fn(() => mockDatabaseService),
}));

describe("EmailSubscriberService", () => {
  let emailService;
  let mockBrevoService;

  beforeEach(async () => {
    // Set up environment variables for Brevo service
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.BREVO_NEWSLETTER_LIST_ID = "1";
    process.env.BREVO_WELCOME_TEMPLATE_ID = "1";

    // Setup database mocks
    mockDatabaseService.testConnection.mockResolvedValue(true);
    mockDatabaseService.execute.mockResolvedValue({
      lastInsertRowid: 123,
      rows: [],
    });

    // Use the persistent mock instance
    mockBrevoService = mockBrevoServiceInstance;
    emailService = new EmailSubscriberService();
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up environment variables
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_NEWSLETTER_LIST_ID;
    delete process.env.BREVO_WELCOME_TEMPLATE_ID;
  });

  describe("createSubscriber", () => {
    it("should create subscriber with Brevo integration", async () => {
      const mockBrevoResult = { id: "brevo-123" };
      mockBrevoService.subscribeToNewsletter.mockResolvedValue(mockBrevoResult);

      const subscriberData = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        consentSource: "website",
        consentIp: "192.168.1.1",
      };

      const result = await emailService.createSubscriber(subscriberData);

      expect(mockBrevoService.subscribeToNewsletter).toHaveBeenCalledWith({
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        phone: undefined,
        source: "website",
        attributes: {},
      });

      expect(result.email).toBe("test@example.com");
      expect(result.brevo_contact_id).toBe("brevo-123");
      expect(result.consent_source).toBe("website");
    });

    it("should handle duplicate email error", async () => {
      mockBrevoService.subscribeToNewsletter.mockRejectedValue(
        new Error("duplicate key value violates unique constraint"),
      );

      const subscriberData = {
        email: "test@example.com",
        firstName: "John",
      };

      await expect(
        emailService.createSubscriber(subscriberData),
      ).rejects.toThrow("Email address is already subscribed");
    });

    it("should log email event and audit trail", async () => {
      const mockBrevoResult = { id: "brevo-123" };
      mockBrevoService.subscribeToNewsletter.mockResolvedValue(mockBrevoResult);

      // Mock the logging methods
      const logEmailEventSpy = vi
        .spyOn(emailService, "logEmailEvent")
        .mockResolvedValue({ id: 1 });
      const auditLogSpy = vi
        .spyOn(emailService, "auditLog")
        .mockResolvedValue({ id: 1 });

      const subscriberData = {
        email: "test@example.com",
        firstName: "John",
      };

      await emailService.createSubscriber(subscriberData);

      expect(logEmailEventSpy).toHaveBeenCalledWith(
        expect.any(Number),
        "subscribed",
        expect.objectContaining({
          source: "website",
        }),
      );

      expect(auditLogSpy).toHaveBeenCalledWith(
        "email_subscribers",
        expect.any(Number),
        "create",
        "system",
        "api",
        expect.objectContaining({
          email: "test@example.com",
        }),
        undefined,
      );
    });
  });

  describe("getSubscriberByEmail", () => {
    it("should return subscriber data", async () => {
      // Mock database response for getSubscriberByEmail
      mockDatabaseService.execute.mockResolvedValue({
        rows: [
          {
            id: 1,
            email: "test@example.com",
            first_name: null,
            last_name: null,
            phone: null,
            status: "active",
            brevo_contact_id: "123",
            list_ids: "[1]",
            attributes: "{}",
            consent_date: new Date().toISOString(),
            consent_source: "website",
            consent_ip: null,
            verification_token: null,
            verified_at: new Date().toISOString(),
            unsubscribed_at: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result =
        await emailService.getSubscriberByEmail("test@example.com");

      expect(result.email).toBe("test@example.com");
      expect(result.status).toBe("active");
    });
  });

  describe("updateSubscriber", () => {
    it("should update subscriber with provided data", async () => {
      const updateData = {
        firstName: "Jane",
        status: "unsubscribed",
        unsubscribedAt: new Date(),
      };

      // Mock getSubscriberByEmail to return updated subscriber
      const getSubscriberSpy = vi
        .spyOn(emailService, "getSubscriberByEmail")
        .mockResolvedValue({
          id: 1,
          email: "test@example.com",
          first_name: "Jane",
          status: "unsubscribed",
          unsubscribed_at: updateData.unsubscribedAt,
        });

      const auditLogSpy = vi
        .spyOn(emailService, "auditLog")
        .mockResolvedValue({ id: 1 });

      const result = await emailService.updateSubscriber(
        "test@example.com",
        updateData,
      );

      expect(result.email).toBe("test@example.com");
      expect(getSubscriberSpy).toHaveBeenCalledWith("test@example.com");
      expect(auditLogSpy).toHaveBeenCalledWith(
        "email_subscribers",
        expect.any(Number),
        "update",
        "system",
        "api",
        updateData,
      );
    });

    it("should throw error when no update data provided", async () => {
      await expect(
        emailService.updateSubscriber("test@example.com", {}),
      ).rejects.toThrow("No update data provided");
    });
  });

  describe("unsubscribeSubscriber", () => {
    it("should unsubscribe user in Brevo and database", async () => {
      mockBrevoService.unsubscribeContact.mockResolvedValue({ success: true });

      // Mock updateSubscriber to return unsubscribed subscriber
      const updateSubscriberSpy = vi
        .spyOn(emailService, "updateSubscriber")
        .mockResolvedValue({
          id: 1,
          email: "test@example.com",
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        });

      const logEmailEventSpy = vi
        .spyOn(emailService, "logEmailEvent")
        .mockResolvedValue({ id: 1 });

      const result =
        await emailService.unsubscribeSubscriber("test@example.com");

      expect(mockBrevoService.unsubscribeContact).toHaveBeenCalledWith(
        "test@example.com",
      );
      expect(updateSubscriberSpy).toHaveBeenCalled();
      expect(logEmailEventSpy).toHaveBeenCalledWith(
        expect.any(Number),
        "unsubscribed",
        { reason: "user_request" },
      );
      expect(result.email).toBe("test@example.com");
    });

    it("should handle contact not found in Brevo", async () => {
      mockBrevoService.unsubscribeContact.mockRejectedValue(
        new Error("contact_not_exist"),
      );

      // Mock updateSubscriber to return unsubscribed subscriber
      const updateSubscriberSpy = vi
        .spyOn(emailService, "updateSubscriber")
        .mockResolvedValue({
          id: 1,
          email: "test@example.com",
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString(),
        });

      const result =
        await emailService.unsubscribeSubscriber("test@example.com");

      expect(updateSubscriberSpy).toHaveBeenCalled();
      expect(result.email).toBe("test@example.com");
    });
  });

  describe("verifySubscriber", () => {
    it("should verify subscriber with valid token", async () => {
      // Mock getSubscriberByEmail to return unverified subscriber
      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        verification_token: "valid-token",
        verified_at: null,
      };

      vi.spyOn(emailService, "getSubscriberByEmail").mockResolvedValue(
        mockSubscriber,
      );

      const logEmailEventSpy = vi
        .spyOn(emailService, "logEmailEvent")
        .mockResolvedValue({ id: 1 });

      const result = await emailService.verifySubscriber(
        "test@example.com",
        "valid-token",
      );

      expect(logEmailEventSpy).toHaveBeenCalledWith(1, "verified", {});
      expect(result.email).toBe("test@example.com");
    });

    it("should reject invalid verification token", async () => {
      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        verification_token: "valid-token",
        verified_at: null,
      };

      vi.spyOn(emailService, "getSubscriberByEmail").mockResolvedValue(
        mockSubscriber,
      );

      await expect(
        emailService.verifySubscriber("test@example.com", "invalid-token"),
      ).rejects.toThrow("Invalid verification token");
    });

    it("should reject already verified email", async () => {
      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        verification_token: "valid-token",
        verified_at: new Date(),
      };

      vi.spyOn(emailService, "getSubscriberByEmail").mockResolvedValue(
        mockSubscriber,
      );

      await expect(
        emailService.verifySubscriber("test@example.com", "valid-token"),
      ).rejects.toThrow("Email already verified");
    });
  });

  describe("processWebhookEvent", () => {
    it("should process webhook event and log it", async () => {
      const webhookData = {
        id: "webhook-123",
        event: "opened",
        email: "test@example.com",
        date: new Date().toISOString(),
      };

      const processedEvent = {
        eventType: "opened",
        email: "test@example.com",
        occurredAt: new Date(),
        data: {},
      };

      mockBrevoService.processWebhookEvent.mockResolvedValue(processedEvent);

      // Mock getSubscriberByEmail to return a subscriber
      const getSubscriberSpy = vi
        .spyOn(emailService, "getSubscriberByEmail")
        .mockResolvedValue({
          id: 1,
          email: "test@example.com",
        });

      const logEmailEventSpy = vi
        .spyOn(emailService, "logEmailEvent")
        .mockResolvedValue({ id: 1 });

      const result = await emailService.processWebhookEvent(webhookData);

      expect(mockBrevoService.processWebhookEvent).toHaveBeenCalledWith(
        webhookData,
      );
      expect(getSubscriberSpy).toHaveBeenCalledWith("test@example.com");
      expect(logEmailEventSpy).toHaveBeenCalledWith(
        1,
        "opened",
        {},
        "webhook-123",
      );
      expect(result).toEqual(processedEvent);
    });

    it("should update subscriber status for bounce events", async () => {
      const webhookData = {
        id: "webhook-123",
        event: "hard_bounce",
        email: "test@example.com",
      };

      const processedEvent = {
        eventType: "hard_bounce",
        email: "test@example.com",
        occurredAt: new Date(),
        data: {},
      };

      mockBrevoService.processWebhookEvent.mockResolvedValue(processedEvent);

      // Mock getSubscriberByEmail to return a subscriber
      const getSubscriberSpy = vi
        .spyOn(emailService, "getSubscriberByEmail")
        .mockResolvedValue({
          id: 1,
          email: "test@example.com",
        });

      const updateSubscriberSpy = vi
        .spyOn(emailService, "updateSubscriber")
        .mockResolvedValue({});

      await emailService.processWebhookEvent(webhookData);

      expect(getSubscriberSpy).toHaveBeenCalledWith("test@example.com");
      expect(updateSubscriberSpy).toHaveBeenCalledWith("test@example.com", {
        status: "bounced",
      });
    });

    it("should return null for subscriber not found", async () => {
      const webhookData = {
        id: "webhook-123",
        event: "opened",
        email: "notfound@example.com",
      };

      const processedEvent = {
        eventType: "opened",
        email: "notfound@example.com",
        occurredAt: new Date(),
        data: {},
      };

      mockBrevoService.processWebhookEvent.mockResolvedValue(processedEvent);

      vi.spyOn(emailService, "getSubscriberByEmail").mockRejectedValue(
        new Error("Subscriber not found"),
      );

      const result = await emailService.processWebhookEvent(webhookData);

      expect(result).toBeNull();
    });
  });

  describe("generateUnsubscribeToken", () => {
    beforeEach(() => {
      process.env.UNSUBSCRIBE_SECRET = "test-secret";
    });

    afterEach(() => {
      delete process.env.UNSUBSCRIBE_SECRET;
    });

    it("should generate consistent token for same email", () => {
      const token1 = emailService.generateUnsubscribeToken("test@example.com");
      const token2 = emailService.generateUnsubscribeToken("test@example.com");

      expect(token1).toBe(token2);
      expect(token1).toBeTruthy(); // Just check it exists since we're mocking
    });

    it("should generate different tokens for different emails", () => {
      const token1 = emailService.generateUnsubscribeToken("test1@example.com");
      const token2 = emailService.generateUnsubscribeToken("test2@example.com");

      expect(token1).not.toBe(token2);
    });
  });

  describe("validateUnsubscribeToken", () => {
    beforeEach(() => {
      process.env.UNSUBSCRIBE_SECRET = "test-secret";
    });

    afterEach(() => {
      delete process.env.UNSUBSCRIBE_SECRET;
    });

    it("should validate correct token", () => {
      const email = "test@example.com";
      const token = emailService.generateUnsubscribeToken(email);

      const isValid = emailService.validateUnsubscribeToken(email, token);
      expect(isValid).toBe(true);
    });

    it("should reject incorrect token", () => {
      const email = "test@example.com";
      const wrongToken = "wrong-token";

      const isValid = emailService.validateUnsubscribeToken(email, wrongToken);
      expect(isValid).toBe(false);
    });
  });

  describe("getSubscriberStats", () => {
    it("should return subscriber statistics", async () => {
      const stats = await emailService.getSubscriberStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("active");
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("unsubscribed");
      expect(stats).toHaveProperty("bounced");
      expect(typeof stats.total).toBe("number");
    });
  });

  describe("getRecentEvents", () => {
    it("should return recent email events", async () => {
      const events = await emailService.getRecentEvents(10);

      expect(Array.isArray(events)).toBe(true);
      if (events.length > 0) {
        expect(events[0]).toHaveProperty("event_type");
        expect(events[0]).toHaveProperty("email");
        expect(events[0]).toHaveProperty("occurred_at");
      }
    });
  });

  describe("getEmailSubscriberService singleton", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = getEmailSubscriberService();
      const instance2 = getEmailSubscriberService();

      expect(instance1).toBe(instance2);
    });
  });

  describe("generateVerificationToken", () => {
    it("should generate a verification token", () => {
      const token = emailService.generateVerificationToken();
      expect(token).toBe("mocked-verification-token");
    });
  });
});
