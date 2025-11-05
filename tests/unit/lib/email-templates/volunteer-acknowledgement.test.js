/**
 * Unit Tests for Volunteer Acknowledgement Email Template
 * Tests HTML generation, XSS prevention, data interpolation, and edge cases
 */

import { describe, it, expect } from 'vitest';
import { generateVolunteerAcknowledgementEmail } from '../../../../lib/email-templates/volunteer-acknowledgement.js';

describe('Volunteer Acknowledgement Email Template', () => {
  describe('HTML Generation', () => {
    it('should generate valid HTML with all fields populated', () => {
      const data = {
        firstName: 'María',
        lastName: 'González',
        email: 'maria@example.com',
        areasOfInterest: ['setup', 'registration'],
        availability: ['friday', 'saturday']
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check basic structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<title>Thank You for Volunteering - A Lo Cubano Boulder Fest</title>');

      // Check name interpolation
      expect(html).toContain('Hi María!');

      // Check area labels
      expect(html).toContain('Event Setup/Breakdown');
      expect(html).toContain('Registration Desk');

      // Check day labels
      expect(html).toContain('Friday, May 15');
      expect(html).toContain('Saturday, May 16');

      // Check key sections
      expect(html).toContain('Thank You for Volunteering!');
      expect(html).toContain('Application Received');
      expect(html).toContain('What Happens Next?');
      expect(html).toContain('Your Application Details');
      expect(html).toContain('Stay Connected');
    });

    it('should generate valid HTML with only required fields', () => {
      const data = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check basic structure
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Hi John!');

      // Check required sections are present
      expect(html).toContain('Thank You for Volunteering!');
      expect(html).toContain('Application Received');
      expect(html).toContain('What Happens Next?');

      // Application details section should not be present when arrays are empty
      expect(html).not.toContain('Your Application Details');
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in first name', () => {
      const data = {
        firstName: '<script>alert("xss")</script>',
        lastName: 'Test',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Should escape script tags
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should escape malicious HTML tags', () => {
      const data = {
        firstName: '<img src=x onerror=alert(1)>',
        lastName: 'Test',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Should escape img tag
      expect(html).not.toContain('<img src=x onerror=alert(1)>');
      expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    });

    it('should escape all special HTML characters', () => {
      const data = {
        firstName: 'Test&<>"\' User',
        lastName: 'Smith',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check that all special characters are escaped
      expect(html).toContain('Test&amp;&lt;&gt;&quot;&#039; User');
      expect(html).not.toContain('Test&<>"\' User');
    });

    it('should handle injection attempts in areas of interest', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: ['<script>alert("xss")</script>'],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Unknown areas should still be escaped
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });
  });

  describe('Data Interpolation', () => {
    it('should display areas of interest with proper labels', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: ['setup', 'registration', 'artist', 'merchandise', 'info', 'social'],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check all area labels are present
      expect(html).toContain('Event Setup/Breakdown');
      expect(html).toContain('Registration Desk');
      expect(html).toContain('Artist Support');
      expect(html).toContain('Merchandise Sales');
      expect(html).toContain('Information Booth');
      expect(html).toContain('Social Media Team');
    });

    it('should display availability days with proper labels', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: ['friday', 'saturday', 'sunday']
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check all day labels are present
      expect(html).toContain('Friday, May 15');
      expect(html).toContain('Saturday, May 16');
      expect(html).toContain('Sunday, May 17');
    });

    it('should handle unknown area values gracefully', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: ['unknown_area', 'another_unknown'],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Unknown areas should be displayed as-is
      expect(html).toContain('unknown_area');
      expect(html).toContain('another_unknown');
    });

    it('should handle unknown day values gracefully', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: ['unknown_day']
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Unknown days should be displayed as-is
      expect(html).toContain('unknown_day');
    });
  });

  describe('Edge Cases', () => {
    it('should not show application details section when arrays are empty', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Application details section should not be present
      expect(html).not.toContain('Your Application Details');
      expect(html).not.toContain('Areas of Interest:');
      expect(html).not.toContain('Availability:');
    });

    it('should show only areas when availability is empty', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: ['setup'],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Application details section should be present
      expect(html).toContain('Your Application Details');
      expect(html).toContain('Areas of Interest:');
      expect(html).toContain('Event Setup/Breakdown');

      // Availability section should not be present
      expect(html).not.toContain('Availability:');
    });

    it('should show only availability when areas are empty', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: ['friday']
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Application details section should be present
      expect(html).toContain('Your Application Details');
      expect(html).toContain('Availability:');
      expect(html).toContain('Friday, May 15');

      // Areas section should not be present
      expect(html).not.toContain('Areas of Interest:');
    });

    it('should handle undefined arrays gracefully', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
        // areasOfInterest and availability are undefined
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Should not throw error and should generate valid HTML
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Hi Test!');
      expect(html).not.toContain('Your Application Details');
    });

    it('should handle empty string in firstName gracefully', () => {
      const data = {
        firstName: '',
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Should still generate HTML with empty greeting
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('Hi !');
    });

    it('should handle null values gracefully', () => {
      const data = {
        firstName: null,
        lastName: 'User',
        email: 'test@example.com',
        areasOfInterest: [],
        availability: []
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Should not crash and should generate valid HTML
      expect(html).toContain('<!DOCTYPE html>');
    });
  });

  describe('Content Sections', () => {
    it('should include confirmation banner', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('Application Received');
      expect(html).toContain('background: linear-gradient(135deg, #5b6bb5 0%, #cc2936 100%)');
    });

    it('should include what happens next section', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('What Happens Next?');
      expect(html).toContain('May 15-17, 2026');
    });

    it('should include stay connected section', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('Stay Connected');
      expect(html).toContain('@alocubano.boulderfest');
      expect(html).toContain('https://www.instagram.com/alocubano.boulderfest/');
    });

    it('should include questions section', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('Questions?');
      expect(html).toContain('alocubanoboulderfest@gmail.com');
    });

    it('should include closing signature', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('See you soon!');
      expect(html).toContain('The A Lo Cubano Boulder Fest Team');
      expect(html).toContain('three days of incredible Cuban salsa');
    });
  });

  describe('Styling and Layout', () => {
    it('should use inline styles for email compatibility', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check for inline styles
      const styleCount = (html.match(/style="/g) || []).length;
      expect(styleCount).toBeGreaterThan(10);
    });

    it('should have max-width container', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      expect(html).toContain('max-width: 600px');
    });

    it('should use brand colors', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check for brand colors
      expect(html).toContain('#5b6bb5'); // Primary blue
      expect(html).toContain('#cc2936'); // Primary red
    });

    it('should have proper spacing and padding', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check for consistent padding/margin patterns
      expect(html).toMatch(/padding:\s*\d+px/);
      expect(html).toMatch(/margin:\s*\d+px/);
    });
  });

  describe('Base Layout Integration', () => {
    it('should wrap content in base layout', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check for DOCTYPE and html tags from base layout
      expect(html).toMatch(/<!DOCTYPE html>/);
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toMatch(/<\/html>/);
    });

    it('should include proper title', () => {
      const data = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      };

      const html = generateVolunteerAcknowledgementEmail(data);

      // Check for proper title with HTML escaping
      expect(html).toContain('<title>Thank You for Volunteering - A Lo Cubano Boulder Fest</title>');
    });
  });
});
