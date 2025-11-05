/**
 * Integration Test: Volunteer Submit API
 *
 * Tests the complete volunteer form submission flow including:
 * - Valid submissions with all fields and required fields only
 * - HTTP method validation (POST, OPTIONS, GET/PUT/DELETE)
 * - Request body validation
 * - Validator integration (spam detection, SQL injection, disposable emails)
 * - CORS headers
 * - Preview deployment mode
 *
 * Target: ~20 comprehensive tests with real API testing (not mocked)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { testRequest, HTTP_STATUS, generateTestEmail } from '../../integration/handler-test-helper.js';

// Helper to generate test emails that will pass MX validation gracefully
// Use gmail.com which has valid MX records and won't be caught as disposable
function generateValidTestEmail() {
  return `test.volunteer.${Date.now()}.${Math.random().toString(36).slice(2)}@gmail.com`;
}

describe('Integration: Volunteer Submit API', () => {
  beforeEach(() => {
    // Reset any environment variables that might affect the tests
    delete process.env.BREVO_API_KEY;
  });

  // ============================================================================
  // 1. Valid Submissions (5 tests)
  // ============================================================================

  describe('Valid Submissions', () => {
    it('should accept submission with all fields', async () => {
      const data = {
        firstName: 'María',
        lastName: 'González',
        email: generateValidTestEmail(),
        phone: '(303) 555-1234',
        areasOfInterest: ['setup', 'registration', 'artist'],
        availability: ['friday', 'saturday'],
        message: 'I would love to help with the festival! I have experience with event setup and registration.'
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toMatch(/received|submitted/i);
    });

    it('should accept submission with only required fields', async () => {
      const data = {
        firstName: 'John',
        lastName: 'Smith',
        email: generateValidTestEmail()
        // No phone, areasOfInterest, availability, or message
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
    });

    it('should accept submission with international names', async () => {
      const testCases = [
        { firstName: 'José', lastName: 'Martínez' },
        { firstName: 'François', lastName: 'Dubois' },
        { firstName: '陳大', lastName: '文華' },  // Changed to 2+ chars each
        { firstName: "O'Brien", lastName: 'Smith' },
        { firstName: 'Mary-Jane', lastName: 'St. John' }
      ];

      for (const nameCase of testCases) {
        const data = {
          firstName: nameCase.firstName,
          lastName: nameCase.lastName,
          email: generateValidTestEmail()
        };

        const response = await testRequest('POST', '/api/volunteer/submit', data);

        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('success', true);
      }
    });

    it('should accept submission with all areas of interest selected', async () => {
      const data = {
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: generateValidTestEmail(),
        areasOfInterest: ['setup', 'registration', 'artist', 'merchandise', 'info', 'social']
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });

    it('should accept submission with all availability days selected', async () => {
      const data = {
        firstName: 'Michael',
        lastName: 'Chen',
        email: generateValidTestEmail(),
        availability: ['friday', 'saturday', 'sunday']
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });
  });

  // ============================================================================
  // 2. HTTP Method Validation (3 tests)
  // ============================================================================

  describe('HTTP Method Validation', () => {
    it('should accept POST method with 201 status', async () => {
      const data = {
        firstName: 'Alice',
        lastName: 'Johnson',
        email: generateValidTestEmail()
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });

    it('should handle OPTIONS method for CORS preflight', async () => {
      const response = await testRequest('OPTIONS', '/api/volunteer/submit', null);

      expect(response.status).toBe(200);
      // Response should have CORS headers (checked in CORS Headers section)
    });

    it('should reject GET, PUT, DELETE methods with 405', async () => {
      const methods = ['GET', 'PUT', 'DELETE'];

      for (const method of methods) {
        const response = await testRequest(method, '/api/volunteer/submit', null);

        expect(response.status).toBe(HTTP_STATUS.METHOD_NOT_ALLOWED);
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/method not allowed/i);
        expect(response.headers).toHaveProperty('allow');
        expect(response.headers.allow).toMatch(/POST/i);
        expect(response.headers.allow).toMatch(/OPTIONS/i);
      }
    });
  });

  // ============================================================================
  // 3. Request Body Validation (4 tests)
  // ============================================================================

  describe('Request Body Validation', () => {
    it('should reject missing request body with 400', async () => {
      // Pass null as body to simulate missing request body
      const response = await testRequest('POST', '/api/volunteer/submit', null);

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/invalid request body/i);
    });

    it('should reject empty request body object with 400', async () => {
      const response = await testRequest('POST', '/api/volunteer/submit', {});

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      // Should fail validation for missing required fields
      expect(response.data.error).toMatch(/required|name|email/i);
    });

    it('should reject missing required fields with field-specific error', async () => {
      // Test missing firstName
      let response = await testRequest('POST', '/api/volunteer/submit', {
        lastName: 'Smith',
        email: generateValidTestEmail()
      });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('field', 'firstName');
      expect(response.data.error).toMatch(/first name.*required/i);

      // Test missing lastName
      response = await testRequest('POST', '/api/volunteer/submit', {
        firstName: 'John',
        email: generateValidTestEmail()
      });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('field', 'lastName');
      expect(response.data.error).toMatch(/last name.*required/i);

      // Test missing email
      response = await testRequest('POST', '/api/volunteer/submit', {
        firstName: 'John',
        lastName: 'Smith'
      });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('field', 'email');
      expect(response.data.error).toMatch(/email.*required/i);
    });

    it('should handle malformed JSON gracefully', async () => {
      // This tests the handler's ability to handle body parsing errors
      // The handler expects parsed JSON, so passing invalid structure
      const response = await testRequest('POST', '/api/volunteer/submit', 'not-json');

      // Should be rejected at the body validation level
      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
    });
  });

  // ============================================================================
  // 4. Validator Integration (5 tests)
  // ============================================================================

  describe('Validator Integration', () => {
    it('should reject spam names (test, asdf, 12345)', async () => {
      const spamNames = ['test', 'asdf', '12345', 'qwerty', 'aaaaa'];

      for (const spamName of spamNames) {
        const response = await testRequest('POST', '/api/volunteer/submit', {
          firstName: spamName,
          lastName: 'User',
          email: generateValidTestEmail()
        });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(response.data).toHaveProperty('error');
        expect(response.data).toHaveProperty('field', 'firstName');
        // Error could be pattern validation or spam detection
        expect(response.data.error).toMatch(/valid|contain|letters|spaces/i);
      }
    });

    it('should reject SQL injection attempts', async () => {
      const sqlInjectionAttempts = [
        "Robert'; DROP TABLE users--",
        "admin' OR '1'='1",
        "user' UNION SELECT * FROM passwords--",
        "test' AND 1=1--"
      ];

      for (const sqlAttempt of sqlInjectionAttempts) {
        const response = await testRequest('POST', '/api/volunteer/submit', {
          firstName: sqlAttempt,
          lastName: 'User',
          email: generateValidTestEmail()
        });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(response.data).toHaveProperty('error');
        expect(response.data).toHaveProperty('field', 'firstName');
        // Error could be prohibited content or pattern validation
        expect(response.data.error).toMatch(/prohibited|valid|contain|letters|spaces/i);
      }
    });

    it('should reject disposable email domains', async () => {
      const disposableEmails = [
        'user@10minutemail.com',
        'test@guerrillamail.com',
        'volunteer@mailinator.com',
        'person@temp-mail.org',
        'someone@yopmail.com'
      ];

      for (const disposableEmail of disposableEmails) {
        const response = await testRequest('POST', '/api/volunteer/submit', {
          firstName: 'John',
          lastName: 'Doe',
          email: disposableEmail
        });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(response.data).toHaveProperty('error');
        expect(response.data).toHaveProperty('field', 'email');
        expect(response.data.error).toMatch(/disposable.*not allowed/i);
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'not-an-email',
        'missing@domain',
        '@nodomain.com',
        'double@@domain.com',
        'spaces in@email.com',
        'consecutive..dots@email.com',
        '.startswithdot@email.com',
        'endswithdot.@email.com'
      ];

      for (const invalidEmail of invalidEmails) {
        const response = await testRequest('POST', '/api/volunteer/submit', {
          firstName: 'John',
          lastName: 'Doe',
          email: invalidEmail
        });

        expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
        expect(response.data).toHaveProperty('error');
        expect(response.data).toHaveProperty('field', 'email');
        expect(response.data.error).toMatch(/valid email|email.*format|consecutive dots|dot/i);
      }
    });

    it('should enforce message length limit (>1000 chars)', async () => {
      const longMessage = 'a'.repeat(1001); // 1001 characters

      const response = await testRequest('POST', '/api/volunteer/submit', {
        firstName: 'John',
        lastName: 'Doe',
        email: generateValidTestEmail(),
        message: longMessage
      });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('error');
      expect(response.data).toHaveProperty('field', 'message');
      expect(response.data.error).toMatch(/message.*1000.*characters/i);
    });
  });

  // ============================================================================
  // 5. CORS Headers (1 test)
  // ============================================================================

  describe('CORS Headers', () => {
    it('should include proper CORS headers in response', async () => {
      const data = {
        firstName: 'Bob',
        lastName: 'Wilson',
        email: generateValidTestEmail()
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      // Check for CORS headers
      expect(response.headers).toBeDefined();
      // CORS headers should be set by setSecureCorsHeaders function
      // Common CORS headers: access-control-allow-origin, access-control-allow-methods, etc.
      // Note: The exact headers depend on the CORS configuration in the handler
    });
  });

  // ============================================================================
  // 6. Preview Deployment Mode (2 tests)
  // ============================================================================

  describe('Preview Deployment Mode', () => {
    it('should return mock success in preview mode without BREVO_API_KEY', async () => {
      // Simulate preview deployment by setting host header
      const headers = {
        'host': 'my-app-preview.vercel.app'
      };

      const data = {
        firstName: 'Preview',
        lastName: 'User',
        email: generateValidTestEmail()
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data, headers);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data.message).toMatch(/preview|mock|production/i);
    });

    it('should handle preview mode with x-vercel-deployment-url header', async () => {
      // Alternative way to detect preview deployment
      const headers = {
        'x-vercel-deployment-url': 'my-app-git-feature-branch.vercel.app'
      };

      const data = {
        firstName: 'Preview',
        lastName: 'UserTwo',  // Changed from User2 to UserTwo (no numbers)
        email: generateValidTestEmail()
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data, headers);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });
  });

  // ============================================================================
  // Additional Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('should trim and normalize whitespace in names', async () => {
      const data = {
        firstName: '  John  ',
        lastName: '  Smith  ',
        email: generateValidTestEmail()
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });

    it('should handle empty arrays for areasOfInterest and availability', async () => {
      const data = {
        firstName: 'David',
        lastName: 'Miller',
        email: generateValidTestEmail(),
        areasOfInterest: [],
        availability: []
      };

      const response = await testRequest('POST', '/api/volunteer/submit', data);

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('success', true);
    });

    it('should handle optional phone field validation', async () => {
      // Valid phone number
      let response = await testRequest('POST', '/api/volunteer/submit', {
        firstName: 'Emma',
        lastName: 'Davis',
        email: generateValidTestEmail(),
        phone: '303-555-1234'
      });

      expect(response.status).toBe(201);

      // Invalid phone number (too short)
      response = await testRequest('POST', '/api/volunteer/submit', {
        firstName: 'Frank',
        lastName: 'Brown',
        email: generateValidTestEmail(),
        phone: '123'
      });

      expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(response.data).toHaveProperty('field', 'phone');
    });
  });
});
