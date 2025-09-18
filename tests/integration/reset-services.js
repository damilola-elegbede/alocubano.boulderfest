/**
 * Service Reset Helper for Integration Tests
 * Resets all singleton services that cache database connections
 * This prevents CLIENT_CLOSED errors from stale connections in tests
 */

import auditService from '../../lib/audit-service.js';
import securityAlertService from '../../lib/security-alert-service.js';
import { resetDatabaseInstance } from '../../lib/database.js';

/**
 * Reset all service instances that cache database connections
 * Call this in beforeEach() of integration tests to ensure clean state
 */
export async function resetAllServices() {
  // Reset database instance first (all services depend on this)
  await resetDatabaseInstance();

  // Reset audit service state
  auditService.initialized = false;
  auditService.initializationPromise = null;
  auditService.db = null;

  // Reset security alert service state
  securityAlertService.initialized = false;
  securityAlertService.initializationPromise = null;
  securityAlertService.db = null;

  // Note: Services will lazy-initialize when first used
  // Only pre-initialize if needed for your test
}

/**
 * Reset and initialize all services
 * Use when you need services ready immediately
 */
export async function resetAndInitializeServices() {
  await resetAllServices();

  // Initialize all services
  await Promise.all([
    auditService.ensureInitialized(),
    securityAlertService.ensureInitialized()
  ]);
}