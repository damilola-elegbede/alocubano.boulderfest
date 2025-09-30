/**
 * Cron Job: Cleanup Expired Reservations
 *
 * Runs periodically to mark expired ticket reservations as expired.
 * This ensures that tickets held in expired checkout sessions are
 * released back to the available pool.
 *
 * Schedule: Every 5 minutes (recommended)
 * Vercel Cron: * /5 * * * * (every 5 minutes)
 */

import { cleanupExpiredReservations } from '../../lib/ticket-availability-service.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Verify authorization for cron job
  const authHeader = req.headers.authorization;

  // Vercel Cron sends a special authorization header
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || ''}`;

  if (authHeader !== expectedAuth && process.env.NODE_ENV === 'production') {
    logger.warn('Unauthorized cron job access attempt');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization header'
    });
  }

  try {
    const startTime = Date.now();
    logger.info('Starting expired reservations cleanup...');

    // Clean up expired reservations
    const cleanedCount = await cleanupExpiredReservations();

    const duration = Date.now() - startTime;

    logger.info(`Expired reservations cleanup completed:`, {
      cleanedCount,
      duration: `${duration}ms`
    });

    return res.status(200).json({
      success: true,
      cleanedCount,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Expired reservations cleanup failed:', {
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}