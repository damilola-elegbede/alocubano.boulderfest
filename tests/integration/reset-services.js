/**
 * Service Reset Helper for Integration Tests
 * Resets all singleton services that cache database connections
 * This prevents CLIENT_CLOSED errors from stale connections in tests
 */

import auditService from '../../lib/audit-service.js';

/**
 * Reset all service instances that cache database connections
 * Call this in beforeEach() of integration tests to ensure clean state
 */
export async function resetAllServices() {
  // Reset database instance first (all services depend on this)
  try {
    const { resetDatabaseInstance } = await import('../../lib/database.js');
    if (resetDatabaseInstance) {
      await resetDatabaseInstance();
    }
  } catch (error) {
    console.warn('⚠️ Could not reset database instance:', error.message);
  }

  // Reset audit service state
  auditService.initialized = false;
  auditService.initializationPromise = null;
  auditService.db = null;

  // Reset security alert service state - gracefully handle if not available
  try {
    const securityAlertModule = await import('../../lib/security-alert-service.js');
    const securityAlertService = securityAlertModule.default || securityAlertModule.securityAlertService;
    if (securityAlertService) {
      securityAlertService.initialized = false;
      securityAlertService.initializationPromise = null;
      securityAlertService.db = null;
    }
  } catch (error) {
    console.warn('⚠️ Could not reset security alert service:', error.message);
  }

  // Reset admin session monitor - gracefully handle if not available
  try {
    const adminSessionModule = await import('../../lib/admin-session-monitor.js');
    const adminSessionMonitor = adminSessionModule.default || adminSessionModule.adminSessionMonitor;
    if (adminSessionMonitor) {
      adminSessionMonitor.initialized = false;
      adminSessionMonitor.initializationPromise = null;
      adminSessionMonitor.db = null;
    }
  } catch (error) {
    console.warn('⚠️ Could not reset admin session monitor:', error.message);
  }

  // Note: Services will lazy-initialize when first used
  // Only pre-initialize if needed for your test
}

/**
 * Reset and initialize all services
 * Use when you need services ready immediately
 */
export async function resetAndInitializeServices() {
  await resetAllServices();

  // Initialize available services
  const initPromises = [auditService.ensureInitialized()];

  // Add security alert service if available
  try {
    const securityAlertModule = await import('../../lib/security-alert-service.js');
    const securityAlertService = securityAlertModule.default || securityAlertModule.securityAlertService;
    if (securityAlertService && typeof securityAlertService.ensureInitialized === 'function') {
      initPromises.push(securityAlertService.ensureInitialized());
    }
  } catch (error) {
    console.warn('⚠️ Security alert service not available for initialization:', error.message);
  }

  // Add admin session monitor if available
  try {
    const adminSessionModule = await import('../../lib/admin-session-monitor.js');
    const adminSessionMonitor = adminSessionModule.default || adminSessionModule.adminSessionMonitor;
    if (adminSessionMonitor && typeof adminSessionMonitor.ensureInitialized === 'function') {
      initPromises.push(adminSessionMonitor.ensureInitialized());
    }
  } catch (error) {
    console.warn('⚠️ Admin session monitor not available for initialization:', error.message);
  }

  await Promise.all(initPromises);
}