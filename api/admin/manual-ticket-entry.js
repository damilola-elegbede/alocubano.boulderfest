/**
 * Manual Ticket Entry API Endpoint
 * Allows admin staff to create tickets for at-door purchases (cash, card, venmo, comp)
 */

import authService from "../../lib/auth-service.js";
import { withSecurityHeaders } from "../../lib/security-headers-serverless.js";
import { withAdminAudit } from "../../lib/admin-audit-middleware.js";
import csrfService from "../../lib/csrf-service.js";
import { getFraudDetectionService } from "../../lib/fraud-detection-service.js";
import { createManualTickets } from "../../lib/manual-ticket-creation-service.js";
import { processDatabaseResult } from "../../lib/bigint-serializer.js";
import timeUtils from "../../lib/time-utils.js";

/**
 * Input validation schemas
 */
const INPUT_VALIDATION = {
  manualEntryId: {
    required: true,
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    error: 'manualEntryId must be a valid UUID'
  },
  paymentMethod: {
    required: true,
    allowedValues: ['cash', 'card_terminal', 'venmo', 'comp'],
    error: 'paymentMethod must be one of: cash, card_terminal, venmo, comp'
  },
  customerEmail: {
    required: true,
    maxLength: 255,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    error: 'customerEmail must be a valid email address'
  },
  customerName: {
    required: true,
    minLength: 1,
    maxLength: 200,
    error: 'customerName is required and must be under 200 characters'
  },
  customerPhone: {
    required: false,
    maxLength: 50,
    pattern: /^[\d\s\-\+\(\)]+$/,
    error: 'customerPhone must contain only numbers, spaces, and phone characters'
  },
  cashShiftId: {
    required: false,
    pattern: /^\d+$/,
    error: 'cashShiftId must be a positive integer'
  },
  isTest: {
    required: false,
    type: 'boolean',
    error: 'isTest must be a boolean'
  }
};

/**
 * Validate input field
 */
function validateField(value, field, rules) {
  // Check required fields
  if (rules.required && (value === undefined || value === null || value === '')) {
    return { isValid: false, error: `${field} is required` };
  }

  // Skip further validation if field is not required and empty
  if (!rules.required && (value === undefined || value === null || value === '')) {
    return { isValid: true };
  }

  // Type validation
  if (rules.type === 'boolean') {
    if (typeof value !== 'boolean') {
      return { isValid: false, error: rules.error };
    }
    return { isValid: true };
  }

  // String validation
  if (typeof value !== 'string' && rules.pattern) {
    return { isValid: false, error: rules.error };
  }

  const strValue = String(value);

  // Length validation
  if (rules.minLength && strValue.length < rules.minLength) {
    return { isValid: false, error: rules.error };
  }

  if (rules.maxLength && strValue.length > rules.maxLength) {
    return { isValid: false, error: rules.error };
  }

  // Pattern validation
  if (rules.pattern && !rules.pattern.test(strValue)) {
    return { isValid: false, error: rules.error };
  }

  // Allowed values validation
  if (rules.allowedValues && !rules.allowedValues.includes(strValue)) {
    return { isValid: false, error: rules.error };
  }

  // XSS and injection protection
  const dangerousPatterns = [
    /<script[^>]*>/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /\$\{.*\}/,
    /__proto__/,
    /constructor/,
    /prototype/,
    /eval\s*\(/i,
    /function\s*\(/i,
    /\.\.\//,
    /union\s+select/i,
    /insert\s+into/i,
    /delete\s+from/i,
    /drop\s+table/i,
    new RegExp('[\\x00\\x08\\x0B\\x0C]')
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(strValue)) {
      return { isValid: false, error: 'Invalid characters detected' };
    }
  }

  return { isValid: true };
}

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers to prevent caching of sensitive data
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // ========================================================================
    // STEP 1: Input Validation
    // ========================================================================
    const {
      manualEntryId,
      ticketItems,
      paymentMethod,
      customerEmail,
      customerName,
      customerPhone,
      cashShiftId,
      isTest = false
    } = req.body || {};

    // Validate required fields
    const validations = {
      manualEntryId: validateField(manualEntryId, 'manualEntryId', INPUT_VALIDATION.manualEntryId),
      paymentMethod: validateField(paymentMethod, 'paymentMethod', INPUT_VALIDATION.paymentMethod),
      customerEmail: validateField(customerEmail, 'customerEmail', INPUT_VALIDATION.customerEmail),
      customerName: validateField(customerName, 'customerName', INPUT_VALIDATION.customerName),
      customerPhone: validateField(customerPhone, 'customerPhone', INPUT_VALIDATION.customerPhone),
      cashShiftId: validateField(cashShiftId, 'cashShiftId', INPUT_VALIDATION.cashShiftId),
      isTest: validateField(isTest, 'isTest', INPUT_VALIDATION.isTest)
    };

    // Check for validation errors
    for (const [field, result] of Object.entries(validations)) {
      if (!result.isValid) {
        return res.status(400).json({ error: result.error, field });
      }
    }

    // Validate ticketItems array
    if (!Array.isArray(ticketItems) || ticketItems.length === 0) {
      return res.status(400).json({ error: 'ticketItems must be a non-empty array' });
    }

    // Validate each ticket item
    for (const item of ticketItems) {
      if (!item.ticketTypeId || typeof item.ticketTypeId !== 'string') {
        return res.status(400).json({ error: 'Each ticket item must have a valid ticketTypeId' });
      }
      if (!item.quantity || typeof item.quantity !== 'number' || item.quantity < 1) {
        return res.status(400).json({ error: 'Each ticket item must have a quantity >= 1' });
      }
      if (item.quantity > 50) {
        return res.status(400).json({ error: 'Maximum 50 tickets per item' });
      }
    }

    // Validate total ticket count
    const totalTickets = ticketItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalTickets > 100) {
      return res.status(400).json({ error: 'Maximum 100 tickets per transaction' });
    }

    // Validate cash shift requirement for cash payments
    if (paymentMethod === 'cash' && !cashShiftId) {
      return res.status(400).json({
        error: 'cashShiftId is required for cash payments',
        details: 'Please ensure a cash shift is open before processing cash payments'
      });
    }

    // ========================================================================
    // STEP 2: Fraud Detection Check
    // ========================================================================
    const fraudDetectionService = getFraudDetectionService();
    await fraudDetectionService.ensureInitialized();
    const fraudCheck = await fraudDetectionService.checkManualTicketRateLimit();

    if (fraudCheck.alert) {
      console.warn(`🚨 Fraud alert triggered: ${fraudCheck.message}`);
      // Continue processing but log the alert - don't block the transaction
      // The alert email has already been sent by the fraud detection service
    }

    // Log fraud detection result
    console.log(`Fraud detection check: ${fraudCheck.count} tickets in last 15 minutes (threshold: 20)`);

    // ========================================================================
    // STEP 3: Create Manual Tickets
    // ========================================================================
    const result = await createManualTickets({
      manualEntryId,
      ticketItems,
      paymentMethod,
      customerEmail,
      customerName,
      customerPhone: customerPhone || null,
      cashShiftId: cashShiftId ? parseInt(cashShiftId, 10) : null,
      isTest
    });

    // ========================================================================
    // STEP 4: Return Success Response with Mountain Time Fields
    // ========================================================================
    // Enhance transaction with Mountain Time fields
    const enhancedTransaction = timeUtils.enhanceApiResponse(
      {
        id: result.transaction.id,
        transaction_id: result.transaction.transaction_id,
        uuid: result.transaction.uuid,
        order_number: result.transaction.order_number,
        amount_cents: result.transaction.amount_cents,
        currency: result.transaction.currency,
        payment_processor: result.transaction.payment_processor,
        status: result.transaction.status,
        customer_email: result.transaction.customer_email,
        customer_name: result.transaction.customer_name,
        created_at: result.transaction.created_at,
        completed_at: result.transaction.completed_at
      },
      ['created_at', 'completed_at'],
      { includeDeadline: false }
    );

    // Enhance tickets with Mountain Time fields
    const enhancedTickets = result.tickets.map(ticket =>
      timeUtils.enhanceApiResponse(
        {
          ticket_id: ticket.ticket_id,
          type: ticket.type,
          created_at: ticket.created_at,
          registration_deadline: ticket.registration_deadline
        },
        ['created_at', 'registration_deadline'],
        { includeDeadline: false }
      )
    );

    return res.status(result.created ? 201 : 200).json(
      processDatabaseResult({
        success: true,
        created: result.created,
        transaction: enhancedTransaction,
        tickets: enhancedTickets,
        ticketCount: result.ticketCount,
        fraudCheck: {
          recentTickets: fraudCheck.count,
          threshold: 20,
          alert: fraudCheck.alert
        }
      })
    );

  } catch (error) {
    console.error('Manual ticket entry error:', error);

    // Handle specific error types
    if (error.message.includes('Ticket type not found')) {
      return res.status(404).json({ error: error.message });
    }

    if (error.message.includes('not available') || error.message.includes('Insufficient tickets')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message.includes('not active')) {
      return res.status(400).json({ error: error.message });
    }

    if (error.message.includes('Transaction total cannot be $0')) {
      return res.status(400).json({ error: error.message });
    }

    // Generic error response
    return res.status(500).json({
      error: 'Failed to create manual tickets',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Build middleware chain with security features
// IMPORTANT: Order matters - audit must be outside auth to capture unauthorized access
const securedHandler = withSecurityHeaders(
  withAdminAudit(
    authService.requireAuth(
      csrfService.validateCSRF(handler, {
        skipOriginValidation: false,
        requireHttps: process.env.NODE_ENV === 'production'
      })
    ),
    {
      logBody: true, // Log ticket creation for audit trail
      logMetadata: true,
      skipMethods: [] // Log all methods
    }
  )
);

// Wrap in error-handling function to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  try {
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in manual ticket entry endpoint:', error);

    // Check for authentication errors
    if (error.message?.includes('ADMIN_SECRET') || error.message?.includes('Authentication')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Generic error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? error.message
          : 'A server error occurred while processing your request',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default safeHandler;
