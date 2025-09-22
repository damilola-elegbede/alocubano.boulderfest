/**
 * Admin Test Cart API
 * Provides endpoints for managing test cart items during admin testing
 * Requires admin authentication for all operations
 */

import jwt from 'jsonwebtoken';
import { setSecureCorsHeaders } from '../../lib/cors-config.js';

/**
 * Sanitize admin user information for logging and responses
 * @param {string} userInfo - Admin user information (username or email)
 * @returns {string} Sanitized user information
 */
function sanitizeAdminUserInfo(userInfo) {
  if (!userInfo || typeof userInfo !== 'string') {
    return '[UNKNOWN]';
  }

  // If it's an email, mask the domain part
  if (userInfo.includes('@')) {
    const [localPart, domain] = userInfo.split('@');
    return `${localPart.substring(0, 2)}***@${domain}`;
  }

  // For usernames, mask most characters
  if (userInfo.length <= 3) {
    return '***';
  }

  return userInfo.substring(0, 2) + '*'.repeat(userInfo.length - 2);
}

const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  throw new Error('❌ FATAL: ADMIN_SECRET environment variable not configured');
}

// Test ticket configurations
const TEST_TICKET_TYPES = {
  'weekend-pass': {
    name: 'Weekend Pass',
    price: 150.00,
    eventId: 'boulder-fest-2026',
    eventDate: '2026-05-15',
    description: 'Full weekend access to all events'
  },
  'friday-only': {
    name: 'Friday Night Only',
    price: 75.00,
    eventId: 'boulder-fest-2026',
    eventDate: '2026-05-15',
    description: 'Friday night party access'
  },
  'workshop-bundle': {
    name: 'Workshop Bundle',
    price: 200.00,
    eventId: 'boulder-fest-2026',
    eventDate: '2026-05-15',
    description: 'All workshops and weekend access'
  }
};

// Admin authentication middleware
function verifyAdminAuth(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET);
    if (!decoded.isAdmin) {
      throw new Error('Not an admin user');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired admin token');
  }
}

// Validate test cart request
function validateTestCartRequest(body) {
  const { action, ticketType, quantity, donationAmount } = body;

  if (!action) {
    throw new Error('Action is required');
  }

  if (!['add_ticket', 'add_donation', 'get_config', 'clear_test_items'].includes(action)) {
    throw new Error('Invalid action');
  }

  if (action === 'add_ticket') {
    if (!ticketType || !TEST_TICKET_TYPES[ticketType]) {
      throw new Error(`Invalid ticket type. Available: ${Object.keys(TEST_TICKET_TYPES).join(', ')}`);
    }

    if (!quantity || quantity < 1 || quantity > 10) {
      throw new Error('Quantity must be between 1 and 10');
    }
  }

  if (action === 'add_donation') {
    if (!donationAmount || donationAmount < 5 || donationAmount > 1000) {
      throw new Error('Donation amount must be between $5 and $1000');
    }
  }

  return { action, ticketType, quantity, donationAmount };
}

export default async function handler(req, res) {
  console.log('=== Admin Test Cart Handler Started ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  // Set secure CORS headers - do not override security configuration
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!['POST', 'GET'].includes(req.method)) {
    res.setHeader('Allow', 'POST, GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const adminUser = verifyAdminAuth(req);
    console.log('Admin authenticated:', sanitizeAdminUserInfo(adminUser.username || adminUser.email));

    // Handle GET request - return test configuration
    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        testTicketTypes: TEST_TICKET_TYPES,
        testModeEnabled: true,
        availableActions: [
          'add_ticket',
          'add_donation',
          'get_config',
          'clear_test_items'
        ]
      });
    }

    // Handle POST request - process test cart operations
    const validatedRequest = validateTestCartRequest(req.body);
    const { action, ticketType, quantity, donationAmount } = validatedRequest;

    console.log('Processing test cart action:', action);

    switch (action) {
    case 'add_ticket': {
      const ticketConfig = TEST_TICKET_TYPES[ticketType];

      const testTicketData = {
        ticketType,
        price: ticketConfig.price,
        name: ticketConfig.name,
        eventId: ticketConfig.eventId,
        eventDate: ticketConfig.eventDate,
        quantity,
        isTestItem: true,
        description: ticketConfig.description,
        addedVia: 'admin_test_api',
        adminUser: sanitizeAdminUserInfo(adminUser.username || adminUser.email),
        timestamp: new Date().toISOString()
      };

      return res.status(200).json({
        success: true,
        action: 'add_ticket',
        data: testTicketData,
        message: `Test ticket added: ${quantity}x ${ticketConfig.name}`,
        testMode: true
      });
    }

    case 'add_donation': {
      const testDonationData = {
        amount: donationAmount,
        name: 'TEST - Festival Support',
        isTestItem: true,
        addedVia: 'admin_test_api',
        adminUser: sanitizeAdminUserInfo(adminUser.username || adminUser.email),
        timestamp: new Date().toISOString()
      };

      return res.status(200).json({
        success: true,
        action: 'add_donation',
        data: testDonationData,
        message: `Test donation added: $${donationAmount}`,
        testMode: true
      });
    }

    case 'get_config': {
      return res.status(200).json({
        success: true,
        action: 'get_config',
        testTicketTypes: TEST_TICKET_TYPES,
        testModeEnabled: true,
        adminUser: sanitizeAdminUserInfo(adminUser.username || adminUser.email)
      });
    }

    case 'clear_test_items': {
      return res.status(200).json({
        success: true,
        action: 'clear_test_items',
        message: 'Test items clearing initiated',
        testMode: true,
        adminUser: sanitizeAdminUserInfo(adminUser.username || adminUser.email)
      });
    }

    default:
      return res.status(400).json({
        error: 'Unhandled action',
        action
      });
    }
  } catch (error) {
    console.error('Admin test cart error:', error);

    // Handle specific error types
    if (error.message.includes('authorization') ||
        error.message.includes('admin') ||
        error.message.includes('token')) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    }

    if (error.message.includes('Invalid') ||
        error.message.includes('required') ||
        error.message.includes('must be')) {
      return res.status(400).json({
        error: 'Validation failed',
        message: error.message
      });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process test cart request',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}