/**
 * Gallery API endpoint - Environment-aware gallery service
 * Serves gallery data from cache (local) or runtime API (Vercel)
 */

import { getGalleryService } from "./lib/gallery-service.js";
import crypto from 'crypto';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');

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
    
    // Parse and validate query parameters
    const { event, year, offset: rawOffset = '0', limit: rawLimit = '20' } = req.query;
    
    // Validate and parse numeric parameters
    const parsedOffset = parseQueryParam(rawOffset, 0, { min: 0, max: 10000 });
    const parsedLimit = parseQueryParam(rawLimit, 20, { min: 1, max: 100 });
    
    if (parsedOffset === null || parsedLimit === null) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        message: 'offset must be 0-10000, limit must be 1-100'
      });
    }
    
    const galleryService = getGalleryService();
    const galleryData = await galleryService.getGalleryData(year, event);
    
    // Apply pagination if requested
    let paginatedData = galleryData;
    if (parsedOffset > 0 || parsedLimit < 1000) {
      paginatedData = applyPagination(galleryData, parsedOffset, parsedLimit);
    }
    
    // Generate ETag for caching
    const dataHash = generateETag(paginatedData);
    res.setHeader('ETag', `"${dataHash}"`);
    
    // Check if client has current version
    const clientETag = req.headers['if-none-match'];
    if (clientETag === `"${dataHash}"`) {
      res.status(304).end();
      return;
    }
    
    // Add API metadata
    const response = {
      ...paginatedData,
      api: {
        version: '2.1',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local',
        queryParams: { event, year, offset: parsedOffset, limit: parsedLimit },
        etag: dataHash
      }
    };
    
    // Set performance headers
    res.setHeader('X-Response-Time', Date.now());
    res.setHeader('Vary', 'Accept-Encoding');
    
    // Set caching headers based on data source
    if (galleryData.source === 'build-time-cache') {
      // Long cache for build-time data
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 hours
    } else {
      // Shorter cache for runtime data with stale-while-revalidate
      res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900, stale-if-error=1800'); // 5 min, 15 min SWR, 30 min error
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

/**
 * Apply pagination to gallery data
 */
function applyPagination(data, offset, limit) {
  if (!data.categories) return data;
  
  // Flatten all items for pagination
  const allItems = [];
  Object.entries(data.categories).forEach(([category, items]) => {
    items.forEach(item => allItems.push({ ...item, category }));
  });
  
  // Apply pagination
  const paginatedItems = allItems.slice(offset, offset + limit);
  
  // Group back into categories
  const paginatedCategories = {};
  paginatedItems.forEach(item => {
    if (!paginatedCategories[item.category]) {
      paginatedCategories[item.category] = [];
    }
    const { category, ...itemWithoutCategory } = item;
    paginatedCategories[item.category].push(itemWithoutCategory);
  });
  
  return {
    ...data,
    categories: paginatedCategories,
    totalCount: allItems.length,
    returnedCount: paginatedItems.length,
    offset,
    limit,
    hasMore: offset + limit < allItems.length
  };
}

/**
 * Parse and validate query parameters
 * @param {string} value - Parameter value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @param {Object} options - Validation options with min/max
 * @returns {number|null} Parsed value or null if invalid
 */
function parseQueryParam(value, defaultValue, options = {}) {
  if (!value) return defaultValue;
  
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) return null;
  
  if (options.min !== undefined && parsed < options.min) return null;
  if (options.max !== undefined && parsed > options.max) return null;
  
  return parsed;
}

/**
 * Generate strong ETag hash for response caching
 * Uses SHA-256 for better collision resistance than simple hash
 */
function generateETag(data) {
  try {
    const str = JSON.stringify(data, null, 0); // Consistent serialization
    const hash = crypto.createHash('sha256').update(str, 'utf8').digest('hex');
    return hash.substring(0, 16); // Use first 16 chars for reasonable ETag length
  } catch (error) {
    console.error('ETag generation failed:', error);
    // Fallback to simple hash
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
}