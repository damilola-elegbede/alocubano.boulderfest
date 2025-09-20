/**
 * Audit Trigger Testing Utilities
 *
 * Comprehensive testing framework for database audit triggers to ensure:
 * - Triggers fire correctly for tracked tables
 * - Before/after values are captured accurately
 * - JSON fields are properly populated
 * - Performance impact is minimal
 * - Concurrent operations are handled correctly
 */

import { getDatabaseClient } from './database.js';

/**
 * Create a comprehensive test suite for audit triggers
 */
export function createTriggerTestSuite(db) {
  return {
    async runAllTests() {
      const tests = [
        this.testTicketsInsertTrigger,
        this.testTicketsUpdateTrigger,
        this.testTransactionsInsertTrigger,
        this.testTransactionsUpdateTrigger,
        this.testAdminSessionsInsertTrigger,
        this.testAdminSessionsUpdateTrigger,
        this.testPaymentEventsInsertTrigger,
        this.testPaymentEventsUpdateTrigger,
        this.testConcurrentOperations,
        this.testNullValueHandling,
        this.testPerformanceImpact,
        this.testJSONFieldStructure
      ];

      const results = { total: 0, passed: 0, failed: 0, details: [] };

      for (const test of tests) {
        results.total++;
        try {
          await test.call(this);
          results.passed++;
          results.details.push({ name: test.name, passed: true });
        } catch (error) {
          results.failed++;
          results.details.push({ name: test.name, passed: false, error: error.message });
        }
      }

      return results;
    },

    /**
     * Test tickets table INSERT trigger
     */
    async testTicketsInsertTrigger() {
      // Clear any existing audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // First, create a test transaction to satisfy foreign key constraint
      const transactionId = 'TEST_TXN_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 7500, 'USD',
        'test@example.com', 'Test Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Insert a test ticket
      const testTicket = {
        ticket_id: 'TEST_' + Date.now(),
        transaction_id: dbTransactionId,
        ticket_type: 'general_admission',
        event_id: 'test_event_2026',
        price_cents: 7500,
        attendee_email: 'test@example.com',
        attendee_first_name: 'Test',
        attendee_last_name: 'User',
        status: 'valid',
        registration_status: 'pending'
      };

      await db.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, attendee_first_name, attendee_last_name, status, registration_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        testTicket.ticket_id, testTicket.transaction_id, testTicket.ticket_type,
        testTicket.event_id, testTicket.price_cents, testTicket.attendee_email,
        testTicket.attendee_first_name, testTicket.attendee_last_name,
        testTicket.status, testTicket.registration_status
      ]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'ticket_created'
        AND target_type = 'ticket'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for ticket insert');
      }

      const log = auditLog.rows[0];

      // Verify audit log fields
      if (log.event_type !== 'data_change') {
        throw new Error(`Expected event_type 'data_change', got '${log.event_type}'`);
      }

      if (log.data_subject_id !== testTicket.attendee_email) {
        throw new Error(`Expected data_subject_id '${testTicket.attendee_email}', got '${log.data_subject_id}'`);
      }

      // Verify JSON fields
      const afterValue = JSON.parse(log.after_value);
      if (afterValue.ticket_id !== testTicket.ticket_id) {
        throw new Error(`Expected ticket_id '${testTicket.ticket_id}' in after_value`);
      }

      const changedFields = JSON.parse(log.changed_fields);
      if (!changedFields.includes('ticket_id')) {
        throw new Error('Expected changed_fields to include ticket_id');
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE ticket_id = ?", [testTicket.ticket_id]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test tickets table UPDATE trigger
     */
    async testTicketsUpdateTrigger() {
      // First, create a test transaction
      const transactionId = 'TEST_TXN_UPD_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 7500, 'USD',
        'original@example.com', 'Original Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Create a test ticket first
      const ticketId = 'TEST_UPD_' + Date.now();
      const insertResult = await db.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, attendee_first_name, attendee_last_name, status, registration_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        ticketId, dbTransactionId, 'general_admission', 'test_event_2026', 7500,
        'original@example.com', 'Original', 'User', 'valid', 'pending'
      ]);

      const ticketDbId = insertResult.rows[0].id;

      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Update the ticket
      await db.execute(`
        UPDATE tickets
        SET attendee_email = ?, attendee_first_name = ?, registration_status = ?
        WHERE id = ?
      `, ['updated@example.com', 'Updated', 'completed', ticketDbId]);

      // Check audit log was created (check multiple possible action names)
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE (action = 'ticket_updated' OR action LIKE '%ticket%' OR action LIKE '%registration%')
        AND target_type = 'ticket'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        // Debug: Check if any audit logs were created at all
        const allLogs = await db.execute(`
          SELECT action, event_type, source_service, target_type FROM audit_logs
          WHERE source_service = 'audit_trigger'
          ORDER BY created_at DESC
          LIMIT 5
        `);
        console.log('Available audit logs for ticket update:', allLogs.rows);
        throw new Error('No audit log created for ticket update');
      }

      const log = auditLog.rows[0];

      // Verify before and after values
      const beforeValue = JSON.parse(log.before_value);
      const afterValue = JSON.parse(log.after_value);

      if (beforeValue.attendee_email !== 'original@example.com') {
        throw new Error('Before value email mismatch');
      }

      if (afterValue.attendee_email !== 'updated@example.com') {
        throw new Error('After value email mismatch');
      }

      // Verify changed fields
      const changedFields = JSON.parse(log.changed_fields);
      if (!changedFields.includes('attendee_email') || !changedFields.includes('attendee_first_name')) {
        throw new Error('Changed fields missing expected values');
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE id = ?", [ticketDbId]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test transactions table INSERT trigger
     */
    async testTransactionsInsertTrigger() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Insert a test transaction
      const transactionId = 'TEST_TXN_' + Date.now();
      await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        transactionId, 'tickets', 'pending', 15000, 'USD',
        'customer@example.com', 'Test Customer', '{}', 'test_event_2026'
      ]);

      // Check audit log was created (may take a moment)
      await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay for trigger

      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'transaction_created'
        AND event_type = 'financial_event'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        // Debug: Check if any audit logs were created at all
        const allLogs = await db.execute(`
          SELECT action, event_type, source_service FROM audit_logs
          WHERE source_service = 'audit_trigger'
          ORDER BY created_at DESC
          LIMIT 5
        `);
        console.log('Available audit logs:', allLogs.rows);
        throw new Error('No audit log created for transaction insert');
      }

      const log = auditLog.rows[0];

      // Verify financial fields
      if (log.amount_cents !== 15000) {
        throw new Error(`Expected amount_cents 15000, got ${log.amount_cents}`);
      }

      if (log.currency !== 'USD') {
        throw new Error(`Expected currency USD, got ${log.currency}`);
      }

      if (log.transaction_reference !== transactionId) {
        throw new Error(`Expected transaction_reference ${transactionId}, got ${log.transaction_reference}`);
      }

      // Verify metadata risk assessment for large transaction
      const metadata = JSON.parse(log.metadata);
      if (metadata.risk_assessment !== 'low') {
        throw new Error(`Expected risk_assessment 'low' for $150 transaction, got '${metadata.risk_assessment}'`);
      }

      // Cleanup
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test transactions table UPDATE trigger
     */
    async testTransactionsUpdateTrigger() {
      // Create a test transaction first
      const transactionId = 'TEST_TXN_UPD_' + Date.now();
      const insertResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'pending', 10000, 'USD',
        'customer@example.com', 'Test Customer', '{}', 'test_event_2026'
      ]);

      const txnDbId = insertResult.rows[0].id;

      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Update transaction status (critical change from completed to refunded)
      await db.execute(`
        UPDATE transactions
        SET status = 'completed'
        WHERE id = ?
      `, [txnDbId]);

      // Clear audit logs from the status setting
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Now update to refunded (this should trigger critical severity)
      await db.execute(`
        UPDATE transactions
        SET status = ?
        WHERE id = ?
      `, ['refunded', txnDbId]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'transaction_status_changed'
        AND event_type = 'financial_event'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for transaction status update');
      }

      const log = auditLog.rows[0];

      // Verify before and after values
      const beforeValue = JSON.parse(log.before_value);
      const afterValue = JSON.parse(log.after_value);

      if (beforeValue.status !== 'pending') {
        throw new Error('Before value status mismatch');
      }

      if (afterValue.status !== 'refunded') {
        throw new Error('After value status mismatch');
      }

      // Verify critical severity for refund
      if (log.severity !== 'critical') {
        throw new Error(`Expected critical severity for refund, got ${log.severity}`);
      }

      // Cleanup
      await db.execute("DELETE FROM transactions WHERE id = ?", [txnDbId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test admin_sessions table INSERT trigger
     */
    async testAdminSessionsInsertTrigger() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Insert a test admin session
      const sessionToken = 'sess_test_' + Date.now();
      await db.execute(`
        INSERT INTO admin_sessions (
          session_token, ip_address, user_agent, mfa_verified, is_active, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        sessionToken, '192.168.1.100', 'Test Browser', 0, 1,
        new Date(Date.now() + 3600000).toISOString() // 1 hour from now
      ]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'admin_session_created'
        AND event_type = 'admin_access'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for admin session insert');
      }

      const log = auditLog.rows[0];

      // Verify admin access fields
      if (log.admin_user !== 'admin') {
        throw new Error(`Expected admin_user 'admin', got '${log.admin_user}'`);
      }

      if (log.ip_address !== '192.168.1.100') {
        throw new Error(`Expected ip_address '192.168.1.100', got '${log.ip_address}'`);
      }

      // Verify session token is masked
      const afterValue = JSON.parse(log.after_value);
      if (!afterValue.session_token.endsWith('...')) {
        throw new Error('Session token should be masked in audit log');
      }

      // Verify high risk for unverified MFA
      if (log.severity !== 'warning') {
        throw new Error(`Expected warning severity for unverified MFA, got ${log.severity}`);
      }

      // Cleanup
      await db.execute("DELETE FROM admin_sessions WHERE session_token = ?", [sessionToken]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test admin_sessions table UPDATE trigger
     */
    async testAdminSessionsUpdateTrigger() {
      // Create a test admin session first
      const sessionToken = 'sess_test_upd_' + Date.now();
      const insertResult = await db.execute(`
        INSERT INTO admin_sessions (
          session_token, ip_address, user_agent, mfa_verified, is_active, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        sessionToken, '192.168.1.100', 'Test Browser', 0, 1,
        new Date(Date.now() + 3600000).toISOString()
      ]);

      const sessionDbId = insertResult.rows[0].id;

      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Update MFA verification status
      await db.execute(`
        UPDATE admin_sessions
        SET mfa_verified = ?, mfa_verified_at = ?
        WHERE id = ?
      `, [1, new Date().toISOString(), sessionDbId]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'admin_mfa_status_changed'
        AND event_type = 'admin_access'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for admin session MFA update');
      }

      const log = auditLog.rows[0];

      // Verify before and after values
      const beforeValue = JSON.parse(log.before_value);
      const afterValue = JSON.parse(log.after_value);

      if (beforeValue.mfa_verified !== 0) {
        throw new Error('Before value mfa_verified mismatch');
      }

      if (afterValue.mfa_verified !== 1) {
        throw new Error('After value mfa_verified mismatch');
      }

      // Cleanup
      await db.execute("DELETE FROM admin_sessions WHERE id = ?", [sessionDbId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test payment_events table INSERT trigger
     */
    async testPaymentEventsInsertTrigger() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // First create a test transaction
      const transactionId = 'TEST_PE_TXN_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 10000, 'USD',
        'payment_test@example.com', 'Payment Test Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Insert a test payment event
      const eventId = 'evt_test_' + Date.now();
      await db.execute(`
        INSERT INTO payment_events (
          event_id, event_type, event_source, transaction_id,
          stripe_session_id, event_data, processing_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        eventId, 'payment_intent.succeeded', 'stripe', dbTransactionId,
        'cs_test_123', '{"test": "data"}', 'pending'
      ]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'payment_event_received'
        AND event_type = 'payment_processing'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for payment event insert');
      }

      const log = auditLog.rows[0];

      // Verify payment processing fields
      if (log.payment_status !== 'pending') {
        throw new Error(`Expected payment_status 'pending', got '${log.payment_status}'`);
      }

      if (log.transaction_reference !== 'cs_test_123') {
        throw new Error(`Expected transaction_reference 'cs_test_123', got '${log.transaction_reference}'`);
      }

      // Verify metadata
      const metadata = JSON.parse(log.metadata);
      if (metadata.event_classification !== 'payment_intent.succeeded') {
        throw new Error('Event classification mismatch in metadata');
      }

      // Cleanup
      await db.execute("DELETE FROM payment_events WHERE event_id = ?", [eventId]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test payment_events table UPDATE trigger
     */
    async testPaymentEventsUpdateTrigger() {
      // First create a test transaction
      const transactionId = 'TEST_PE_UPD_TXN_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 10000, 'USD',
        'payment_update_test@example.com', 'Payment Update Test Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Create a test payment event first
      const eventId = 'evt_test_upd_' + Date.now();
      const insertResult = await db.execute(`
        INSERT INTO payment_events (
          event_id, event_type, event_source, transaction_id,
          stripe_session_id, event_data, processing_status, retry_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        eventId, 'payment_intent.failed', 'stripe', dbTransactionId,
        'cs_test_456', '{"test": "data"}', 'pending', 0
      ]);

      const eventDbId = insertResult.rows[0].id;

      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // Update processing status to failed
      await db.execute(`
        UPDATE payment_events
        SET processing_status = ?, retry_count = ?, error_message = ?
        WHERE id = ?
      `, ['failed', 1, 'Processing error occurred', eventDbId]);

      // Check audit log was created
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'payment_processing_status_changed'
        AND event_type = 'payment_processing'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for payment event status update');
      }

      const log = auditLog.rows[0];

      // Verify before and after values
      const beforeValue = JSON.parse(log.before_value);
      const afterValue = JSON.parse(log.after_value);

      if (beforeValue.processing_status !== 'pending') {
        throw new Error('Before value processing_status mismatch');
      }

      if (afterValue.processing_status !== 'failed') {
        throw new Error('After value processing_status mismatch');
      }

      // Verify error severity for failed processing
      if (log.severity !== 'error') {
        throw new Error(`Expected error severity for failed processing, got ${log.severity}`);
      }

      // Cleanup
      await db.execute("DELETE FROM payment_events WHERE id = ?", [eventDbId]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test concurrent operations don't interfere with triggers
     */
    async testConcurrentOperations() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      const concurrentPromises = [];
      const testCount = 5;

      // First create base transactions
      const txnIds = [];
      for (let i = 0; i < testCount; i++) {
        const txnId = `CONCURRENT_TXN_${i}_${Date.now()}`;
        const txnResult = await db.execute(`
          INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency,
            customer_email, customer_name, order_data, event_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [
          txnId, 'tickets', 'completed', 7500, 'USD',
          `test${i}@example.com`, `Test${i} Customer`, '{}', 'test_event_2026'
        ]);
        txnIds.push({ txnId, dbId: txnResult.rows[0].id });
      }

      // Create multiple concurrent ticket insertions
      for (let i = 0; i < testCount; i++) {
        concurrentPromises.push(
          db.execute(`
            INSERT INTO tickets (
              ticket_id, transaction_id, ticket_type, event_id, price_cents,
              attendee_email, attendee_first_name, attendee_last_name, status, registration_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            `CONCURRENT_${i}_${Date.now()}`, txnIds[i].dbId, 'general_admission', 'test_event_2026', 7500,
            `test${i}@example.com`, `Test${i}`, `User${i}`, 'valid', 'pending'
          ])
        );
      }

      // Wait for all insertions to complete
      await Promise.all(concurrentPromises);

      // Check that all audit logs were created
      const auditCount = await db.execute(`
        SELECT COUNT(*) as count FROM audit_logs
        WHERE action = 'ticket_created'
        AND source_service = 'audit_trigger'
      `);

      if (auditCount.rows[0].count !== testCount) {
        throw new Error(`Expected ${testCount} audit logs, got ${auditCount.rows[0].count}`);
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE ticket_id LIKE 'CONCURRENT_%'");
      for (const txn of txnIds) {
        await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [txn.txnId]);
      }
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");
    },

    /**
     * Test triggers handle NULL values properly
     */
    async testNullValueHandling() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // First create a transaction
      const transactionId = 'TEST_NULL_TXN_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 7500, 'USD',
        'test@example.com', 'Test Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Insert ticket with NULL values
      const ticketId = 'TEST_NULL_' + Date.now();
      await db.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, status, registration_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ticketId, dbTransactionId, 'general_admission', 'test_event_2026', 7500,
        'test@example.com', 'valid', 'pending'
        // Note: attendee_first_name and attendee_last_name are NULL
      ]);

      // Check audit log was created without errors
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'ticket_created'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log created for ticket with NULL values');
      }

      const log = auditLog.rows[0];

      // Verify JSON parsing works with NULL values
      const afterValue = JSON.parse(log.after_value);
      if (afterValue.attendee_first_name !== null) {
        throw new Error('NULL values not properly handled in JSON');
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE ticket_id = ?", [ticketId]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    },

    /**
     * Test performance impact of triggers
     */
    async testPerformanceImpact() {
      const batchSize = 100;

      // Create base transactions for performance test
      const baseTxnIds = [];
      for (let i = 0; i < batchSize; i++) {
        const txnId = `PERF_BASE_TXN_${i}_${Date.now()}`;
        const txnResult = await db.execute(`
          INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency,
            customer_email, customer_name, order_data, event_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [
          txnId, 'tickets', 'completed', 7500, 'USD',
          `perf${i}@example.com`, `Perf${i} Customer`, '{}', 'test_event_2026'
        ]);
        baseTxnIds.push({ txnId, dbId: txnResult.rows[0].id });
      }

      // Measure time without triggers (baseline)
      await db.execute("DROP TRIGGER IF EXISTS audit_tickets_insert");

      const startTimeWithoutTriggers = Date.now();
      for (let i = 0; i < batchSize; i++) {
        await db.execute(`
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id, price_cents,
            attendee_email, status, registration_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `PERF_NO_TRIG_${i}_${Date.now()}`, baseTxnIds[i].dbId, 'general_admission', 'test_event_2026', 7500,
          `perf${i}@example.com`, 'valid', 'pending'
        ]);
      }
      const timeWithoutTriggers = Date.now() - startTimeWithoutTriggers;

      // Reinstall trigger
      await db.execute(`
        CREATE TRIGGER IF NOT EXISTS audit_tickets_insert
        AFTER INSERT ON tickets
        BEGIN
          INSERT INTO audit_logs (
            request_id, event_type, action, target_type, target_id,
            data_subject_id, data_type, processing_purpose, legal_basis,
            after_value, changed_fields, metadata, severity, source_service
          ) VALUES (
            'trig_' || hex(randomblob(8)), 'data_change', 'ticket_created', 'ticket', NEW.id,
            NEW.attendee_email, 'ticket_data', 'ticket_management', 'contract',
            json_object('ticket_id', NEW.ticket_id), json_array('ticket_id'),
            json_object('table_name', 'tickets'), 'info', 'audit_trigger'
          );
        END;
      `);

      // Create additional transactions for trigger test
      const trigTxnIds = [];
      for (let i = 0; i < batchSize; i++) {
        const txnId = `PERF_TRIG_TXN_${i}_${Date.now()}`;
        const txnResult = await db.execute(`
          INSERT INTO transactions (
            transaction_id, type, status, amount_cents, currency,
            customer_email, customer_name, order_data, event_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [
          txnId, 'tickets', 'completed', 7500, 'USD',
          `perf_trig${i}@example.com`, `PerfTrig${i} Customer`, '{}', 'test_event_2026'
        ]);
        trigTxnIds.push({ txnId, dbId: txnResult.rows[0].id });
      }

      // Measure time with triggers
      const startTimeWithTriggers = Date.now();
      for (let i = 0; i < batchSize; i++) {
        await db.execute(`
          INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id, price_cents,
            attendee_email, status, registration_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          `PERF_WITH_TRIG_${i}_${Date.now()}`, trigTxnIds[i].dbId, 'general_admission', 'test_event_2026', 7500,
          `perf_trig${i}@example.com`, 'valid', 'pending'
        ]);
      }
      const timeWithTriggers = Date.now() - startTimeWithTriggers;

      // Calculate performance impact
      const performanceImpact = ((timeWithTriggers - timeWithoutTriggers) / timeWithoutTriggers) * 100;

      // Fail if performance impact is too high (>50% slowdown)
      if (performanceImpact > 50) {
        throw new Error(`Performance impact too high: ${performanceImpact.toFixed(2)}% slowdown`);
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE ticket_id LIKE 'PERF_%'");
      for (const txn of baseTxnIds) {
        await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [txn.txnId]);
      }
      for (const txn of trigTxnIds) {
        await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [txn.txnId]);
      }
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");
    },

    /**
     * Test JSON field structure and content validation
     */
    async testJSONFieldStructure() {
      // Clear audit logs
      await db.execute("DELETE FROM audit_logs WHERE source_service = 'audit_trigger'");

      // First create a transaction
      const transactionId = 'TEST_JSON_TXN_' + Date.now();
      const txnResult = await db.execute(`
        INSERT INTO transactions (
          transaction_id, type, status, amount_cents, currency,
          customer_email, customer_name, order_data, event_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `, [
        transactionId, 'tickets', 'completed', 15000, 'USD',
        'json_test@example.com', 'JSON Customer', '{}', 'test_event_2026'
      ]);

      const dbTransactionId = txnResult.rows[0].id;

      // Insert a test ticket
      const ticketId = 'TEST_JSON_' + Date.now();
      await db.execute(`
        INSERT INTO tickets (
          ticket_id, transaction_id, ticket_type, event_id, price_cents,
          attendee_email, attendee_first_name, attendee_last_name, status, registration_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ticketId, dbTransactionId, 'vip_pass', 'test_event_2026', 15000,
        'json_test@example.com', 'JSON', 'Tester', 'valid', 'completed'
      ]);

      // Get the audit log
      const auditLog = await db.execute(`
        SELECT * FROM audit_logs
        WHERE action = 'ticket_created'
        AND source_service = 'audit_trigger'
        ORDER BY created_at DESC
        LIMIT 1
      `);

      if (auditLog.rows.length === 0) {
        throw new Error('No audit log found for JSON structure test');
      }

      const log = auditLog.rows[0];

      // Validate after_value JSON structure
      let afterValue;
      try {
        afterValue = JSON.parse(log.after_value);
      } catch (error) {
        throw new Error(`Invalid JSON in after_value: ${error.message}`);
      }

      // Check required fields are present
      const requiredFields = ['ticket_id', 'ticket_type', 'price_cents', 'attendee_email', 'status'];
      for (const field of requiredFields) {
        if (!(field in afterValue)) {
          throw new Error(`Missing required field '${field}' in after_value JSON. Available fields: ${Object.keys(afterValue).join(', ')}`);
        }
      }

      // Validate changed_fields JSON array
      let changedFields;
      try {
        changedFields = JSON.parse(log.changed_fields);
      } catch (error) {
        throw new Error(`Invalid JSON in changed_fields: ${error.message}`);
      }

      if (!Array.isArray(changedFields)) {
        throw new Error('changed_fields should be a JSON array');
      }

      // Validate metadata JSON structure
      let metadata;
      try {
        metadata = JSON.parse(log.metadata);
      } catch (error) {
        throw new Error(`Invalid JSON in metadata: ${error.message}`);
      }

      // Check metadata has expected structure
      const expectedMetadataFields = ['table_name', 'operation', 'business_process'];
      for (const field of expectedMetadataFields) {
        if (!(field in metadata)) {
          throw new Error(`Missing required field '${field}' in metadata JSON`);
        }
      }

      // Cleanup
      await db.execute("DELETE FROM tickets WHERE ticket_id = ?", [ticketId]);
      await db.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
      await db.execute("DELETE FROM audit_logs WHERE request_id = ?", [log.request_id]);
    }
  };
}