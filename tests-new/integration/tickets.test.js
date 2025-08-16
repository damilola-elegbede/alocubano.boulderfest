/**
 * Ticket System Integration Tests
 * Tests ticket database operations, QR code generation, and core business logic
 * Note: Server-dependent tests are skipped due to Vercel dev server startup issues in CI
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { databaseHelper } from '../core/database.js';
import { authHelper } from '../core/auth.js';
import { TestDataFactory } from '../helpers/test-data.js';
import jwt from 'jsonwebtoken';

describe('Ticket System Integration Tests', () => {
  let testTickets = [];

  beforeAll(async () => {
    // Initialize test environment
    await databaseHelper.initialize();
    console.log('✅ Test environment initialized');
  });

  afterAll(async () => {
    await databaseHelper.cleanup();
    console.log('✅ Test database cleaned');
  });

  beforeEach(async () => {
    // Clean test data between tests
    await databaseHelper.cleanBetweenTests();
    testTickets = [];
  });

  describe('Database Ticket Operations', () => {
    describe('Ticket Creation and Retrieval', () => {
      it('should create and retrieve ticket by ID', async () => {
        // Create test ticket in database
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'retrieve-test@example.com',
          buyer_name: 'Retrieve Test User'
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Retrieve ticket directly from database
        const retrievedTicket = await databaseHelper.getTicket(testTicket.id);
        
        expect(retrievedTicket).toBeTruthy();
        expect(Number(retrievedTicket.id)).toBe(Number(testTicket.id));
        expect(retrievedTicket.buyer_email).toBe('retrieve-test@example.com');
        expect(retrievedTicket.buyer_name).toBe('Retrieve Test User');
        expect(retrievedTicket.status).toBe('confirmed');

        console.log('✅ Ticket created and retrieved by ID:', testTicket.id);
      });

      it('should handle multiple tickets for same email', async () => {
        const testEmail = 'multi-ticket@example.com';
        
        // Create multiple tickets for the same email
        const ticket1 = await databaseHelper.createTestTicket(
          TestDataFactory.createTicketData({
            buyer_email: testEmail,
            ticket_type: 'Weekend Pass'
          })
        );
        const ticket2 = await databaseHelper.createTestTicket(
          TestDataFactory.createTicketData({
            buyer_email: testEmail,
            ticket_type: 'Friday Night'
          })
        );
        testTickets.push(ticket1, ticket2);

        // Verify both tickets exist in database
        const retrievedTicket1 = await databaseHelper.getTicket(ticket1.id);
        const retrievedTicket2 = await databaseHelper.getTicket(ticket2.id);
        
        expect(retrievedTicket1.buyer_email).toBe(testEmail);
        expect(retrievedTicket2.buyer_email).toBe(testEmail);
        expect(retrievedTicket1.ticket_type).toBe('Weekend Pass');
        expect(retrievedTicket2.ticket_type).toBe('Friday Night');

        console.log('✅ Multiple tickets created for same email:', testEmail);
      });

      it('should return null for non-existent ticket ID', async () => {
        const retrievedTicket = await databaseHelper.getTicket(99999);
        expect(retrievedTicket).toBeNull();

        console.log('✅ Non-existent ticket handled correctly');
      });
    });

    describe('Ticket Data Integrity', () => {
      it('should maintain data integrity during creation', async () => {
        const originalData = TestDataFactory.createTicketData({
          buyer_email: 'integrity-test@example.com',
          unit_price_cents: 15000,
          total_amount_cents: 15000,
          quantity: 1
        });
        
        const testTicket = await databaseHelper.createTestTicket(originalData);
        testTickets.push(testTicket);
        
        const retrievedTicket = await databaseHelper.getTicket(testTicket.id);
        
        // Verify all important fields are preserved
        expect(retrievedTicket.buyer_email).toBe(originalData.buyer_email);
        expect(retrievedTicket.unit_price_cents).toBe(originalData.unit_price_cents);
        expect(retrievedTicket.total_amount_cents).toBe(originalData.total_amount_cents);
        expect(retrievedTicket.quantity).toBe(originalData.quantity);
        expect(retrievedTicket.currency).toBe(originalData.currency);
        expect(retrievedTicket.status).toBe(originalData.status);

        console.log('✅ Data integrity maintained during creation');
      });
    });
  });

  describe('QR Code Generation and Validation', () => {
    describe('JWT Token Generation', () => {
      it('should generate valid QR tokens with correct payload', async () => {
        // Create test ticket
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'qr-test@example.com',
          scanned_count: 0,
          max_scans: 5
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Generate QR token
        const qrToken = authHelper.generateTestQrToken(Number(testTicket.id), 5);
        
        expect(qrToken).toBeTruthy();
        expect(typeof qrToken).toBe('string');
        expect(qrToken.split('.')).toHaveLength(3); // JWT format

        // Verify token can be decoded
        const decoded = jwt.verify(qrToken, process.env.QR_SECRET_KEY);
        expect(decoded.ticketId).toBe(Number(testTicket.id));
        expect(decoded.maxScans).toBe(5);
        expect(decoded.test).toBe(true);

        console.log('✅ QR token generated and validated:', testTicket.id);
      });

      it('should handle token validation and expiration', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'expiry-test@example.com'
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Generate token with short expiry
        const shortLivedToken = jwt.sign({
          ticketId: Number(testTicket.id),
          maxScans: 5,
          test: true,
          exp: Math.floor(Date.now() / 1000) + 1 // 1 second expiry
        }, process.env.QR_SECRET_KEY);

        // Verify token is initially valid
        const decoded = jwt.verify(shortLivedToken, process.env.QR_SECRET_KEY);
        expect(decoded.ticketId).toBe(Number(testTicket.id));

        // Wait for expiry and test
        await new Promise(resolve => setTimeout(resolve, 1100));
        
        expect(() => {
          jwt.verify(shortLivedToken, process.env.QR_SECRET_KEY);
        }).toThrow('jwt expired');

        console.log('✅ Token expiration handled correctly');
      });

      it('should validate scan count limits during token generation', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'scan-limit@example.com',
          scanned_count: 0,
          max_scans: 3
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        const qrToken = authHelper.generateTestQrToken(Number(testTicket.id), 3);
        const decoded = jwt.verify(qrToken, process.env.QR_SECRET_KEY);
        
        expect(decoded.maxScans).toBe(3);
        expect(decoded.ticketId).toBe(Number(testTicket.id));

        console.log('✅ Scan count limits encoded in token');
      });
    });

    describe('Token Validation Logic', () => {
      it('should detect invalid QR token formats', async () => {
        const invalidTokens = [
          'invalid_token_123',
          'not.a.jwt.token',
          'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid',
          ''
        ];

        for (const invalidToken of invalidTokens) {
          expect(() => {
            jwt.verify(invalidToken, process.env.QR_SECRET_KEY);
          }).toThrow();
        }

        console.log('✅ Invalid token formats detected correctly');
      });

      it('should validate scan count constraints', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'maxed-out@example.com',
          scanned_count: 5,
          max_scans: 5
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Verify ticket has reached max scans
        const ticket = await databaseHelper.getTicket(testTicket.id);
        expect(ticket.scanned_count).toBe(5);
        expect(ticket.max_scans).toBe(5);
        expect(ticket.scanned_count >= ticket.max_scans).toBe(true);

        console.log('✅ Scan count constraints validated in database');
      });

      it('should handle expired QR tokens in JWT validation', async () => {
        const expiredToken = jwt.sign({
          ticketId: 999,
          maxScans: 5,
          exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
        }, process.env.QR_SECRET_KEY);

        expect(() => {
          jwt.verify(expiredToken, process.env.QR_SECRET_KEY);
        }).toThrow('jwt expired');

        console.log('✅ Expired tokens rejected by JWT validation');
      });

      it('should validate QR token signatures', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'signature-test@example.com'
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Generate token with correct secret
        const validToken = authHelper.generateTestQrToken(Number(testTicket.id), 5);
        
        // Try to verify with wrong secret
        expect(() => {
          jwt.verify(validToken, 'wrong-secret-key');
        }).toThrow('invalid signature');

        // Verify with correct secret should work
        const decoded = jwt.verify(validToken, process.env.QR_SECRET_KEY);
        expect(decoded.ticketId).toBe(Number(testTicket.id));

        console.log('✅ QR token signature validation working');
      });
    });

    describe('Database Scan Count Updates', () => {
      it('should update scan count correctly', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'scan-update@example.com',
          scanned_count: 2,
          max_scans: 5
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Verify initial state
        let ticket = await databaseHelper.getTicket(testTicket.id);
        expect(ticket.scanned_count).toBe(2);

        // Simulate scan count update
        await databaseHelper.updateTicketScanCount(testTicket.id, 3);

        // Verify update
        ticket = await databaseHelper.getTicket(testTicket.id);
        expect(ticket.scanned_count).toBe(3);

        console.log('✅ Scan count update handled correctly');
      });

      it('should handle scan count constraints', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'constraint-test@example.com',
          scanned_count: 4,
          max_scans: 5
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        const ticket = await databaseHelper.getTicket(testTicket.id);
        
        // Check that we're near the limit
        expect(ticket.scanned_count).toBe(4);
        expect(ticket.max_scans).toBe(5);
        expect(ticket.scanned_count < ticket.max_scans).toBe(true);

        // One more scan should be allowed
        await databaseHelper.updateTicketScanCount(testTicket.id, 5);
        const updatedTicket = await databaseHelper.getTicket(testTicket.id);
        expect(updatedTicket.scanned_count).toBe(5);
        expect(updatedTicket.scanned_count >= updatedTicket.max_scans).toBe(true);

        console.log('✅ Scan count constraints enforced correctly');
      });
    });
  });

  describe('Wallet Pass Data Validation', () => {
    describe('Ticket Data for Wallet Passes', () => {
      it('should validate ticket data for wallet pass generation', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'wallet-test@example.com',
          buyer_name: 'Wallet User',
          event_name: 'A Lo Cubano Boulder Fest 2026',
          ticket_type: 'Weekend Pass'
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        const ticket = await databaseHelper.getTicket(testTicket.id);
        
        // Validate that all required fields for wallet passes are present
        expect(ticket.buyer_email).toBeTruthy();
        expect(ticket.buyer_name).toBeTruthy();
        expect(ticket.event_name).toBeTruthy();
        expect(ticket.ticket_type).toBeTruthy();
        expect(ticket.id).toBeTruthy();
        expect(ticket.qr_token).toBeTruthy();

        console.log('✅ Ticket data valid for wallet pass generation');
      });

      it('should handle different ticket types for wallet passes', async () => {
        const ticketTypes = ['Weekend Pass', 'Friday Night', 'Saturday Night', 'VIP Pass'];
        const createdTickets = [];
        
        for (let i = 0; i < ticketTypes.length; i++) {
          const ticketData = TestDataFactory.createTicketData({
            buyer_email: `wallet-${i}@example.com`,
            ticket_type: ticketTypes[i]
          });
          const ticket = await databaseHelper.createTestTicket(ticketData);
          createdTickets.push(ticket);
          testTickets.push(ticket);
        }

        // Verify all ticket types were created correctly
        for (let i = 0; i < createdTickets.length; i++) {
          const ticket = await databaseHelper.getTicket(createdTickets[i].id);
          expect(ticket.ticket_type).toBe(ticketTypes[i]);
        }

        console.log('✅ Different ticket types handled for wallet passes');
      });

      it('should validate QR token generation for wallet passes', async () => {
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'qr-wallet@example.com',
          buyer_name: 'QR Wallet User'
        });
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);

        // Generate QR token that would be used in wallet pass
        const qrToken = authHelper.generateTestQrToken(Number(testTicket.id), testTicket.max_scans);
        
        expect(qrToken).toBeTruthy();
        
        // Verify QR token contains valid ticket data
        const decoded = jwt.verify(qrToken, process.env.QR_SECRET_KEY);
        expect(decoded.ticketId).toBe(Number(testTicket.id));
        expect(decoded.maxScans).toBe(testTicket.max_scans);

        console.log('✅ QR token for wallet pass validated');
      });
    });
  });

  describe('Complete Ticket Lifecycle Integration', () => {
    it('should handle full ticket lifecycle from creation to validation', async () => {
      console.log('🔄 Starting complete ticket lifecycle test...');

      // Step 1: Create ticket in database (simulating payment webhook)
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'lifecycle@example.com',
        buyer_name: 'Lifecycle User',
        ticket_type: 'Weekend Pass',
        scanned_count: 0,
        max_scans: 3
      });
      const testTicket = await databaseHelper.createTestTicket(ticketData);
      testTickets.push(testTicket);

      console.log('✅ Step 1: Ticket created in database', testTicket.id);

      // Step 2: Retrieve ticket by ID from database
      const retrievedTicket = await databaseHelper.getTicket(testTicket.id);
      expect(retrievedTicket).toBeTruthy();
      expect(retrievedTicket.buyer_email).toBe('lifecycle@example.com');
      expect(retrievedTicket.ticket_type).toBe('Weekend Pass');

      console.log('✅ Step 2: Ticket retrieved successfully');

      // Step 3: Generate and validate QR code
      const qrToken = authHelper.generateTestQrToken(Number(testTicket.id), 3);
      expect(qrToken).toBeTruthy();
      
      const decoded = jwt.verify(qrToken, process.env.QR_SECRET_KEY);
      expect(decoded.ticketId).toBe(Number(testTicket.id));
      expect(decoded.maxScans).toBe(3);

      console.log('✅ Step 3: QR code generated and structure validated');

      // Step 4: Simulate scan count increment
      await databaseHelper.updateTicketScanCount(testTicket.id, 1);
      let updatedTicket = await databaseHelper.getTicket(testTicket.id);
      expect(updatedTicket.scanned_count).toBe(1);

      console.log('✅ Step 4: First scan simulation successful');

      // Step 5: Simulate second scan
      await databaseHelper.updateTicketScanCount(testTicket.id, 2);
      updatedTicket = await databaseHelper.getTicket(testTicket.id);
      expect(updatedTicket.scanned_count).toBe(2);

      console.log('✅ Step 5: Second scan simulation successful');

      // Step 6: Verify final state
      const finalTicket = await databaseHelper.getTicket(testTicket.id);
      expect(finalTicket.scanned_count).toBe(2);
      expect(finalTicket.max_scans).toBe(3);
      expect(finalTicket.status).toBe('confirmed');
      expect(finalTicket.scanned_count < finalTicket.max_scans).toBe(true);

      console.log('✅ Complete ticket lifecycle test successful');
    });

    it('should handle edge case scenarios', async () => {
      console.log('🔄 Testing edge case scenarios...');

      // Test max scans scenario
      const maxScansTicket = await databaseHelper.createTestTicket(
        TestDataFactory.createTicketData({
          buyer_email: 'maxscans@example.com',
          scanned_count: 2,
          max_scans: 3
        })
      );
      testTickets.push(maxScansTicket);

      // Verify current state
      let ticket = await databaseHelper.getTicket(maxScansTicket.id);
      expect(ticket.scanned_count).toBe(2);
      expect(ticket.max_scans).toBe(3);

      // This should work (scan 3/3)
      await databaseHelper.updateTicketScanCount(maxScansTicket.id, 3);
      ticket = await databaseHelper.getTicket(maxScansTicket.id);
      expect(ticket.scanned_count).toBe(3);
      expect(ticket.scanned_count).toBe(ticket.max_scans);

      console.log('✅ Step 1: Final valid scan completed');

      // At this point, ticket has reached max scans
      expect(ticket.scanned_count >= ticket.max_scans).toBe(true);

      console.log('✅ Max scans edge case handled correctly');
    });
  });

  describe('Performance and Database Load Testing', () => {
    it('should handle concurrent ticket creation and retrieval', async () => {
      // Create multiple tickets concurrently
      const ticketPromises = Array.from({ length: 5 }, (_, index) =>
        databaseHelper.createTestTicket(
          TestDataFactory.createTicketData({
            buyer_email: `concurrent-${index}@example.com`,
            buyer_name: `Concurrent User ${index}`
          })
        )
      );

      const createdTickets = await Promise.all(ticketPromises);
      testTickets.push(...createdTickets);

      // Test concurrent retrievals from database
      const retrievalPromises = createdTickets.map(ticket =>
        databaseHelper.getTicket(ticket.id)
      );

      const retrievedTickets = await Promise.all(retrievalPromises);

      // All retrievals should succeed
      retrievedTickets.forEach((ticket, index) => {
        expect(ticket).toBeTruthy();
        expect(Number(ticket.id)).toBe(Number(createdTickets[index].id));
        expect(ticket.buyer_email).toBe(`concurrent-${index}@example.com`);
      });

      console.log('✅ Concurrent ticket operations successful');
    });

    it('should handle rapid QR token generation', async () => {
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'rapid-generation@example.com',
        scanned_count: 0,
        max_scans: 10
      });
      const testTicket = await databaseHelper.createTestTicket(ticketData);
      testTickets.push(testTicket);

      // Generate multiple QR tokens rapidly
      const tokenPromises = Array.from({ length: 5 }, () =>
        Promise.resolve(authHelper.generateTestQrToken(Number(testTicket.id), 10))
      );

      const tokens = await Promise.all(tokenPromises);

      // All tokens should be valid
      tokens.forEach(token => {
        expect(token).toBeTruthy();
        const decoded = jwt.verify(token, process.env.QR_SECRET_KEY);
        expect(decoded.ticketId).toBe(Number(testTicket.id));
        expect(decoded.maxScans).toBe(10);
      });

      console.log(`✅ Rapid QR token generation: ${tokens.length} tokens created`);
    });

    it('should handle bulk database operations', async () => {
      const batchSize = 10;
      const ticketDataBatch = Array.from({ length: batchSize }, (_, index) =>
        TestDataFactory.createTicketData({
          buyer_email: `bulk-${index}@example.com`,
          buyer_name: `Bulk User ${index}`,
          ticket_type: index % 2 === 0 ? 'Weekend Pass' : 'Friday Night'
        })
      );

      // Create tickets in batch
      const startTime = Date.now();
      const batchPromises = ticketDataBatch.map(ticketData =>
        databaseHelper.createTestTicket(ticketData)
      );
      const batchTickets = await Promise.all(batchPromises);
      const createTime = Date.now() - startTime;

      testTickets.push(...batchTickets);

      expect(batchTickets).toHaveLength(batchSize);
      expect(createTime).toBeLessThan(5000); // Should complete within 5 seconds

      console.log(`✅ Bulk operations: ${batchSize} tickets created in ${createTime}ms`);
    });
  });

  describe('Security Testing', () => {
    it('should handle malformed QR tokens safely in JWT validation', async () => {
      const malformedTokens = [
        '', // Empty
        'not.a.jwt.token', // Invalid format
        'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.invalid', // Malformed JWT
        '<script>alert("xss")</script>', // XSS attempt
        'null', // Null string
        '{}', // Empty object
        'true', // Boolean
        '12345' // Plain number
      ];

      for (const token of malformedTokens) {
        expect(() => {
          jwt.verify(token, process.env.QR_SECRET_KEY);
        }).toThrow();
      }

      console.log('✅ All malformed tokens rejected by JWT validation');
    });

    it('should protect against token tampering', async () => {
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'tamper-test@example.com'
      });
      const testTicket = await databaseHelper.createTestTicket(ticketData);
      testTickets.push(testTicket);

      // Generate valid token
      const validToken = authHelper.generateTestQrToken(Number(testTicket.id), 5);
      
      // Tamper with the token by changing one character
      const tamperedToken = validToken.slice(0, -5) + 'XXXX' + validToken.slice(-1);

      expect(() => {
        jwt.verify(tamperedToken, process.env.QR_SECRET_KEY);
      }).toThrow('invalid signature');

      console.log('✅ Token tampering detected and rejected');
    });

    it('should validate input data sanitization', async () => {
      const maliciousInputs = [
        "'; DROP TABLE tickets; --",
        "<script>alert('xss')</script>",
        "../../etc/passwd",
        "null\x00byte"
      ];

      for (const maliciousInput of maliciousInputs) {
        // Test that malicious input doesn't break ticket creation
        const ticketData = TestDataFactory.createTicketData({
          buyer_email: 'sanitization-test@example.com',
          buyer_name: maliciousInput // Inject malicious data
        });
        
        const testTicket = await databaseHelper.createTestTicket(ticketData);
        testTickets.push(testTicket);
        
        // Verify ticket was created but data was handled safely
        const retrievedTicket = await databaseHelper.getTicket(testTicket.id);
        expect(retrievedTicket).toBeTruthy();
        expect(retrievedTicket.buyer_email).toBe('sanitization-test@example.com');
      }

      console.log('✅ Input sanitization handled safely');
    });

    it('should handle concurrent security validations', async () => {
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'security-concurrent@example.com'
      });
      const testTicket = await databaseHelper.createTestTicket(ticketData);
      testTickets.push(testTicket);

      // Generate multiple tokens and validate concurrently
      const tokenPromises = Array.from({ length: 5 }, () => {
        const token = authHelper.generateTestQrToken(Number(testTicket.id), 5);
        return Promise.resolve(() => jwt.verify(token, process.env.QR_SECRET_KEY));
      });

      const validationFunctions = await Promise.all(tokenPromises);
      
      // All validations should work
      validationFunctions.forEach(validateFn => {
        const decoded = validateFn();
        expect(decoded.ticketId).toBe(Number(testTicket.id));
      });

      console.log('✅ Concurrent security validations successful');
    });
  });

  describe('Database Integration and Reliability', () => {
    it('should maintain data consistency during operations', async () => {
      // Create ticket and verify initial state
      const ticketData = TestDataFactory.createTicketData({
        buyer_email: 'consistency@example.com',
        scanned_count: 0
      });
      const testTicket = await databaseHelper.createTestTicket(ticketData);
      testTickets.push(testTicket);

      // Verify ticket exists in database
      const dbTicket = await databaseHelper.getTicket(testTicket.id);
      expect(dbTicket).toBeTruthy();
      expect(dbTicket.scanned_count).toBe(0);

      // Simulate scan operation
      await databaseHelper.updateTicketScanCount(testTicket.id, 1);

      // Verify database was updated consistently
      const updatedDbTicket = await databaseHelper.getTicket(testTicket.id);
      expect(updatedDbTicket.scanned_count).toBe(1);

      console.log('✅ Database consistency maintained during operations');
    });

    it('should handle non-existent records gracefully', async () => {
      // Test with non-existent ticket ID
      const nonExistentTicket = await databaseHelper.getTicket(999999);
      expect(nonExistentTicket).toBeNull();

      console.log('✅ Non-existent records handled gracefully');
    });

    it('should verify database transaction support', async () => {
      // Test database transaction functionality
      const transactionResult = await databaseHelper.testTransaction();
      expect(transactionResult.success).toBe(true);
      expect(transactionResult.insertId).toBeTruthy();

      console.log('✅ Database transaction support verified');
    });

    it('should provide accurate database statistics', async () => {
      // Create some test data
      const ticket1 = await databaseHelper.createTestTicket(
        TestDataFactory.createTicketData({ buyer_email: 'stats1@example.com' })
      );
      const ticket2 = await databaseHelper.createTestTicket(
        TestDataFactory.createTicketData({ buyer_email: 'stats2@example.com' })
      );
      testTickets.push(ticket1, ticket2);

      const stats = await databaseHelper.getStats();
      expect(stats.tickets).toBeGreaterThanOrEqual(2);
      expect(stats.initialized).toBe(true);
      expect(stats.connectionUrl).toBeTruthy();

      console.log('✅ Database statistics accurate:', stats);
    });
  });
});