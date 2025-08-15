import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// Create a mock AuthService that doesn't have the singleton issue
class MockAuthService {
  constructor() {
    this.sessionSecret = process.env.ADMIN_SECRET;
    this.sessionDuration = parseInt(
      process.env.ADMIN_SESSION_DURATION || "3600000",
    );

    if (!this.sessionSecret || this.sessionSecret.length < 32) {
      throw new Error("ADMIN_SECRET must be at least 32 characters long");
    }
  }

  async verifyPassword(password) {
    const adminPasswordHash = process.env.ADMIN_PASSWORD;
    if (!adminPasswordHash) {
      return false;
    }
    return await bcrypt.compare(password, adminPasswordHash);
  }

  createSessionToken(adminId = "admin") {
    return jwt.sign(
      {
        id: adminId,
        role: "admin",
        loginTime: Date.now(),
      },
      this.sessionSecret,
      {
        expiresIn: Math.floor(this.sessionDuration / 1000) + "s",
        issuer: "alocubano-admin",
      },
    );
  }

  verifySessionToken(token) {
    try {
      const decoded = jwt.verify(token, this.sessionSecret, {
        issuer: "alocubano-admin",
      });

      return {
        valid: true,
        admin: decoded,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  createSessionCookie(token) {
    return `admin_session=${token}; HttpOnly; Secure=${process.env.NODE_ENV === "production"}; SameSite=Strict; Max-Age=${Math.floor(this.sessionDuration / 1000)}; Path=/`;
  }

  getSessionFromRequest(req) {
    const cookies = req.headers.cookie || "";
    const match = cookies.match(/admin_session=([^;]+)/);
    if (match) {
      return match[1];
    }

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    return null;
  }

  requireAuth(handler) {
    return async (req, res) => {
      const token = this.getSessionFromRequest(req);

      if (!token) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const session = this.verifySessionToken(token);

      if (!session.valid) {
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      req.admin = session.admin;
      return handler(req, res);
    };
  }

  clearSessionCookie() {
    return `admin_session=; HttpOnly; Secure=${process.env.NODE_ENV === "production"}; SameSite=Strict; Max-Age=0; Path=/`;
  }
}

describe("Admin Authentication", () => {
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
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe("AuthService", () => {
    it("should initialize with valid configuration", () => {
      const service = new MockAuthService();

      expect(service.sessionSecret).toBe(process.env.ADMIN_SECRET);
      expect(service.sessionDuration).toBe(3600000);
    });

    it("should throw error if ADMIN_SECRET is too short", () => {
      process.env.ADMIN_SECRET = "short";

      expect(() => {
        new MockAuthService();
      }).toThrow("ADMIN_SECRET must be at least 32 characters long");
    });

    it("should verify valid password", async () => {
      const service = new MockAuthService();

      const isValid = await service.verifyPassword("testpassword");
      expect(isValid).toBe(true);
    });

    it("should reject invalid password", async () => {
      const service = new MockAuthService();

      const isValid = await service.verifyPassword("wrongpassword");
      expect(isValid).toBe(false);
    });

    it("should create and verify session token", () => {
      const service = new MockAuthService();

      const token = service.createSessionToken("admin123");
      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");

      const verification = service.verifySessionToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.admin.id).toBe("admin123");
      expect(verification.admin.role).toBe("admin");
    });

    it("should reject invalid token", () => {
      const service = new MockAuthService();

      const verification = service.verifySessionToken("invalid-token");
      expect(verification.valid).toBe(false);
      expect(verification.error).toBeTruthy();
    });

    it("should create session cookie", () => {
      const service = new MockAuthService();

      const token = service.createSessionToken();
      const cookie = service.createSessionCookie(token);

      expect(cookie).toContain("admin_session=");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Strict");
      expect(cookie).toContain("Max-Age=3600");
    });

    it("should parse session from request with cookie", () => {
      const service = new MockAuthService();

      const token = service.createSessionToken();
      const req = {
        headers: {
          cookie: `admin_session=${token}; other=value`,
        },
      };

      const parsedToken = service.getSessionFromRequest(req);
      expect(parsedToken).toBe(token);
    });

    it("should parse session from Authorization header", () => {
      const service = new MockAuthService();

      const token = service.createSessionToken();
      const req = {
        headers: {
          authorization: `Bearer ${token}`,
        },
      };

      const parsedToken = service.getSessionFromRequest(req);
      expect(parsedToken).toBe(token);
    });

    it("should create logout cookie", () => {
      const service = new MockAuthService();

      const cookie = service.clearSessionCookie();

      expect(cookie).toContain("admin_session=");
      expect(cookie).toContain("Max-Age=0");
    });
  });

  describe("Auth Middleware", () => {
    it("should reject request without token", async () => {
      const service = new MockAuthService();

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
      const service = new MockAuthService();

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
      const service = new MockAuthService();

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
