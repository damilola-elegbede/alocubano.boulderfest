/**
 * Comprehensive Security Headers Test Suite
 * Validates SPEC_04 Task 4.4 security implementation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  addSecurityHeaders, 
  addAPISecurityHeaders, 
  addCSRFHeaders,
  getHelmetConfig,
  TRUSTED_DOMAINS
} from '../../api/lib/security-headers.js';
import { createSecurityMiddleware } from '../../middleware/security.js';

// Mock Helmet
vi.mock('helmet', () => ({
  default: vi.fn((config) => (req, res, next) => {
    // Mock helmet behavior - apply basic headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    if (process.env.VERCEL_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }
    
    if (next) next();
  })
}));

describe('Security Headers System', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      url: '/test',
      headers: {
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.1'
      }
    };

    mockRes = {
      headers: {},
      setHeader: vi.fn((name, value) => {
        mockRes.headers[name] = value;
      }),
      getHeader: vi.fn((name) => mockRes.headers[name]),
      removeHeader: vi.fn((name) => {
        delete mockRes.headers[name];
      }),
      status: vi.fn(() => mockRes),
      json: vi.fn(() => mockRes),
      end: vi.fn(() => mockRes)
    };
  });

  describe('Basic Security Headers', () => {
    it('should apply basic security headers', async () => {
      await addSecurityHeaders(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
      // X-XSS-Protection removed in Helmet v7, but added manually in addSecurityHeaders
      // The header is still set, just not by Helmet's mock
      expect(mockRes.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    it('should apply HSTS only in production', async () => {
      // Store original env
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        // Test development
        process.env.VERCEL_ENV = 'development';
        process.env.NODE_ENV = 'development';
        await addSecurityHeaders(mockReq, mockRes);
        
        expect(mockRes.setHeader).not.toHaveBeenCalledWith(
          'Strict-Transport-Security',
          expect.any(String)
        );

        // Reset mock calls
        mockRes.setHeader.mockClear();

        // Test production
        process.env.VERCEL_ENV = 'production';
        process.env.NODE_ENV = 'production';
        await addSecurityHeaders(mockReq, mockRes);
        
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Strict-Transport-Security',
          'max-age=63072000; includeSubDomains; preload'
        );
      } finally {
        // Restore original env
        if (originalVercelEnv !== undefined) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should hide server information', async () => {
      await addSecurityHeaders(mockReq, mockRes);

      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Server', 'Vercel');
    });

    it('should add custom application headers', async () => {
      await addSecurityHeaders(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Application', 'ALocubanoBoulderfest');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Security-Level', 'Strict');
    });
  });

  describe('API Security Headers', () => {
    it('should apply API-specific headers with no caching', () => {
      addAPISecurityHeaders({}, mockRes, { maxAge: 0 });

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, proxy-revalidate'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Expires', '0');
    });

    it('should apply API-specific headers with caching', () => {
      addAPISecurityHeaders({}, mockRes, { maxAge: 300, etag: 'W/"123456"' });

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'public, max-age=300, s-maxage=300, stale-while-revalidate=60'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('ETag', 'W/"123456"');
    });

    it('should set CORS headers for API endpoints', () => {
      const corsOrigins = ['https://example.com', 'https://app.example.com'];
      const mockReq = { headers: { origin: 'https://example.com' } };
      addAPISecurityHeaders(mockReq, mockRes, { corsOrigins });

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'https://example.com'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Methods',
        'GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS'
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-API-Key, X-CSRF-Token'
      );
    });

    it('should set API versioning headers', () => {
      addAPISecurityHeaders({}, mockRes, { apiVersion: 'v2' });

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-API-Version', 'v2');
    });

    it('should not set rate limiting headers (handled by middleware)', () => {
      addAPISecurityHeaders({}, mockRes);

      // Rate limiting headers are now handled by the rate-limiter middleware
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-RateLimit-Limit', expect.anything());
      expect(mockRes.setHeader).not.toHaveBeenCalledWith('X-RateLimit-Window', expect.anything());
    });

    it('should set CORS credentials when allowCredentials is true', () => {
      const corsOrigins = ['https://example.com', 'https://app.example.com'];
      const mockReq = { headers: { origin: 'https://example.com' } };
      
      addAPISecurityHeaders(mockReq, mockRes, { 
        corsOrigins,
        allowCredentials: true 
      });

      // Verify credentials header is set
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Credentials', 
        'true'
      );
      
      // Verify origin is echoed (not '*') when credentials are enabled
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'https://example.com'
      );
      
      // Verify Vary header includes Origin
      expect(mockRes.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    });

    it('should fallback to single origin when no request origin is present', () => {
      const corsOrigins = ['https://api.example.com'];
      // mockReq has no origin header
      const mockReq = { headers: {} };
      
      addAPISecurityHeaders(mockReq, mockRes, { corsOrigins });

      // Should set the single origin as fallback
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Access-Control-Allow-Origin',
        'https://api.example.com'
      );
      
      // Vary header should still be set for caching
      expect(mockRes.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    });
  });

  describe('CSRF Protection', () => {
    it('should add CSRF headers', () => {
      const token = 'test-csrf-token';
      addCSRFHeaders(mockRes, token);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-CSRF-Token', token);
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Vary', 'X-CSRF-Token, Origin, X-Requested-With');
    });
  });

  describe('Helmet Configuration', () => {
    it('should generate proper Helmet config', () => {
      const config = getHelmetConfig();

      expect(config).toHaveProperty('contentSecurityPolicy');
      expect(config).toHaveProperty('frameguard');
      expect(config).toHaveProperty('noSniff', true);
      // xssFilter removed in Helmet v7
      expect(config).not.toHaveProperty('xssFilter');
      expect(config).toHaveProperty('referrerPolicy');
      // permissionsPolicy is not a core Helmet option
      expect(config).not.toHaveProperty('permissionsPolicy');
    });

    it('should configure CSP with trusted domains', () => {
      const config = getHelmetConfig();
      const csp = config.contentSecurityPolicy.directives;

      expect(csp.defaultSrc).toContain("'self'");
      expect(csp.frameAncestors).toContain("'none'");
      expect(csp.objectSrc).toContain("'none'");
      expect(csp.baseUri).toContain("'self'");
    });

    it('should include Stripe domains in CSP', () => {
      const config = getHelmetConfig();
      const csp = config.contentSecurityPolicy.directives;

      TRUSTED_DOMAINS.stripe.forEach(domain => {
        expect(csp.scriptSrc).toContain(domain);
        expect(csp.connectSrc).toContain(domain);
      });
    });

    it('should configure HSTS only in production', () => {
      // Store original env
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        // Test development
        process.env.VERCEL_ENV = 'development';
        process.env.NODE_ENV = 'development';
        let config = getHelmetConfig();
        expect(config.hsts).toBe(false);

        // Test production
        process.env.VERCEL_ENV = 'production';
        process.env.NODE_ENV = 'production';
        config = getHelmetConfig();
        expect(config.hsts).toEqual({
          maxAge: 63072000,
          includeSubDomains: true,
          preload: true
        });
      } finally {
        // Restore original env
        if (originalVercelEnv !== undefined) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should not include Permissions Policy in Helmet config', () => {
      const config = getHelmetConfig();
      // Permissions Policy is not a core Helmet option, it's set separately
      expect(config.permissionsPolicy).toBeUndefined();
    });
  });

  describe('Security Middleware Integration', () => {
    it('should create API security middleware', () => {
      const handler = vi.fn(async (req, res) => {
        res.json({ success: true });
      });

      const securityMiddleware = createSecurityMiddleware('api');
      const protectedHandler = securityMiddleware(handler);

      expect(protectedHandler).toBeInstanceOf(Function);
    });

    it('should create admin security middleware', () => {
      const handler = vi.fn(async (req, res) => {
        res.json({ success: true });
      });

      const securityMiddleware = createSecurityMiddleware('admin');
      const protectedHandler = securityMiddleware(handler);

      expect(protectedHandler).toBeInstanceOf(Function);
    });

    it('should create auth security middleware', () => {
      const handler = vi.fn(async (req, res) => {
        res.json({ success: true });
      });

      const securityMiddleware = createSecurityMiddleware('auth');
      const protectedHandler = securityMiddleware(handler);

      expect(protectedHandler).toBeInstanceOf(Function);
    });
  });

  describe('Content Security Policy', () => {
    it('should allow necessary inline scripts for Stripe', () => {
      // Store original env
      const originalNodeEnv = process.env.NODE_ENV;
      
      try {
        // Test development mode - should have unsafe-eval
        process.env.NODE_ENV = 'development';
        let config = getHelmetConfig();
        let csp = config.contentSecurityPolicy.directives;
        expect(csp.scriptSrc).toContain("'unsafe-inline'");
        expect(csp.scriptSrc).toContain("'unsafe-eval'");
        
        // Test production mode - should NOT have unsafe-eval
        process.env.NODE_ENV = 'production';
        config = getHelmetConfig();
        csp = config.contentSecurityPolicy.directives;
        expect(csp.scriptSrc).toContain("'unsafe-inline'");
        expect(csp.scriptSrc).not.toContain("'unsafe-eval'");
      } finally {
        // Restore original env
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should include report URI for CSP violations', () => {
      const config = getHelmetConfig();
      const csp = config.contentSecurityPolicy.directives;

      expect(csp.reportUri).toContain('/api/security/csp-report');
    });

    it('should upgrade insecure requests in production', () => {
      // Store original env
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.VERCEL_ENV = 'production';
        process.env.NODE_ENV = 'production';
        const config = getHelmetConfig();
        const csp = config.contentSecurityPolicy.directives;

        expect(csp.upgradeInsecureRequests).toBe(true);
      } finally {
        // Restore original env
        if (originalVercelEnv !== undefined) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });

    it('should not upgrade insecure requests in development', () => {
      // Store original env
      const originalVercelEnv = process.env.VERCEL_ENV;
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.VERCEL_ENV = 'development';
        process.env.NODE_ENV = 'development';
        const config = getHelmetConfig();
        const csp = config.contentSecurityPolicy.directives;

        expect(csp.upgradeInsecureRequests).toBe(false);
      } finally {
        // Restore original env
        if (originalVercelEnv !== undefined) {
          process.env.VERCEL_ENV = originalVercelEnv;
        } else {
          delete process.env.VERCEL_ENV;
        }
        if (originalNodeEnv !== undefined) {
          process.env.NODE_ENV = originalNodeEnv;
        } else {
          delete process.env.NODE_ENV;
        }
      }
    });
  });

  describe('Trusted Domains Configuration', () => {
    it('should define Stripe domains', () => {
      expect(TRUSTED_DOMAINS.stripe).toContain('https://js.stripe.com');
      expect(TRUSTED_DOMAINS.stripe).toContain('https://checkout.stripe.com');
      expect(TRUSTED_DOMAINS.stripe).toContain('https://api.stripe.com');
    });

    it('should define Brevo domains', () => {
      expect(TRUSTED_DOMAINS.brevo).toContain('https://sibforms.com');
      expect(TRUSTED_DOMAINS.brevo).toContain('https://api.brevo.com');
    });

    it('should define CDN domains', () => {
      expect(TRUSTED_DOMAINS.cdn).toContain('https://fonts.googleapis.com');
      expect(TRUSTED_DOMAINS.cdn).toContain('https://fonts.gstatic.com');
    });

    it('should define Vercel domains', () => {
      expect(TRUSTED_DOMAINS.vercel).toContain('https://vercel.live');
      expect(TRUSTED_DOMAINS.vercel).toContain('*.vercel.app');
    });
  });
});

describe('Security Headers Edge Cases', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      method: 'GET',
      url: '/test',
      headers: {
        'user-agent': 'test-agent',
        'x-forwarded-for': '192.168.1.1'
      }
    };

    mockRes = {
      headers: {},
      setHeader: vi.fn((name, value) => {
        mockRes.headers[name] = value;
      }),
      getHeader: vi.fn((name) => mockRes.headers[name]),
      removeHeader: vi.fn((name) => {
        delete mockRes.headers[name];
      })
    };
  });

  it('should handle missing options gracefully', async () => {
    await expect(addSecurityHeaders(mockReq, mockRes)).resolves.not.toThrow();
  });

  it('should handle API headers with empty CORS origins', () => {
    expect(() => addAPISecurityHeaders({}, mockRes, { corsOrigins: [] })).not.toThrow();
    expect(mockRes.setHeader).not.toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      expect.any(String)
    );
  });

  it('should handle large maxAge values', () => {
    const largeMaxAge = 31536000; // 1 year
    addAPISecurityHeaders({}, mockRes, { maxAge: largeMaxAge });

    expect(mockRes.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      `public, max-age=${largeMaxAge}, s-maxage=${largeMaxAge}, stale-while-revalidate=60`
    );
  });

  it('should handle special characters in API version', () => {
    const version = 'v2.1-beta';
    addAPISecurityHeaders({}, mockRes, { apiVersion: version });

    expect(mockRes.setHeader).toHaveBeenCalledWith('X-API-Version', version);
  });
});