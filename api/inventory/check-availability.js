/**
 * Check Inventory Availability API
 * Returns real-time ticket availability
 */

import { inventoryManager } from '../../lib/inventory/manager.js';
import { validateItems, sanitizeItems } from '../../lib/payment/validation.js';
import { withRateLimit } from '../../lib/middleware/rateLimiter.js';
import { ERROR_MESSAGES } from '../../lib/payment/config.js';

/**
 * Main handler function
 */
async function handler(req, res) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=30'); // Cache for 30 seconds

  if (req.method === 'GET') {
    // Get all inventory levels
    try {
      const levels = await inventoryManager.getInventoryLevels();
      
      res.status(200).json({
        success: true,
        inventory: levels,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get inventory levels error:', error);
      res.status(500).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    }

  } else if (req.method === 'POST') {
    // Check availability for specific items
    try {
      const { items } = req.body;

      if (!items) {
        return res.status(400).json({ error: 'Items required' });
      }

      // Validate items
      const validation = validateItems(items);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      // Sanitize items
      const sanitizedItems = sanitizeItems(items);

      // Check availability
      const availability = await inventoryManager.checkAvailability(sanitizedItems);

      res.status(200).json({
        success: true,
        available: availability.available,
        items: availability.items,
        unavailable: availability.unavailable,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Check availability error:', error);

      if (error.name === 'ValidationError') {
        return res.status(400).json({ error: error.message });
      }

      res.status(500).json({ error: ERROR_MESSAGES.INTERNAL_ERROR });
    }

  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

// Apply API rate limiting
export default withRateLimit(handler, 'api');