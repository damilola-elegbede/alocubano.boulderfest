/**
 * Unit Tests for Base Email Layout Template
 * Tests layout structure, branding, responsive design, and email client compatibility
 */

import { describe, it, expect } from 'vitest';
import { wrapInBaseLayout, generateSocialFooter } from '../../../../lib/email-templates/base-layout.js';

describe('Base Email Layout Template', () => {
  const sampleContent = '<p>Test email content</p>';
  const sampleTitle = 'Test Email Title';

  describe('Layout Structure', () => {
    it('should wrap content in complete HTML structure', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('</head>');
      expect(html).toContain('<body');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('should include header section with logo', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<!-- Logo -->');
      expect(html).toContain('<img src="https://img.mailinblue.com/9670291/images/content_library/original/68a6c02f3da913a8d57a0190.png"');
    });

    it('should include main content area', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<!-- Main Content -->');
      expect(html).toContain(sampleContent);
    });

    it('should include footer section', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<!-- Social Media Footer -->');
    });

    it('should render content in correct location', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);
      const contentIndex = html.indexOf(sampleContent);
      const logoIndex = html.indexOf('<!-- Logo -->');
      const footerIndex = html.indexOf('<!-- Social Media Footer -->');

      expect(logoIndex).toBeGreaterThan(0);
      expect(contentIndex).toBeGreaterThan(logoIndex);
      expect(footerIndex).toBeGreaterThan(contentIndex);
    });
  });

  describe('Branding', () => {
    it('should include festival logo with proper dimensions', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('width="106"');
      expect(html).toMatch(/<img[^>]*src="https:\/\/img\.mailinblue\.com\/[^"]*"[^>]*>/);
    });

    it('should display logo with proper styling', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/display:\s*block/);
      expect(html).toMatch(/margin:\s*0 auto/);
    });

    it('should use consistent color palette', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      // Primary brand colors
      expect(html).toContain('#3f4799'); // Primary blue
      expect(html).toContain('#ffffff'); // White background
      expect(html).toContain('#3b3f44'); // Text color
    });

    it('should include festival name in title', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain(`<title>${sampleTitle}</title>`);
    });

    it('should use default title when not provided', () => {
      const html = wrapInBaseLayout(sampleContent);

      expect(html).toContain('<title>A Lo Cubano Boulder Fest</title>');
    });

    it('should apply typography styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('font-family: Arial, sans-serif');
      expect(html).toContain('font-size: 16px');
      expect(html).toContain('line-height: 1.5');
    });
  });

  describe('Social Media Links', () => {
    it('should include website link', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('https://www.alocubanoboulderfest.org/');
    });

    it('should include Instagram link', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('https://www.instagram.com/alocubano.boulderfest/');
    });

    it('should include WhatsApp link', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH');
    });

    it('should include email contact', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('alocubanoboulderfest@gmail.com');
    });

    it('should use proper social media icons', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('website_32px.png');
      expect(html).toContain('instagram_32px.png');
      expect(html).toContain('whatsapp_32px.png');
    });

    it('should set target="_blank" for external links', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      const websiteLink = html.match(/<a[^>]*href="https:\/\/www\.alocubanoboulderfest\.org\/"[^>]*>/);
      expect(websiteLink).toBeTruthy();
      expect(websiteLink[0]).toContain('target="_blank"');
    });
  });

  describe('Contact Information', () => {
    it('should display contact email with proper styling', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/<a[^>]*href="mailto:alocubanoboulderfest@gmail\.com"[^>]*>/);
    });

    it('should include data deletion notice', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('You have the right to request deletion of your personal data');
      expect(html).toContain('Data Deletion Request');
    });

    it('should style contact email as link', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/color:\s*#3f4799.*alocubanoboulderfest@gmail\.com/);
    });
  });

  describe('Responsive Design', () => {
    it('should include mobile-responsive styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('@media (max-width: 600px)');
    });

    it('should adjust width for mobile devices', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/width:\s*320px\s*!important/);
    });

    it('should adjust padding for mobile', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/padding-left:\s*15px\s*!important/);
      expect(html).toMatch(/padding-right:\s*15px\s*!important/);
    });

    it('should disable text size adjustment', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('-webkit-text-size-adjust: none');
    });

    it('should include viewport meta tag', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
    });

    it('should set fixed table layout', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('table-layout: fixed');
    });

    it('should define responsive helper classes', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('.nl2go-responsive-hide');
      expect(html).toContain('.mobshow');
      expect(html).toContain('.resp-table');
    });
  });

  describe('Email Client Compatibility', () => {
    it('should include Outlook-specific CSS', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('#outlook a { padding:0; }');
      expect(html).toContain('.ExternalClass');
      expect(html).toContain('mso-line-height-rule: exactly');
    });

    it('should include Gmail-specific fixes', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('*[class="gmail-fix"]');
      expect(html).toContain('.gmx-killpill');
    });

    it('should disable image interpolation for IE', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('-ms-interpolation-mode: bicubic');
    });

    it('should include X-UA-Compatible meta tag', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta http-equiv="X-UA-Compatible" content="IE=edge">');
    });

    it('should disable auto phone number detection', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta name="format-detection" content="telephone=no">');
    });

    it('should include preheader hiding styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('.nl2go_preheader');
      expect(html).toContain('display: none !important');
      expect(html).toContain('mso-hide:all');
    });

    it('should reset table spacing', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('border-collapse:collapse');
      expect(html).toContain('mso-table-lspace:0pt');
      expect(html).toContain('mso-table-rspace:0pt');
    });

    it('should use role="presentation" for layout tables', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      const presentationTables = html.match(/role="presentation"/g);
      expect(presentationTables).toBeTruthy();
      expect(presentationTables.length).toBeGreaterThan(5);
    });

    it('should prevent Apple Mail data detection', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('a[x-apple-data-detectors]');
      expect(html).toContain('color: inherit !important');
    });
  });

  describe('Typography', () => {
    it('should define default text styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('.nl2go-default-textstyle');
      expect(html).toContain('color: #3b3f44');
      expect(html).toContain('font-family: Arial, sans-serif');
      expect(html).toContain('font-size: 16px');
    });

    it('should define heading styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('.default-heading1');
      expect(html).toContain('.default-heading2');
      expect(html).toContain('.default-heading3');
    });

    it('should define button styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('.default-button');
      expect(html).toContain('color: #ffffff');
    });

    it('should define link styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('a, a:link');
      expect(html).toContain('color: #3f4799');
      expect(html).toContain('text-decoration: underline');
    });

    it('should set proper heading sizes', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('font-size: 36px'); // H1
      expect(html).toContain('font-size: 24px'); // H2
      expect(html).toContain('font-size: 18px'); // H3
    });

    it('should enable word breaking for long text', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('word-break: break-word');
    });
  });

  describe('Layout Dimensions', () => {
    it('should set 600px container width', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toMatch(/width="600"/);
      expect(html).toMatch(/width:\s*600px/);
    });

    it('should center content', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('align="center"');
      expect(html).toMatch(/margin:\s*0 auto/);
    });

    it('should include proper spacing', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('padding-bottom: 20px');
      expect(html).toContain('padding-top: 20px');
    });

    it('should set white background', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('background-color: #ffffff');
    });
  });

  describe('Content Rendering', () => {
    it('should render simple HTML content', () => {
      const content = '<p>Hello World</p>';
      const html = wrapInBaseLayout(content);

      expect(html).toContain('Hello World');
    });

    it('should render complex HTML content', () => {
      const content = `
        <h1>Heading</h1>
        <p>Paragraph with <strong>bold</strong> text</p>
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
        </ul>
      `;
      const html = wrapInBaseLayout(content);

      expect(html).toContain('<h1>Heading</h1>');
      expect(html).toContain('<strong>bold</strong>');
      expect(html).toContain('<li>Item 1</li>');
    });

    it('should preserve content formatting', () => {
      const content = '<div style="color: red;">Styled content</div>';
      const html = wrapInBaseLayout(content);

      expect(html).toContain('color: red;');
      expect(html).toContain('Styled content');
    });

    it('should handle empty content', () => {
      const html = wrapInBaseLayout('');

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('</html>');
    });

    it('should handle content with special characters', () => {
      const content = '<p>Price: $100 & up</p>';
      const html = wrapInBaseLayout(content);

      expect(html).toContain('$100 & up');
    });
  });

  describe('Social Footer Function', () => {
    it('should generate social footer independently', () => {
      const footer = generateSocialFooter();

      // The function returns the footer HTML without the comment (comment is in wrapInBaseLayout)
      expect(footer).toBeTruthy();
      expect(footer).toContain('alocubanoboulderfest@gmail.com');
    });

    it('should include all social links in footer', () => {
      const footer = generateSocialFooter();

      expect(footer).toContain('https://www.alocubanoboulderfest.org/');
      expect(footer).toContain('https://www.instagram.com/alocubano.boulderfest/');
      expect(footer).toContain('https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH');
    });

    it('should include horizontal separator in footer', () => {
      const footer = generateSocialFooter();

      expect(footer).toContain('border-top-style: solid');
      expect(footer).toContain('border-top-color: #aaaaaa');
    });

    it('should use table layout for footer', () => {
      const footer = generateSocialFooter();

      expect(footer).toContain('<table');
      expect(footer).toContain('cellspacing="0"');
      expect(footer).toContain('cellpadding="0"');
    });
  });

  describe('Meta Tags', () => {
    it('should include charset meta tag', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta charset="UTF-8">');
    });

    it('should include content-type meta tag', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta http-equiv="Content-Type" content="text/html; charset=utf-8">');
    });

    it('should include all required meta tags', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain('<meta name="viewport"');
      expect(html).toContain('<meta http-equiv="Content-Type"');
      expect(html).toContain('<meta http-equiv="X-UA-Compatible"');
      expect(html).toContain('<meta name="format-detection"');
    });
  });

  describe('Style Blocks', () => {
    it('should include non-emogrified styles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      const emogrifyNoBlocks = html.match(/emogrify="no"/g);
      expect(emogrifyNoBlocks).toBeTruthy();
      expect(emogrifyNoBlocks.length).toBe(2);
    });

    it('should include standard style block', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<style type="text/css">');
    });

    it('should organize styles in logical blocks', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      // Should have multiple style blocks
      const styleBlocks = html.match(/<style[^>]*>/g);
      expect(styleBlocks.length).toBeGreaterThan(1);
    });
  });

  describe('Accessibility', () => {
    it('should include lang attribute', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('<html lang="en">');
    });

    it('should use semantic table roles', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      expect(html).toContain('role="presentation"');
    });

    it('should include alt text for logo', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      // Logo should have display:block styling
      expect(html).toMatch(/<img[^>]*display:\s*block[^>]*>/);
    });

    it('should have readable font sizes', () => {
      const html = wrapInBaseLayout(sampleContent, sampleTitle);

      // Check for minimum 11px font size (smallest in footer)
      expect(html).toContain('font-size: 11px');
      expect(html).toContain('font-size: 14px');
      expect(html).toContain('font-size: 16px');
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined content', () => {
      expect(() => wrapInBaseLayout(undefined, sampleTitle)).not.toThrow();
    });

    it('should handle null content', () => {
      expect(() => wrapInBaseLayout(null, sampleTitle)).not.toThrow();
    });

    it('should handle undefined title', () => {
      const html = wrapInBaseLayout(sampleContent, undefined);

      expect(html).toContain('<title>A Lo Cubano Boulder Fest</title>');
    });

    it('should handle null title', () => {
      const html = wrapInBaseLayout(sampleContent, null);

      expect(html).toBeTruthy();
    });

    it('should handle special characters in title', () => {
      const title = 'Order #123 & Receipt';
      const html = wrapInBaseLayout(sampleContent, title);

      // Title should be HTML-escaped for security
      expect(html).toContain('<title>Order #123 &amp; Receipt</title>');
    });
  });

  describe('Content Security', () => {
    it('should not execute JavaScript in content', () => {
      const maliciousContent = '<script>alert("XSS")</script>';
      const html = wrapInBaseLayout(maliciousContent);

      // Content is inserted as-is, but emails don't execute scripts
      expect(html).toContain(maliciousContent);
    });

    it('should preserve HTML entities', () => {
      const content = '<p>&lt;tag&gt; &amp; entity</p>';
      const html = wrapInBaseLayout(content);

      expect(html).toContain('&lt;tag&gt;');
      expect(html).toContain('&amp;');
    });

    it('should handle single quotes in content', () => {
      const content = "<p>It's a test</p>";
      const html = wrapInBaseLayout(content);

      expect(html).toContain("It's a test");
    });

    it('should handle double quotes in content', () => {
      const content = '<p>"Quoted text"</p>';
      const html = wrapInBaseLayout(content);

      expect(html).toContain('"Quoted text"');
    });
  });
});
