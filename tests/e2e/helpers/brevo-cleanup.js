/**
 * Brevo Cleanup Helpers
 * 
 * Provides utilities for managing test emails and cleanup in Brevo.
 */

// Track test emails for cleanup (with metadata)
const testEmails = new Map();

// Add test email to tracking
export const trackTestEmail = (email, metadata = {}) => {
  testEmails.set(email, {
    email,
    tracked: Date.now(),
    ...metadata
  });
  console.log(`📧 Tracking test email: ${email}`, metadata ? `with metadata: ${JSON.stringify(metadata)}` : '');
};

// Remove test email from tracking
export const untrackTestEmail = (email) => {
  const existed = testEmails.delete(email);
  if (existed) {
    console.log(`📧 Untracking test email: ${email}`);
  }
  return existed;
};

// Get all tracked test emails
export const getTrackedEmails = () => {
  return Array.from(testEmails.keys());
};

// Clear all tracked emails
export const clearTrackedEmails = () => {
  const count = testEmails.size;
  testEmails.clear();
  console.log(`🧹 Cleared ${count} tracked test emails`);
  return count;
};

// Check if email is a test email
export const isTestEmail = (email) => {
  return email.includes('test-') || 
         email.includes('@example.com') || 
         email.includes('@e2etest.example.com') ||
         email.includes('@test.com') ||
         email.endsWith('.test');
};

// Alias for backward compatibility
export const getBrevoCleanupStats = () => {
  return getCleanupStats();
};

// Generate cleanup statistics
export const getCleanupStats = () => {
  const tracked = Array.from(testEmails.keys());
  const testEmailsCount = tracked.filter(isTestEmail).length;
  
  return {
    totalTracked: tracked.length,
    testEmails: testEmailsCount,
    trackedEmails: testEmailsCount, // Alias for backward compatibility
    productionEmails: tracked.length - testEmailsCount,
    trackedList: tracked,
    trackedMetadata: Array.from(testEmails.values()),
    cleanupLog: [], // For compatibility with test expectations
    isTestMode: isTestMode(),
    initialized: true
  };
};

// Alias for backward compatibility
export const cleanupTestEmails = async (options = {}) => {
  return performBrevoCleanup(options);
};

// Cleanup function for Brevo (placeholder for API integration)
export const performBrevoCleanup = async (options = {}) => {
  const stats = getCleanupStats();
  
  console.log('🧹 Performing Brevo cleanup...');
  console.log(`   Test emails to clean: ${stats.testEmails}`);
  console.log(`   Options:`, options);
  
  // In a real implementation, this would call Brevo API to remove test contacts
  // For now, just simulate cleanup
  let cleaned = 0;
  let errors = [];
  
  if (stats.testEmails > 0) {
    console.log(`   Simulating cleanup of ${stats.testEmails} test emails`);
    // Clear tracked test emails
    const testEmailsToRemove = stats.trackedList.filter(isTestEmail);
    testEmailsToRemove.forEach(email => {
      try {
        untrackTestEmail(email);
        cleaned++;
      } catch (error) {
        errors.push({ email, error: error.message });
      }
    });
  }
  
  return {
    totalProcessed: stats.testEmails,
    totalCleaned: cleaned,
    errors,
    remaining: getTrackedEmails().length
  };
};

// Handle test mode
export const setTestMode = (enabled = true) => {
  console.log(`🧪 Test mode: ${enabled ? 'Enabled' : 'Disabled'}`);
  // Store test mode state if needed
  globalThis._brevoTestMode = enabled;
};

export const isTestMode = () => {
  return globalThis._brevoTestMode === true;
};

// Initialize Brevo cleanup system
export const initializeBrevoCleanup = async () => {
  console.log('🚀 Initializing Brevo cleanup system...');
  
  // Clear any existing tracked emails from previous runs
  const existingCount = testEmails.size;
  if (existingCount > 0) {
    console.log(`   🧹 Clearing ${existingCount} existing tracked emails`);
    testEmails.clear();
  }
  
  // Set test mode
  setTestMode(true);
  
  console.log('   ✅ Brevo cleanup system initialized');
  return {
    initialized: true,
    clearedExisting: existingCount,
    testMode: true
  };
};

export default {
  trackTestEmail,
  untrackTestEmail,
  getTrackedEmails,
  clearTrackedEmails,
  isTestEmail,
  getBrevoCleanupStats,
  getCleanupStats,
  cleanupTestEmails,
  performBrevoCleanup,
  setTestMode,
  isTestMode,
  initializeBrevoCleanup
};