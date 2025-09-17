import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

/**
 * Mobile Check-in Authentication Service
 * Extended session duration for event staff during the festival
 */
export class MobileAuthService {
  constructor() {
    // Fail immediately if ADMIN_SECRET is not configured
    if (!process.env.ADMIN_SECRET) {
      throw new Error("❌ FATAL: ADMIN_SECRET secret not configured");
    }

    this.sessionSecret = process.env.ADMIN_SECRET;

    // Mobile check-in sessions: 72 hours for event weekend
    // Default: 259200000ms = 72 hours (3 days)
    this.sessionDuration = parseInt(
      process.env.MOBILE_CHECKIN_SESSION_DURATION || "259200000",
    );

    // Alternative: Use different duration based on role
    this.roleDurations = {
      checkin_staff: 259200000, // 72 hours for check-in staff
      admin: 3600000, // 1 hour for full admins
      volunteer: 43200000, // 12 hours for volunteers
    };

    if (this.sessionSecret.length < 32) {
      throw new Error("ADMIN_SECRET must be at least 32 characters long");
    }
  }

  /**
   * Verify check-in staff credentials
   * Could be simplified password for event staff
   */
  async verifyStaffPassword(password) {
    // Check environment
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
    const isNonProd = !isProduction;

    // Non-production: Use TEST_ADMIN_PASSWORD with plain text comparison
    if (isNonProd) {
      const testAdminPassword = process.env.TEST_ADMIN_PASSWORD;
      if (!testAdminPassword) {
        console.error("[MobileAuth] Non-production but TEST_ADMIN_PASSWORD not configured");
        return false;
      }

      // Plain text comparison for non-production
      const matches = password.trim() === testAdminPassword.trim();
      console.log("[MobileAuth] TEST_ADMIN_PASSWORD verification result:", matches);
      return matches;
    }

    // Production: Use ADMIN_PASSWORD with bcrypt
    if (!process.env.ADMIN_PASSWORD) {
      throw new Error("❌ FATAL: ADMIN_PASSWORD secret not configured");
    }

    // Option 1: Same admin password
    const adminPasswordHash = process.env.ADMIN_PASSWORD;

    // Option 2: Separate staff password (recommended)
    const staffPasswordHash =
      process.env.CHECKIN_STAFF_PASSWORD || adminPasswordHash;

    return await bcrypt.compare(password, staffPasswordHash);
  }

  /**
   * Create mobile check-in session token with extended duration
   */
  createMobileSessionToken(staffId = "checkin_staff", role = "checkin_staff") {
    const duration = this.roleDurations[role] || this.sessionDuration;

    return jwt.sign(
      {
        id: staffId,
        role: role,
        loginTime: Date.now(),
        isMobileCheckIn: true, // Flag to identify mobile sessions
        expiresAt: Date.now() + duration,
      },
      this.sessionSecret,
      {
        expiresIn: Math.floor(duration / 1000) + "s",
        issuer: "alocubano-mobile-checkin",
      },
    );
  }

  /**
   * Verify mobile session token
   */
  verifyMobileSessionToken(token) {
    try {
      const decoded = jwt.verify(token, this.sessionSecret, {
        issuer: "alocubano-mobile-checkin",
      });

      // Check if session is still valid
      if (decoded.expiresAt && Date.now() > decoded.expiresAt) {
        return {
          valid: false,
          error: "Session expired",
        };
      }

      return {
        valid: true,
        staff: decoded,
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }

  /**
   * Create session cookie for mobile PWA
   */
  createMobileSessionCookie(token, role = "checkin_staff") {
    const duration = this.roleDurations[role] || this.sessionDuration;

    return serialize("mobile_checkin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: Math.floor(duration / 1000),
      path: "/",
    });
  }

  /**
   * Parse session from request
   */
  getSessionFromRequest(req) {
    // Check mobile session cookie first
    const cookies = parse(req.headers.cookie || "");
    if (cookies.mobile_checkin_session) {
      return cookies.mobile_checkin_session;
    }

    // Check regular admin session as fallback
    if (cookies.admin_session) {
      return cookies.admin_session;
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Check if user has check-in permissions
   */
  canCheckInTickets(decodedToken) {
    const allowedRoles = ["admin", "checkin_staff", "volunteer"];
    return allowedRoles.includes(decodedToken.role);
  }

  /**
   * Refresh token if needed (for long sessions)
   */
  shouldRefreshToken(decodedToken) {
    const timeLeft = decodedToken.expiresAt - Date.now();
    const oneDay = 86400000; // 24 hours in ms

    // Refresh if less than 24 hours left
    return timeLeft < oneDay;
  }
}

// Export singleton instance
let mobileAuthInstance;

export function getMobileAuthService() {
  if (!mobileAuthInstance) {
    mobileAuthInstance = new MobileAuthService();
  }
  return mobileAuthInstance;
}
