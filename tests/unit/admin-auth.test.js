import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

describe("Admin Authentication", () => {
  let authService;
  let originalEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };

    // Set test environment variables
    process.env.ADMIN_PASSWORD = bcrypt.hashSync("testpassword", 10);
    process.env.ADMIN_SECRET =
      "test-secret-key-that-is-at-least-32-characters-long";
    process.env.ADMIN_SESSION_DURATION = "3600000"; // 1 hour
    process.env.NODE_ENV = "test";

    // Clear module cache to get fresh instance
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("AuthService", () => {
    it("should initialize with valid configuration", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      expect(service.sessionSecret).toBe(process.env.ADMIN_SECRET);
      expect(service.sessionDuration).toBe(3600000);
    });

    it("should throw error if ADMIN_SECRET is too short", async () => {
      process.env.ADMIN_SECRET = "short";

      // Need to import dynamically since the module creates a singleton on import
      await expect(async () => {
        await import("../../api/lib/auth-service.js");
      }).rejects.toThrow("ADMIN_SECRET must be at least 32 characters long");
    });

    it("should verify valid password", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const isValid = await service.verifyPassword("testpassword");
      expect(isValid).toBe(true);
    });

    it("should reject invalid password", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const isValid = await service.verifyPassword("wrongpassword");
      expect(isValid).toBe(false);
    });

    it("should create and verify session token", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const token = service.createSessionToken("admin123");
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const verification = service.verifySessionToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.admin.id).toBe("admin123");
      expect(verification.admin.role).toBe("admin");
    });

    it("should reject invalid token", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const verification = service.verifySessionToken("invalid-token");
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeTruthy();
    });

    it("should create session cookie", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const token = service.createSessionToken();
      const cookie = service.createSessionCookie(token);

      expect(cookie).toContain("admin_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Max-Age=3600");
    });

    it("should parse session from request with cookie", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const token = service.createSessionToken();
      const req = {
        headers: {
          cookie: `admin_session=${token}; other=value`,
        },
      };

      const parsedToken = service.getSessionFromRequest(req);
      expect(parsedToken).toBe(token);
    });

    it("should parse session from Authorization header", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const token = service.createSessionToken();
      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };

      const parsedToken = service.getSessionFromRequest(req);
      expect(parsedToken).toBe(token);
    });

    it("should create logout cookie", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const cookie = service.clearSessionCookie();

      expect(cookie).toContain("admin_session=");
      expect(cookie).toContain("Max-Age=0");
    });
  });

  describe("Auth Middleware", () => {
    it("should reject request without token", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const handler = vi.fn();
      const middleware = service.requireAuth(handler);

      const req = { headers: {} };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await middleware(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Authentication required",
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("should reject request with invalid token", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const handler = vi.fn();
      const middleware = service.requireAuth(handler);

      const req = {
        headers: {
          cookie: "admin_session=invalid-token",
        },
      };
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await middleware(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: "Invalid or expired session",
      });
      expect(handler).not.toHaveBeenCalled();
    });

    it("should allow request with valid token", async () => {
      const { AuthService } = await import("../../api/lib/auth-service.js");
      const service = new AuthService();

      const token = service.createSessionToken("admin123");
      const handler = vi.fn();
      const middleware = service.requireAuth(handler);

      const req = {
        headers: {
          cookie: `admin_session=${token}`,
        },
      };
      const res = {};

      await middleware(req, res);

      expect(handler).toHaveBeenCalledWith(req, res);
      expect(req.admin).toBeDefined();
      expect(req.admin.id).toBe("admin123");
      expect(req.admin.role).toBe("admin");
    });
  });
});
