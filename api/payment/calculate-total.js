/**
 * Calculate Total API Endpoint
 * Server-side price calculation for validation
 */

import { calculateTotal } from '../../lib/payment/calculator.js';
import { validateItems, sanitizeItems } from '../../lib/payment/validation.js';
import { withRateLimit } from '../../lib/middleware/rateLimiter.js';
import { ERROR_MESSAGES } from '../../lib/payment/config.js';

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items } = req.body;

    // Validate items
    const validation = validateItems(items);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Sanitize items
    const sanitizedItems = sanitizeItems(items);

    // Calculate total with breakdown
    const calculation = calculateTotal(sanitizedItems);

    res.status(200).json({
      success: true,
      total: calculation.total, // In cents
      totalDollars: calculation.totalDollars,
      breakdown: calculation.breakdown,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calculate total error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }

    res.status(500).json({ 
      error: ERROR_MESSAGES.INTERNAL_ERROR 
    });
  }
}

// Apply API rate limiting
export default withRateLimit(handler, 'api');