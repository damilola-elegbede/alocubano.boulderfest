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

  // Reset bootstrap service state (CRITICAL: must re-initialize after database cleanup)
  try {
    const { bootstrapService } = await import('../../lib/bootstrap-service.js');
    if (bootstrapService) {
      bootstrapService.initialized = false;
      bootstrapService.initializationPromise = null;
      bootstrapService.lastChecksum = null;
    }
  } catch (error) {
    console.warn('⚠️ Could not reset bootstrap service:', error.message);
  }

  // Reset Stripe price sync service state
  try {
    const { stripePriceSyncService } = await import('../../lib/stripe-price-sync-service.js');
    if (stripePriceSyncService) {
      stripePriceSyncService.initialized = false;
      stripePriceSyncService.initializationPromise = null;
      stripePriceSyncService.stripe = null;
    }
  } catch (error) {
    console.warn('⚠️ Could not reset Stripe price sync service:', error.message);
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

  // Add bootstrap service initialization (CRITICAL: populates ticket_types and events)
  try {
    const { bootstrapService } = await import('../../lib/bootstrap-service.js');
    if (bootstrapService && typeof bootstrapService.initialize === 'function') {
      initPromises.push(bootstrapService.initialize());
    }
  } catch (error) {
    console.warn('⚠️ Bootstrap service not available for initialization:', error.message);
  }

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