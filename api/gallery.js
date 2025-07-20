import { google } from 'googleapis';

// Initialize Google Drive API client
const getDriveClient = () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
};

// Cache configuration
const CACHE_DURATION = 3600; // 1 hour in seconds

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get folder ID from query params or use default
    const folderId = req.query.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;
    
    if (!folderId) {
      return res.status(400).json({ error: 'Folder ID is required' });
    }

    // Initialize Drive client
    const drive = getDriveClient();

    // List files in the folder
    const response = await drive.files.list({
      q: `'${folderId}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
      fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)',
      pageSize: 100,
      orderBy: 'createdTime desc',
    });

    const files = response.data.files || [];

    // Process files to create gallery items
    const galleryItems = files.map(file => ({
      id: file.id,
      name: file.name,
      type: file.mimeType.startsWith('image/') ? 'image' : 'video',
      mimeType: file.mimeType,
      thumbnailUrl: `/api/image-proxy/${file.id}`,
      viewUrl: `/api/image-proxy/${file.id}`,
      downloadUrl: `/api/image-proxy/${file.id}`,
      size: parseInt(file.size || '0'),
      createdAt: file.createdTime,
    }));

    // Get folder metadata for additional info
    const folderResponse = await drive.files.get({
      fileId: folderId,
      fields: 'name, createdTime, modifiedTime',
    });

    const result = {
      folder: {
        id: folderId,
        name: folderResponse.data.name,
        createdAt: folderResponse.data.createdTime,
        modifiedAt: folderResponse.data.modifiedTime,
      },
      items: galleryItems,
      count: galleryItems.length,
    };

    // Set cache headers
    res.setHeader('Cache-Control', `s-maxage=${CACHE_DURATION}, stale-while-revalidate`);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Gallery API Error:', error);
    
    // Handle specific Google API errors
    if (error.code === 404) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    
    if (error.code === 403) {
      return res.status(403).json({ error: 'Access denied. Please check folder permissions.' });
    }
    
    // Generic error response
    return res.status(500).json({ 
      error: 'Failed to fetch gallery data',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

// Helper function to get subfolder structure (for future use)
export async function getSubfolders(folderId) {
  try {
    const drive = getDriveClient();
    
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      orderBy: 'name',
    });

    return response.data.files || [];
  } catch (error) {
    console.error('Error fetching subfolders:', error);
    return [];
  }
}