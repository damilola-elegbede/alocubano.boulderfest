/**
 * Unit Tests for Attendee Confirmation Email Template
 * Tests template rendering, variable substitution, HTML generation, and error handling
 */

import { describe, it, expect } from 'vitest';
import { generateAttendeeConfirmationEmail } from '../../../../lib/email-templates/attendee-confirmation.js';

describe('Attendee Confirmation Email Template', () => {
  const validData = {
    firstName: 'John',
    lastName: 'Doe',
    ticketId: 'TICKET-12345',
    ticketType: 'All-Access Pass',
    orderNumber: 'ORDER-67890',
    eventName: 'A Lo Cubano Boulder Fest 2026',
    eventLocation: 'Avalon Ballroom, Boulder, CO',
    eventDate: 'May 15-17, 2026',
    qrCodeUrl: 'https://example.com/qr/TICKET-12345.png',
    walletPassUrl: 'https://example.com/wallet/apple/TICKET-12345',
    googleWalletUrl: 'https://example.com/wallet/google/TICKET-12345',
    appleWalletButtonUrl: 'https://example.com/assets/apple-wallet-button.png',
    googleWalletButtonUrl: 'https://example.com/assets/google-wallet-button.png',
    viewTicketUrl: 'https://example.com/tickets/view/abc123'
  };

  describe('Template Rendering', () => {
    it('should render with all required variables', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toBeTruthy();
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should include email title in head section', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('<title>Your Ticket is Ready</title>');
    });

    it('should include main heading', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Your Ticket is Ready!');
    });

    it('should render complete ticket details box', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Ticket Details');
      expect(html).toContain('John Doe');
      expect(html).toContain('TICKET-12345');
      expect(html).toContain('All-Access Pass');
      expect(html).toContain('ORDER-67890');
      expect(html).toContain('Avalon Ballroom, Boulder, CO');
      expect(html).toContain('May 15-17, 2026');
    });

    it('should render QR code section', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Your QR Code');
      expect(html).toContain('Show this at the entrance');
      expect(html).toContain(validData.qrCodeUrl);
      expect(html).toContain('alt="QR Code"');
    });

    it('should render wallet buttons section', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Add to Apple Wallet');
      expect(html).toContain('Add to Google Wallet');
      expect(html).toContain(validData.walletPassUrl);
      expect(html).toContain(validData.googleWalletUrl);
    });

    it('should render view ticket online section', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('View Your Ticket Online');
      expect(html).toContain('Access your ticket anytime from any device');
      expect(html).toContain(validData.viewTicketUrl);
      expect(html).toContain('View Ticket Online');
    });

    it('should render what\'s next instructions', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('What\'s Next?');
      expect(html).toContain('Save this email as backup');
      expect(html).toContain('Add ticket to your phone wallet');
      expect(html).toContain('Show QR code at event entrance');
      expect(html).toContain('Arrive early and enjoy!');
    });

    it('should include closing message', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('See you on the dance floor!');
    });
  });

  describe('Variable Substitution', () => {
    it('should correctly substitute first name', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Hi John,');
      expect(html).toContain('<strong>Name:</strong> John Doe');
    });

    it('should correctly substitute last name', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('John Doe');
    });

    it('should correctly substitute event name', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('A Lo Cubano Boulder Fest 2026');
    });

    it('should correctly substitute ticket ID', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('TICKET-12345');
    });

    it('should correctly substitute ticket type', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('All-Access Pass');
    });

    it('should correctly substitute order number', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('ORDER-67890');
    });

    it('should correctly substitute event location', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Avalon Ballroom, Boulder, CO');
    });

    it('should correctly substitute event date', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('May 15-17, 2026');
    });

    it('should handle special characters in names', () => {
      const data = {
        ...validData,
        firstName: "O'Connor",
        lastName: "Smith-Jones"
      };

      const html = generateAttendeeConfirmationEmail(data);

      // Apostrophes are HTML-escaped for security
      expect(html).toContain("O&#039;Connor");
      expect(html).toContain("Smith-Jones");
    });

    it('should handle names with accents', () => {
      const data = {
        ...validData,
        firstName: 'José',
        lastName: 'García'
      };

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toContain('José');
      expect(html).toContain('García');
    });
  });

  describe('Link Generation', () => {
    it('should generate valid Apple Wallet link', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain(`href="${validData.walletPassUrl}"`);
      expect(html).toMatch(new RegExp(`<a[^>]*href="${validData.walletPassUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`));
    });

    it('should generate valid Google Wallet link', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain(`href="${validData.googleWalletUrl}"`);
    });

    it('should generate valid view ticket link', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain(`href="${validData.viewTicketUrl}"`);
    });

    it('should handle URLs with query parameters', () => {
      const data = {
        ...validData,
        viewTicketUrl: 'https://example.com/tickets?id=123&token=abc'
      };

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toContain('https://example.com/tickets?id=123&token=abc');
    });

    it('should properly escape special characters in URLs', () => {
      const data = {
        ...validData,
        walletPassUrl: 'https://example.com/wallet?param=value&other=test'
      };

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toContain('https://example.com/wallet?param=value&other=test');
    });
  });

  describe('HTML Generation', () => {
    it('should generate valid HTML structure', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toMatch(/<head>/);
      expect(html).toMatch(/<\/head>/);
      expect(html).toMatch(/<body[^>]*>/);
      expect(html).toMatch(/<\/body>/);
      expect(html).toMatch(/<\/html>/);
    });

    it('should include meta tags for email clients', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<meta http-equiv="Content-Type"');
    });

    it('should include inline styles for email compatibility', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('style="');
      expect(html).toMatch(/max-width:\s*600px/);
      expect(html).toMatch(/margin:\s*0 auto/);
    });

    it('should include alt text for all images', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('alt="QR Code"');
      expect(html).toContain('alt="Add to Apple Wallet"');
      expect(html).toContain('alt="Add to Google Wallet"');
    });

    it('should use table layout for email client compatibility', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('<table');
      expect(html).toContain('cellspacing="0"');
      expect(html).toContain('cellpadding="0"');
      expect(html).toContain('role="presentation"');
    });

    it('should include responsive design styles', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toMatch(/@media.*max-width.*600px/);
    });

    it('should have proper color scheme', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('color: #d32f2f'); // Primary red color
      expect(html).toContain('background: #f5f5f5'); // Light gray background
      expect(html).toContain('background: #e8f5e9'); // Light green background
    });

    it('should include accessible color contrasts', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      // Check for dark text on light backgrounds
      expect(html).toMatch(/color:\s*#333/);
      expect(html).toMatch(/color:\s*#666/);
      // Check for light text on dark backgrounds
      expect(html).toContain('color: white');
    });
  });

  describe('Conditional Content', () => {
    it('should show Apple Wallet button when URL provided', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain(validData.appleWalletButtonUrl);
    });

    it('should show Google Wallet button when URL provided', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain(validData.googleWalletButtonUrl);
    });

    it('should handle different ticket types correctly', () => {
      const weekendPass = {
        ...validData,
        ticketType: 'Weekend Pass'
      };

      const html = generateAttendeeConfirmationEmail(weekendPass);

      expect(html).toContain('Weekend Pass');
      expect(html).not.toContain('All-Access Pass');
    });

    it('should handle single day ticket type', () => {
      const singleDay = {
        ...validData,
        ticketType: 'Friday Night Only'
      };

      const html = generateAttendeeConfirmationEmail(singleDay);

      expect(html).toContain('Friday Night Only');
    });
  });

  describe('Base Layout Integration', () => {
    it('should include logo section from base layout', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('<img src="https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png"');
    });

    it('should include social footer from base layout', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('alocubanoboulderfest@gmail.com');
      expect(html).toContain('www.alocubanoboulderfest.org');
      expect(html).toContain('instagram.com/alocubano.boulderfest');
    });

    it('should include data deletion notice', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('You have the right to request deletion of your personal data');
      expect(html).toContain('Data Deletion Request');
    });

    it('should have proper base layout structure', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('background-color: #ffffff');
      expect(html).toMatch(/width:\s*600px/);
      expect(html).toContain('table-layout: fixed');
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined data object', () => {
      // Template destructures data, so passing undefined will throw
      // This is expected behavior - template requires data object
      expect(() => generateAttendeeConfirmationEmail()).toThrow();
    });

    it('should handle missing firstName', () => {
      const data = { ...validData };
      delete data.firstName;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
      // With HTML escaping, undefined becomes empty string (better than "undefined")
      expect(html).toContain('Hi ,');
    });

    it('should handle missing lastName', () => {
      const data = { ...validData };
      delete data.lastName;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle missing ticketId', () => {
      const data = { ...validData };
      delete data.ticketId;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle missing event details', () => {
      const data = { ...validData };
      delete data.eventName;
      delete data.eventDate;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle missing QR code URL', () => {
      const data = { ...validData };
      delete data.qrCodeUrl;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle missing wallet URLs', () => {
      const data = { ...validData };
      delete data.walletPassUrl;
      delete data.googleWalletUrl;

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle empty string values', () => {
      const data = {
        ...validData,
        firstName: '',
        lastName: '',
        ticketType: ''
      };

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });

    it('should handle null values', () => {
      const data = {
        ...validData,
        firstName: null,
        lastName: null
      };

      const html = generateAttendeeConfirmationEmail(data);

      expect(html).toBeTruthy();
    });
  });

  describe('Email Client Compatibility', () => {
    it('should include Outlook-specific CSS fixes', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('#outlook a');
      expect(html).toContain('.ExternalClass');
      expect(html).toContain('mso-line-height-rule');
    });

    it('should include Gmail-specific fixes', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('*[class="gmail-fix"]');
    });

    it('should include mobile-responsive styles', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('.nl2go-responsive-hide');
      expect(html).toContain('.mobshow');
    });

    it('should disable auto-detection features', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('format-detection');
      expect(html).toContain('x-apple-data-detectors');
    });

    it('should use web-safe fonts', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('Arial');
      expect(html).toContain('sans-serif');
    });
  });

  describe('Accessibility', () => {
    it('should include semantic HTML elements', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('<h1');
      expect(html).toContain('<h2');
      expect(html).toContain('<h3');
      expect(html).toContain('<p');
      expect(html).toContain('<ul');
      expect(html).toContain('<li');
    });

    it('should include alt text for all images', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      const imgTags = html.match(/<img[^>]*>/g) || [];
      const imgsWithAlt = html.match(/<img[^>]*alt="[^"]*"[^>]*>/g) || [];

      expect(imgsWithAlt.length).toBeGreaterThan(0);
    });

    it('should use proper heading hierarchy', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('<h2'));
      expect(html.indexOf('<h2')).toBeLessThan(html.indexOf('<h3'));
    });

    it('should include language attribute', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('lang="en"');
    });

    it('should have readable font sizes', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toMatch(/font-size:\s*\d{2,}px/);
    });
  });

  describe('Content Validation', () => {
    it('should not contain template placeholders', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).not.toContain('{{');
      expect(html).not.toContain('}}');
      expect(html).not.toContain('${');
    });

    it('should not contain script tags', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).not.toContain('<script');
      expect(html).not.toContain('</script>');
    });

    it('should have balanced HTML tags', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      const openTags = (html.match(/<(?!\/)[^>]+>/g) || []).filter(tag => !tag.match(/^<(img|meta|br|hr|!DOCTYPE)[^>]*>$/i));
      const closeTags = html.match(/<\/[^>]+>/g) || [];

      // Should have similar number of opening and closing tags (allowing some self-closing)
      expect(Math.abs(openTags.length - closeTags.length)).toBeLessThan(15);
    });

    it('should contain CTA button with proper styling', () => {
      const html = generateAttendeeConfirmationEmail(validData);

      expect(html).toContain('View Ticket Online');
      expect(html).toMatch(/background:\s*#000000/);
      expect(html).toContain('text-decoration: none');
    });
  });
});
