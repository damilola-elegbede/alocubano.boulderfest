#!/usr/bin/env node
/**
 * Database Audit Triggers Installation Script
 *
 * Installs comprehensive database triggers for automatic change tracking
 * across all critical tables with performance optimization and testing
 *
 * Usage:
 *   node scripts/install-audit-triggers.js [--test] [--rollback] [--verify-only]
 *
 * Options:
 *   --test       Run installation with test data validation
 *   --rollback   Remove all audit triggers
 *   --verify-only Verify trigger functionality without changes
 */

import { getDatabaseClient } from '../lib/database.js';
import { createTriggerTestSuite } from '../lib/audit-trigger-testing.js';

const AUDIT_TRIGGERS = {
  // Tickets table triggers - Track critical attendee and status changes
  tickets_insert: `
    CREATE TRIGGER IF NOT EXISTS audit_tickets_insert
    AFTER INSERT ON tickets
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        data_subject_id,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'data_change',
        'ticket_created',
        'ticket',
        NEW.id,
        NEW.attendee_email,
        'ticket_data',
        'ticket_management',
        'contract',
        NULL,
        json_object(
          'ticket_id', NEW.ticket_id,
          'transaction_id', NEW.transaction_id,
          'ticket_type', NEW.ticket_type,
          'event_id', NEW.event_id,
          'price_cents', NEW.price_cents,
          'attendee_email', NEW.attendee_email,
          'attendee_first_name', NEW.attendee_first_name,
          'attendee_last_name', NEW.attendee_last_name,
          'status', NEW.status,
          'registration_status', NEW.registration_status
        ),
        json_array('ticket_id', 'transaction_id', 'ticket_type', 'event_id', 'price_cents', 'attendee_email', 'attendee_first_name', 'attendee_last_name', 'status', 'registration_status'),
        json_object(
          'table_name', 'tickets',
          'operation', 'INSERT',
          'event_id', NEW.event_id,
          'business_process', 'ticket_creation',
          'risk_assessment', 'low'
        ),
        'info',
        'audit_trigger'
      );
    END;
  `,

  tickets_update: `
    CREATE TRIGGER IF NOT EXISTS audit_tickets_update
    AFTER UPDATE ON tickets
    WHEN OLD.attendee_first_name != NEW.attendee_first_name
      OR OLD.attendee_last_name != NEW.attendee_last_name
      OR OLD.attendee_email != NEW.attendee_email
      OR OLD.registration_status != NEW.registration_status
      OR OLD.status != NEW.status
      OR (OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL)
      OR (OLD.first_scanned_at IS NULL AND NEW.first_scanned_at IS NOT NULL)
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        data_subject_id,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'data_change',
        CASE
          WHEN OLD.status != NEW.status THEN 'ticket_status_changed'
          WHEN OLD.registration_status != NEW.registration_status THEN 'registration_status_changed'
          WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'ticket_checked_in'
          WHEN OLD.first_scanned_at IS NULL AND NEW.first_scanned_at IS NOT NULL THEN 'ticket_first_scan'
          ELSE 'ticket_updated'
        END,
        'ticket',
        NEW.id,
        COALESCE(NEW.attendee_email, OLD.attendee_email),
        'ticket_data',
        'ticket_management',
        'contract',
        json_object(
          'attendee_first_name', OLD.attendee_first_name,
          'attendee_last_name', OLD.attendee_last_name,
          'attendee_email', OLD.attendee_email,
          'registration_status', OLD.registration_status,
          'status', OLD.status,
          'checked_in_at', OLD.checked_in_at,
          'first_scanned_at', OLD.first_scanned_at,
          'scan_count', OLD.scan_count
        ),
        json_object(
          'attendee_first_name', NEW.attendee_first_name,
          'attendee_last_name', NEW.attendee_last_name,
          'attendee_email', NEW.attendee_email,
          'registration_status', NEW.registration_status,
          'status', NEW.status,
          'checked_in_at', NEW.checked_in_at,
          'first_scanned_at', NEW.first_scanned_at,
          'scan_count', NEW.scan_count
        ),
        json_array(
          CASE WHEN OLD.attendee_first_name != NEW.attendee_first_name THEN 'attendee_first_name' END,
          CASE WHEN OLD.attendee_last_name != NEW.attendee_last_name THEN 'attendee_last_name' END,
          CASE WHEN OLD.attendee_email != NEW.attendee_email THEN 'attendee_email' END,
          CASE WHEN OLD.registration_status != NEW.registration_status THEN 'registration_status' END,
          CASE WHEN OLD.status != NEW.status THEN 'status' END,
          CASE WHEN OLD.checked_in_at != NEW.checked_in_at THEN 'checked_in_at' END,
          CASE WHEN OLD.first_scanned_at != NEW.first_scanned_at THEN 'first_scanned_at' END,
          CASE WHEN OLD.scan_count != NEW.scan_count THEN 'scan_count' END
        ),
        json_object(
          'table_name', 'tickets',
          'operation', 'UPDATE',
          'ticket_id', NEW.ticket_id,
          'event_id', NEW.event_id,
          'business_process', CASE
            WHEN OLD.status != NEW.status THEN 'ticket_lifecycle'
            WHEN OLD.registration_status != NEW.registration_status THEN 'registration_management'
            WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'event_check_in'
            ELSE 'attendee_management'
          END,
          'risk_assessment', CASE
            WHEN OLD.status = 'valid' AND NEW.status = 'cancelled' THEN 'high'
            WHEN OLD.attendee_email != NEW.attendee_email THEN 'medium'
            WHEN OLD.checked_in_at IS NULL AND NEW.checked_in_at IS NOT NULL THEN 'medium'
            ELSE 'low'
          END
        ),
        CASE
          WHEN OLD.status = 'valid' AND NEW.status = 'cancelled' THEN 'warning'
          WHEN OLD.attendee_email != NEW.attendee_email THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  // Transactions table triggers - Track financial status changes
  transactions_insert: `
    CREATE TRIGGER IF NOT EXISTS audit_transactions_insert
    AFTER INSERT ON transactions
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        data_subject_id,
        data_type,
        processing_purpose,
        legal_basis,
        amount_cents,
        currency,
        transaction_reference,
        payment_status,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'financial_event',
        'transaction_created',
        'transaction',
        NEW.id,
        NEW.customer_email,
        'financial_data',
        'payment_processing',
        'contract',
        NEW.amount_cents,
        NEW.currency,
        NEW.transaction_id,
        NEW.status,
        NULL,
        json_object(
          'transaction_id', NEW.transaction_id,
          'type', NEW.type,
          'status', NEW.status,
          'amount_cents', NEW.amount_cents,
          'currency', NEW.currency,
          'customer_email', NEW.customer_email,
          'customer_name', NEW.customer_name,
          'stripe_session_id', NEW.stripe_session_id,
          'event_id', NEW.event_id
        ),
        json_array('transaction_id', 'type', 'status', 'amount_cents', 'currency', 'customer_email', 'customer_name', 'stripe_session_id', 'event_id'),
        json_object(
          'table_name', 'transactions',
          'operation', 'INSERT',
          'business_process', 'payment_processing',
          'risk_assessment', CASE
            WHEN NEW.amount_cents > 100000 THEN 'high'     -- $1000+
            WHEN NEW.amount_cents > 50000 THEN 'medium'    -- $500+
            ELSE 'low'
          END,
          'payment_method_type', NEW.payment_method_type
        ),
        CASE
          WHEN NEW.amount_cents > 100000 THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  transactions_update: `
    CREATE TRIGGER IF NOT EXISTS audit_transactions_update
    AFTER UPDATE ON transactions
    WHEN OLD.status != NEW.status
      OR OLD.amount_cents != NEW.amount_cents
      OR OLD.customer_email != NEW.customer_email
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        data_subject_id,
        data_type,
        processing_purpose,
        legal_basis,
        amount_cents,
        currency,
        transaction_reference,
        payment_status,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'financial_event',
        CASE
          WHEN OLD.status != NEW.status THEN 'transaction_status_changed'
          WHEN OLD.amount_cents != NEW.amount_cents THEN 'transaction_amount_changed'
          WHEN OLD.customer_email != NEW.customer_email THEN 'transaction_customer_changed'
          ELSE 'transaction_updated'
        END,
        'transaction',
        NEW.id,
        COALESCE(NEW.customer_email, OLD.customer_email),
        'financial_data',
        'payment_processing',
        'contract',
        NEW.amount_cents,
        NEW.currency,
        NEW.transaction_id,
        NEW.status,
        json_object(
          'status', OLD.status,
          'amount_cents', OLD.amount_cents,
          'customer_email', OLD.customer_email,
          'stripe_payment_intent_id', OLD.stripe_payment_intent_id
        ),
        json_object(
          'status', NEW.status,
          'amount_cents', NEW.amount_cents,
          'customer_email', NEW.customer_email,
          'stripe_payment_intent_id', NEW.stripe_payment_intent_id
        ),
        json_array(
          CASE WHEN OLD.status != NEW.status THEN 'status' END,
          CASE WHEN OLD.amount_cents != NEW.amount_cents THEN 'amount_cents' END,
          CASE WHEN OLD.customer_email != NEW.customer_email THEN 'customer_email' END,
          CASE WHEN OLD.stripe_payment_intent_id != NEW.stripe_payment_intent_id THEN 'stripe_payment_intent_id' END
        ),
        json_object(
          'table_name', 'transactions',
          'operation', 'UPDATE',
          'transaction_id', NEW.transaction_id,
          'business_process', 'payment_processing',
          'risk_assessment', CASE
            WHEN OLD.status = 'completed' AND NEW.status IN ('refunded', 'cancelled') THEN 'critical'
            WHEN OLD.amount_cents != NEW.amount_cents THEN 'high'
            WHEN OLD.status != NEW.status THEN 'medium'
            ELSE 'low'
          END,
          'old_status', OLD.status,
          'new_status', NEW.status
        ),
        CASE
          WHEN OLD.status = 'completed' AND NEW.status IN ('refunded', 'cancelled') THEN 'critical'
          WHEN OLD.amount_cents != NEW.amount_cents THEN 'error'
          WHEN OLD.status != NEW.status THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  // Admin sessions table triggers - Track administrative access
  admin_sessions_insert: `
    CREATE TRIGGER IF NOT EXISTS audit_admin_sessions_insert
    AFTER INSERT ON admin_sessions
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        admin_user,
        session_id,
        ip_address,
        user_agent,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'admin_access',
        'admin_session_created',
        'admin_session',
        NEW.id,
        'admin',
        NEW.session_token,
        NEW.ip_address,
        NEW.user_agent,
        'session_data',
        'admin_authentication',
        'legitimate_interests',
        NULL,
        json_object(
          'session_token', substr(NEW.session_token, 1, 10) || '...',  -- Masked for security
          'ip_address', NEW.ip_address,
          'mfa_verified', NEW.mfa_verified,
          'expires_at', NEW.expires_at,
          'is_active', NEW.is_active
        ),
        json_array('session_token', 'ip_address', 'mfa_verified', 'expires_at', 'is_active'),
        json_object(
          'table_name', 'admin_sessions',
          'operation', 'INSERT',
          'business_process', 'admin_authentication',
          'risk_assessment', CASE
            WHEN NEW.mfa_verified = 0 THEN 'high'
            ELSE 'medium'
          END,
          'mfa_status', CASE WHEN NEW.mfa_verified = 1 THEN 'verified' ELSE 'pending' END
        ),
        CASE
          WHEN NEW.mfa_verified = 0 THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  admin_sessions_update: `
    CREATE TRIGGER IF NOT EXISTS audit_admin_sessions_update
    AFTER UPDATE ON admin_sessions
    WHEN OLD.mfa_verified != NEW.mfa_verified
      OR OLD.is_active != NEW.is_active
      OR OLD.expires_at != NEW.expires_at
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        admin_user,
        session_id,
        ip_address,
        user_agent,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'admin_access',
        CASE
          WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'admin_mfa_status_changed'
          WHEN OLD.is_active != NEW.is_active THEN 'admin_session_status_changed'
          WHEN OLD.expires_at != NEW.expires_at THEN 'admin_session_extended'
          ELSE 'admin_session_updated'
        END,
        'admin_session',
        NEW.id,
        'admin',
        NEW.session_token,
        NEW.ip_address,
        NEW.user_agent,
        'session_data',
        'admin_authentication',
        'legitimate_interests',
        json_object(
          'mfa_verified', OLD.mfa_verified,
          'is_active', OLD.is_active,
          'expires_at', OLD.expires_at
        ),
        json_object(
          'mfa_verified', NEW.mfa_verified,
          'is_active', NEW.is_active,
          'expires_at', NEW.expires_at
        ),
        json_array(
          CASE WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'mfa_verified' END,
          CASE WHEN OLD.is_active != NEW.is_active THEN 'is_active' END,
          CASE WHEN OLD.expires_at != NEW.expires_at THEN 'expires_at' END
        ),
        json_object(
          'table_name', 'admin_sessions',
          'operation', 'UPDATE',
          'business_process', 'admin_session_management',
          'risk_assessment', CASE
            WHEN OLD.mfa_verified = 1 AND NEW.mfa_verified = 0 THEN 'critical'
            WHEN OLD.is_active = 1 AND NEW.is_active = 0 THEN 'medium'
            ELSE 'low'
          END,
          'session_change_reason', CASE
            WHEN OLD.mfa_verified != NEW.mfa_verified THEN 'mfa_verification_change'
            WHEN OLD.is_active != NEW.is_active THEN 'session_activation_change'
            WHEN OLD.expires_at != NEW.expires_at THEN 'session_extension'
            ELSE 'unknown'
          END
        ),
        CASE
          WHEN OLD.mfa_verified = 1 AND NEW.mfa_verified = 0 THEN 'critical'
          WHEN OLD.is_active = 1 AND NEW.is_active = 0 THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  // Payment events table triggers - Track payment processing events
  payment_events_insert: `
    CREATE TRIGGER IF NOT EXISTS audit_payment_events_insert
    AFTER INSERT ON payment_events
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        transaction_reference,
        payment_status,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'payment_processing',
        'payment_event_received',
        'payment_event',
        NEW.id,
        COALESCE(NEW.stripe_session_id, NEW.stripe_payment_intent_id, NEW.event_id),
        NEW.processing_status,
        'payment_event_data',
        'payment_processing',
        'contract',
        NULL,
        json_object(
          'event_id', NEW.event_id,
          'event_type', NEW.event_type,
          'event_source', NEW.event_source,
          'transaction_id', NEW.transaction_id,
          'processing_status', NEW.processing_status,
          'retry_count', NEW.retry_count
        ),
        json_array('event_id', 'event_type', 'event_source', 'transaction_id', 'processing_status', 'retry_count'),
        json_object(
          'table_name', 'payment_events',
          'operation', 'INSERT',
          'business_process', 'payment_webhook_processing',
          'risk_assessment', CASE
            WHEN NEW.event_type LIKE '%failed%' THEN 'high'
            WHEN NEW.event_type LIKE '%disputed%' THEN 'critical'
            WHEN NEW.event_type LIKE '%refund%' THEN 'medium'
            ELSE 'low'
          END,
          'webhook_source', NEW.event_source,
          'event_classification', NEW.event_type
        ),
        CASE
          WHEN NEW.event_type LIKE '%failed%' THEN 'error'
          WHEN NEW.event_type LIKE '%disputed%' THEN 'critical'
          WHEN NEW.event_type LIKE '%refund%' THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `,

  payment_events_update: `
    CREATE TRIGGER IF NOT EXISTS audit_payment_events_update
    AFTER UPDATE ON payment_events
    WHEN OLD.processing_status != NEW.processing_status
      OR OLD.retry_count != NEW.retry_count
      OR OLD.error_message != NEW.error_message
    BEGIN
      INSERT INTO audit_logs (
        request_id,
        event_type,
        action,
        target_type,
        target_id,
        transaction_reference,
        payment_status,
        data_type,
        processing_purpose,
        legal_basis,
        before_value,
        after_value,
        changed_fields,
        metadata,
        severity,
        source_service
      ) VALUES (
        'trig_' || hex(randomblob(8)),
        'payment_processing',
        CASE
          WHEN OLD.processing_status != NEW.processing_status THEN 'payment_processing_status_changed'
          WHEN OLD.retry_count != NEW.retry_count THEN 'payment_event_retried'
          WHEN OLD.error_message != NEW.error_message THEN 'payment_error_updated'
          ELSE 'payment_event_updated'
        END,
        'payment_event',
        NEW.id,
        COALESCE(NEW.stripe_session_id, NEW.stripe_payment_intent_id, NEW.event_id),
        NEW.processing_status,
        'payment_event_data',
        'payment_processing',
        'contract',
        json_object(
          'processing_status', OLD.processing_status,
          'retry_count', OLD.retry_count,
          'error_message', OLD.error_message,
          'processed_at', OLD.processed_at
        ),
        json_object(
          'processing_status', NEW.processing_status,
          'retry_count', NEW.retry_count,
          'error_message', NEW.error_message,
          'processed_at', NEW.processed_at
        ),
        json_array(
          CASE WHEN OLD.processing_status != NEW.processing_status THEN 'processing_status' END,
          CASE WHEN OLD.retry_count != NEW.retry_count THEN 'retry_count' END,
          CASE WHEN OLD.error_message != NEW.error_message THEN 'error_message' END,
          CASE WHEN OLD.processed_at != NEW.processed_at THEN 'processed_at' END
        ),
        json_object(
          'table_name', 'payment_events',
          'operation', 'UPDATE',
          'event_id', NEW.event_id,
          'event_type', NEW.event_type,
          'business_process', 'payment_webhook_processing',
          'risk_assessment', CASE
            WHEN OLD.processing_status = 'pending' AND NEW.processing_status = 'failed' THEN 'high'
            WHEN NEW.retry_count > 3 THEN 'medium'
            ELSE 'low'
          END,
          'status_transition', OLD.processing_status || ' -> ' || NEW.processing_status
        ),
        CASE
          WHEN OLD.processing_status = 'pending' AND NEW.processing_status = 'failed' THEN 'error'
          WHEN NEW.retry_count > 3 THEN 'warning'
          ELSE 'info'
        END,
        'audit_trigger'
      );
    END;
  `
};

// Trigger cleanup/rollback SQL
const TRIGGER_CLEANUP = {
  tickets_insert: 'DROP TRIGGER IF EXISTS audit_tickets_insert;',
  tickets_update: 'DROP TRIGGER IF EXISTS audit_tickets_update;',
  transactions_insert: 'DROP TRIGGER IF EXISTS audit_transactions_insert;',
  transactions_update: 'DROP TRIGGER IF EXISTS audit_transactions_update;',
  admin_sessions_insert: 'DROP TRIGGER IF EXISTS audit_admin_sessions_insert;',
  admin_sessions_update: 'DROP TRIGGER IF EXISTS audit_admin_sessions_update;',
  payment_events_insert: 'DROP TRIGGER IF EXISTS audit_payment_events_insert;',
  payment_events_update: 'DROP TRIGGER IF EXISTS audit_payment_events_update;'
};

/**
 * Install all audit triggers
 */
async function installTriggers(db) {
  console.log('🔧 Installing audit triggers...');

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const [triggerName, triggerSQL] of Object.entries(AUDIT_TRIGGERS)) {
    try {
      console.log(`  Installing trigger: ${triggerName}`);
      await db.execute(triggerSQL);
      results.push({ trigger: triggerName, status: 'success' });
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to install trigger ${triggerName}:`, error.message);
      results.push({ trigger: triggerName, status: 'error', error: error.message });
      errorCount++;
    }
  }

  console.log(`\n✅ Trigger installation complete: ${successCount} successful, ${errorCount} failed`);
  return results;
}

/**
 * Remove all audit triggers
 */
async function rollbackTriggers(db) {
  console.log('🗑️  Removing audit triggers...');

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const [triggerName, cleanupSQL] of Object.entries(TRIGGER_CLEANUP)) {
    try {
      console.log(`  Removing trigger: ${triggerName}`);
      await db.execute(cleanupSQL);
      results.push({ trigger: triggerName, status: 'removed' });
      successCount++;
    } catch (error) {
      console.error(`  ❌ Failed to remove trigger ${triggerName}:`, error.message);
      results.push({ trigger: triggerName, status: 'error', error: error.message });
      errorCount++;
    }
  }

  console.log(`\n✅ Trigger removal complete: ${successCount} successful, ${errorCount} failed`);
  return results;
}

/**
 * Verify triggers are properly installed and functioning
 */
async function verifyTriggers(db) {
  console.log('🔍 Verifying trigger installation...');

  const results = {
    installed_triggers: [],
    missing_triggers: [],
    audit_logs_table_ready: false,
    test_results: null
  };

  // Check if audit_logs table exists and has required columns
  try {
    const tableInfo = await db.execute("PRAGMA table_info(audit_logs)");
    if (tableInfo.rows.length > 0) {
      results.audit_logs_table_ready = true;
      console.log('  ✅ audit_logs table is ready');
    } else {
      console.log('  ❌ audit_logs table not found');
      return results;
    }
  } catch (error) {
    console.log('  ❌ audit_logs table check failed:', error.message);
    return results;
  }

  // Check for installed triggers
  const triggerQuery = `
    SELECT name FROM sqlite_master
    WHERE type = 'trigger'
    AND name LIKE 'audit_%'
    ORDER BY name
  `;

  try {
    const installedTriggers = await db.execute(triggerQuery);
    const installedNames = installedTriggers.rows.map(row => row.name);

    const expectedTriggers = Object.keys(TRIGGER_CLEANUP).map(name =>
      name.replace('_', '_').replace(/(.+)/, 'audit_$1')
    );

    for (const expectedTrigger of expectedTriggers) {
      if (installedNames.includes(expectedTrigger)) {
        results.installed_triggers.push(expectedTrigger);
        console.log(`  ✅ Trigger installed: ${expectedTrigger}`);
      } else {
        results.missing_triggers.push(expectedTrigger);
        console.log(`  ❌ Trigger missing: ${expectedTrigger}`);
      }
    }
  } catch (error) {
    console.error('  ❌ Failed to verify triggers:', error.message);
  }

  return results;
}

/**
 * Run comprehensive trigger functionality tests
 */
async function testTriggerFunctionality(db) {
  console.log('🧪 Testing trigger functionality...');

  try {
    const testSuite = createTriggerTestSuite(db);
    const testResults = await testSuite.runAllTests();

    console.log('\n📊 Test Results Summary:');
    console.log(`  Total tests: ${testResults.total}`);
    console.log(`  Passed: ${testResults.passed}`);
    console.log(`  Failed: ${testResults.failed}`);

    if (testResults.failed > 0) {
      console.log('\n❌ Failed tests:');
      testResults.details
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`  - ${test.name}: ${test.error}`);
        });
    }

    return testResults;
  } catch (error) {
    console.error('  ❌ Test suite execution failed:', error.message);
    return { total: 0, passed: 0, failed: 1, error: error.message };
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes('--test');
  const isRollback = args.includes('--rollback');
  const isVerifyOnly = args.includes('--verify-only');

  try {
    const db = await getDatabaseClient();
    console.log('📋 Database Audit Triggers Management\n');

    if (isRollback) {
      await rollbackTriggers(db);
    } else if (isVerifyOnly) {
      const verification = await verifyTriggers(db);
      console.log('\n📋 Verification Report:');
      console.log(`  Installed triggers: ${verification.installed_triggers.length}`);
      console.log(`  Missing triggers: ${verification.missing_triggers.length}`);
      console.log(`  Audit logs table ready: ${verification.audit_logs_table_ready ? 'Yes' : 'No'}`);
    } else {
      // Install triggers
      const installResults = await installTriggers(db);

      // Verify installation
      const verification = await verifyTriggers(db);

      // Run tests if requested
      if (isTest && verification.audit_logs_table_ready) {
        await testTriggerFunctionality(db);
      }

      // Final summary
      console.log('\n📋 Installation Summary:');
      console.log(`  Triggers installed: ${installResults.filter(r => r.status === 'success').length}`);
      console.log(`  Installation errors: ${installResults.filter(r => r.status === 'error').length}`);
      console.log(`  Verification passed: ${verification.missing_triggers.length === 0 ? 'Yes' : 'No'}`);

      if (verification.missing_triggers.length > 0) {
        console.log('\n⚠️  Some triggers failed to install. Check logs above for details.');
        process.exit(1);
      } else {
        console.log('\n🎉 All audit triggers successfully installed and verified!');
      }
    }
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { installTriggers, rollbackTriggers, verifyTriggers, testTriggerFunctionality };