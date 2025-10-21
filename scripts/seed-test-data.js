/**
 * Test Data Seeding and Constants
 *
 * Provides standardized test data constants and seeding functions for E2E tests.
 */

// Test data constants for consistent testing
export const getTestDataConstants = () => {
  const timestamp = Date.now();
  const uniqueId = Math.random().toString(36).substring(2, 8);

  return {
    // Admin test credentials
    admin: {
      username: 'admin',
      password: process.env.TEST_ADMIN_PASSWORD || 'test-admin-password',
      email: 'admin'  // Must match username for login (not a real email address)
    },

    // Test user data
    testUser: {
      firstName: 'Test',
      lastName: 'User',
      email: `test-${uniqueId}@example.com`,
      phone: '+1234567890',
      emergencyContact: {
        name: 'Emergency Contact',
        phone: '+1987654321',
        relationship: 'Friend'
      }
    },

    // Test ticket data
    testTicket: {
      type: 'weekend-pass',
      quantity: 1,
      price: 85.00
    },

    // Test timestamps
    timestamps: {
      now: timestamp,
      uniqueId,
      testSuffix: `_test_${uniqueId}`
    }
  };
};

// Seed function for setting up test data
export const seedTestData = async (database = null) => {
  const testData = getTestDataConstants();

  if (!database) {
    console.log('⚠️ No database connection provided to seedTestData');
    return testData;
  }

  console.log(`🌱 Seeding test data with ID: ${testData.timestamps.uniqueId}`);

  // Add any database seeding logic here if needed
  // For now, just return the constants

  return testData;
};

// Cleanup function for removing test data
export const cleanupTestData = async (testData, database = null) => {
  if (!testData || !database) {
    console.log('⚠️ No test data or database connection provided for cleanup');
    return;
  }

  console.log(`🧹 Cleaning up test data with ID: ${testData.timestamps.uniqueId}`);

  // Add cleanup logic here if needed
};

export default {
  getTestDataConstants,
  seedTestData,
  cleanupTestData
};