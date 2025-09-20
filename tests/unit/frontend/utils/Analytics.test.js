/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSessionId,
  createEventData,
  validateEventData,
  formatCartEvent,
  formatEcommerceEvent,
  formatFacebookPixelEvent,
  formatGA4Event,
  createConversionFunnel,
  isDevelopmentEnvironment,
  sanitizeEventProperties,
  createPerformanceEvent,
  createErrorEvent,
  calculateSessionDuration
} from '../../../../js/lib/pure/analytics-utils.js';

// Mock global variables for testing
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

describe('Analytics Utils', () => {
  let mockDate;

  beforeEach(() => {
    mockDate = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
  });

  afterEach(() => {
    if (mockDate) {
      mockDate.mockRestore();
    }
    vi.clearAllMocks();
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', () => {
      const id1 = generateSessionId();
      const id2 = generateSessionId();

      expect(id1).toMatch(/^session_\d+_\w+$/);
      expect(id2).toMatch(/^session_\d+_\w+$/);
      expect(id1).not.toBe(id2);
    });

    it('should include timestamp in session ID', () => {
      const id = generateSessionId();
      const timestamp = parseInt(id.split('_')[1]);

      expect(timestamp).toBe(1234567890);
    });

    it('should include random component', () => {
      const id = generateSessionId();
      const randomPart = id.split('_')[2];

      expect(randomPart).toMatch(/^\w+$/);
      expect(randomPart.length).toBeGreaterThan(0);
    });
  });

  describe('createEventData', () => {
    it('should create basic event data structure', () => {
      const eventData = createEventData('test_event');

      expect(eventData).toMatchObject({
        event: 'test_event',
        timestamp: 1234567890
      });
      expect(eventData.sessionId).toMatch(/^session_\d+_\w+$/);
    });

    it('should include provided properties', () => {
      const properties = { value: 100, currency: 'USD' };
      const eventData = createEventData('purchase', properties);

      expect(eventData.value).toBe(100);
      expect(eventData.currency).toBe('USD');
    });

    it('should include context data', () => {
      const context = {
        sessionId: 'custom-session',
        url: 'https://example.com/test',
        referrer: 'https://google.com'
      };
      const eventData = createEventData('test_event', {}, context);

      expect(eventData.sessionId).toBe('custom-session');
      expect(eventData.url).toBe('https://example.com/test');
      expect(eventData.referrer).toBe('https://google.com');
    });

    it('should use defaults when context not provided', () => {
      const eventData = createEventData('test_event');

      expect(eventData.url).toBe('');
      expect(eventData.referrer).toBe('');
      expect(eventData.sessionId).toMatch(/^session_/);
    });

    it('should throw error for invalid event name', () => {
      expect(() => createEventData('')).toThrow('Event name is required');
      expect(() => createEventData(null)).toThrow('Event name is required');
      expect(() => createEventData(123)).toThrow('Event name is required');
    });

    it('should merge properties correctly', () => {
      const properties = { prop1: 'value1', prop2: 'value2' };
      const context = { prop1: 'context-value1', prop3: 'value3' };
      const eventData = createEventData('test', properties, context);

      // Properties should override context
      expect(eventData.prop1).toBe('value1');
      expect(eventData.prop2).toBe('value2');
      expect(eventData.prop3).toBe('value3');
    });
  });

  describe('validateEventData', () => {
    it('should validate correct event data', () => {
      const eventData = {
        event: 'test_event',
        timestamp: 1234567890,
        sessionId: 'session_123'
      };

      const result = validateEventData(eventData);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null/undefined', () => {
      expect(validateEventData(null).isValid).toBe(false);
      expect(validateEventData(undefined).isValid).toBe(false);
    });

    it('should require event name', () => {
      const eventData = { timestamp: 123, sessionId: 'test' };
      const result = validateEventData(eventData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Event name is required and must be a string');
    });

    it('should require timestamp', () => {
      const eventData = { event: 'test', sessionId: 'test' };
      const result = validateEventData(eventData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Timestamp must be a number');
    });

    it('should require session ID', () => {
      const eventData = { event: 'test', timestamp: 123 };
      const result = validateEventData(eventData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Session ID is required and must be a string');
    });

    it('should validate type requirements', () => {
      const eventData = {
        event: 123, // Should be string
        timestamp: '123', // Should be number
        sessionId: 456 // Should be string
      };
      const result = validateEventData(eventData);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(3);
    });
  });

  describe('formatCartEvent', () => {
    it('should map known event types', () => {
      const mappings = {
        'ticket_added': 'cart_ticket_added',
        'ticket_removed': 'cart_ticket_removed',
        'donation_updated': 'cart_donation_updated',
        'cart_cleared': 'cart_cleared',
        'cart_opened': 'cart_panel_opened',
        'checkout_clicked': 'checkout_button_clicked'
      };

      Object.entries(mappings).forEach(([input, expected]) => {
        const result = formatCartEvent(input);
        expect(result.event).toBe(expected);
        expect(result.category).toBe('cart');
      });
    });

    it('should handle unknown event types', () => {
      const result = formatCartEvent('unknown_event');
      expect(result.event).toBe('cart_unknown_event');
      expect(result.category).toBe('cart');
    });

    it('should include provided details', () => {
      const details = { ticketType: 'general', quantity: 2 };
      const result = formatCartEvent('ticket_added', details);

      expect(result).toMatchObject({
        event: 'cart_ticket_added',
        category: 'cart',
        ticketType: 'general',
        quantity: 2
      });
    });

    it('should handle empty details', () => {
      const result = formatCartEvent('cart_opened', {});
      expect(result).toMatchObject({
        event: 'cart_panel_opened',
        category: 'cart'
      });
    });
  });

  describe('formatEcommerceEvent', () => {
    it('should format basic e-commerce event', () => {
      const items = [
        { ticketType: 'general', name: 'General Admission', quantity: 2, price: 50 }
      ];
      const result = formatEcommerceEvent(items, 100);

      expect(result).toMatchObject({
        items: [{
          id: 'general',
          name: 'General Admission',
          category: 'ticket',
          quantity: 2,
          price: 50
        }],
        value: 100,
        currency: 'USD',
        num_items: 1
      });
    });

    it('should handle multiple items', () => {
      const items = [
        { ticketType: 'general', name: 'General', price: 50, quantity: 2 },
        { id: 'vip', name: 'VIP', price: 100, amount: 100, quantity: 1 }
      ];
      const result = formatEcommerceEvent(items, 200);

      expect(result.items).toHaveLength(2);
      expect(result.num_items).toBe(2);
      expect(result.value).toBe(200);
    });

    it('should use fallback values for missing properties', () => {
      const items = [{ name: 'Test Item' }];
      const result = formatEcommerceEvent(items, 0);

      expect(result.items[0]).toMatchObject({
        id: undefined,
        name: 'Test Item',
        category: 'ticket',
        quantity: 1,
        price: 0
      });
    });

    it('should handle empty items array', () => {
      const result = formatEcommerceEvent([], 0);

      expect(result).toMatchObject({
        items: [],
        value: 0,
        currency: 'USD',
        num_items: 0
      });
    });

    it('should round value to 2 decimal places', () => {
      const result = formatEcommerceEvent([], 123.456);
      expect(result.value).toBe(123.46);
    });

    it('should allow custom currency', () => {
      const result = formatEcommerceEvent([], 100, 'EUR');
      expect(result.currency).toBe('EUR');
    });
  });

  describe('formatFacebookPixelEvent', () => {
    it('should map known events to Facebook events', () => {
      const mappings = {
        'checkout_button_clicked': 'InitiateCheckout',
        'customer_info_submitted': 'AddPaymentInfo',
        'payment_submit_attempted': 'Purchase',
        'payment_completed': 'Purchase'
      };

      Object.entries(mappings).forEach(([input, expected]) => {
        const eventData = { value: 100 };
        const result = formatFacebookPixelEvent(input, eventData);
        expect(result.event).toBe(expected);
      });
    });

    it('should use event name as-is for unknown events', () => {
      const result = formatFacebookPixelEvent('custom_event', {});
      expect(result.event).toBe('custom_event');
    });

    it('should format event data correctly', () => {
      const eventData = {
        value: 150.50,
        currency: 'EUR',
        items: [
          { id: 'ticket1', name: 'Test Ticket' },
          { id: 'ticket2', name: 'VIP Ticket' }
        ]
      };
      const result = formatFacebookPixelEvent('purchase', eventData);

      expect(result).toMatchObject({
        event: 'purchase',
        value: 150.50,
        currency: 'EUR',
        content_ids: ['ticket1', 'ticket2'],
        content_type: 'product',
        num_items: 2
      });
    });

    it('should handle missing properties gracefully', () => {
      const result = formatFacebookPixelEvent('test', {});

      expect(result).toMatchObject({
        event: 'test',
        value: 0,
        currency: 'USD',
        content_ids: [],
        content_type: 'product',
        num_items: 0
      });
    });
  });

  describe('formatGA4Event', () => {
    it('should format basic GA4 event data', () => {
      const eventData = {
        sessionId: 'test-session',
        value: 100,
        currency: 'USD'
      };
      const result = formatGA4Event('purchase', eventData);

      expect(result).toMatchObject({
        custom_parameter_1: 'test-session',
        value: 100,
        currency: 'USD'
      });
    });

    it('should include items data when available', () => {
      const eventData = {
        sessionId: 'test',
        items: [
          { id: 'ticket1', name: 'General', category: 'ticket', quantity: 2, price: 50 }
        ]
      };
      const result = formatGA4Event('purchase', eventData);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        item_id: 'ticket1',
        item_name: 'General',
        item_category: 'ticket',
        quantity: 2,
        price: 50
      });
    });

    it('should handle missing optional properties', () => {
      const result = formatGA4Event('test', {});

      expect(result).toMatchObject({
        custom_parameter_1: undefined,
        value: 0,
        currency: 'USD'
      });
      expect(result.items).toBeUndefined();
    });

    it('should handle empty items array', () => {
      const eventData = { items: [] };
      const result = formatGA4Event('test', eventData);

      expect(result.items).toEqual([]);
    });
  });

  describe('createConversionFunnel', () => {
    it('should create funnel with counts', () => {
      const events = [
        { event: 'payment_integration_initialized' },
        { event: 'cart_ticket_added' },
        { event: 'cart_ticket_added' }, // Second occurrence
        { event: 'checkout_button_clicked' },
        { event: 'payment_completed' }
      ];

      const funnel = createConversionFunnel(events);

      expect(funnel).toHaveProperty('payment_integration_initialized');
      expect(funnel).toHaveProperty('cart_ticket_added');
      expect(funnel).toHaveProperty('checkout_button_clicked');
      expect(funnel).toHaveProperty('payment_completed');

      expect(funnel.cart_ticket_added.count).toBe(2);
      expect(funnel.checkout_button_clicked.count).toBe(1);
    });

    it('should calculate conversion rates', () => {
      const events = [
        { event: 'payment_integration_initialized' },
        { event: 'cart_ticket_added' },
        { event: 'checkout_button_clicked' }
      ];

      const funnel = createConversionFunnel(events);

      expect(funnel.cart_ticket_added.rate).toBe(100); // 1/1 * 100 (based on payment_integration_initialized)
      expect(funnel.checkout_button_clicked.rate).toBe(0); // 1/0 = 0 (based on cart_panel_opened)
    });

    it('should handle empty events array', () => {
      const funnel = createConversionFunnel([]);

      Object.values(funnel).forEach(step => {
        expect(step.count).toBe(0);
        expect(step.rate).toBe(0);
      });
    });

    it('should include all funnel steps even if not present', () => {
      const funnel = createConversionFunnel([]);

      const expectedSteps = [
        'payment_integration_initialized',
        'cart_ticket_added',
        'cart_panel_opened',
        'checkout_button_clicked',
        'customer_info_step_shown',
        'customer_info_submitted',
        'payment_form_shown',
        'payment_submit_attempted',
        'payment_completed'
      ];

      expectedSteps.forEach(step => {
        expect(funnel).toHaveProperty(step);
      });
    });

    it('should calculate rates with partial funnel data', () => {
      const events = [
        { event: 'payment_integration_initialized' },
        { event: 'payment_integration_initialized' }, // 2 total
        { event: 'cart_ticket_added' }, // 1 out of 2 = 50%
        { event: 'checkout_button_clicked' } // 1 out of 1 = 100%
      ];

      const funnel = createConversionFunnel(events);

      expect(funnel.cart_ticket_added.rate).toBe(50);
      expect(funnel.checkout_button_clicked.rate).toBe(0); // 1/0 = 0 (based on cart_panel_opened)
    });
  });

  describe('isDevelopmentEnvironment', () => {
    it('should detect localhost', () => {
      const mockWindow = { location: { hostname: 'localhost' } };
      expect(isDevelopmentEnvironment(mockWindow)).toBe(true);
    });

    it('should detect 127.0.0.1', () => {
      const mockWindow = { location: { hostname: '127.0.0.1' } };
      expect(isDevelopmentEnvironment(mockWindow)).toBe(true);
    });

    it('should detect development ports', () => {
      const mockWindow1 = { location: { hostname: 'example.com', port: '3000' } };
      const mockWindow2 = { location: { hostname: 'example.com', port: '8080' } };

      expect(isDevelopmentEnvironment(mockWindow1)).toBe(true);
      expect(isDevelopmentEnvironment(mockWindow2)).toBe(true);
    });

    it('should detect debug parameter', () => {
      const mockWindow = {
        location: {
          hostname: 'production.com',
          search: '?debug=true&other=value'
        }
      };
      expect(isDevelopmentEnvironment(mockWindow)).toBe(true);
    });

    it('should detect dev_mode in localStorage', () => {
      const mockWindow = {
        location: { hostname: 'production.com' },
        localStorage: { getItem: (key) => key === 'dev_mode' ? 'true' : null }
      };
      expect(isDevelopmentEnvironment(mockWindow)).toBe(true);
    });

    it('should return false for production environment', () => {
      const mockWindow = {
        location: {
          hostname: 'production.com',
          port: '443',
          search: ''
        },
        localStorage: { getItem: () => null }
      };
      expect(isDevelopmentEnvironment(mockWindow)).toBe(false);
    });

    it('should handle missing location', () => {
      expect(isDevelopmentEnvironment({})).toBe(false);
    });
  });

  describe('sanitizeEventProperties', () => {
    it('should include safe property types', () => {
      const properties = {
        string: 'text',
        number: 123,
        boolean: true,
        object: { nested: 'value' }, // Should be excluded
        array: [1, 2, 3],
        nullValue: null, // Should be excluded
        undefinedValue: undefined // Should be excluded
      };

      const sanitized = sanitizeEventProperties(properties);

      expect(sanitized).toHaveProperty('string', 'text');
      expect(sanitized).toHaveProperty('number', 123);
      expect(sanitized).toHaveProperty('boolean', true);
      expect(sanitized).toHaveProperty('array', [1, 2, 3]);
      expect(sanitized).not.toHaveProperty('object');
      expect(sanitized).not.toHaveProperty('nullValue');
      expect(sanitized).not.toHaveProperty('undefinedValue');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(150);
      const properties = { longText: longString };

      const sanitized = sanitizeEventProperties(properties);

      expect(sanitized.longText).toHaveLength(103); // 100 + '...'
      expect(sanitized.longText.endsWith('...')).toBe(true);
    });

    it('should handle large arrays', () => {
      const largeArray = new Array(20).fill(1);
      const properties = { bigArray: largeArray };

      const sanitized = sanitizeEventProperties(properties);

      expect(sanitized.bigArray).toBe('Array(20)');
    });

    it('should preserve small arrays', () => {
      const smallArray = [1, 2, 3];
      const properties = { smallArray: smallArray };

      const sanitized = sanitizeEventProperties(properties);

      expect(sanitized.smallArray).toEqual([1, 2, 3]);
    });

    it('should handle empty input', () => {
      expect(sanitizeEventProperties()).toEqual({});
      expect(sanitizeEventProperties({})).toEqual({});
    });
  });

  describe('createPerformanceEvent', () => {
    it('should create valid performance event', () => {
      const event = createPerformanceEvent('page_load', 1500);

      expect(event).toMatchObject({
        event: 'performance_metric',
        metric: 'page_load',
        value: 1500,
        unit: 'ms',
        timestamp: 1234567890
      });
    });

    it('should allow custom unit', () => {
      const event = createPerformanceEvent('bundle_size', 250, 'KB');
      expect(event.unit).toBe('KB');
    });

    it('should round value to 2 decimal places', () => {
      const event = createPerformanceEvent('metric', 123.456789);
      expect(event.value).toBe(123.46);
    });

    it('should require valid metric name', () => {
      expect(() => createPerformanceEvent('', 100)).toThrow('Metric name is required');
      expect(() => createPerformanceEvent(null, 100)).toThrow('Metric name is required');
    });

    it('should require valid value', () => {
      expect(() => createPerformanceEvent('test', 'invalid')).toThrow('Metric value must be a valid number');
      expect(() => createPerformanceEvent('test', NaN)).toThrow('Metric value must be a valid number');
    });
  });

  describe('createErrorEvent', () => {
    it('should create valid error event', () => {
      const event = createErrorEvent('network_error', 'Failed to fetch data');

      expect(event).toMatchObject({
        event: 'error_occurred',
        error_type: 'network_error',
        error_message: 'Failed to fetch data',
        context: {},
        timestamp: 1234567890
      });
    });

    it('should include sanitized context', () => {
      const context = {
        url: '/api/test',
        status: 404,
        object: { nested: 'value' } // Should be sanitized out
      };
      const event = createErrorEvent('api_error', 'Not found', context);

      expect(event.context).toHaveProperty('url', '/api/test');
      expect(event.context).toHaveProperty('status', 404);
      expect(event.context).not.toHaveProperty('object');
    });

    it('should truncate long error messages', () => {
      const longMessage = 'error '.repeat(50); // 250+ chars
      const event = createErrorEvent('test', longMessage);

      expect(event.error_message.length).toBeLessThanOrEqual(200);
    });

    it('should require valid error type', () => {
      expect(() => createErrorEvent('', 'message')).toThrow('Error type is required');
      expect(() => createErrorEvent(null, 'message')).toThrow('Error type is required');
    });

    it('should require valid error message', () => {
      expect(() => createErrorEvent('type', '')).toThrow('Error message is required');
      expect(() => createErrorEvent('type', null)).toThrow('Error message is required');
    });
  });

  describe('calculateSessionDuration', () => {
    it('should calculate duration correctly', () => {
      const duration = calculateSessionDuration(1000, 2000);
      expect(duration).toBe(1000);
    });

    it('should use current time as default end time', () => {
      const duration = calculateSessionDuration(1234567000); // 890ms before mocked time
      expect(duration).toBe(890);
    });

    it('should return 0 for invalid start time', () => {
      expect(calculateSessionDuration(0, 1000)).toBe(0);
      expect(calculateSessionDuration(-1, 1000)).toBe(0);
      expect(calculateSessionDuration('invalid', 1000)).toBe(0);
    });

    it('should use current time for invalid end time', () => {
      const duration = calculateSessionDuration(1234567000, 'invalid');
      expect(duration).toBe(890);
    });

    it('should not return negative duration', () => {
      const duration = calculateSessionDuration(2000, 1000); // End before start
      expect(duration).toBe(0);
    });

    it('should handle same start and end time', () => {
      const duration = calculateSessionDuration(1000, 1000);
      expect(duration).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should create complete analytics event flow', () => {
      // 1. Create event data
      const eventData = createEventData('cart_ticket_added', {
        ticketType: 'general',
        quantity: 2,
        price: 50
      });

      // 2. Validate event data
      const validation = validateEventData(eventData);
      expect(validation.isValid).toBe(true);

      // 3. Format for different platforms
      const cartEvent = formatCartEvent('ticket_added', { ticketType: 'general' });
      const fbEvent = formatFacebookPixelEvent('cart_ticket_added', eventData);
      const ga4Event = formatGA4Event('cart_ticket_added', eventData);

      expect(cartEvent.event).toBe('cart_ticket_added');
      expect(fbEvent.event).toBe('cart_ticket_added');
      expect(ga4Event.value).toBe(0); // No value in original event data
    });

    it('should handle complete e-commerce tracking', () => {
      const items = [
        { ticketType: 'general', name: 'General Admission', quantity: 2, price: 50 },
        { ticketType: 'vip', name: 'VIP Access', quantity: 1, price: 100 }
      ];
      const totalValue = 200;

      // Format for different platforms
      const ecommerceEvent = formatEcommerceEvent(items, totalValue);
      const fbPixelEvent = formatFacebookPixelEvent('purchase', ecommerceEvent);
      const ga4Event = formatGA4Event('purchase', ecommerceEvent);

      // All platforms should have consistent data
      expect(ecommerceEvent.value).toBe(200);
      expect(fbPixelEvent.value).toBe(200);
      expect(ga4Event.value).toBe(200);

      expect(ecommerceEvent.num_items).toBe(2);
      expect(fbPixelEvent.num_items).toBe(2);
      expect(ga4Event.items).toHaveLength(2);
    });

    it('should create comprehensive conversion funnel analysis', () => {
      const userEvents = [
        { event: 'payment_integration_initialized' },
        { event: 'cart_ticket_added' },
        { event: 'cart_panel_opened' },
        { event: 'checkout_button_clicked' },
        { event: 'customer_info_submitted' },
        { event: 'payment_submit_attempted' },
        { event: 'payment_completed' }
      ];

      const funnel = createConversionFunnel(userEvents);

      // Should show complete successful funnel
      expect(funnel.payment_integration_initialized.count).toBe(1);
      expect(funnel.cart_ticket_added.count).toBe(1);
      expect(funnel.payment_completed.count).toBe(1);

      // Conversion rates should be 100% for this complete flow
      expect(funnel.cart_ticket_added.rate).toBe(100);
      expect(funnel.payment_completed.rate).toBe(100);
    });
  });
});