import authService from '../../lib/auth-service.js';
import csrfService from '../../lib/csrf-service.js';
import { getDatabaseClient } from '../../lib/database.js';
import { getValidationService } from '../../lib/validation-service.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';
import { withHighSecurityAudit } from '../../lib/admin-audit-middleware.js';

async function handler(req, res) {
  let db;

  try {
    db = await getDatabaseClient();
    if (req.method === 'GET') {
      const validationService = getValidationService();

      // Validate all search parameters
      const validation = validationService.validateTransactionSearchParams(
        req.query
      );

      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors
        });
      }

      const { sanitized } = validation;

      // Build query
      let sql = `
        SELECT 
          t.*,
          COUNT(DISTINCT ti.id) as item_count,
          GROUP_CONCAT(DISTINCT ti.item_name) as items
        FROM transactions t
        LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
        WHERE 1=1
      `;

      const args = [];

      if (sanitized.email) {
        sql += ' AND t.customer_email = ?';
        args.push(sanitized.email);
      }

      if (sanitized.status) {
        sql += ' AND t.status = ?';
        args.push(sanitized.status);
      }

      sql += ' GROUP BY t.id ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
      args.push(sanitized.limit, sanitized.offset);

      const result = await db.execute({ sql, args });

      // Get total count
      let countSql = 'SELECT COUNT(*) as total FROM transactions WHERE 1=1';
      const countArgs = [];

      if (sanitized.email) {
        countSql += ' AND customer_email = ?';
        countArgs.push(sanitized.email);
      }

      if (sanitized.status) {
        countSql += ' AND status = ?';
        countArgs.push(sanitized.status);
      }

      const countResult = await db.execute({ sql: countSql, args: countArgs });

      res.status(200).json({
        transactions: result.rows,
        total: countResult.rows[0].total,
        limit: sanitized.limit,
        offset: sanitized.offset,
        hasMore: sanitized.offset + sanitized.limit < countResult.rows[0].total
      });
    } else if (req.method === 'POST') {
      // Manual transaction creation (for testing)
      // Verify CSRF token for POST requests
      const csrfToken = req.headers['x-csrf-token'] || req.body?.csrfToken;
      if (!csrfToken) {
        return res.status(403).json({ error: 'CSRF token required' });
      }

      // Get session ID from authenticated user
      const sessionToken = authService.getSessionFromRequest(req);
      if (!sessionToken) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const session = await authService.verifySessionToken(sessionToken);
      if (!session.valid) {
        return res.status(401).json({ error: 'Invalid session' });
      }

      const csrfVerification = csrfService.verifyToken(
        csrfToken,
        session.admin.id
      );
      if (!csrfVerification.valid) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
      }

      const { amount, email, name, type = 'tickets' } = req.body;
      const validationService = getValidationService();

      // Validate all required fields
      const errors = [];

      // Validate amount
      const amountValidation = validationService.validateAmount(amount);
      if (!amountValidation.isValid) {
        errors.push(amountValidation.error);
      }

      // Validate email
      const emailValidation = validationService.validateEmail(email);
      if (!emailValidation.isValid) {
        errors.push(emailValidation.error);
      }

      // Validate name if provided
      const nameValidation = validationService.validateName(
        name,
        'Customer name'
      );
      if (!nameValidation.isValid) {
        errors.push(nameValidation.error);
      }

      // Validate type
      const typeValidation = validationService.validateEnum(
        type,
        'transaction type',
        'transactionTypes'
      );
      if (!typeValidation.isValid) {
        return res.status(400).json({
          error: typeValidation.error,
          allowedValues: typeValidation.allowedValues
        });
      }

      // Return validation errors if any
      if (errors.length > 0) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors
        });
      }

      const numAmount = amountValidation.amount;

      const uuid = `MANUAL-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      await db.execute({
        sql: `INSERT INTO transactions (
          uuid, order_type, status, total_amount, currency,
          customer_email, customer_name, order_details, payment_method, paid_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          uuid,
          type,
          'paid', // Use valid status
          Math.round(numAmount * 100),
          'USD',
          email,
          name || null,
          JSON.stringify({ manual: true, created_by: 'admin' }),
          'stripe_checkout', // Use valid payment method
          new Date().toISOString()
        ]
      });

      res
        .status(201)
        .json({ transactionId: uuid, message: 'Transaction created' });
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('Transaction API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Wrap the entire middleware chain in an error-handling function
// to ensure all errors are returned as JSON
async function safeHandler(req, res) {
  try {
    // Build the middleware chain inside the try-catch
    // This ensures any middleware initialization errors are caught
    const securedHandler = withSecurityHeaders(authService.requireAuth(withHighSecurityAudit(handler, {
      requireExplicitAction: true,
      logFullRequest: true,
      alertOnFailure: true
    })));

    // Execute the secured handler
    return await securedHandler(req, res);
  } catch (error) {
    console.error('Fatal error in transactions endpoint:', error);

    // Check if this is an auth initialization error
    if (error.message.includes('ADMIN_SECRET')) {
      return res.status(500).json({
        error: 'Authentication service unavailable',
        message: process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview'
          ? `Auth configuration error: ${error.message}`
          : 'Authentication service is temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    // Always return JSON error response for other errors
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
