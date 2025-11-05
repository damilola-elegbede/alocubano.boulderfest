/**
 * Volunteer Email Flow Integration Tests
 * Tests the dual email sending logic in volunteer form submission
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testHandler, createMockRequest, createMockResponse } from '../../integration/handler-test-helper.js';
import handler from '../../../api/volunteer/submit.js';

// Mock DNS to prevent real MX record lookups
vi.mock('dns', () => ({
  default: {
    resolveMx: vi.fn((domain, callback) => {
      // Simulate successful MX lookup for test emails
      callback(null, [{ exchange: 'mail.example.com', priority: 10 }]);
    })
  }
}));

// Mock Brevo service
vi.mock('../../../lib/brevo-service.js', () => ({
  getBrevoService: vi.fn()
}));

import { getBrevoService } from '../../../lib/brevo-service.js';

describe('Volunteer Email Flow Integration', () => {
  let mockBrevoService;

  beforeEach(() => {
    // Reset environment variables
    process.env.BREVO_API_KEY = 'test-api-key';

    // Create mock Brevo service
    mockBrevoService = {
      sendTransactionalEmail: vi.fn()
    };
    getBrevoService.mockResolvedValue(mockBrevoService);

    // Mock console methods to suppress logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    delete process.env.BREVO_API_KEY;
  });

  describe('Dual Email Sending', () => {
    it('should send both team and volunteer emails successfully', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-message-id'
      });

      const validData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@gmail.com',
        phone: '555-123-4567',
        areasOfInterest: ['setup'],
        availability: ['friday'],
        message: 'I love helping!'
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().message).toContain('confirmation email has been sent');
    });

    it('should succeed with warning when team email succeeds but volunteer email fails', async () => {
      // First call (volunteer email) rejects, second call (team email) succeeds
      mockBrevoService.sendTransactionalEmail
        .mockRejectedValueOnce(new Error('Volunteer email failed'))
        .mockResolvedValueOnce({ messageId: 'team-email-id' });

      const validData = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@gmail.com',
        areasOfInterest: ['registration'],
        availability: ['saturday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(201);
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().warning).toBe('Confirmation email could not be sent');
      expect(res._getBody().message).toContain('We will contact you soon');
    });

    it('should fail with 500 when team email fails', async () => {
      // First call (volunteer email) succeeds, second call (team email) fails
      mockBrevoService.sendTransactionalEmail
        .mockResolvedValueOnce({ messageId: 'volunteer-email-id' })
        .mockRejectedValueOnce(new Error('Team notification failed'));

      const validData = {
        firstName: 'Bob',
        lastName: 'Johnson',
        email: 'bob.johnson@gmail.com',
        areasOfInterest: ['cleanup'],
        availability: ['sunday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(500);
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);
      expect(res._getBody().error).toContain('Unable to process your application');
      expect(console.error).toHaveBeenCalledWith(
        'Critical: Team notification failed:',
        expect.any(Error)
      );
    });
  });

  describe('Brevo Service Integration', () => {
    it('should initialize Brevo service successfully', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'Alice',
        lastName: 'Williams',
        email: 'alice.w@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(getBrevoService).toHaveBeenCalled();
      expect(res._getStatus()).toBe(201);
    });

    it('should return 503 when Brevo service initialization fails', async () => {
      getBrevoService.mockRejectedValue(new Error('Brevo service unavailable'));

      const validData = {
        firstName: 'Charlie',
        lastName: 'Brown',
        email: 'charlie.b@gmail.com',
        areasOfInterest: ['registration'],
        availability: ['saturday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(503);
      expect(res._getBody().error).toContain('Email service is temporarily unavailable');
    });

    it('should return mock success in preview mode without BREVO_API_KEY', async () => {
      delete process.env.BREVO_API_KEY;

      const validData = {
        firstName: 'Preview',
        lastName: 'User',
        email: 'preview@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        host: 'test-deployment.vercel.app'
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().message).toContain('Preview mode');
      expect(mockBrevoService.sendTransactionalEmail).not.toHaveBeenCalled();
    });

    it('should return mock success in preview mode when Brevo init fails', async () => {
      getBrevoService.mockRejectedValue(new Error('Brevo init failed'));

      const validData = {
        firstName: 'Preview',
        lastName: 'User',
        email: 'preview.user@gmail.com',
        areasOfInterest: ['cleanup'],
        availability: ['sunday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData, {
        host: 'preview-abc123.vercel.app'
      });
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(201);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().message).toContain('Preview mode');
    });
  });

  describe('Email Content Validation', () => {
    it('should send team notification to correct recipient', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'David',
        lastName: 'Miller',
        email: 'david.m@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Second call is team notification
      const teamEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[1][0];
      expect(teamEmailCall.to).toEqual([{
        email: 'alocubanoboulderfest@gmail.com',
        name: 'A Lo Cubano Boulder Fest Team'
      }]);
    });

    it('should include applicant details in team notification', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'Emma',
        lastName: 'Davis',
        email: 'emma.davis@gmail.com',
        phone: '555-987-6543',
        areasOfInterest: ['setup', 'registration'],
        availability: ['friday', 'saturday'],
        message: 'Excited to help!'
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Second call is team notification
      const teamEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[1][0];
      expect(teamEmailCall.subject).toContain('Emma Davis');
      expect(teamEmailCall.htmlContent).toContain('Emma');
      expect(teamEmailCall.htmlContent).toContain('Davis');
      expect(teamEmailCall.htmlContent).toContain('emma.davis@gmail.com');
      expect(teamEmailCall.htmlContent).toContain('555-987-6543');
      expect(teamEmailCall.htmlContent).toContain('Setup');
      expect(teamEmailCall.htmlContent).toContain('Registration');
      expect(teamEmailCall.htmlContent).toContain('Friday');
      expect(teamEmailCall.htmlContent).toContain('Saturday');
      expect(teamEmailCall.htmlContent).toContain('Excited to help!');
    });

    it('should send volunteer acknowledgement to applicant email', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'Frank',
        lastName: 'Wilson',
        email: 'frank.wilson@gmail.com',
        areasOfInterest: ['cleanup'],
        availability: ['sunday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // First call is volunteer acknowledgement
      const volunteerEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[0][0];
      expect(volunteerEmailCall.to).toEqual([{
        email: 'frank.wilson@gmail.com',
        name: 'Frank Wilson'
      }]);
    });

    it('should use generated HTML template for volunteer acknowledgement', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'Grace',
        lastName: 'Taylor',
        email: 'grace.t@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // First call is volunteer acknowledgement
      const volunteerEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[0][0];
      expect(volunteerEmailCall.htmlContent).toBeDefined();
      expect(volunteerEmailCall.htmlContent).toContain('Thank You for Volunteering');
      expect(volunteerEmailCall.htmlContent).toContain('Grace');
      expect(volunteerEmailCall.subject).toContain('Thank You');
    });

    it('should include custom email headers', async () => {
      mockBrevoService.sendTransactionalEmail.mockResolvedValue({
        messageId: 'test-id'
      });

      const validData = {
        firstName: 'Henry',
        lastName: 'Anderson',
        email: 'henry.a@gmail.com',
        areasOfInterest: ['registration'],
        availability: ['saturday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Check volunteer email headers
      const volunteerEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[0][0];
      expect(volunteerEmailCall.headers['X-Mailin-Tag']).toBe('volunteer-acknowledgement');
      expect(volunteerEmailCall.headers['X-Mailin-Custom']).toBeDefined();
      const volunteerCustom = JSON.parse(volunteerEmailCall.headers['X-Mailin-Custom']);
      expect(volunteerCustom.type).toBe('volunteer_application');
      expect(volunteerCustom.firstName).toBe('Henry');

      // Check team email headers
      const teamEmailCall = mockBrevoService.sendTransactionalEmail.mock.calls[1][0];
      expect(teamEmailCall.headers['X-Mailin-Tag']).toBe('volunteer-notification');
      expect(teamEmailCall.headers['X-Mailin-Custom']).toBeDefined();
      const teamCustom = JSON.parse(teamEmailCall.headers['X-Mailin-Custom']);
      expect(teamCustom.type).toBe('volunteer_notification');
      expect(teamCustom.applicantEmail).toBe('henry.a@gmail.com');
    });
  });

  describe('Error Handling', () => {
    it('should handle both emails failing', async () => {
      mockBrevoService.sendTransactionalEmail.mockRejectedValue(
        new Error('Email service error')
      );

      const validData = {
        firstName: 'Ian',
        lastName: 'Thomas',
        email: 'ian.thomas@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(500);
      expect(mockBrevoService.sendTransactionalEmail).toHaveBeenCalledTimes(2);
      expect(res._getBody().error).toContain('Unable to process your application');
    });

    it('should handle Brevo API error properly', async () => {
      const brevoError = new Error('API rate limit exceeded');
      brevoError.status = 429;
      mockBrevoService.sendTransactionalEmail.mockRejectedValue(brevoError);

      const validData = {
        firstName: 'Julia',
        lastName: 'Martinez',
        email: 'julia.m@gmail.com',
        areasOfInterest: ['cleanup'],
        availability: ['sunday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toBeDefined();
    });

    it('should mask email in error logs', async () => {
      mockBrevoService.sendTransactionalEmail.mockRejectedValue(
        new Error('Email failed')
      );

      const validData = {
        firstName: 'Karen',
        lastName: 'Lee',
        email: 'karen.lee@gmail.com',
        areasOfInterest: ['registration'],
        availability: ['saturday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Check that console.error was called with masked email
      const errorCalls = console.error.mock.calls;
      const volunteerErrorCall = errorCalls.find(call =>
        call[0] === 'Volunteer submission error:'
      );

      if (volunteerErrorCall) {
        const logData = volunteerErrorCall[1];
        expect(logData.email).not.toBe('karen.lee@gmail.com');
        expect(logData.email).toContain('k***');
      }
    });
  });

  describe('Promise.allSettled Logic', () => {
    it('should use Promise.allSettled for parallel email sending', async () => {
      const sendEmailSpy = vi.spyOn(mockBrevoService, 'sendTransactionalEmail');
      sendEmailSpy.mockResolvedValue({ messageId: 'test-id' });

      const validData = {
        firstName: 'Laura',
        lastName: 'Garcia',
        email: 'laura.garcia@gmail.com',
        areasOfInterest: ['setup'],
        availability: ['friday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Both emails should be called
      expect(sendEmailSpy).toHaveBeenCalledTimes(2);
      expect(res._getStatus()).toBe(201);
    });

    it('should handle team email rejection without volunteer email affecting it', async () => {
      // Volunteer succeeds, team fails
      mockBrevoService.sendTransactionalEmail
        .mockResolvedValueOnce({ messageId: 'volunteer-id' })
        .mockRejectedValueOnce(new Error('Team email failed'));

      const validData = {
        firstName: 'Mike',
        lastName: 'Robinson',
        email: 'mike.r@gmail.com',
        areasOfInterest: ['cleanup'],
        availability: ['sunday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Should fail because team email is critical
      expect(res._getStatus()).toBe(500);
      expect(res._getBody().error).toContain('Unable to process your application');
    });

    it('should handle volunteer email rejection without affecting team email', async () => {
      // Volunteer fails, team succeeds
      mockBrevoService.sendTransactionalEmail
        .mockRejectedValueOnce(new Error('Volunteer email failed'))
        .mockResolvedValueOnce({ messageId: 'team-id' });

      const validData = {
        firstName: 'Nancy',
        lastName: 'Clark',
        email: 'nancy.clark@gmail.com',
        areasOfInterest: ['registration'],
        availability: ['saturday']
      };

      const req = createMockRequest('POST', 'http://localhost:3001/api/volunteer/submit', validData);
      const res = createMockResponse();

      await handler(req, res);

      // Should succeed with warning because team email succeeded
      expect(res._getStatus()).toBe(201);
      expect(res._getBody().success).toBe(true);
      expect(res._getBody().warning).toBe('Confirmation email could not be sent');
    });
  });
});
