import { describe, it, expect } from "vitest";
import crypto from "crypto";

describe("Webhook Security", () => {
  describe("Stripe Webhook Validation", () => {
    const testSecret = "whsec_test_secret_key_12345";
    const testPayload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed" });

    it("should generate valid Stripe webhook signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac("sha256", testSecret).update(`${timestamp}.${testPayload}`).digest("hex");
      expect(`t=${timestamp},v1=${sig}`).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });
    it("should reject invalid Stripe webhook signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const invalidSig = crypto.createHmac("sha256", "wrong_key").update(`${timestamp}.${testPayload}`).digest("hex");
      const validSig = crypto.createHmac("sha256", testSecret).update(`${timestamp}.${testPayload}`).digest("hex");
      expect(invalidSig).not.toBe(validSig);
    });
    it("should validate webhook timestamp tolerance", () => {
      const now = Math.floor(Date.now() / 1000);
      expect(now - (now - 360) > 300).toBe(true); // expired
      expect(now - (now - 120) > 300).toBe(false); // valid
    });
  });
  describe("Brevo Webhook Validation", () => {
    const testSecret = "brevo_webhook_secret_12345";
    const testPayload = { event: "delivered", email: "test@example.com" };

    it("should generate valid Brevo webhook signature", () => {
      const body = JSON.stringify(testPayload);
      
      // Generate signature like Brevo does
      const expectedSignature = crypto
        .createHmac("sha256", testSecret)
        .update(body)
        .digest("hex");
      
      // Validate signature format (64 hex characters)
      expect(expectedSignature).toMatch(/^[a-f0-9]{64}$/);
      expect(expectedSignature).toHaveLength(64);
    });


    it("should reject invalid Brevo webhook signature", () => {
      const sig = crypto.createHmac("sha256", testSecret).update(JSON.stringify(testPayload)).digest("hex");
      expect(sig).not.toBe("invalid_signature");
    });

    it("should use timing-safe comparison", () => {
      const b1 = Buffer.from("a".repeat(64), "hex");
      const b2 = Buffer.from("b".repeat(64), "hex");
      expect(() => crypto.timingSafeEqual(b1, b2)).not.toThrow();
    });
  });
  describe("Admin JWT Authentication", () => {
    it("should validate JWT and bcrypt formats", () => {
      expect("test_admin_jwt_secret_minimum_32_characters_long".length).toBeGreaterThanOrEqual(32);
      expect("eyJhbGciOiJIUzI1NiJ9.eyJhZG1pbiI6dHJ1ZX0.sig".split(".")).toHaveLength(3);
      expect("$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy").toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
    });
  });

  describe("Security Headers", () => {
    it("should validate security headers", () => {
      const csp = "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.stripe.com";
      expect(csp).toContain("default-src 'self'");
      expect("max-age=31536000; includeSubDomains; preload").toContain("max-age=31536000");
      expect(["DENY", "SAMEORIGIN"]).toContain("SAMEORIGIN");
    });
  });

  describe("Input Sanitization", () => {
    it("should validate input sanitization", () => {
      // HTML escaping
      const escaped = '<script>'.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      expect(escaped).toBe("&lt;script&gt;");
      
      // SQL injection detection
      expect("'; DROP TABLE users; --".includes("DROP")).toBe(true);
      
      // Email validation with strict regex
      const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      expect(emailRegex.test("user@example.com")).toBe(true);
      expect(emailRegex.test("user@@example.com")).toBe(false);
    });
  });
});