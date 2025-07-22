import { google } from 'googleapis';

/**
 * Vercel serverless function for authenticated Google Drive image proxy
 * Route: /api/image-proxy/[fileId]
 * 
 * This function:
 * - Accepts fileId as a dynamic route parameter
 * - Uses Google Drive API with service account credentials
 * - Fetches image binary data securely
 * - Streams images back with proper headers and caching
 * - Handles CORS and error responses
 */
export default async function handler(req, res) {
  // Set CORS headers for cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
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

  const { fileId } = req.query;

  // Validate required parameters
  if (!fileId) {
    return res.status(400).json({ 
      error: 'Bad Request',
      message: 'File ID is required'
    });
  }

  // Validate environment variables
  const requiredEnvVars = {
    GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
    GOOGLE_PROJECT_ID: process.env.GOOGLE_PROJECT_ID
  };

  const missingVars = Object.keys(requiredEnvVars).filter(key => !requiredEnvVars[key]);
  if (missingVars.length > 0) {
    console.warn('Missing environment variables for Google Drive API:', missingVars);
    console.log('Serving placeholder image for local development');
    
    // For local development, serve a placeholder image instead of failing
    // This allows the gallery to work without Google Drive credentials
    return servePlaceholderImage(res, fileId);
  }

  try {
    // Configure Google Drive API client
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        // Handle private key newlines properly (Vercel replaces \n with \\n)
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        project_id: process.env.GOOGLE_PROJECT_ID,
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    // First, get file metadata to check existence and get MIME type
    let fileMetadata;
    try {
      const metadataResponse = await drive.files.get({
        fileId: fileId,
        fields: 'id,name,mimeType,size'
      });
      fileMetadata = metadataResponse.data;
    } catch (metaError) {
      if (metaError.code === 404) {
        return res.status(404).json({ 
          error: 'File Not Found',
          message: 'The requested image file does not exist or is not accessible'
        });
      }
      if (metaError.code === 403) {
        return res.status(403).json({ 
          error: 'Access Denied',
          message: 'Permission denied to access the requested file'
        });
      }
      throw metaError;
    }

    // Validate that it's an image file
    if (!fileMetadata.mimeType || !fileMetadata.mimeType.startsWith('image/')) {
      return res.status(400).json({ 
        error: 'Invalid File Type',
        message: 'The requested file is not an image',
        mimeType: fileMetadata.mimeType
      });
    }

    // Set response headers before streaming
    const contentType = fileMetadata.mimeType || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    
    // Set aggressive caching headers for images
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, immutable');
    res.setHeader('ETag', `"${fileId}-${fileMetadata.size || 'unknown'}"`);
    
    // Set additional headers for better browser compatibility
    res.setHeader('Accept-Ranges', 'bytes');
    if (fileMetadata.size) {
      res.setHeader('Content-Length', fileMetadata.size);
    }

    // Handle conditional requests (304 Not Modified)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === `"${fileId}-${fileMetadata.size || 'unknown'}"`) {
      return res.status(304).end();
    }

    // Fetch the actual file content
    const fileResponse = await drive.files.get({
      fileId: fileId,
      alt: 'media'
    }, {
      responseType: 'arraybuffer'
    });

    // Validate response
    if (!fileResponse.data) {
      return res.status(404).json({ 
        error: 'File Content Not Found',
        message: 'File exists but content could not be retrieved'
      });
    }

    // Convert ArrayBuffer to Buffer and send
    const buffer = Buffer.from(fileResponse.data);
    res.status(200).send(buffer);

  } catch (error) {
    console.error('Google Drive API Error:', {
      message: error.message,
      code: error.code,
      status: error.status,
      fileId: fileId,
      timestamp: new Date().toISOString()
    });

    // Handle specific Google API errors
    if (error.code === 404) {
      return res.status(404).json({ 
        error: 'File Not Found',
        message: 'The requested image file does not exist'
      });
    }
    
    if (error.code === 403) {
      return res.status(403).json({ 
        error: 'Access Denied',
        message: 'Permission denied to access the requested file'
      });
    }
    
    if (error.code === 429) {
      return res.status(429).json({ 
        error: 'Rate Limited',
        message: 'Too many requests. Please try again later.'
      });
    }

    // Handle quota exceeded errors
    if (error.message && error.message.includes('quota')) {
      return res.status(503).json({ 
        error: 'Service Unavailable',
        message: 'API quota exceeded. Please try again later.'
      });
    }

    // Handle authentication errors
    if (error.code === 401 || (error.message && error.message.includes('authentication'))) {
      return res.status(500).json({ 
        error: 'Authentication Error',
        message: 'Failed to authenticate with Google Drive API'
      });
    }

    // Generic server error
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'An unexpected error occurred while fetching the image',
      // Only include detailed error info in development
      ...(process.env.NODE_ENV === 'development' && { 
        debug: {
          message: error.message,
          code: error.code,
          status: error.status
        }
      })
    });
  }
}

/**
 * Serve a placeholder image for local development when Google Drive credentials are not available
 */
function servePlaceholderImage(res, fileId) {
  // Generate a simple SVG placeholder with the file ID
  const svgContent = `
    <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666">
        Gallery Image
      </text>
      <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#999">
        ${fileId.substring(0, 12)}...
      </text>
      <text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#ccc">
        (Local Dev Placeholder)
      </text>
    </svg>
  `;

  // Set appropriate headers
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Send the SVG
  res.status(200).send(svgContent);
}

// Export configuration for Vercel
export const config = {
  api: {
    // Increase body size limit for large images (default is 1mb)
    bodyParser: {
      sizeLimit: '10mb',
    },
    // Set response size limit for large images
    responseLimit: '10mb',
  },
}