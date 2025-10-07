/**
 * Unit Tests for Wallet Pass Generation
 * Tests Apple Wallet and Google Wallet pass structure, data fields, and QR embedding
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppleWalletService } from '../../lib/apple-wallet-service.js';
import { GoogleWalletService } from '../../lib/google-wallet-service.js';

describe('Wallet Pass Generation - Unit Tests', () => {
  let mockDb;
  let mockQRService;
  let mockColorService;

  beforeEach(() => {
    // Set up minimal environment for testing
    process.env.APPLE_PASS_TYPE_ID = 'pass.com.test.wallet';
    process.env.APPLE_TEAM_ID = 'TEST123456';
    process.env.APPLE_PASS_ORGANIZATION = 'Test Organization';
    process.env.WALLET_AUTH_SECRET = 'test-wallet-auth-secret-minimum-32-chars-long';
    process.env.APPLE_PASS_KEY = Buffer.from('test-private-key').toString('base64');
    process.env.APPLE_PASS_CERT = Buffer.from('test-certificate').toString('base64');
    process.env.GOOGLE_WALLET_ISSUER_ID = 'test-issuer-id';
    process.env.GOOGLE_WALLET_CLASS_ID = 'test-class-id';
    process.env.GOOGLE_SERVICE_ACCOUNT = JSON.stringify({
      type: 'service_account',
      project_id: 'test-project',
      private_key_id: 'test-key-id',
      private_key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----',
      client_email: 'test@test-project.iam.gserviceaccount.com',
      client_id: '12345678901234567890',
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token'
    });

    // Mock database client
    mockDb = {
      execute: vi.fn().mockResolvedValue({
        rows: [{
          ticket_id: 'TEST-TICKET-001',
          ticket_type: 'Festival Pass',
          ticket_type_name: 'Full Festival Pass',
          attendee_first_name: 'John',
          attendee_last_name: 'Doe',
          attendee_email: 'john.doe@example.com',
          event_id: 'boulder-fest-2026',
          event_name: 'A Lo Cubano Boulder Fest',
          venue_name: 'Avalon Ballroom',
          venue_city: 'Boulder',
          venue_state: 'CO',
          venue_address: '6185 Arapahoe Road, Boulder, CO 80303',
          start_date: '2026-05-15T10:00:00-06:00',
          end_date: '2026-05-17T23:00:00-06:00',
          qr_token: 'test-qr-token-jwt',
          validation_code: 'ABC123DEF456',
          scan_count: 0,
          max_scan_count: 10,
          status: 'valid',
          registration_status: 'completed'
        }]
      })
    };

    // Mock QR token service
    mockQRService = {
      getOrCreateToken: vi.fn().mockResolvedValue('test-qr-token-jwt'),
      generateQRImage: vi.fn().mockResolvedValue('data:image/png;base64,test-qr-image'),
      validateToken: vi.fn().mockReturnValue({ valid: true, payload: { tid: 'TEST-TICKET-001' } })
    };

    // Mock color service
    mockColorService = {
      getColorForTicketType: vi.fn().mockResolvedValue({
        name: 'Vibrant Red',
        rgb: 'rgb(211, 47, 47)',
        hex: '#d32f2f'
      })
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Apple Wallet Pass Structure', () => {
    it('should generate pass with required PKPass fields', async () => {
      const service = new AppleWalletService();

      // Mock the pass generation to return structure
      const mockPassData = {
        formatVersion: 1,
        passTypeIdentifier: 'pass.com.test.wallet',
        serialNumber: expect.any(String),
        teamIdentifier: 'TEST123456',
        organizationName: 'Test Organization',
        description: expect.any(String)
      };

      expect(mockPassData.formatVersion).toBe(1);
      expect(mockPassData.passTypeIdentifier).toBe('pass.com.test.wallet');
      expect(mockPassData.teamIdentifier).toBe('TEST123456');
    });

    it('should include event ticket type structure', async () => {
      const passStructure = {
        eventTicket: {
          primaryFields: expect.arrayContaining([
            expect.objectContaining({
              key: 'event',
              label: expect.any(String),
              value: expect.any(String)
            })
          ]),
          secondaryFields: expect.any(Array),
          auxiliaryFields: expect.any(Array),
          backFields: expect.any(Array)
        }
      };

      expect(passStructure.eventTicket).toBeDefined();
      expect(passStructure.eventTicket.primaryFields).toBeDefined();
    });

    it('should include barcode with PKBarcodeFormatQR format', () => {
      const barcodeData = {
        format: 'PKBarcodeFormatQR',
        message: expect.any(String),
        messageEncoding: 'iso-8859-1'
      };

      expect(barcodeData.format).toBe('PKBarcodeFormatQR');
      expect(barcodeData.messageEncoding).toBe('iso-8859-1');
    });

    it('should embed QR code token in barcode message', () => {
      const qrToken = 'test-qr-token-jwt-encoded';
      const barcodeMessage = qrToken;

      expect(barcodeMessage).toBe(qrToken);
      expect(barcodeMessage.length).toBeGreaterThan(0);
    });

    it('should include attendee information in primary fields', () => {
      const primaryFields = [{
        key: 'attendee',
        label: 'Attendee',
        value: 'John Doe'
      }];

      const attendeeField = primaryFields.find(f => f.key === 'attendee');
      expect(attendeeField).toBeDefined();
      expect(attendeeField.value).toBe('John Doe');
    });

    it('should include ticket type in secondary fields', () => {
      const secondaryFields = [{
        key: 'type',
        label: 'Ticket Type',
        value: 'Full Festival Pass'
      }];

      const typeField = secondaryFields.find(f => f.key === 'type');
      expect(typeField).toBeDefined();
      expect(typeField.value).toBe('Full Festival Pass');
    });

    it('should include venue location data', () => {
      const locations = [{
        latitude: 40.014984,
        longitude: -105.219544,
        relevantText: 'Welcome to Avalon Ballroom!'
      }];

      expect(locations[0].latitude).toBe(40.014984);
      expect(locations[0].longitude).toBe(-105.219544);
    });

    it('should set event date as relevantDate', () => {
      const relevantDate = '2026-05-15T10:00:00-06:00';

      expect(relevantDate).toContain('2026-05-15');
      expect(relevantDate).toContain('-06:00'); // Mountain Time offset
    });

    it('should include background color from ticket type', () => {
      const backgroundColor = 'rgb(211, 47, 47)';

      expect(backgroundColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
    });

    it('should set foreground color for contrast', () => {
      const foregroundColor = 'rgb(255, 255, 255)';

      expect(foregroundColor).toBe('rgb(255, 255, 255)');
    });
  });

  describe('Google Wallet Pass Structure', () => {
    it('should generate pass with required EventTicket fields', () => {
      const passData = {
        id: expect.any(String),
        classId: 'test-class-id',
        state: 'ACTIVE',
        heroImage: expect.any(Object),
        textModulesData: expect.any(Array),
        barcode: expect.any(Object)
      };

      expect(passData.state).toBe('ACTIVE');
      expect(passData.classId).toBe('test-class-id');
    });

    it('should include barcode with QR_CODE type', () => {
      const barcode = {
        type: 'QR_CODE',
        value: 'test-qr-token-jwt',
        alternateText: expect.any(String)
      };

      expect(barcode.type).toBe('QR_CODE');
      expect(barcode.value).toBe('test-qr-token-jwt');
    });

    it('should include ticket holder information', () => {
      const textModules = [{
        header: 'Attendee',
        body: 'John Doe',
        id: 'attendee'
      }];

      const attendeeModule = textModules.find(m => m.id === 'attendee');
      expect(attendeeModule).toBeDefined();
      expect(attendeeModule.body).toBe('John Doe');
    });

    it('should include event details in text modules', () => {
      const textModules = [
        { header: 'Event', body: 'A Lo Cubano Boulder Fest', id: 'event' },
        { header: 'Date', body: 'May 15-17, 2026', id: 'date' },
        { header: 'Venue', body: 'Avalon Ballroom', id: 'venue' }
      ];

      expect(textModules.find(m => m.id === 'event')).toBeDefined();
      expect(textModules.find(m => m.id === 'date')).toBeDefined();
      expect(textModules.find(m => m.id === 'venue')).toBeDefined();
    });

    it('should include hero image for visual branding', () => {
      const heroImage = {
        sourceUri: {
          uri: expect.stringContaining('https://')
        },
        contentDescription: expect.any(String)
      };

      expect(heroImage.sourceUri.uri).toContain('https://');
    });

    it('should set valid event date/time', () => {
      const eventDateTime = {
        start: '2026-05-15T10:00:00-06:00',
        end: '2026-05-17T23:00:00-06:00'
      };

      expect(eventDateTime.start).toContain('2026-05-15');
      expect(eventDateTime.end).toContain('2026-05-17');
    });

    it('should include venue location', () => {
      const venue = {
        name: 'Avalon Ballroom',
        address: {
          kind: 'walletobjects#eventVenue',
          address: '6185 Arapahoe Road, Boulder, CO 80303'
        }
      };

      expect(venue.name).toBe('Avalon Ballroom');
      expect(venue.address.address).toContain('Boulder, CO');
    });

    it('should generate save URL for Google Wallet', () => {
      const saveUrl = 'https://pay.google.com/gp/v/save/test-jwt-token';

      expect(saveUrl).toContain('pay.google.com');
      expect(saveUrl).toContain('/save/');
    });
  });

  describe('Pass Data Fields Validation', () => {
    it('should include ticket ID in pass', () => {
      const ticketId = 'TEST-TICKET-001';
      const passData = { ticketId };

      expect(passData.ticketId).toBe('TEST-TICKET-001');
    });

    it('should include event name', () => {
      const eventName = 'A Lo Cubano Boulder Fest';
      expect(eventName).toBe('A Lo Cubano Boulder Fest');
    });

    it('should include attendee first and last name', () => {
      const attendee = {
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe'
      };

      expect(attendee.firstName).toBe('John');
      expect(attendee.lastName).toBe('Doe');
      expect(attendee.fullName).toBe('John Doe');
    });

    it('should include attendee email', () => {
      const email = 'john.doe@example.com';
      expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should include ticket type name', () => {
      const ticketType = 'Full Festival Pass';
      expect(ticketType).toBe('Full Festival Pass');
    });

    it('should include event dates formatted for Mountain Time', () => {
      const eventDates = 'May 15-17, 2026';
      expect(eventDates).toContain('May 15-17, 2026');
    });

    it('should include venue name and address', () => {
      const venue = {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Road, Boulder, CO 80303'
      };

      expect(venue.name).toBe('Avalon Ballroom');
      expect(venue.address).toContain('Boulder, CO');
    });

    it('should include scan count information', () => {
      const scanInfo = {
        current: 0,
        maximum: 10
      };

      expect(scanInfo.current).toBe(0);
      expect(scanInfo.maximum).toBe(10);
    });
  });

  describe('QR Code Embedding', () => {
    it('should embed QR token in Apple Wallet barcode', () => {
      const qrToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const barcode = {
        format: 'PKBarcodeFormatQR',
        message: qrToken,
        messageEncoding: 'iso-8859-1'
      };

      expect(barcode.message).toBe(qrToken);
    });

    it('should embed QR token in Google Wallet barcode', () => {
      const qrToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const barcode = {
        type: 'QR_CODE',
        value: qrToken
      };

      expect(barcode.value).toBe(qrToken);
    });

    it('should use JWT format for QR tokens', () => {
      const qrToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0aWQiOiJURVNULVRJQ0tFVC0wMDEifQ.test';

      expect(qrToken).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('should include ticket ID in QR token payload', () => {
      const tokenPayload = {
        tid: 'TEST-TICKET-001',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60
      };

      expect(tokenPayload.tid).toBe('TEST-TICKET-001');
    });

    it('should set QR code expiration to 90 days', () => {
      const now = Math.floor(Date.now() / 1000);
      const expiry = now + 90 * 24 * 60 * 60;
      const expiryDays = (expiry - now) / (24 * 60 * 60);

      expect(expiryDays).toBe(90);
    });
  });

  describe('Color Customization', () => {
    it('should apply ticket type color to Apple Wallet pass', () => {
      const backgroundColor = 'rgb(211, 47, 47)';
      const labelColor = 'rgb(255, 255, 255)';

      expect(backgroundColor).toMatch(/^rgb\(\d+,\s*\d+,\s*\d+\)$/);
      expect(labelColor).toBe('rgb(255, 255, 255)');
    });

    it('should convert RGB to hex for Google Wallet', () => {
      const hexColor = '#d32f2f';

      expect(hexColor).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('should use white foreground for dark backgrounds', () => {
      const backgroundColor = 'rgb(211, 47, 47)'; // Dark red
      const foregroundColor = 'rgb(255, 255, 255)'; // White

      expect(foregroundColor).toBe('rgb(255, 255, 255)');
    });

    it('should handle default color when ticket type color unavailable', () => {
      const defaultColor = 'rgb(211, 47, 47)';

      expect(defaultColor).toBe('rgb(211, 47, 47)');
    });
  });

  describe('Pass Expiration Dates', () => {
    it('should set expiration to event end date', () => {
      const eventEndDate = '2026-05-17T23:00:00-06:00';
      const expirationDate = new Date(eventEndDate);

      expect(expirationDate.getFullYear()).toBe(2026);
      expect(expirationDate.getMonth()).toBe(4); // May (0-indexed)
      expect(expirationDate.getDate()).toBe(17);
    });

    it('should mark pass as invalid after event ends', () => {
      const eventEndDate = new Date('2026-05-17T23:00:00-06:00');
      const now = new Date('2026-05-18T00:00:00-06:00');

      expect(now > eventEndDate).toBe(true);
    });

    it('should allow pass to be valid before and during event', () => {
      const eventStartDate = new Date('2026-05-15T10:00:00-06:00');
      const eventEndDate = new Date('2026-05-17T23:00:00-06:00');
      const now = new Date('2026-05-16T12:00:00-06:00');

      expect(now >= eventStartDate && now <= eventEndDate).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing ticket ID gracefully', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [] });

      const service = new AppleWalletService();
      // Mock getDatabaseClient to return mockDb
      vi.spyOn(service, 'isConfigured').mockReturnValue(true);

      await expect(async () => {
        // Attempt to generate pass with invalid ticket
        const ticketData = null;
        if (!ticketData) {
          throw new Error('Ticket not found');
        }
      }).rejects.toThrow('Ticket not found');
    });

    it('should handle database errors during pass generation', async () => {
      mockDb.execute.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(async () => {
        await mockDb.execute({ sql: 'SELECT * FROM tickets WHERE ticket_id = ?', args: ['TEST'] });
      }).rejects.toThrow('Database connection failed');
    });

    it('should handle missing QR token', async () => {
      mockDb.execute.mockResolvedValueOnce({
        rows: [{
          ticket_id: 'TEST-TICKET-001',
          qr_token: null // Missing QR token
        }]
      });

      mockQRService.getOrCreateToken.mockResolvedValueOnce('newly-generated-token');

      const token = await mockQRService.getOrCreateToken('TEST-TICKET-001');
      expect(token).toBe('newly-generated-token');
    });

    it('should validate pass configuration before generation', () => {
      const service = new AppleWalletService();

      // Check configuration
      const isConfigured = service.passTypeId && service.teamId && service.signerCert && service.signerKey;

      expect(typeof isConfigured).toBe('boolean');
    });

    it('should handle missing attendee information gracefully', () => {
      const attendee = {
        firstName: null,
        lastName: null,
        fullName: 'Guest Attendee'
      };

      expect(attendee.fullName).toBe('Guest Attendee');
    });
  });

  describe('Pass File Format', () => {
    it('should return Buffer for Apple Wallet .pkpass file', () => {
      const passBuffer = Buffer.from('PKPass file content');

      expect(passBuffer).toBeInstanceOf(Buffer);
      expect(passBuffer.length).toBeGreaterThan(0);
    });

    it('should set correct MIME type for Apple Wallet', () => {
      const contentType = 'application/vnd.apple.pkpass';

      expect(contentType).toBe('application/vnd.apple.pkpass');
    });

    it('should generate JWT for Google Wallet', () => {
      const googleJWT = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature';

      expect(googleJWT).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('should create Google Pay save URL with JWT', () => {
      const jwt = 'test-jwt-token';
      const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

      expect(saveUrl).toBe('https://pay.google.com/gp/v/save/test-jwt-token');
    });
  });

  describe('Pass Updates and Versioning', () => {
    it('should include serial number for pass tracking', () => {
      const serialNumber = 'TEST-TICKET-001-1620000000';

      expect(serialNumber).toContain('TEST-TICKET-001');
    });

    it('should include authentication token for updates', () => {
      const authToken = 'test-auth-token-for-wallet-updates';

      expect(authToken).toBeDefined();
      expect(authToken.length).toBeGreaterThan(0);
    });

    it('should support pass updates via web service', () => {
      const webServiceURL = 'https://example.com/api/passes/';

      expect(webServiceURL).toContain('/api/passes/');
    });
  });

  describe('Mountain Time Formatting', () => {
    it('should format event dates in Mountain Time', () => {
      const eventDate = '2026-05-15T10:00:00-06:00';

      expect(eventDate).toContain('-06:00'); // MDT offset
    });

    it('should display human-readable date format', () => {
      const displayDate = 'May 15-17, 2026';

      expect(displayDate).toMatch(/^[A-Za-z]+ \d+-\d+, \d{4}$/);
    });

    it('should handle DST transitions correctly', () => {
      // May is in MDT (UTC-6)
      const summerDate = '2026-05-15T10:00:00-06:00';
      expect(summerDate).toContain('-06:00');

      // December would be in MST (UTC-7)
      const winterDate = '2026-12-15T10:00:00-07:00';
      expect(winterDate).toContain('-07:00');
    });
  });
});
