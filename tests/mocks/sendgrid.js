/**
 * SendGrid API Mock for Testing
 * Provides comprehensive mocking of email operations
 */

// Mock email data
export const mockEmailData = {
  to: 'test@example.com',
  from: 'alocubanoboulderfest@gmail.com',
  subject: 'Payment Confirmed - A Lo Cubano Boulder Fest 2026',
  html: '<p>Thank you for your purchase!</p>',
  text: 'Thank you for your purchase!'
};

// Mock SendGrid responses
export const mockSendGridResponses = {
  success: {
    statusCode: 202,
    body: '',
    headers: {
      'x-message-id': 'msg_test_1234567890'
    }
  },
  
  failure: {
    statusCode: 400,
    body: {
      errors: [
        {
          message: 'The to email does not contain a valid address.',
          field: 'to',
          help: 'http://sendgrid.com/docs/API_Reference/Web_API_v3/Mail/errors.html#message.to'
        }
      ]
    }
  },
  
  rateLimited: {
    statusCode: 429,
    body: {
      errors: [
        {
          message: 'Rate limit exceeded'
        }
      ]
    },
    headers: {
      'x-ratelimit-remaining': '0',
      'x-ratelimit-reset': Math.floor(Date.now() / 1000) + 60
    }
  },
  
  serverError: {
    statusCode: 500,
    body: {
      errors: [
        {
          message: 'Internal server error'
        }
      ]
    }
  }
};

/**
 * Create mock SendGrid client
 */
export function createMockSendGrid() {
  const mockSend = jest.fn().mockResolvedValue([mockSendGridResponses.success, {}]);
  
  return {
    setApiKey: jest.fn(),
    send: mockSend,
    
    // Helper to simulate different responses
    simulateSuccess: () => {
      mockSend.mockResolvedValueOnce([mockSendGridResponses.success, {}]);
    },
    
    simulateFailure: () => {
      const error = new Error('Bad Request');
      error.response = mockSendGridResponses.failure;
      mockSend.mockRejectedValueOnce(error);
    },
    
    simulateRateLimit: () => {
      const error = new Error('Rate limit exceeded');
      error.response = mockSendGridResponses.rateLimited;
      mockSend.mockRejectedValueOnce(error);
    },
    
    simulateServerError: () => {
      const error = new Error('Internal server error');
      error.response = mockSendGridResponses.serverError;
      mockSend.mockRejectedValueOnce(error);
    },
    
    // Access to the mock for assertions
    _mock: mockSend
  };
}

/**
 * Mock email templates
 */
export const mockEmailTemplates = {
  paymentConfirmation: {
    templateId: 'd-1234567890abcdef',
    dynamicTemplateData: {
      customer_name: 'Test Customer',
      order_number: 'ORD-123456',
      total_amount: '$300.00',
      ticket_details: [
        {
          name: 'Full Festival Pass',
          quantity: 1,
          price: '$300.00'
        }
      ],
      event_name: 'A Lo Cubano Boulder Fest 2026',
      event_date: 'May 15-17, 2026',
      venue: 'Avalon Ballroom, Boulder, CO'
    }
  },
  
  paymentFailed: {
    templateId: 'd-fedcba0987654321',
    dynamicTemplateData: {
      customer_name: 'Test Customer',
      order_number: 'ORD-123456',
      failure_reason: 'Your card was declined.',
      retry_url: 'https://alocubanoboulderfest.com/tickets?retry=ORD-123456'
    }
  },
  
  refundConfirmation: {
    templateId: 'd-1111222233334444',
    dynamicTemplateData: {
      customer_name: 'Test Customer',
      order_number: 'ORD-123456',
      refund_amount: '$300.00',
      processing_time: '5-10 business days'
    }
  }
};

/**
 * Mock bulk email operations
 */
export const mockBulkEmailData = {
  personalizations: [
    {
      to: [{ email: 'test1@example.com' }],
      dynamic_template_data: mockEmailTemplates.paymentConfirmation.dynamicTemplateData
    },
    {
      to: [{ email: 'test2@example.com' }],
      dynamic_template_data: mockEmailTemplates.paymentConfirmation.dynamicTemplateData
    }
  ],
  from: { email: 'alocubanoboulderfest@gmail.com' },
  template_id: mockEmailTemplates.paymentConfirmation.templateId
};

/**
 * Mock webhook event data from SendGrid
 */
export const mockSendGridWebhookEvents = {
  delivered: [
    {
      email: 'test@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'delivered',
      'smtp-id': '<msg_test_1234567890@ismtpd0001p1den1.sendgrid.net>',
      sg_event_id: 'evt_test_delivered_123',
      sg_message_id: 'msg_test_1234567890'
    }
  ],
  
  opened: [
    {
      email: 'test@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'open',
      'smtp-id': '<msg_test_1234567890@ismtpd0001p1den1.sendgrid.net>',
      sg_event_id: 'evt_test_opened_123',
      sg_message_id: 'msg_test_1234567890',
      useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ip: '192.168.1.1'
    }
  ],
  
  clicked: [
    {
      email: 'test@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'click',
      'smtp-id': '<msg_test_1234567890@ismtpd0001p1den1.sendgrid.net>',
      sg_event_id: 'evt_test_clicked_123',
      sg_message_id: 'msg_test_1234567890',
      url: 'https://alocubanoboulderfest.com/tickets',
      useragent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ip: '192.168.1.1'
    }
  ],
  
  bounced: [
    {
      email: 'bounce@example.com',
      timestamp: Math.floor(Date.now() / 1000),
      event: 'bounce',
      'smtp-id': '<msg_test_bounce_123@ismtpd0001p1den1.sendgrid.net>',
      sg_event_id: 'evt_test_bounced_123',
      sg_message_id: 'msg_test_bounce_123',
      reason: 'Mail was rejected by the recipient domain.',
      status: '5.1.1',
      type: 'bounce'
    }
  ]
};

/**
 * Helper to create custom mock email data
 */
export function createMockEmail(overrides = {}) {
  return {
    ...mockEmailData,
    ...overrides,
    personalizations: [{
      to: [{ email: overrides.to || mockEmailData.to }]
    }]
  };
}

/**
 * Mock email validation utilities
 */
export const mockEmailValidation = {
  valid: {
    email: 'valid@example.com',
    result: {
      isValid: true,
      suggestion: null,
      checks: {
        domain: { isValid: true },
        localPart: { isValid: true },
        additional: { isValid: true }
      }
    }
  },
  
  invalid: {
    email: 'invalid-email',
    result: {
      isValid: false,
      suggestion: null,
      checks: {
        domain: { isValid: false, reason: 'Domain is missing' },
        localPart: { isValid: false, reason: 'Local part is invalid' },
        additional: { isValid: false }
      }
    }
  },
  
  typo: {
    email: 'test@gmial.com',
    result: {
      isValid: false,
      suggestion: 'test@gmail.com',
      checks: {
        domain: { isValid: false, reason: 'Domain appears to be a typo' },
        localPart: { isValid: true },
        additional: { isValid: true }
      }
    }
  }
};

export default createMockSendGrid;