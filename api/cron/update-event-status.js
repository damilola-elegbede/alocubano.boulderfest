/**
 * Cron Job: Automatic Event Status Updates
 *
 * Automatically transitions event statuses based on dates:
 * - 'upcoming' → 'active' on start_date (at 00:00 MT)
 * - 'active' → 'completed' on end_date + 1 day (at 00:00 MT)
 *
 * Schedule: Once per hour (recommended)
 * Vercel Cron: 0 * * * * (at minute 0 of every hour)
 *
 * Status Transitions:
 * - upcoming → active: When current date >= start_date
 * - active → completed: When current date > end_date
 *
 * Note: Times are compared in Mountain Time (America/Denver)
 */

import { getDatabaseClient } from '../../lib/database.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Verify authorization for cron job
  const authHeader = req.headers.authorization;

  // Vercel Cron sends a special authorization header
  const expectedAuth = `Bearer ${process.env.CRON_SECRET || ''}`;

  if (authHeader !== expectedAuth && process.env.NODE_ENV === 'production') {
    logger.warn('Unauthorized cron job access attempt for event status update');
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid authorization header'
    });
  }

  try {
    const startTime = Date.now();
    logger.info('Starting automatic event status updates...');

    const db = await getDatabaseClient();

    // Get current date in Mountain Time (America/Denver)
    const now = new Date();
    const mtFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Denver',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const [month, day, year] = mtFormatter.format(now).split('/');
    const currentDateMT = `${year}-${month}-${day}`; // YYYY-MM-DD format

    logger.info(`Current date in Mountain Time: ${currentDateMT}`);

    // Transition 1: upcoming → active (when current date >= start_date)
    const activateResult = await db.execute({
      sql: `
        UPDATE events
        SET status = 'active', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'upcoming'
          AND date(start_date) <= date(?)
          AND id > 0
      `,
      args: [currentDateMT]
    });

    const activatedCount = activateResult.rowsAffected || 0;

    if (activatedCount > 0) {
      // Log which events were activated
      const activatedEvents = await db.execute({
        sql: `
          SELECT id, name, slug, start_date, end_date
          FROM events
          WHERE status = 'active'
            AND date(start_date) <= date(?)
            AND id > 0
          ORDER BY start_date
        `,
        args: [currentDateMT]
      });

      logger.info(`Activated ${activatedCount} event(s):`, {
        events: activatedEvents.rows.map(e => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          startDate: e.start_date
        }))
      });
    }

    // Transition 2: active → completed (when current date > end_date)
    const completeResult = await db.execute({
      sql: `
        UPDATE events
        SET status = 'completed', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active'
          AND date(end_date) < date(?)
          AND id > 0
      `,
      args: [currentDateMT]
    });

    const completedCount = completeResult.rowsAffected || 0;

    if (completedCount > 0) {
      // Log which events were completed
      const completedEvents = await db.execute({
        sql: `
          SELECT id, name, slug, start_date, end_date
          FROM events
          WHERE status = 'completed'
            AND date(end_date) < date(?)
            AND id > 0
          ORDER BY end_date DESC
        `,
        args: [currentDateMT]
      });

      logger.info(`Completed ${completedCount} event(s):`, {
        events: completedEvents.rows.map(e => ({
          id: e.id,
          name: e.name,
          slug: e.slug,
          endDate: e.end_date
        }))
      });
    }

    const duration = Date.now() - startTime;

    logger.info('Event status updates completed:', {
      activatedCount,
      completedCount,
      duration: `${duration}ms`
    });

    return res.status(200).json({
      success: true,
      updates: {
        activated: activatedCount,
        completed: completedCount
      },
      currentDateMT,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Event status update failed:', {
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
