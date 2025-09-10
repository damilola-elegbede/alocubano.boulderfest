import crypto from 'crypto';

export class CSRFProtection {
  constructor() {
    this.tokens = new Map();
    this.tokenExpiry = 60 * 60 * 1000; // 1 hour
  }
  
  generateToken(sessionId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.tokenExpiry;
    
    this.tokens.set(token, {
      sessionId,
      expires,
      used: false
    });
    
    // Cleanup expired tokens
    this.cleanup();
    
    return token;
  }
  
  validateToken(token, sessionId) {
    if (!token) {
      throw new Error('CSRF token required');
    }
    
    const tokenData = this.tokens.get(token);
    
    if (!tokenData) {
      throw new Error('Invalid CSRF token');
    }
    
    if (tokenData.expires < Date.now()) {
      this.tokens.delete(token);
      throw new Error('CSRF token expired');
    }
    
    if (tokenData.sessionId !== sessionId) {
      throw new Error('CSRF token mismatch');
    }
    
    if (tokenData.used) {
      throw new Error('CSRF token already used');
    }
    
    // Mark as used (single-use tokens)
    tokenData.used = true;
    
    return true;
  }
  
  validateOrigin(originHeader, allowedOrigins) {
    if (!originHeader || !Array.isArray(allowedOrigins) || allowedOrigins.length === 0) {
      return false;
    }
    let originUrl;
    try {
      originUrl = new URL(originHeader);
    } catch {
      // If Referer is a full URL with path, or malformed, reject
      return false;
    }
    const origin = `${originUrl.protocol}//${originUrl.host}`;
    const host = originUrl.hostname;

    return allowedOrigins.some((allowed) => {
      // Support full origin entries like https://app.example.com
      if (/^https?:\/\//i.test(allowed)) {
        return allowed.toLowerCase() === origin.toLowerCase();
      }
      // Support exact host match: example.com or app.example.com
      if (!allowed.startsWith('*.')) {
        return host.toLowerCase() === allowed.toLowerCase();
      }
      // Wildcard subdomains: *.example.com -> match foo.example.com but not example.com
      const domain = allowed.slice(2).toLowerCase();
      return host.toLowerCase().endsWith(`.${domain}`);
    });
  }
  
  cleanup() {
    const now = Date.now();
    for (const [token, data] of this.tokens.entries()) {
      if (data.expires < now) {
        this.tokens.delete(token);
      }
    }
  }
  
  middleware(allowedOrigins = []) {
    return async (req, res, next) => {
      // Skip safe and preflight methods
      const method = req.method?.toUpperCase();
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
        return next();
      }
      
      // Validate origin
      const origin = req.headers.origin || req.headers.referer;
      if (!this.validateOrigin(origin, allowedOrigins)) {
        return res.status(403).json({ error: 'Invalid origin' });
      }
      
      // Validate CSRF token
      const token = req.headers['x-csrf-token'] || req.body.csrfToken;
      const sessionId = req.session?.id || req.ip;
      
      try {
        this.validateToken(token, sessionId);
        next();
      } catch (error) {
        return res.status(403).json({ error: error.message });
      }
    };
  }
}

// Export singleton instance
export const csrfProtection = new CSRFProtection();