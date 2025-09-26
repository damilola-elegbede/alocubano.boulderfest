export class RateLimiter {
  constructor() {
    this.attempts = new Map();
    this.violations = new Map();
    this.windowMs = 15 * 60 * 1000; // 15 minutes
    this.maxAttempts = 3;

    // Cleanup old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  destroy() {
    // Clear the interval to prevent memory leaks
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Clear maps
    this.attempts.clear();
    this.violations.clear();
  }

  async checkRateLimit(identifier, isAdmin = false) {
    // Bypass for admin users
    if (isAdmin) {
      return { allowed: true, remaining: 999, resetTime: null };
    }

    const now = Date.now();
    const key = this.getKey(identifier);

    // Check for previous violations (progressive backoff)
    const violationMeta = this.violations.get(key) || { count: 0, lastViolationAt: 0 };
    const backoffMultiplier = Math.pow(2, violationMeta.count); // Exponential backoff
    const effectiveWindow = this.windowMs * backoffMultiplier;

    // Get or create attempt record
    let record = this.attempts.get(key);
    if (!record) {
      record = { attempts: [], windowStart: now };
      this.attempts.set(key, record);
    }

    // Remove attempts outside the window
    const windowStart = now - effectiveWindow;
    record.attempts = record.attempts.filter(time => time > windowStart);

    // Check if limit exceeded
    if (record.attempts.length >= this.maxAttempts) {
      // Record violation
      const nowTs = Date.now();
      this.violations.set(key, {
        count: violationMeta.count + 1,
        lastViolationAt: nowTs,
      });

      // Calculate reset time
      const oldestAttempt = Math.min(...record.attempts);
      const resetTime = oldestAttempt + effectiveWindow;

      return {
        allowed: false,
        remaining: 0,
        resetTime: new Date(resetTime),
        retryAfter: Math.ceil((resetTime - now) / 1000)
      };
    }

    // Record this attempt
    record.attempts.push(now);

    // Clear violations on successful attempt
    if (violationMeta.count > 0 && record.attempts.length === 1) {
      this.violations.delete(key);
    }

    return {
      allowed: true,
      remaining: this.maxAttempts - record.attempts.length,
      resetTime: new Date(now + effectiveWindow)
    };
  }

  getKey(identifier) {
    // Use IP + endpoint as key for more granular control
    return `${identifier.ip}:${identifier.endpoint || 'default'}`;
  }

  cleanup() {
    const now = Date.now();
    const maxAge = this.windowMs * 4; // Keep for 4x window duration

    // Clean attempts
    for (const [key, record] of this.attempts.entries()) {
      const latestAttempt = Math.max(...record.attempts, 0);
      if (now - latestAttempt > maxAge) {
        this.attempts.delete(key);
      }
    }

    // Clean violations older than 1 hour since last violation
    for (const [key, meta] of this.violations.entries()) {
      if (!meta?.lastViolationAt || (now - meta.lastViolationAt) > 60 * 60 * 1000) {
        this.violations.delete(key);
      }
    }
  }

  reset(identifier) {
    const key = this.getKey(identifier);
    this.attempts.delete(key);
    this.violations.delete(key);
  }
}

// Singleton instance
let rateLimiterInstance;
export function getRateLimiter() {
  if (!rateLimiterInstance) {
    rateLimiterInstance = new RateLimiter();
  }
  return rateLimiterInstance;
}