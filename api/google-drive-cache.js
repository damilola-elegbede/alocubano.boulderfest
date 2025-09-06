/**
 * Google Drive Cache Management API
 * Allows clearing and managing the Google Drive service cache
 */

import { getGoogleDriveService, clearGoogleDriveCache, getGoogleDriveMetrics } from './lib/google-drive-service.js';

export default async function handler(req, res) {
  // Configure CORS with restricted origins for security
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:8080'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Authenticate POST/DELETE methods with internal API key
  if (req.method === 'POST' || req.method === 'DELETE') {
    const apiKey = req.headers['x-api-key'] || req.query.apiKey;
    const internalApiKey = process.env.INTERNAL_API_KEY;

    if (!internalApiKey) {
      res.status(500).json({
        error: 'Configuration Error',
        message: '❌ FATAL: INTERNAL_API_KEY secret not configured'
      });
      return;
    }

    if (!apiKey || apiKey !== internalApiKey) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid API key required for POST/DELETE operations'
      });
      return;
    }
  }

  try {
    console.log(`Google Drive Cache API: ${req.method} request`);

    const googleDriveService = getGoogleDriveService();

    switch (req.method) {
    case 'GET': {
      // Get cache status and metrics
      const metrics = getGoogleDriveMetrics();

      res.status(200).json({
        action: 'status',
        cache: {
          size: metrics.cacheSize,
          hitRatio: metrics.cacheHitRatio,
          hits: metrics.cacheHits,
          misses: metrics.cacheMisses
        },
        metrics,
        api: {
          version: '1.0',
          timestamp: new Date().toISOString(),
          environment: process.env.VERCEL ? 'vercel' : 'local'
        }
      });
      break;
    }

    case 'DELETE': {
      // Clear the cache
      clearGoogleDriveCache();

      const clearedMetrics = getGoogleDriveMetrics();

      res.status(200).json({
        action: 'cleared',
        success: true,
        message: 'Google Drive cache cleared successfully',
        cache: {
          size: clearedMetrics.cacheSize,
          hitRatio: clearedMetrics.cacheHitRatio
        },
        api: {
          version: '1.0',
          timestamp: new Date().toISOString(),
          environment: process.env.VERCEL ? 'vercel' : 'local'
        }
      });
      break;
    }

    case 'POST': {
      // Warm up cache by fetching data
      const { year, eventId, maxResults = 100 } = req.body || {};

      try {
        const data = await googleDriveService.fetchImages({
          year,
          eventId,
          maxResults: parseInt(maxResults, 10)
        });

        const warmedMetrics = getGoogleDriveMetrics();

        res.status(200).json({
          action: 'warmed',
          success: true,
          message: 'Cache warmed successfully',
          data: {
            itemsFetched: data.totalCount,
            source: data.source,
            categories: Object.keys(data.categories || {})
          },
          cache: {
            size: warmedMetrics.cacheSize,
            hitRatio: warmedMetrics.cacheHitRatio
          },
          api: {
            version: '1.0',
            timestamp: new Date().toISOString(),
            environment: process.env.VERCEL ? 'vercel' : 'local'
          }
        });
      } catch (warmupError) {
        res.status(500).json({
          action: 'warmed',
          success: false,
          message: 'Cache warmup failed',
          error: warmupError.message,
          api: {
            version: '1.0',
            timestamp: new Date().toISOString(),
            environment: process.env.VERCEL ? 'vercel' : 'local'
          }
        });
      }
      break;
    }

    default:
      res.status(405).json({
        error: 'Method not allowed',
        message: 'Supported methods: GET (status), DELETE (clear), POST (warm)',
        api: {
          version: '1.0',
          timestamp: new Date().toISOString()
        }
      });
    }

  } catch (error) {
    console.error('Google Drive Cache API Error:', error);

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to manage Google Drive cache',
      details: error.message,
      api: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local'
      }
    });
  }
}