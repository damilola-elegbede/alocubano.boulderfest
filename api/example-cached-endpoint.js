/**
import { setSecureCorsHeaders } from '../../lib/cors-config.js';
 * Example Cached API Endpoint
 * Demonstrates integration of the multi-layer cache system with Vercel serverless functions
 */

import { getCacheService } from "../lib/cache-service.js";
import { CACHE_TYPES } from "../lib/cache/index.js";

const cacheService = getCacheService();

export default async function handler(req, res) {
  // CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { endpoint = 'event-info', year, forceRefresh } = req.query;
    const shouldForceRefresh = forceRefresh === 'true' || forceRefresh === true;

    // Example 1: Static event information (cached for 6 hours)
    if (endpoint === 'event-info') {
      const cacheKey = 'event:info';

      if (!shouldForceRefresh) {
        const cached = await cacheService.get(cacheKey, {
          namespace: 'static',
          fallback: null
        });

        if (cached) {
          return res.status(200).json({
            ...cached,
            cached: true,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Simulate expensive database/API call
      const eventInfo = {
        name: 'A Lo Cubano Boulder Fest 2026',
        dates: 'May 15-17, 2026',
        location: 'Avalon Ballroom, Boulder, CO',
        description: 'Premier Cuban salsa festival in Boulder',
        artists: ['Maykel Fonts', 'Dayme y El High', 'Chacal', 'El Micha'],
        ticketPrices: {
          earlyBird: 125,
          regular: 150,
          vip: 250,
          workshop: 75
        }
      };

      // Cache for 6 hours (static data)
      await cacheService.set(cacheKey, eventInfo, {
        namespace: 'static',
        type: CACHE_TYPES.STATIC
      });

      return res.status(200).json({
        ...eventInfo,
        cached: false,
        timestamp: new Date().toISOString()
      });
    }

    // Example 2: Dynamic ticket availability (cached for 5 minutes)
    if (endpoint === 'ticket-availability') {
      const cacheKey = 'tickets:current-availability';

      if (!shouldForceRefresh) {
        const cached = await cacheService.getTicketAvailability();

        if (cached) {
          return res.status(200).json({
            ...cached,
            cached: true,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Simulate real-time ticket availability check
      const availability = {
        earlyBird: { available: 45, total: 100, price: 125 },
        regular: { available: 234, total: 500, price: 150 },
        vip: { available: 12, total: 50, price: 250 },
        workshop: { available: 78, total: 100, price: 75 },
        lastUpdated: new Date().toISOString()
      };

      // Cache for 5 minutes (dynamic data)
      await cacheService.cacheTicketAvailability(availability);

      return res.status(200).json({
        ...availability,
        cached: false,
        timestamp: new Date().toISOString()
      });
    }

    // Example 3: Gallery photos by year (cached for 24 hours)
    if (endpoint === 'gallery' && year) {
      const cacheKey = `photos:${year}`;

      if (!shouldForceRefresh) {
        const cached = await cacheService.getGalleryData(year);

        if (cached) {
          return res.status(200).json({
            year,
            photos: cached,
            cached: true,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Simulate gallery data fetch from Google Drive API
      const galleryPhotos = Array.from({ length: 50 }, (_, i) => ({
        id: `photo_${year}_${i + 1}`,
        url: `https://drive.google.com/file/d/example_${i}/view`,
        thumbnail: `https://drive.google.com/thumbnail?id=example_${i}`,
        title: `Boulder Fest ${year} - Photo ${i + 1}`,
        uploadDate: new Date(2024, 0, i + 1).toISOString()
      }));

      // Cache for 24 hours (gallery data)
      await cacheService.cacheGalleryData(year, galleryPhotos);

      return res.status(200).json({
        year,
        photos: galleryPhotos,
        cached: false,
        timestamp: new Date().toISOString()
      });
    }

    // Example 4: Analytics data (cached for 15 minutes)
    if (endpoint === 'analytics') {
      const cacheKey = 'analytics:dashboard';

      if (!shouldForceRefresh) {
        const cached = await cacheService.getAnalytics(cacheKey);

        if (cached) {
          return res.status(200).json({
            ...cached,
            cached: true,
            timestamp: new Date().toISOString()
          });
        }
      }

      // Simulate analytics calculation
      const analyticsData = {
        totalVisitors:
          (await cacheService.getCounter('visitors:total')) || 15432,
        ticketsSold: (await cacheService.getCounter('tickets:sold')) || 892,
        newsletterSignups:
          (await cacheService.getCounter('newsletter:signups')) || 2341,
        pageViews: {
          home: 8765,
          tickets: 4321,
          gallery: 3456,
          artists: 2109
        },
        topCountries: [
          { country: 'USA', visitors: 12500 },
          { country: 'Canada', visitors: 1800 },
          { country: 'Mexico', visitors: 950 },
          { country: 'Spain', visitors: 182 }
        ],
        generatedAt: new Date().toISOString()
      };

      // Cache for 15 minutes (analytics data)
      await cacheService.cacheAnalytics(cacheKey, analyticsData);

      return res.status(200).json({
        ...analyticsData,
        cached: false,
        timestamp: new Date().toISOString()
      });
    }

    // Example 5: Cache management endpoints
    if (endpoint === 'cache-stats') {
      const stats = await cacheService.getStats();
      const health = await cacheService.getHealthStatus();

      return res.status(200).json({
        stats,
        health,
        timestamp: new Date().toISOString()
      });
    }

    if (endpoint === 'cache-invalidate' && req.method === 'POST') {
      const { pattern, namespace } = req.body || {};

      let invalidated = 0;
      if (pattern && namespace) {
        invalidated = await cacheService.invalidatePattern(pattern, namespace);
      } else if (req.query.tickets) {
        invalidated = await cacheService.invalidateTicketCache();
      } else if (req.query.gallery) {
        invalidated = await cacheService.invalidateGalleryCache();
      }

      return res.status(200).json({
        message: `Invalidated ${invalidated} cache entries`,
        invalidated,
        timestamp: new Date().toISOString()
      });
    }

    // Example 6: Rate limiting with cache counters
    if (endpoint === 'rate-limit-demo') {
      const clientId = req.headers['x-client-id'] || 'anonymous';
      const rateLimitKey = `rate-limit:${clientId}`;

      const currentCount = await cacheService.incrementCounter(rateLimitKey, {
        ttl: 60 // 1 minute window
      });

      const limit = 10; // 10 requests per minute

      if (currentCount > limit) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          limit,
          current: currentCount,
          resetIn: 60,
          timestamp: new Date().toISOString()
        });
      }

      return res.status(200).json({
        message: 'Request successful',
        rateLimit: {
          limit,
          current: currentCount,
          remaining: Math.max(0, limit - currentCount)
        },
        timestamp: new Date().toISOString()
      });
    }

    // Example 7: Multi-get operation for dashboard
    if (endpoint === 'dashboard') {
      const keys = [
        'event:info',
        'tickets:current-availability',
        'analytics:dashboard'
      ];
      const results = {};

      // Try to get all data from cache first
      for (const key of keys) {
        const namespace = key.startsWith('event:')
          ? 'static'
          : key.startsWith('tickets:')
            ? 'tickets'
            : key.startsWith('analytics:')
              ? 'analytics'
              : '';

        results[key] = await cacheService.get(key, { namespace });
      }

      // Check what's missing and mark for refresh
      const missingKeys = keys.filter((key) => !results[key]);

      return res.status(200).json({
        data: results,
        cached: keys.length - missingKeys.length,
        missing: missingKeys,
        cacheHitRatio: `${Math.round(((keys.length - missingKeys.length) / keys.length) * 100)}%`,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(400).json({
      error: 'Unknown endpoint',
      available: [
        'event-info',
        'ticket-availability',
        'gallery?year=2024',
        'analytics',
        'cache-stats',
        'cache-invalidate (POST)',
        'rate-limit-demo',
        'dashboard'
      ]
    });
  } catch (error) {
    console.error('Cache example endpoint error:', error);

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
