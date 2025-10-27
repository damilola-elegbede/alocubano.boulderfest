import { describe, it, expect } from 'vitest';
import {
  detectPaymentProcessor,
  extractPaymentSourceDetails,
  validateCaptureResponseStructure
} from '../../lib/paypal-payment-source-detector.js';

describe('Venmo Payment Source Detector', () => {
  describe('detectPaymentProcessor', () => {
    it('should detect Venmo payment source', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO123',
                  user_name: '@testuser',
                  email_address: 'test@example.com'
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(captureResponse);
      expect(processor).toBe('venmo');
    });

    it('should detect PayPal payment source', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL123',
                  email_address: 'paypal@example.com',
                  account_status: 'VERIFIED'
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(captureResponse);
      expect(processor).toBe('paypal');
    });

    it('should default to paypal when payment_source is missing', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE123'
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(captureResponse);
      expect(processor).toBe('paypal');
    });

    it('should default to paypal when payment_source is unknown type', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                credit_card: {
                  last_digits: '1234'
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(captureResponse);
      expect(processor).toBe('paypal');
    });

    it('should prioritize Venmo over PayPal when both present', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO123'
                },
                paypal: {
                  account_id: 'PAYPAL123'
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(captureResponse);
      expect(processor).toBe('venmo');
    });

    it('should handle null or undefined response safely', () => {
      expect(detectPaymentProcessor(null)).toBe('paypal');
      expect(detectPaymentProcessor(undefined)).toBe('paypal');
      expect(detectPaymentProcessor({})).toBe('paypal');
    });

    it('should handle malformed response structure', () => {
      const malformedResponse = {
        purchase_units: [{}]
      };

      const processor = detectPaymentProcessor(malformedResponse);
      expect(processor).toBe('paypal');
    });
  });

  describe('extractPaymentSourceDetails', () => {
    it('should extract Venmo payment source details', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO123',
                  user_name: '@testuser',
                  email_address: 'venmo@example.com',
                  name: {
                    given_name: 'John',
                    surname: 'Doe'
                  }
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details).toEqual({
        type: 'venmo',
        accountId: 'VENMO123',
        userName: '@testuser',
        email: 'venmo@example.com',
        name: {
          givenName: 'John',
          surname: 'Doe'
        }
      });
    });

    it('should extract Venmo details without name field', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO123',
                  user_name: '@testuser',
                  email_address: 'venmo@example.com'
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details.type).toBe('venmo');
      expect(details.accountId).toBe('VENMO123');
      expect(details.name).toBeUndefined();
    });

    it('should extract PayPal payment source details', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL123',
                  email_address: 'paypal@example.com',
                  account_status: 'VERIFIED',
                  name: {
                    given_name: 'Jane',
                    surname: 'Smith'
                  }
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details).toEqual({
        type: 'paypal',
        accountId: 'PAYPAL123',
        email: 'paypal@example.com',
        accountStatus: 'VERIFIED',
        name: {
          givenName: 'Jane',
          surname: 'Smith'
        }
      });
    });

    it('should extract PayPal details without name field', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL123',
                  email_address: 'paypal@example.com'
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details.type).toBe('paypal');
      expect(details.accountId).toBe('PAYPAL123');
      expect(details.name).toBeUndefined();
    });

    it('should return unknown type when payment_source is missing', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE123'
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details).toEqual({
        type: 'unknown',
        note: 'Payment source not found in capture response'
      });
    });

    it('should handle null input safely', () => {
      const details = extractPaymentSourceDetails(null);
      expect(details.type).toBe('unknown');
      expect(details.note).toBeDefined();
    });

    it('should prioritize Venmo details when both sources present', () => {
      const captureResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              payment_source: {
                venmo: {
                  account_id: 'VENMO123',
                  user_name: '@testuser',
                  email_address: 'venmo@example.com'
                },
                paypal: {
                  account_id: 'PAYPAL123',
                  email_address: 'paypal@example.com'
                }
              }
            }]
          }
        }]
      };

      const details = extractPaymentSourceDetails(captureResponse);
      expect(details.type).toBe('venmo');
      expect(details.accountId).toBe('VENMO123');
    });
  });

  describe('validateCaptureResponseStructure', () => {
    it('should validate complete and valid capture response', () => {
      const validResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE123',
              payment_source: {
                venmo: {
                  account_id: 'VENMO123'
                }
              }
            }]
          }
        }]
      };

      const validation = validateCaptureResponseStructure(validResponse);
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toBeNull();
      expect(validation.hasPaymentSource).toBe(true);
    });

    it('should detect missing purchase_units', () => {
      const response = {
        id: 'ORDER123'
      };

      const validation = validateCaptureResponseStructure(response);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Missing purchase_units array');
    });

    it('should detect missing payments object', () => {
      const response = {
        purchase_units: [{ id: 'UNIT1' }]
      };

      const validation = validateCaptureResponseStructure(response);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Missing payments object in first purchase unit');
    });

    it('should detect missing captures array', () => {
      const response = {
        purchase_units: [{
          payments: {}
        }]
      };

      const validation = validateCaptureResponseStructure(response);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Missing captures array in payments');
    });

    it('should detect empty captures array', () => {
      const response = {
        purchase_units: [{
          payments: {
            captures: []
          }
        }]
      };

      const validation = validateCaptureResponseStructure(response);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Missing first capture in captures array');
    });

    it('should detect missing payment_source', () => {
      const response = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE123'
            }]
          }
        }]
      };

      const validation = validateCaptureResponseStructure(response);
      expect(validation.isValid).toBe(false);
      expect(validation.issues).toContain('Missing payment_source in capture - may be older API version');
      expect(validation.hasPaymentSource).toBe(false);
    });

    it('should handle null or undefined response', () => {
      const nullValidation = validateCaptureResponseStructure(null);
      expect(nullValidation.isValid).toBe(false);
      expect(nullValidation.issues).toContain('Capture response is null or undefined');

      const undefinedValidation = validateCaptureResponseStructure(undefined);
      expect(undefinedValidation.isValid).toBe(false);
      expect(undefinedValidation.issues).toContain('Capture response is null or undefined');
    });

    it('should collect multiple issues', () => {
      const badResponse = {};

      const validation = validateCaptureResponseStructure(badResponse);
      expect(validation.isValid).toBe(false);
      expect(validation.issues.length).toBeGreaterThan(1);
    });
  });

  describe('Real-world response scenarios', () => {
    it('should handle production Venmo capture response', () => {
      const productionResponse = {
        id: 'ORDER123',
        status: 'COMPLETED',
        purchase_units: [{
          reference_id: 'default',
          amount: {
            currency_code: 'USD',
            value: '25.00'
          },
          payee: {
            email_address: 'merchant@example.com'
          },
          payments: {
            captures: [{
              id: 'CAPTURE123',
              status: 'COMPLETED',
              amount: {
                currency_code: 'USD',
                value: '25.00'
              },
              final_capture: true,
              seller_protection: {
                status: 'ELIGIBLE'
              },
              payment_source: {
                venmo: {
                  account_id: 'VENMO_ACCT_123',
                  user_name: '@user123',
                  email_address: 'user@venmo.com',
                  name: {
                    given_name: 'Test',
                    surname: 'User'
                  }
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(productionResponse);
      const details = extractPaymentSourceDetails(productionResponse);
      const validation = validateCaptureResponseStructure(productionResponse);

      expect(processor).toBe('venmo');
      expect(details.type).toBe('venmo');
      expect(details.userName).toBe('@user123');
      expect(validation.isValid).toBe(true);
    });

    it('should handle production PayPal capture response', () => {
      const productionResponse = {
        id: 'ORDER456',
        status: 'COMPLETED',
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE456',
              status: 'COMPLETED',
              payment_source: {
                paypal: {
                  account_id: 'PAYPAL_ACCT_456',
                  email_address: 'buyer@paypal.com',
                  account_status: 'VERIFIED',
                  name: {
                    given_name: 'PayPal',
                    surname: 'Buyer'
                  }
                }
              }
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(productionResponse);
      const details = extractPaymentSourceDetails(productionResponse);
      const validation = validateCaptureResponseStructure(productionResponse);

      expect(processor).toBe('paypal');
      expect(details.type).toBe('paypal');
      expect(details.accountStatus).toBe('VERIFIED');
      expect(validation.isValid).toBe(true);
    });

    it('should handle legacy response without payment_source', () => {
      const legacyResponse = {
        purchase_units: [{
          payments: {
            captures: [{
              id: 'CAPTURE789',
              status: 'COMPLETED'
            }]
          }
        }]
      };

      const processor = detectPaymentProcessor(legacyResponse);
      const details = extractPaymentSourceDetails(legacyResponse);
      const validation = validateCaptureResponseStructure(legacyResponse);

      expect(processor).toBe('paypal');
      expect(details.type).toBe('unknown');
      expect(validation.isValid).toBe(false);
      expect(validation.hasPaymentSource).toBe(false);
    });
  });
});
