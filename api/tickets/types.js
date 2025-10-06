/**
 * Ticket Types API Endpoint
 * Provides access to ticket type configuration with caching
 *
 * Query parameters:
 * - event_id: Filter by specific event
 * - status: Filter by availability status (comma-separated)
 * - include_test: Include test tickets (default false)
 */

import { ticketTypeCache } from '../../lib/ticket-type-cache.js';
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
import { logger } from '../../lib/logger.js';

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    });
  }

  try {
    const { event_id, status, include_test } = req.query;
    const startTime = Date.now();

    // Get all ticket types from cache
    let ticketTypes = await ticketTypeCache.getAll();
    const wasFromCache = ticketTypeCache.isValid();

    // Filter by event if specified
    if (event_id) {
      ticketTypes = ticketTypes.filter(t => String(t.event_id) === String(event_id));
    }

    // Filter by status if specified
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      ticketTypes = ticketTypes.filter(t => statuses.includes(t.status));
    }

    // Filter out test tickets unless explicitly requested
    if (include_test !== 'true') {
      ticketTypes = ticketTypes.filter(t => t.status !== 'test');
    }

    // Enrich tickets with availability calculation
    const enrichedTickets = ticketTypes.map(ticket => ({
      ...ticket,
      // Calculate availability (max_quantity - sold_count)
      availability: ticket.max_quantity ?
        Math.max(0, ticket.max_quantity - (ticket.sold_count || 0)) :
        null,
      // Event information is already joined in the cache
      event: {
        id: ticket.event_id,
        name: ticket.event_name,
        date: ticket.event_date,           // Ticket type's valid from date
        time: ticket.event_time,           // Ticket type's valid from time
        start_date: ticket.event_start_date, // Event's overall start date
        venue: ticket.event_venue,
        status: ticket.event_status
      }
    }));

    // Set appropriate cache headers for CDN
    const cacheMaxAge = event_id ? 300 : 600; // 5 min for specific event, 10 min for all
    res.setHeader('Cache-Control', `public, max-age=${cacheMaxAge}, s-maxage=${cacheMaxAge}`);
    res.setHeader('ETag', `"tickets-${Date.now()}"`);

    // Add Vary header to handle different query parameters
    res.setHeader('Vary', 'event_id, status, include_test');

    // Build response in the requested format
    const response = {
      success: true,
      tickets: enrichedTickets,
      cached: wasFromCache,
      timestamp: new Date().toISOString(),
      // Additional metadata for debugging and monitoring
      metadata: {
        total_tickets: enrichedTickets.length,
        filtered_by_event: !!event_id,
        filtered_by_status: !!status,
        include_test_tickets: include_test === 'true',
        cache_hit: wasFromCache,
        response_time_ms: Date.now() - startTime
      }
    };

    // Add cache stats in non-production environments
    if (process.env.NODE_ENV !== 'production') {
      response.cache_stats = ticketTypeCache.getStats();
    }

    return res.status(200).json(response);

  } catch (error) {
    logger.error('Failed to fetch ticket types:', error);

    // Handle specific error types with appropriate status codes
    if (error.message && error.message.includes('Bootstrap file not found')) {
      return res.status(503).json({
        success: false,
        error: 'Service unavailable',
        message: 'Ticket configuration not available',
        timestamp: new Date().toISOString()
      });
    }

    if (error.message && error.message.includes('database')) {
      return res.status(503).json({
        success: false,
        error: 'Database error',
        message: 'Unable to retrieve ticket types at this time',
        timestamp: new Date().toISOString()
      });
    }

    if (error.code === 'SQLITE_BUSY') {
      return res.status(503).json({
        success: false,
        error: 'Database busy',
        message: 'Database temporarily unavailable',
        timestamp: new Date().toISOString()
      });
    }

    if (error.name === 'TimeoutError') {
      return res.status(408).json({
        success: false,
        error: 'Request timeout',
        message: 'Request took too long to process',
        timestamp: new Date().toISOString()
      });
    }

    // Generic error response
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to retrieve ticket types',
      timestamp: new Date().toISOString()
    });
  }
}