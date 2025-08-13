/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock crypto module - must be before imports that use it
vi.mock("crypto", () => {
  return {
    createHmac: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => "6d6f636b65642d7369676e6174757265"), // 'mocked-signature' in hex
    })),
    timingSafeEqual: vi.fn((a, b) => {
      // Compare buffers byte by byte
      if (a.length !== b.length) return false;
      let same = true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) same = false;
      }
      return same;
    }),
    randomBytes: vi.fn(() => ({
      toString: vi.fn(() => "mocked-random-bytes"),
    })),
  };
});

import { BrevoService, getBrevoService } from "../../api/lib/brevo-service.js";

describe("BrevoService", () => {
  let brevoService;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create a proper vi.fn() mock with all the needed methods
    global.fetch = vi.fn();

    // Set up environment variables
    process.env.BREVO_API_KEY = "test-api-key";
    process.env.BREVO_NEWSLETTER_LIST_ID = "1";
    process.env.BREVO_WELCOME_TEMPLATE_ID = "1";
    process.env.SEND_WELCOME_EMAIL = "true";

    brevoService = new BrevoService();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_NEWSLETTER_LIST_ID;
    delete process.env.BREVO_WELCOME_TEMPLATE_ID;
    delete process.env.SEND_WELCOME_EMAIL;
  });

  describe("constructor", () => {
    it("should initialize with API key from environment", () => {
      expect(brevoService.apiKey).toBe("test-api-key");
    });

    it("should throw error if API key is missing", () => {
      delete process.env.BREVO_API_KEY;
      expect(() => new BrevoService()).toThrow(
        "BREVO_API_KEY environment variable is required",
      );
    });

    it("should set default list and template IDs", () => {
      expect(brevoService.lists.newsletter).toBe(1);
      expect(brevoService.templates.welcome).toBe(1);
    });
  });

  describe("getHeaders", () => {
    it("should return correct headers", () => {
      const headers = brevoService.getHeaders();
      expect(headers).toEqual({
        "Content-Type": "application/json",
        "api-key": "test-api-key",
      });
    });
  });

  describe("makeRequest", () => {
    it("should make successful API request", async () => {
      const mockResponse = { success: true };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await brevoService.makeRequest("/test");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/test",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "api-key": "test-api-key",
          },
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should handle API errors", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: "Bad request" }),
      });

      await expect(brevoService.makeRequest("/test")).rejects.toThrow(
        "Brevo API error: 400 - Bad request",
      );
    });

    it("should handle network errors", async () => {
      global.fetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(brevoService.makeRequest("/test")).rejects.toThrow(
        "Network error",
      );
    });
  });

  describe("createOrUpdateContact", () => {
    it.skip("should create contact with correct payload", async () => {
      const mockResponse = { id: 123 };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const contactData = {
        email: "test@example.com",
        firstName: "John",
        lastName: "Doe",
        phone: "+1234567890",
        attributes: { SOURCE: "website" },
        listIds: [1],
      };

      const result = await brevoService.createOrUpdateContact(contactData);

      expect(global.fetch).toHaveBeenCalledWith(
        "https://api.brevo.com/v3/contacts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": "test-api-key",
          },
          body: JSON.stringify({
            email: "test@example.com",
            attributes: {
              FNAME: "John",
              LNAME: "Doe",
              PHONE: "+1234567890",
              SOURCE: "website",
            },
            listIds: [1],
            updateEnabled: true,
          }),
        },
      );
      expect(result).toEqual(mockResponse);
    });

    it("should remove empty attributes", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 123 }),
      });

      const contactData = {
        email: "test@example.com",
        firstName: "",
        lastName: null,
        phone: undefined,
      };

      await brevoService.createOrUpdateContact(contactData);

      const callBody = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(callBody.attributes).toEqual({});
    });
  });

  describe.skip("subscribeToNewsletter", () => {
    it("should subscribe user and send welcome email", async () => {
      const createContactResponse = { id: 123 };
      const welcomeEmailResponse = { success: true };

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => createContactResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => welcomeEmailResponse,
        });

      const subscriberData = {
        email: "test@example.com",
        firstName: "John",
        source: "website",
      };

      const result = await brevoService.subscribeToNewsletter(subscriberData);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(createContactResponse);

      // Check welcome email was sent
      const welcomeEmailCall = global.fetch.mock.calls[1];
      expect(welcomeEmailCall[0]).toContain("/smtp/email");
    });

    it("should handle duplicate contact gracefully", async () => {
      const duplicateError = new Error(
        "Brevo API error: 400 - duplicate_parameter",
      );
      const updateResponse = { id: 123 };

      global.fetch.mockRejectedValueOnce(duplicateError).mockResolvedValueOnce({
        ok: true,
        json: async () => updateResponse,
      });

      const subscriberData = {
        email: "test@example.com",
        firstName: "John",
      };

      const result = await brevoService.subscribeToNewsletter(subscriberData);

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(updateResponse);
    });
  });

  describe.skip("unsubscribeContact", () => {
    it("should unsubscribe contact successfully", async () => {
      const contactResponse = { listIds: [1, 2] };
      const removeResponse = { success: true };
      const updateResponse = { success: true };

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => contactResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => removeResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => removeResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => updateResponse,
        });

      const result = await brevoService.unsubscribeContact("test@example.com");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Successfully unsubscribed");
    });

    it("should handle contact not found gracefully", async () => {
      const notFoundError = new Error(
        "Brevo API error: 404 - contact_not_exist",
      );
      global.fetch.mockRejectedValueOnce(notFoundError);

      const result = await brevoService.unsubscribeContact("test@example.com");

      expect(result.success).toBe(true);
      expect(result.message).toBe("Contact not found (already unsubscribed)");
    });
  });

  describe("healthCheck", () => {
    it("should return healthy status on success", async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ account: "test" }),
      });

      const result = await brevoService.healthCheck();

      expect(result.status).toBe("healthy");
      expect(result.timestamp).toBeDefined();
    });

    it("should return unhealthy status on error", async () => {
      global.fetch.mockRejectedValueOnce(new Error("API unavailable"));

      const result = await brevoService.healthCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.error).toBe("API unavailable");
    });
  });

  describe("validateWebhookSignature", () => {
    beforeEach(() => {
      process.env.BREVO_WEBHOOK_SECRET = "test-secret";
    });

    afterEach(() => {
      delete process.env.BREVO_WEBHOOK_SECRET;
    });

    it("should validate correct signature", () => {
      const payload = JSON.stringify({ test: "data" });
      // Since we're mocking crypto to always return hex value
      const isValid = brevoService.validateWebhookSignature(
        payload,
        "6d6f636b65642d7369676e6174757265",
      );
      expect(isValid).toBe(true);
    });

    it("should reject incorrect signature", () => {
      const payload = JSON.stringify({ test: "data" });
      const wrongSignature = "wrong-signature";

      const isValid = brevoService.validateWebhookSignature(
        payload,
        wrongSignature,
      );
      expect(isValid).toBe(false);
    });

    it("should throw error if secret not configured", () => {
      delete process.env.BREVO_WEBHOOK_SECRET;

      expect(() => {
        brevoService.validateWebhookSignature("payload", "signature");
      }).toThrow("BREVO_WEBHOOK_SECRET not configured");
    });
  });

  describe.skip("getBrevoService singleton", () => {
    it("should return same instance on multiple calls", () => {
      const instance1 = getBrevoService();
      const instance2 = getBrevoService();

      expect(instance1).toBe(instance2);
    });
  });
});
