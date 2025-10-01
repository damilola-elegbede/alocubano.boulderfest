/**
 * Admin Test Data Clear API
 * Endpoint for clearing all test tickets and related data
 * Requires admin authentication
 */

import jwt from 'jsonwebtoken';
import { setSecureCorsHeaders } from '../../../lib/cors-config.js';
import { TestDataCleanupService } from '../../../lib/test-data-cleanup.js';

/**
 * Verify admin authentication
 * @param {Object} req - Request object
 * @returns {Object} Decoded admin user
 */
function verifyAdminAuth(req) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (!ADMIN_SECRET) {
    throw new Error('Authentication service unavailable - ADMIN_SECRET not configured');
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, ADMIN_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 5
    });
    if (decoded.role !== 'admin') {
      throw new Error('Not an admin user');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired admin token');
  }
}

/**
 * Sanitize admin user information for logging
 * @param {string} userInfo - Admin user information
 * @returns {string} Sanitized user information
 */
function sanitizeAdminUserInfo(userInfo) {
  if (!userInfo || typeof userInfo !== 'string') {
    return '[UNKNOWN]';
  }

  if (userInfo.includes('@')) {
    const [localPart, domain] = userInfo.split('@');
    return `${localPart.substring(0, 2)}***@${domain}`;
  }

  if (userInfo.length <= 3) {
    return '***';
  }

  return userInfo.substring(0, 2) + '*'.repeat(userInfo.length - 2);
}

export default async function handler(req, res) {
  console.log('=== Admin Test Data Clear Handler Started ===');
  console.log('Request method:', req.method);
  console.log('Request URL:', req.url);

  // Set secure CORS headers
  setSecureCorsHeaders(req, res, {
    allowedMethods: ['POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  });

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!['POST', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'POST, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const adminUser = verifyAdminAuth(req);
    console.log('Admin authenticated:', sanitizeAdminUserInfo(adminUser.username || adminUser.email));

    // Initialize cleanup service
    const cleanupService = new TestDataCleanupService();
    await cleanupService.ensureInitialized();

    // Define cleanup criteria for test data
    // Test events have event_id of -1 (Test Weekender) or -2 (Test Festival)
    const cleanupCriteria = {
      event_ids: [-1, -2],
      create_backup: false,
      verify_checksums: true,
      force: true
    };

    console.log('Starting test data cleanup with criteria:', cleanupCriteria);

    // Perform the cleanup
    const result = await cleanupService.performCleanup(null, cleanupCriteria);

    console.log('Test data cleanup completed:', {
      ticketsDeleted: result.tickets_deleted || 0,
      transactionsDeleted: result.transactions_deleted || 0,
      totalRecords: result.records_deleted || 0
    });

    return res.status(200).json({
      success: true,
      message: 'Test data cleared successfully',
      data: {
        tickets_deleted: result.tickets_deleted || 0,
        transactions_deleted: result.transactions_deleted || 0,
        transaction_items_deleted: result.transaction_items_deleted || 0,
        related_records_deleted: result.related_records_deleted || 0,
        total_records_deleted: result.records_deleted || 0,
        verification_checksum: result.verification_checksum,
        duration_ms: result.metadata?.duration_ms || 0
      },
      adminUser: sanitizeAdminUserInfo(adminUser.username || adminUser.email),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Admin test data clear error:', error);

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
      message: 'Failed to clear test data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
