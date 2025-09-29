/**
 * Admin API Endpoint: Sync Stripe Prices
 * Triggers synchronization of ticket_types with Stripe Price objects
 * Requires admin authentication
 */

import authService from '../../lib/auth-service.js';
import { stripePriceSyncService } from '../../lib/stripe-price-sync-service.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(200).end();
  }

  // Verify admin authentication
  try {
    await authService.ensureInitialized();
    const session = await authService.verifyRequest(req);

    if (!session.valid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }

  try {
    if (req.method === 'GET') {
      // Get sync status - shows which ticket types need syncing
      const status = await stripePriceSyncService.getSyncStatus();

      return res.status(200).json({
        success: true,
        status
      });

    } else if (req.method === 'POST') {
      // Trigger sync for all ticket types or a specific ticket type
      const { ticketTypeId } = req.body || {};

      let result;
      if (ticketTypeId) {
        // Sync single ticket type
        logger.log(`Admin triggering Stripe price sync for ticket type: ${ticketTypeId}`);
        result = await stripePriceSyncService.syncTicketType(ticketTypeId);
      } else {
        // Sync all ticket types
        logger.log('Admin triggering Stripe price sync for all ticket types');
        result = await stripePriceSyncService.syncPricesWithStripe();
      }

      return res.status(200).json({
        success: true,
        result
      });

    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    logger.error('Stripe price sync error:', error);

    // Return detailed error information for admin
    return res.status(500).json({
      error: 'Stripe price sync failed',
      message: error.message,
      details: process.env.NODE_ENV !== 'production' ? {
        errorType: error.name,
        errorMessage: error.message,
        stack: error.stack
      } : undefined
    });
  }
}