/**
 * Hero Image API Endpoint
 * 
 * Dynamic hero image provider with page-specific mapping, format optimization,
 * and aggressive caching for improved Core Web Vitals performance.
 * 
 * Features:
 * - Page-to-image mapping with fallback to default
 * - Format auto-detection (WebP with JPEG fallback)
 * - Quality and size optimization
 * - Aggressive caching with ETag support
 * - Error handling and logging
 * 
 * Usage: /api/hero-image/{pageId}?w=1200&format=auto&q=85
 */

// Page to Google Drive file ID mapping
// TODO: Replace with actual Google Drive file IDs from project assets
// Format: Google Drive file IDs are typically 33-44 characters long and contain letters, numbers, and symbols
const PAGE_HERO_MAPPING = {
  'home': process.env.HERO_HOME_FILE_ID || '1BxC2DyE3FzG4HxI5JyK6LzM7NyO8PxQ9RyS0',           // Main festival hero image
  'about': process.env.HERO_ABOUT_FILE_ID || '1TxU2VyW3XzY4AzB5CzD6EzF7GzH8IzJ9KzL0',         // About page hero
  'artists': process.env.HERO_ARTISTS_FILE_ID || '1MxN2OyP3QzR4SzT5UzV6WzX7YzZ8AzB9CzD0',       // Artists lineup hero
  'schedule': process.env.HERO_SCHEDULE_FILE_ID || '1ExF2GyH3IzJ4KzL5MzN6OzP7QzR8SzT9UzV0',      // Schedule page hero
  'gallery': process.env.HERO_GALLERY_FILE_ID || '1WxX2YyZ3AzB4CzD5EzF6GzH7IzJ8KzL9MzN0',       // Gallery hub hero
  'gallery-2025': process.env.HERO_GALLERY_2025_FILE_ID || '1OxP2QyR3SzT4UzV5WzX6YzZ7AzB8CzD9EzF0',  // 2025 gallery hero
  'tickets': process.env.HERO_TICKETS_FILE_ID || '1GxH2IyJ3KzL4MzN5OzP6QzR7SzT8UzV9WzX0',       // Tickets page hero
  'donations': process.env.HERO_DONATIONS_FILE_ID || '1YxZ2AyB3CzD4EzF5GzH6IzJ7KzL8MzN9OzP0',    // Donations hero
  'default': process.env.HERO_DEFAULT_FILE_ID || '1BxC2DyE3FzG4HxI5JyK6LzM7NyO8PxQ9RyS0'        // Fallback hero image (same as home)
};

// Default query parameters
const DEFAULT_PARAMS = {
  width: 1200,
  quality: 85,
  format: 'auto'
};

// Cache configuration
const CACHE_CONFIG = {
  maxAge: 31536000,    // 1 year in seconds
  staleWhileRevalidate: 86400  // 24 hours in seconds
};

export default async function handler(req, res) {
  try {
    // Extract pageId from URL parameters
    const { pageId } = req.query;
    
    // Validate pageId
    if (!pageId || typeof pageId !== 'string') {
      console.error('[Hero Image API] Invalid pageId:', pageId);
      return res.status(400).json({
        error: 'Invalid page ID',
        message: 'Page ID must be a valid string'
      });
    }

    // Extract and validate query parameters
    const width = parseInt(req.query.w) || DEFAULT_PARAMS.width;
    const quality = parseInt(req.query.q) || DEFAULT_PARAMS.quality;
    const format = req.query.format || DEFAULT_PARAMS.format;

    // Validate parameters
    if (width < 100 || width > 3840) {
      return res.status(400).json({
        error: 'Invalid width',
        message: 'Width must be between 100 and 3840 pixels'
      });
    }

    if (quality < 1 || quality > 100) {
      return res.status(400).json({
        error: 'Invalid quality',
        message: 'Quality must be between 1 and 100'
      });
    }

    if (!['auto', 'webp', 'jpeg'].includes(format)) {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'Format must be auto, webp, or jpeg'
      });
    }

    // Map pageId to Google Drive file ID
    const fileId = PAGE_HERO_MAPPING[pageId] || PAGE_HERO_MAPPING['default'];
    
    console.log(`[Hero Image API] Processing request - Page: ${pageId}, FileId: ${fileId}, Width: ${width}, Quality: ${quality}, Format: ${format}`);

    // Determine optimal format based on Accept header and format parameter
    let targetFormat = format;
    if (format === 'auto') {
      const acceptHeader = req.headers.accept || '';
      targetFormat = acceptHeader.includes('image/webp') ? 'webp' : 'jpeg';
    }

    // Generate ETag for caching
    const etag = `"hero-${pageId}-${width}-${quality}-${targetFormat}"`;
    
    // Check if client has cached version
    const clientETag = req.headers['if-none-match'];
    if (clientETag === etag) {
      console.log(`[Hero Image API] Returning 304 for cached version - Page: ${pageId}`);
      return res.status(304).end();
    }

    // Set aggressive caching headers
    res.setHeader('Cache-Control', `public, max-age=${CACHE_CONFIG.maxAge}, stale-while-revalidate=${CACHE_CONFIG.staleWhileRevalidate}`);
    res.setHeader('ETag', etag);
    res.setHeader('Vary', 'Accept');

    // Build Google Drive API URL for optimized image
    const driveUrl = `https://lh3.googleusercontent.com/d/${fileId}=w${width}-h${Math.round(width * 0.6)}-c-n`;
    
    // Fetch image from Google Drive
    console.log(`[Hero Image API] Fetching from Google Drive: ${driveUrl}`);
    
    const imageResponse = await fetch(driveUrl, {
      headers: {
        'User-Agent': 'A Lo Cubano Boulder Fest Hero Image API/1.0'
      }
    });

    if (!imageResponse.ok) {
      console.error(`[Hero Image API] Google Drive fetch failed - Status: ${imageResponse.status}, Page: ${pageId}`);
      
      // Try fallback to default hero image if original request failed
      if (pageId !== 'default') {
        const fallbackFileId = PAGE_HERO_MAPPING['default'];
        const fallbackUrl = `https://lh3.googleusercontent.com/d/${fallbackFileId}=w${width}-h${Math.round(width * 0.6)}-c-n`;
        
        console.log(`[Hero Image API] Attempting fallback to default hero: ${fallbackUrl}`);
        
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'User-Agent': 'A Lo Cubano Boulder Fest Hero Image API/1.0'
          }
        });

        if (fallbackResponse.ok) {
          const fallbackBuffer = await fallbackResponse.arrayBuffer();
          res.setHeader('Content-Type', `image/${targetFormat}`);
          res.setHeader('X-Fallback-Used', 'true');
          return res.send(Buffer.from(fallbackBuffer));
        }
      }

      return res.status(404).json({
        error: 'Hero image not found',
        message: `Could not retrieve hero image for page: ${pageId}`
      });
    }

    // Get image data
    const imageBuffer = await imageResponse.arrayBuffer();
    
    // Set response headers
    res.setHeader('Content-Type', `image/${targetFormat}`);
    res.setHeader('Content-Length', imageBuffer.byteLength);
    res.setHeader('X-Page-Id', pageId);
    res.setHeader('X-Image-Format', targetFormat);
    
    console.log(`[Hero Image API] Successfully served hero image - Page: ${pageId}, Size: ${imageBuffer.byteLength} bytes, Format: ${targetFormat}`);

    // Send optimized image
    res.send(Buffer.from(imageBuffer));

  } catch (error) {
    console.error('[Hero Image API] Unexpected error:', error);
    
    // Return error response
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process hero image request',
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Supported Query Parameters:
 * 
 * @param {string} w - Image width in pixels (100-3840, default: 1200)
 * @param {string} format - Image format: 'auto', 'webp', 'jpeg' (default: 'auto')
 * @param {string} q - Image quality 1-100 (default: 85)
 * 
 * Examples:
 * - /api/hero-image/home - Default home hero image
 * - /api/hero-image/about?w=800&format=webp&q=90 - About page, 800px wide, WebP format, 90% quality
 * - /api/hero-image/gallery?w=1920&format=auto - Gallery hero, 1920px wide, auto format detection
 */