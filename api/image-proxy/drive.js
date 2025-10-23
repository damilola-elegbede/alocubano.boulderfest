/**
 * Simple CORS Proxy for Google Drive Images
 * Handles CORS issues for direct Google Drive URLs without re-processing
 * Used only for images not available in Vercel Blob Storage
 */

import { setSecureCorsHeaders } from '../../lib/cors-config.js';

export default async function handler(req, res) {
  // Set CORS headers
  setSecureCorsHeaders(req, res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only GET requests are supported'
    });
  }

  const { url } = req.query;

  // Validate URL parameter
  if (!url) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'URL parameter is required'
    });
  }

  // Validate that it's a Google Drive URL - SECURITY FIX
  // Parse URL and validate hostname explicitly to prevent open-proxy bypass
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid URL format'
    });
  }

  // Allowed hostnames for Google Drive URLs
  const allowedHosts = [
    'drive.google.com',
    'lh3.googleusercontent.com'
  ];

  const hostname = parsedUrl.hostname.toLowerCase();
  
  // Check exact hostname match or subdomain of googleusercontent.com
  const isGoogleDriveUrl = allowedHosts.includes(hostname) || 
                           hostname.endsWith('.googleusercontent.com');

  if (!isGoogleDriveUrl) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Only Google Drive URLs are supported'
    });
  }

  try {
    console.log('[Drive Proxy] Proxying Google Drive image:', url);

    // Fetch the image from Google Drive
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ALocubanoBot/1.0)',
      }
    });

    if (!response.ok) {
      throw new Error(`Google Drive returned status ${response.status}`);
    }

    // Get the image buffer
    const buffer = await response.arrayBuffer();

    // Get content type from Google Drive response
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    // Set appropriate caching headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable'); // 24 hours
    res.setHeader('Vary', 'Accept');

    // Send the image
    res.status(200).send(Buffer.from(buffer));

  } catch (error) {
    console.error('[Drive Proxy] Error proxying image:', {
      url,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      error: 'Proxy Error',
      message: 'Failed to fetch image from Google Drive',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// Vercel configuration
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb'
    },
    responseLimit: '10mb'
  }
};
