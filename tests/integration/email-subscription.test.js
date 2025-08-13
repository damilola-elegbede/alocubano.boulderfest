import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMocks } from "node-mocks-http";
import subscribeHandler from "../../api/email/subscribe.js";
import unsubscribeHandler from "../../api/email/unsubscribe.js";

// Create a persistent mock service instance with correct method structure
const mockEmailService = {
  ensureInitialized: vi.fn(),
  createSubscriber: vi.fn(),
  unsubscribeSubscriber: vi.fn(),
  validateUnsubscribeToken: vi.fn(),
  generateVerificationToken: vi.fn(() => "test-verification-token"),
  brevoService: {
    sendVerificationEmail: vi.fn(),
  },
};

// Configure the ensureInitialized mock to return the service instance
// This is the key pattern - ensureInitialized returns the service itself
mockEmailService.ensureInitialized.mockResolvedValue(mockEmailService);

// Mock the email subscriber service
vi.mock("../../api/lib/email-subscriber-service.js", () => ({
  getEmailSubscriberService: vi.fn(() => mockEmailService),
}));

describe("Email Subscription Integration Tests", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset and reconfigure the mock after clearing
    mockEmailService.ensureInitialized.mockResolvedValue(mockEmailService);
    mockEmailService.createSubscriber.mockReset();
    mockEmailService.unsubscribeSubscriber.mockReset();
    mockEmailService.validateUnsubscribeToken.mockReset();
    mockEmailService.generateVerificationToken.mockReturnValue("test-verification-token");
    mockEmailService.brevoService.sendVerificationEmail.mockReset();

    // Set up environment variables
    process.env.REQUIRE_EMAIL_VERIFICATION = "false";
    process.env.RATE_LIMIT_EMAIL_SUBSCRIPTION = "20";
    process.env.RATE_LIMIT_EMAIL_UNSUBSCRIBE = "10";
  });

  afterEach(() => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    delete process.env.RATE_LIMIT_EMAIL_SUBSCRIPTION;
    delete process.env.RATE_LIMIT_EMAIL_UNSUBSCRIBE;
  });

  describe("POST /api/email/subscribe", () => {
    it("should successfully subscribe valid email", async () => {
      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        status: "active",
        first_name: "John",
      };

      mockEmailService.createSubscriber.mockResolvedValue(mockSubscriber);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          firstName: "John",
          consentToMarketing: true,
          source: "contact_page",
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(201);

      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);
      expect(responseData.subscriber.email).toBe("test@example.com");
      expect(responseData.subscriber.status).toBe("active");

      expect(mockEmailService.createSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          firstName: "John",
          status: "active",
          consentSource: "contact_page",
        }),
      );
    });

    it("should require email address", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          firstName: "John",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Email address is required");
    });

    it("should validate email format", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "invalid-email",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Please enter a valid email address");
    });

    it("should require marketing consent", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          consentToMarketing: false,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Marketing consent is required");
    });

    it("should handle duplicate email subscription", async () => {
      mockEmailService.createSubscriber.mockRejectedValue(
        new Error("Email address is already subscribed"),
      );

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(409);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe(
        "This email address is already subscribed to our newsletter",
      );
    });

    it("should handle Brevo API errors", async () => {
      mockEmailService.createSubscriber.mockRejectedValue(
        new Error("Brevo API error: Service unavailable"),
      );

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(503);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe(
        "Email service temporarily unavailable. Please try again later.",
      );
    });

    it("should sanitize input data", async () => {
      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        status: "active",
      };

      mockEmailService.createSubscriber.mockResolvedValue(mockSubscriber);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "  TEST@EXAMPLE.COM  ",
          firstName: "  John  ",
          lastName: "  Doe  ",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(mockEmailService.createSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "test@example.com",
          firstName: "John",
          lastName: "Doe",
        }),
      );
    });

    it("should handle OPTIONS request (CORS preflight)", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()).toMatchObject({
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      });
    });

    it("should reject non-POST methods", async () => {
      const { req, res } = createMocks({
        method: "GET",
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(405);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Method not allowed. Use POST.");
    });

    it("should handle verification email flow", async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = "true";

      const mockSubscriber = {
        id: 1,
        email: "test@example.com",
        status: "pending",
        first_name: "John",
      };

      mockEmailService.createSubscriber.mockResolvedValue(mockSubscriber);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          firstName: "John",
          consentToMarketing: true,
        },
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(201);

      const responseData = JSON.parse(res._getData());
      expect(responseData.message).toBe(
        "Please check your email to verify your subscription",
      );
      expect(responseData.subscriber.requiresVerification).toBe(true);

      expect(
        mockEmailService.brevoService.sendVerificationEmail,
      ).toHaveBeenCalled();
    });
  });

  describe("GET/POST /api/email/unsubscribe", () => {
    beforeEach(() => {
      mockEmailService.validateUnsubscribeToken.mockReturnValue(true);
      mockEmailService.unsubscribeSubscriber.mockResolvedValue({
        email: "test@example.com",
        status: "unsubscribed",
      });
    });

    it("should unsubscribe via GET request with valid token", async () => {
      const { req, res } = createMocks({
        method: "GET",
        query: {
          email: "test@example.com",
          token: "valid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()["content-type"]).toBe("text/html");

      const html = res._getData();
      expect(html).toContain("You've Been Unsubscribed");
      expect(html).toContain("test@example.com");

      expect(mockEmailService.validateUnsubscribeToken).toHaveBeenCalledWith(
        "test@example.com",
        "valid-token",
      );
      expect(mockEmailService.unsubscribeSubscriber).toHaveBeenCalledWith(
        "test@example.com",
        "user_request",
      );
    });

    it("should unsubscribe via POST request with valid token", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          token: "valid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(200);

      const responseData = JSON.parse(res._getData());
      expect(responseData.success).toBe(true);
      expect(responseData.message).toBe(
        "Successfully unsubscribed from newsletter",
      );
      expect(responseData.email).toBe("test@example.com");
    });

    it("should reject invalid unsubscribe token", async () => {
      mockEmailService.validateUnsubscribeToken.mockReturnValue(false);

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          token: "invalid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Invalid unsubscribe token");
    });

    it("should require email parameter", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          token: "valid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Email address is required");
    });

    it("should require token parameter", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Unsubscribe token is required");
    });

    it("should validate email format", async () => {
      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "invalid-email",
          token: "valid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe("Please enter a valid email address");
    });

    it("should handle subscriber not found error", async () => {
      mockEmailService.unsubscribeSubscriber.mockRejectedValue(
        new Error("Subscriber not found"),
      );

      const { req, res } = createMocks({
        method: "POST",
        body: {
          email: "test@example.com",
          token: "valid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(404);

      const responseData = JSON.parse(res._getData());
      expect(responseData.error).toBe(
        "Email address not found or already unsubscribed",
      );
    });

    it("should return HTML error page for GET request errors", async () => {
      mockEmailService.validateUnsubscribeToken.mockReturnValue(false);

      const { req, res } = createMocks({
        method: "GET",
        query: {
          email: "test@example.com",
          token: "invalid-token",
        },
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getHeaders()["content-type"]).toBe("text/html");

      const html = res._getData();
      expect(html).toContain("Invalid unsubscribe token");
    });

    it("should handle OPTIONS request (CORS preflight)", async () => {
      const { req, res } = createMocks({
        method: "OPTIONS",
      });

      await unsubscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getHeaders()).toMatchObject({
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      });
    });
  });
});
