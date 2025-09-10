/**
 * Google Drive Service Health Check API
 * Provides health status and metrics for the Google Drive integration
 */

import { getGoogleDriveService, getGoogleDriveMetrics } from '../lib/google-drive-service.js';

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
    console.log('Google Drive Health API: Processing request');
    
    const googleDriveService = getGoogleDriveService();
    
    // Ensure service is initialized before health check
    await googleDriveService.ensureInitialized?.();
    
    // Get health check and metrics
    const healthCheck = await googleDriveService.healthCheck();
    const metrics = getGoogleDriveMetrics();
    
    // Check configuration status
    const isConfigured = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID);
    
    const response = {
      service: 'google-drive',
      configured: isConfigured,
      health: healthCheck,
      metrics,
      configuration: {
        hasServiceAccountEmail: !!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        hasPrivateKey: !!process.env.GOOGLE_PRIVATE_KEY,
        hasGalleryFolderId: !!process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID
      },
      api: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local'
      }
    };

    // Only expose sensitive config details when explicitly enabled for internal debugging
    if (process.env.EXPOSE_INTERNAL_HEALTH_FIELDS === 'true') {
      response.configuration.serviceAccountEmailFormat = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL.split('@')[0] + '@...' : 'Not set';
      response.configuration.galleryFolderIdFormat = process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID ? 
        process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID.substring(0, 8) + '...' : 'Not set';
    }

    // Set cache headers based on health status
    if (healthCheck.status === 'healthy') {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }

    // Return appropriate HTTP status
    const httpStatus = healthCheck.status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(response);

  } catch (error) {
    console.error('Google Drive Health API Error:', error);
    
    const errorResponse = {
      service: 'google-drive',
      configured: !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID),
      health: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      },
      metrics: {
        error: 'Unable to retrieve metrics',
        errorMessage: error.message
      },
      api: {
        version: '1.0',
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL ? 'vercel' : 'local',
        error: error.message
      }
    };

    res.setHeader('Cache-Control', 'no-cache');
    res.status(503).json(errorResponse);
  }
}