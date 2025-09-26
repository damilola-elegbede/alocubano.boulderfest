import { setSecureCorsHeaders } from '../lib/cors-config.js';

/**
 * Featured Photos API endpoint - Environment-aware service
 * Serves featured photos from cache or dynamically selects from gallery
 */

import { getGalleryService } from "../lib/gallery-service.js";

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    });
    return;
  }

  try {
    console.log('Featured Photos API: Processing request');

    const galleryService = getGalleryService();
    const featuredPhotos = await galleryService.getFeaturedPhotos();

    const response = {
      ...featuredPhotos,
      api: {
        version: '2.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local'
      }
    };

    // Set caching headers
    res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800'); // 15 minutes

    res.status(200).json(response);

  } catch (error) {
    console.error('Featured Photos API Error:', error);

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to load featured photos',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}