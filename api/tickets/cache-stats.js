/**
 * API Endpoint: Ticket Cache Statistics
 * Provides real-time cache performance metrics for monitoring
 */

import { ticketCacheService } from '../../lib/ticket-cache-service.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Ensure service is initialized
    await ticketCacheService.ensureInitialized();

    // Get comprehensive cache statistics
    const stats = ticketCacheService.getCacheStats();

    // Add system health indicators
    const healthMetrics = {
      cacheHealthy: stats.isValid || stats.ticketCacheSize > 0,
      canServeRequests: stats.ticketCacheSize > 0,
      needsRefresh: !stats.isValid,
      serverEnvironment: process.env.VERCEL ? 'serverless' : 'local',
      timestamp: new Date().toISOString()
    };

    logger.log(`📊 Cache stats requested: ${stats.hitRate} hit rate, ${stats.ticketCacheSize} tickets cached`);

    res.status(200).json({
      success: true,
      cache: stats,
      health: healthMetrics
    });

  } catch (error) {
    logger.error('Failed to get ticket cache statistics:', error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve cache statistics',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}