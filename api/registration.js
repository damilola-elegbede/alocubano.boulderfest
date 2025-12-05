/**
 * Registration API Endpoint
 * Handles registration token (JWT) validation and returns tickets for a transaction
 * Used by view-tickets.html to display tickets after purchase
 */

import { getRegistrationTokenService } from "../lib/registration-token-service.js";
import { getDatabaseClient } from "../lib/database.js";
import { processDatabaseResult } from "../lib/bigint-serializer.js";
import { getTicketColorService } from "../lib/ticket-color-service.js";
import { withRateLimit } from "../lib/rate-limiter.js";
import jwt from 'jsonwebtoken';

// Rate limit: 30 requests per minute per IP
const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 1000,
  maxRequests: 30,
  identifier: 'registration'
};

// Allowed CORS origins - production domain and preview deployments
const ALLOWED_ORIGINS = [
  'https://alocubano.com',
  'https://www.alocubano.com',
  /^https:\/\/alocubano-boulderfest-[a-z0-9]+\.vercel\.app$/
];

function getCorsOrigin(requestOrigin) {
  if (!requestOrigin) return null;
  for (const allowed of ALLOWED_ORIGINS) {
    if (allowed instanceof RegExp) {
      if (allowed.test(requestOrigin)) return requestOrigin;
    } else if (allowed === requestOrigin) {
      return requestOrigin;
    }
  }
  // Allow localhost in development
  if (requestOrigin.startsWith('http://localhost:')) return requestOrigin;
  return null;
}

async function handler(req, res) {
  // Set CORS headers - restrict to allowed origins
  const origin = req.headers.origin;
  const allowedOrigin = getCorsOrigin(origin);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { token, ticketId } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    console.log('[Registration] Validating registration token');

    // Get token service and initialize
    const tokenService = getRegistrationTokenService();
    await tokenService.ensureInitialized();

    // Verify JWT without consuming (allow page refresh)
    // The token contains: { tid, txn, type: 'registration', iat, exp }
    // SECURITY: Explicitly specify algorithm to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, tokenService.secret, { algorithms: ['HS256'] });

    if (decoded.type !== 'registration' || !decoded.txn) {
      console.log('[Registration] Invalid token type or missing txn');
      return res.status(401).json({ error: 'Invalid token type' });
    }

    const transactionId = decoded.txn;
    console.log('[Registration] Token valid for transaction:', transactionId);

    const db = await getDatabaseClient();

    // Fetch tickets for this transaction
    // SECURITY: Do NOT select qr_token - it's a sensitive credential for ticket scanning
    let sql = `
      SELECT
        t.ticket_id,
        t.ticket_type,
        t.attendee_first_name,
        t.attendee_last_name,
        t.attendee_email,
        t.registration_status,
        t.registered_at,
        t.registration_deadline,
        t.scan_count,
        t.max_scan_count,
        tx.customer_email as purchaser_email,
        tx.created_at as purchase_date
      FROM tickets t
      JOIN transactions tx ON t.transaction_id = tx.id
      WHERE tx.id = ?
    `;
    const args = [transactionId];

    // Optional: filter by ticketId if specified
    if (ticketId) {
      sql += ' AND t.ticket_id = ?';
      args.push(ticketId);
    }

    const result = await db.execute({ sql, args });
    const processed = processDatabaseResult(result);

    if (processed.rows.length === 0) {
      console.log('[Registration] No tickets found for transaction:', transactionId);
      return res.status(404).json({ error: 'No tickets found' });
    }

    console.log('[Registration] Found', processed.rows.length, 'tickets');

    // Format tickets with colors
    const colorService = getTicketColorService();
    const tickets = await Promise.all(processed.rows.map(async (t) => {
      const color = await colorService.getColorForTicketType(t.ticket_type);
      return {
        ticketId: t.ticket_id,
        ticketType: t.ticket_type,
        color_name: color.name,
        color_rgb: color.rgb,
        status: t.registration_status,
        registeredAt: t.registered_at,
        registration_deadline: t.registration_deadline,
        attendee: t.attendee_first_name ? {
          firstName: t.attendee_first_name,
          lastName: t.attendee_last_name,
          email: t.attendee_email
        } : null,
        scan_count: t.scan_count || 0,
        max_scan_count: t.max_scan_count || 3,
        scans_remaining: Math.max(0, (t.max_scan_count || 3) - (t.scan_count || 0))
      };
    }));

    res.status(200).json({
      purchaserEmail: processed.rows[0].purchaser_email,
      purchaseDate: processed.rows[0].purchase_date,
      transactionId: transactionId,
      tickets: tickets,
      timezone: 'America/Denver'
    });

  } catch (error) {
    console.error('[Registration] Error:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
}

// Export with rate limiting wrapper
export default withRateLimit(handler, RATE_LIMIT_CONFIG);
