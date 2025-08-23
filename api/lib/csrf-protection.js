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
  
  validateOrigin(origin, allowedOrigins) {
    if (!origin) {
      return false;
    }
    
    return allowedOrigins.some(allowed => {
      if (allowed === origin) return true;
      
      // Support wildcard subdomains
      if (allowed.startsWith('*.')) {
        const domain = allowed.substring(2);
        return origin.endsWith(domain);
      }
      
      return false;
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
      // Skip for GET requests
      if (req.method === 'GET' || req.method === 'HEAD') {
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