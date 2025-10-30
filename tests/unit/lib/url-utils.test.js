/**
 * Unit Tests for URL Utils
 * Tests URL building functions for registration, tickets, QR codes, and wallet passes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getBaseUrl,
  buildRegistrationUrl,
  buildViewTicketsUrl,
  buildQRCodeUrl,
  buildWalletPassUrls
} from '../../../lib/url-utils.js';

describe('URL Utils - Unit Tests', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getBaseUrl', () => {
    describe('Production Environment', () => {
      it('should return production URL when VERCEL_ENV is production', () => {
        process.env.VERCEL_ENV = 'production';
        process.env.VERCEL_URL = 'preview.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://www.alocubanoboulderfest.org');
      });

      it('should prioritize VERCEL_ENV over NODE_ENV', () => {
        process.env.VERCEL_ENV = 'production';
        process.env.NODE_ENV = 'development';

        const url = getBaseUrl();

        expect(url).toBe('https://www.alocubanoboulderfest.org');
      });
    });

    describe('Preview Environment', () => {
      it('should return Vercel URL when VERCEL_ENV is preview', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'my-app-abc123.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://my-app-abc123.vercel.app');
      });

      it('should use VERCEL_URL for preview deployments', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'preview-branch-xyz.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://preview-branch-xyz.vercel.app');
      });

      it('should add https protocol to VERCEL_URL', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'app.vercel.app';

        const url = getBaseUrl();

        expect(url).toContain('https://');
        expect(url).not.toContain('https://https://');
      });
    });

    describe('Development Environment', () => {
      it('should return Vercel URL when VERCEL_ENV is development', () => {
        process.env.VERCEL_ENV = 'development';
        process.env.VERCEL_URL = 'localhost-dev.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://localhost-dev.vercel.app');
      });

      it('should use BASE_URL if no Vercel environment', () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        process.env.BASE_URL = 'https://custom-base.com';

        const url = getBaseUrl();

        expect(url).toBe('https://custom-base.com');
      });

      it('should use NEXT_PUBLIC_BASE_URL if BASE_URL not set', () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        delete process.env.BASE_URL;
        process.env.NEXT_PUBLIC_BASE_URL = 'https://next-public.com';

        const url = getBaseUrl();

        expect(url).toBe('https://next-public.com');
      });

      it('should fallback to default URL', () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        delete process.env.BASE_URL;
        delete process.env.NEXT_PUBLIC_BASE_URL;

        const url = getBaseUrl();

        expect(url).toBe('https://alocubanoboulderfest.org');
      });
    });

    describe('Priority Order', () => {
      it('should use production domain over VERCEL_URL in production', () => {
        process.env.VERCEL_ENV = 'production';
        process.env.VERCEL_URL = 'different.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://www.alocubanoboulderfest.org');
        expect(url).not.toContain('different.vercel.app');
      });

      it('should use VERCEL_URL over BASE_URL in preview', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'preview.vercel.app';
        process.env.BASE_URL = 'https://other.com';

        const url = getBaseUrl();

        expect(url).toBe('https://preview.vercel.app');
      });

      it('should use BASE_URL over NEXT_PUBLIC_BASE_URL', () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        process.env.BASE_URL = 'https://base-url.com';
        process.env.NEXT_PUBLIC_BASE_URL = 'https://next-public.com';

        const url = getBaseUrl();

        expect(url).toBe('https://base-url.com');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty VERCEL_URL', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = '';
        process.env.BASE_URL = 'https://fallback.com';

        const url = getBaseUrl();

        expect(url).toBe('https://fallback.com');
      });

      it('should handle VERCEL_URL without protocol', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'app.vercel.app';

        const url = getBaseUrl();

        expect(url).toBe('https://app.vercel.app');
      });

      it('should handle all environment variables undefined', () => {
        delete process.env.VERCEL_ENV;
        delete process.env.VERCEL_URL;
        delete process.env.BASE_URL;
        delete process.env.NEXT_PUBLIC_BASE_URL;

        const url = getBaseUrl();

        expect(url).toBe('https://alocubanoboulderfest.org');
      });
    });
  });

  describe('buildRegistrationUrl', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    describe('Basic URL Building', () => {
      it('should build registration URL with token', () => {
        const token = 'abc123token';
        const url = buildRegistrationUrl(token);

        expect(url).toContain('https://www.alocubanoboulderfest.org');
        expect(url).toContain('/register-tickets');
        expect(url).toContain('token=');
        expect(url).toContain(encodeURIComponent(token));
      });

      it('should encode token parameter', () => {
        const token = 'token+with/special=chars';
        const url = buildRegistrationUrl(token);

        expect(url).toContain(encodeURIComponent(token));
        expect(url).not.toContain('token+with/special=chars');
      });

      it('should handle simple alphanumeric tokens', () => {
        const token = 'simple123';
        const url = buildRegistrationUrl(token);

        expect(url).toBe('https://www.alocubanoboulderfest.org/register-tickets?token=simple123');
      });
    });

    describe('With Ticket ID', () => {
      it('should add ticketId parameter when provided', () => {
        const token = 'token123';
        const ticketId = 'TKT-001';
        const url = buildRegistrationUrl(token, ticketId);

        expect(url).toContain('token=');
        expect(url).toContain('ticketId=');
        expect(url).toContain(encodeURIComponent(ticketId));
      });

      it('should encode ticketId parameter', () => {
        const token = 'token123';
        const ticketId = 'TKT/001+Special';
        const url = buildRegistrationUrl(token, ticketId);

        expect(url).toContain(encodeURIComponent(ticketId));
        expect(url).not.toContain('TKT/001+Special');
      });

      it('should handle null ticketId', () => {
        const token = 'token123';
        const url = buildRegistrationUrl(token, null);

        expect(url).toContain('token=');
        expect(url).not.toContain('ticketId=');
      });

      it('should handle undefined ticketId', () => {
        const token = 'token123';
        const url = buildRegistrationUrl(token, undefined);

        expect(url).toContain('token=');
        expect(url).not.toContain('ticketId=');
      });

      it('should handle empty string ticketId', () => {
        const token = 'token123';
        const url = buildRegistrationUrl(token, '');

        // Empty string is falsy, so ticketId should not be added
        expect(url).not.toContain('ticketId=');
      });
    });

    describe('Environment-Specific URLs', () => {
      it('should use preview URL in preview environment', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'preview-abc.vercel.app';

        const url = buildRegistrationUrl('token123');

        expect(url).toContain('https://preview-abc.vercel.app');
        expect(url).toContain('/register-tickets?token=');
      });

      it('should use development URL in development environment', () => {
        process.env.VERCEL_ENV = 'development';
        process.env.VERCEL_URL = 'dev.vercel.app';

        const url = buildRegistrationUrl('token123');

        expect(url).toContain('https://dev.vercel.app');
      });
    });

    describe('Query String Format', () => {
      it('should use correct query string separator', () => {
        const url = buildRegistrationUrl('token', 'ticket');

        expect(url).toContain('?token=');
        expect(url).toContain('&ticketId=');
      });

      it('should maintain parameter order', () => {
        const url = buildRegistrationUrl('token', 'ticket');
        const params = url.split('?')[1];

        expect(params).toMatch(/^token=.*&ticketId=/);
      });
    });
  });

  describe('buildViewTicketsUrl', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    describe('Basic URL Building', () => {
      it('should build view tickets URL with token', () => {
        const token = 'view123token';
        const url = buildViewTicketsUrl(token);

        expect(url).toContain('https://www.alocubanoboulderfest.org');
        expect(url).toContain('/view-tickets');
        expect(url).toContain('token=');
        expect(url).toContain(encodeURIComponent(token));
      });

      it('should encode token parameter', () => {
        const token = 'view+token/with=special';
        const url = buildViewTicketsUrl(token);

        expect(url).toContain(encodeURIComponent(token));
      });
    });

    describe('With Ticket ID', () => {
      it('should add ticketId parameter when provided', () => {
        const token = 'view123';
        const ticketId = 'TKT-VIEW-001';
        const url = buildViewTicketsUrl(token, ticketId);

        expect(url).toContain('token=');
        expect(url).toContain('ticketId=');
        expect(url).toContain(encodeURIComponent(ticketId));
      });

      it('should encode ticketId parameter', () => {
        const token = 'view123';
        const ticketId = 'TICKET+ID/WITH=SPECIAL';
        const url = buildViewTicketsUrl(token, ticketId);

        expect(url).toContain(encodeURIComponent(ticketId));
      });

      it('should handle null ticketId', () => {
        const url = buildViewTicketsUrl('token', null);

        expect(url).not.toContain('ticketId=');
      });
    });

    describe('Difference from Registration URL', () => {
      it('should use view-tickets path instead of register-tickets', () => {
        const registrationUrl = buildRegistrationUrl('token');
        const viewUrl = buildViewTicketsUrl('token');

        expect(registrationUrl).toContain('/register-tickets');
        expect(viewUrl).toContain('/view-tickets');
        expect(viewUrl).not.toContain('/register-tickets');
      });

      it('should have same structure as registration URL', () => {
        const token = 'test123';
        const ticketId = 'TKT-001';

        const regUrl = buildRegistrationUrl(token, ticketId);
        const viewUrl = buildViewTicketsUrl(token, ticketId);

        // Both should have token and ticketId
        expect(regUrl.includes('token=')).toBe(viewUrl.includes('token='));
        expect(regUrl.includes('ticketId=')).toBe(viewUrl.includes('ticketId='));
      });
    });
  });

  describe('buildQRCodeUrl', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    describe('Basic URL Building', () => {
      it('should build QR code URL with token', () => {
        const token = 'qr123token';
        const url = buildQRCodeUrl(token);

        expect(url).toContain('https://www.alocubanoboulderfest.org');
        expect(url).toContain('/api/qr/generate');
        expect(url).toContain('token=');
        expect(url).toContain(encodeURIComponent(token));
      });

      it('should use API endpoint for QR generation', () => {
        const url = buildQRCodeUrl('token');

        expect(url).toContain('/api/qr/generate');
      });

      it('should encode token parameter', () => {
        const token = 'qr+token/special=chars';
        const url = buildQRCodeUrl(token);

        expect(url).toContain(encodeURIComponent(token));
      });
    });

    describe('Token Formats', () => {
      it('should handle JWT-style tokens', () => {
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
        const url = buildQRCodeUrl(token);

        expect(url).toContain(encodeURIComponent(token));
      });

      it('should handle UUID-style tokens', () => {
        const token = '550e8400-e29b-41d4-a716-446655440000';
        const url = buildQRCodeUrl(token);

        expect(url).toContain('token=550e8400-e29b-41d4-a716-446655440000');
      });

      it('should handle short tokens', () => {
        const token = 'abc';
        const url = buildQRCodeUrl(token);

        expect(url).toContain('token=abc');
      });

      it('should handle long tokens', () => {
        const token = 'a'.repeat(500);
        const url = buildQRCodeUrl(token);

        expect(url).toContain('token=');
        expect(url.length).toBeGreaterThan(500);
      });
    });

    describe('Environment-Specific URLs', () => {
      it('should use correct base URL in preview', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'qr-preview.vercel.app';

        const url = buildQRCodeUrl('token');

        expect(url).toContain('https://qr-preview.vercel.app');
      });
    });
  });

  describe('buildWalletPassUrls', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    describe('Basic URL Building', () => {
      it('should return object with apple and google URLs', () => {
        const ticketId = 'TKT-001';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls).toHaveProperty('apple');
        expect(urls).toHaveProperty('google');
      });

      it('should build Apple Wallet URL', () => {
        const ticketId = 'TKT-APPLE-001';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain('https://www.alocubanoboulderfest.org');
        expect(urls.apple).toContain('/api/tickets/apple-wallet/');
        expect(urls.apple).toContain(encodeURIComponent(ticketId));
      });

      it('should build Google Wallet URL', () => {
        const ticketId = 'TKT-GOOGLE-001';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.google).toContain('https://www.alocubanoboulderfest.org');
        expect(urls.google).toContain('/api/tickets/google-wallet/');
        expect(urls.google).toContain(encodeURIComponent(ticketId));
      });
    });

    describe('Ticket ID Encoding', () => {
      it('should encode ticket ID with special characters', () => {
        const ticketId = 'TKT/001+SPECIAL';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain(encodeURIComponent(ticketId));
        expect(urls.google).toContain(encodeURIComponent(ticketId));
        expect(urls.apple).not.toContain('TKT/001+SPECIAL');
        expect(urls.google).not.toContain('TKT/001+SPECIAL');
      });

      it('should handle simple alphanumeric ticket IDs', () => {
        const ticketId = 'TKT001';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain('/apple-wallet/TKT001');
        expect(urls.google).toContain('/google-wallet/TKT001');
      });

      it('should handle ticket IDs with hyphens', () => {
        const ticketId = 'TKT-2024-001';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain('TKT-2024-001');
        expect(urls.google).toContain('TKT-2024-001');
      });

      it('should handle UUID ticket IDs', () => {
        const ticketId = '550e8400-e29b-41d4-a716-446655440000';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain(ticketId);
        expect(urls.google).toContain(ticketId);
      });
    });

    describe('URL Structure', () => {
      it('should use different paths for Apple and Google', () => {
        const urls = buildWalletPassUrls('TKT-001');

        expect(urls.apple).toContain('/apple-wallet/');
        expect(urls.google).toContain('/google-wallet/');
        expect(urls.apple).not.toContain('/google-wallet/');
        expect(urls.google).not.toContain('/apple-wallet/');
      });

      it('should use same base URL for both platforms', () => {
        const urls = buildWalletPassUrls('TKT-001');

        const appleBase = urls.apple.split('/api/')[0];
        const googleBase = urls.google.split('/api/')[0];

        expect(appleBase).toBe(googleBase);
      });

      it('should format as API endpoints', () => {
        const urls = buildWalletPassUrls('TKT-001');

        expect(urls.apple).toMatch(/\/api\/tickets\/apple-wallet\//);
        expect(urls.google).toMatch(/\/api\/tickets\/google-wallet\//);
      });
    });

    describe('Environment-Specific URLs', () => {
      it('should use preview URLs when in preview environment', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL_URL = 'wallet-preview.vercel.app';

        const urls = buildWalletPassUrls('TKT-001');

        expect(urls.apple).toContain('https://wallet-preview.vercel.app');
        expect(urls.google).toContain('https://wallet-preview.vercel.app');
      });

      it('should use development URLs when in development', () => {
        process.env.VERCEL_ENV = 'development';
        process.env.VERCEL_URL = 'localhost.vercel.app';

        const urls = buildWalletPassUrls('TKT-001');

        expect(urls.apple).toContain('https://localhost.vercel.app');
        expect(urls.google).toContain('https://localhost.vercel.app');
      });
    });

    describe('Edge Cases', () => {
      it('should handle empty string ticket ID', () => {
        const urls = buildWalletPassUrls('');

        expect(urls.apple).toContain('/apple-wallet/');
        expect(urls.google).toContain('/google-wallet/');
      });

      it('should handle very long ticket IDs', () => {
        const ticketId = 'TKT-' + 'A'.repeat(200);
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain(encodeURIComponent(ticketId));
        expect(urls.google).toContain(encodeURIComponent(ticketId));
      });

      it('should handle numeric ticket IDs', () => {
        const ticketId = '12345';
        const urls = buildWalletPassUrls(ticketId);

        expect(urls.apple).toContain('/apple-wallet/12345');
        expect(urls.google).toContain('/google-wallet/12345');
      });
    });
  });

  describe('Integration Tests', () => {
    beforeEach(() => {
      process.env.VERCEL_ENV = 'production';
    });

    it('should use consistent base URLs across all functions', () => {
      const token = 'test123';
      const ticketId = 'TKT-001';

      const baseUrl = getBaseUrl();
      const regUrl = buildRegistrationUrl(token);
      const viewUrl = buildViewTicketsUrl(token);
      const qrUrl = buildQRCodeUrl(token);
      const walletUrls = buildWalletPassUrls(ticketId);

      expect(regUrl).toContain(baseUrl);
      expect(viewUrl).toContain(baseUrl);
      expect(qrUrl).toContain(baseUrl);
      expect(walletUrls.apple).toContain(baseUrl);
      expect(walletUrls.google).toContain(baseUrl);
    });

    it('should all use HTTPS protocol', () => {
      const token = 'test';
      const ticketId = 'TKT-001';

      const baseUrl = getBaseUrl();
      const regUrl = buildRegistrationUrl(token);
      const viewUrl = buildViewTicketsUrl(token);
      const qrUrl = buildQRCodeUrl(token);
      const walletUrls = buildWalletPassUrls(ticketId);

      expect(baseUrl).toMatch(/^https:\/\//);
      expect(regUrl).toMatch(/^https:\/\//);
      expect(viewUrl).toMatch(/^https:\/\//);
      expect(qrUrl).toMatch(/^https:\/\//);
      expect(walletUrls.apple).toMatch(/^https:\/\//);
      expect(walletUrls.google).toMatch(/^https:\/\//);
    });

    it('should properly encode all special characters', () => {
      const specialToken = 'token+with/special=chars&more';
      const specialTicketId = 'TKT/001+SPECIAL=ID&MORE';

      const regUrl = buildRegistrationUrl(specialToken, specialTicketId);
      const viewUrl = buildViewTicketsUrl(specialToken, specialTicketId);
      const qrUrl = buildQRCodeUrl(specialToken);
      const walletUrls = buildWalletPassUrls(specialTicketId);

      // None should contain unencoded special characters in parameters
      expect(regUrl).not.toMatch(/[+/=&](?!ticketId)/);
      expect(viewUrl).not.toMatch(/[+/=&](?!ticketId)/);
      expect(qrUrl).not.toMatch(/[+/=&]/);
    });
  });
});
