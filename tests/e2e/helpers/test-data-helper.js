/**
 * Test Data Helper
 * Provides easy access to seeded test data for E2E tests
 * 
 * Usage:
 *   import { getTestAdmin, getTestTicket, getTestSubscriber } from './helpers/test-data-helper.js';
 *   
 *   const admin = getTestAdmin();
 *   const ticket = getTestTicket('weekend');
 *   const subscriber = getTestSubscriber('active');
 */

import { getTestDataConstants } from '../../../scripts/seed-test-data.js';

/**
 * Get test data constants
 */
export function getTestConstants() {
  return getTestDataConstants();
}

/**
 * Get admin credentials for authentication tests
 */
export function getTestAdmin() {
  const constants = getTestDataConstants();
  return {
    email: constants.ADMIN_EMAIL,
    password: constants.TEST_ADMIN_PASSWORD,
    sessionToken: global.seededTestData?.adminUser?.session_token
  };
}

/**
 * Get test ticket data
 */
export function getTestTicket(ticketType = 'weekend') {
  const seededData = global.seededTestData;
  if (!seededData?.tickets) {
    throw new Error('Test tickets not found in seeded data. Ensure global setup ran successfully.');
  }
  
  const ticket = seededData.tickets.find(t => t.ticket_type === ticketType);
  if (!ticket) {
    const availableTypes = seededData.tickets.map(t => t.ticket_type).join(', ');
    throw new Error(`Ticket type '${ticketType}' not found. Available: ${availableTypes}`);
  }
  
  return ticket;
}

/**
 * Get multiple test tickets
 */
export function getTestTickets(ticketType = null) {
  const seededData = global.seededTestData;
  if (!seededData?.tickets) {
    throw new Error('Test tickets not found in seeded data. Ensure global setup ran successfully.');
  }
  
  if (ticketType) {
    return seededData.tickets.filter(t => t.ticket_type === ticketType);
  }
  
  return seededData.tickets;
}

/**
 * Get test transaction data
 */
export function getTestTransaction(index = 0) {
  const seededData = global.seededTestData;
  if (!seededData?.transactions) {
    throw new Error('Test transactions not found in seeded data. Ensure global setup ran successfully.');
  }
  
  const transaction = seededData.transactions[index];
  if (!transaction) {
    throw new Error(`Transaction at index ${index} not found. Available: ${seededData.transactions.length}`);
  }
  
  return transaction;
}

/**
 * Get test subscriber data
 */
export function getTestSubscriber(status = 'active') {
  const seededData = global.seededTestData;
  if (!seededData?.subscribers) {
    throw new Error('Test subscribers not found in seeded data. Ensure global setup ran successfully.');
  }
  
  const subscriber = seededData.subscribers.find(s => s.status === status);
  if (!subscriber) {
    const availableStatuses = seededData.subscribers.map(s => s.status).join(', ');
    throw new Error(`Subscriber with status '${status}' not found. Available: ${availableStatuses}`);
  }
  
  return subscriber;
}

/**
 * Get test registration data
 */
export function getTestRegistration(index = 0) {
  const seededData = global.seededTestData;
  if (!seededData?.registrations) {
    throw new Error('Test registrations not found in seeded data. Ensure global setup ran successfully.');
  }
  
  const registration = seededData.registrations[index];
  if (!registration) {
    throw new Error(`Registration at index ${index} not found. Available: ${seededData.registrations.length}`);
  }
  
  return registration;
}

/**
 * Get gallery test data
 */
export function getTestGalleryData() {
  const seededData = global.seededTestData;
  if (!seededData?.gallery) {
    throw new Error('Test gallery data not found in seeded data. Ensure global setup ran successfully.');
  }
  
  return seededData.gallery;
}

/**
 * Get QR code for ticket validation tests
 */
export function getTestQRCode(ticketType = 'weekend') {
  const ticket = getTestTicket(ticketType);
  return ticket.validation_code;
}

/**
 * Get test email addresses for different scenarios
 */
export function getTestEmails() {
  const constants = getTestDataConstants();
  return {
    admin: constants.ADMIN_EMAIL,
    ticketBuyer: 'ticket-buyer@e2etest.com',
    saturdayBuyer: 'saturday-buyer@e2etest.com',
    sundayBuyer: 'sunday-buyer@e2etest.com',
    activeSubscriber: 'active-subscriber@e2etest.com',
    unsubscribed: 'unsubscribed@e2etest.com',
    bounced: 'bounced-subscriber@e2etest.com'
  };
}

/**
 * Get deterministic test values
 */
export function getTestValues() {
  const constants = getTestDataConstants();
  return {
    testPrefix: constants.TEST_PREFIX,
    eventId: 'alocubano-boulderfest-2026',
    eventDates: {
      saturday: '2026-05-15',
      sunday: '2026-05-16'
    },
    prices: {
      weekend: 7500,    // $75.00
      saturday: 5000,   // $50.00
      sunday: 5000      // $50.00
    }
  };
}

/**
 * Validate that test data is available
 */
export function validateTestDataAvailable() {
  const errors = [];
  
  if (!global.testDataConstants) {
    errors.push('testDataConstants not found in global scope');
  }
  
  if (!global.seededTestData) {
    errors.push('seededTestData not found in global scope');
  } else {
    const seededData = global.seededTestData;
    
    if (!seededData.adminUser) {
      errors.push('Admin user not found in seeded data');
    }
    
    if (!seededData.tickets || seededData.tickets.length === 0) {
      errors.push('Test tickets not found in seeded data');
    }
    
    if (!seededData.transactions || seededData.transactions.length === 0) {
      errors.push('Test transactions not found in seeded data');
    }
  }
  
  if (errors.length > 0) {
    throw new Error(`Test data validation failed:\n  - ${errors.join('\n  - ')}\n\nEnsure global-setup.js ran successfully and seeded test data.`);
  }
  
  return true;
}

/**
 * Debug helper to log all available test data
 */
export function logAvailableTestData() {
  console.log('📊 Available Test Data:');
  
  if (global.testDataConstants) {
    console.log('  Constants:', global.testDataConstants);
  } else {
    console.log('  ❌ Constants: not available');
  }
  
  if (global.seededTestData) {
    const seededData = global.seededTestData;
    console.log('  Seeded Data Summary:');
    console.log(`    Admin User: ${seededData.adminUser ? '✅' : '❌'}`);
    console.log(`    Transactions: ${seededData.transactions?.length || 0}`);
    console.log(`    Tickets: ${seededData.tickets?.length || 0}`);
    console.log(`    Subscribers: ${seededData.subscribers?.length || 0}`);
    console.log(`    Registrations: ${seededData.registrations?.length || 0}`);
    console.log(`    Gallery: ${seededData.gallery ? '✅' : '❌'}`);
  } else {
    console.log('  ❌ Seeded Data: not available');
  }
}

/**
 * Wait for test data to be available (useful if there's timing issues)
 */
export async function waitForTestData(timeoutMs = 5000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      validateTestDataAvailable();
      return true;
    } catch (error) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  throw new Error(`Test data not available after ${timeoutMs}ms timeout`);
}

// Export all helper functions
export default {
  getTestConstants,
  getTestAdmin,
  getTestTicket,
  getTestTickets,
  getTestTransaction,
  getTestSubscriber,
  getTestRegistration,
  getTestGalleryData,
  getTestQRCode,
  getTestEmails,
  getTestValues,
  validateTestDataAvailable,
  logAvailableTestData,
  waitForTestData
};