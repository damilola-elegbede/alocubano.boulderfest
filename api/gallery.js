/**
 * Gallery API endpoint - Environment-aware gallery service
 * Serves gallery data from cache (local) or runtime API (Vercel)
 */

import { getGalleryService } from "./lib/gallery-service.js";

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    console.log('Gallery API: Processing request');
    
    const { event, year } = req.query;
    
    const galleryService = getGalleryService();
    const galleryData = await galleryService.getGalleryData(year, event);
    
    // Add API metadata
    const response = {
      ...galleryData,
      api: {
        version: '2.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local',
        queryParams: { event, year }
      }
    };
    
    // Set caching headers based on data source
    if (galleryData.source === 'build-time-cache') {
      // Long cache for build-time data
      res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    } else {
      // Shorter cache for runtime data
      res.setHeader('Cache-Control', 'public, max-age=900, stale-while-revalidate=1800'); // 15 minutes
    }
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('Gallery API Error:', error);
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to load gallery data',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}