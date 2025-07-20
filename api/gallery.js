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
    // Get query parameters
    const year = req.query.year || '2025';
    const category = req.query.category; // optional: 'workshops', 'socials', 'performances'
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');
    
    // Use separate gallery folder ID (different from hero images)
    const galleryRootFolderId = req.query.folderId || process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;
    
    if (!galleryRootFolderId) {
      return res.status(400).json({ 
        error: 'Gallery folder ID is required. Please set GOOGLE_DRIVE_GALLERY_FOLDER_ID.' 
      });
    }

    // Initialize Drive client
    const drive = getDriveClient();

    // Find year folder
    const yearFolders = await drive.files.list({
      q: `'${galleryRootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${year}' and trashed = false`,
      fields: 'files(id, name)',
    });

    if (yearFolders.data.files.length === 0) {
      return res.status(404).json({ 
        error: `No gallery found for year ${year}` 
      });
    }

    const yearFolderId = yearFolders.data.files[0].id;

    // Get category folders within the year
    const categoryFolders = await drive.files.list({
      q: `'${yearFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      orderBy: 'name',
    });

    const categories = {};
    let totalCount = 0;

    // Process each category folder
    for (const folder of categoryFolders.data.files) {
      const categoryName = folder.name.toLowerCase();
      
      // Skip if specific category requested and this isn't it
      if (category && categoryName !== category.toLowerCase()) {
        continue;
      }

      // Get files in this category folder
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and (mimeType contains 'image/' or mimeType contains 'video/') and trashed = false`,
        fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)',
        pageSize: 100,
        orderBy: 'createdTime desc',
      });

      const files = filesResponse.data.files || [];
      
      // Process files to create gallery items
      const galleryItems = files.map(file => ({
        id: file.id,
        name: file.name,
        type: file.mimeType.startsWith('image/') ? 'image' : 'video',
        mimeType: file.mimeType,
        category: categoryName,
        thumbnailUrl: `/api/image-proxy/${file.id}`,
        viewUrl: `/api/image-proxy/${file.id}`,
        downloadUrl: `/api/image-proxy/${file.id}`,
        size: parseInt(file.size || '0'),
        createdAt: file.createdTime,
      }));

      categories[categoryName] = galleryItems;
      totalCount += galleryItems.length;
    }

    // Apply pagination to flattened items if needed
    let allItems = [];
    Object.values(categories).forEach(items => {
      allItems = allItems.concat(items);
    });

    // Sort all items by creation date (newest first)
    allItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Apply pagination
    const paginatedItems = allItems.slice(offset, offset + limit);

    const result = {
      year,
      categories,
      items: paginatedItems, // For backwards compatibility
      totalCount,
      limit,
      offset,
      hasMore: (offset + limit) < totalCount,
      cacheTimestamp: new Date().toISOString(),
    };

    // Set cache headers
    res.setHeader('Cache-Control', `s-maxage=${CACHE_DURATION}, stale-while-revalidate`);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Gallery API Error:', error);
    
    // Handle specific Google API errors
    if (error.code === 404) {
      return res.status(404).json({ error: 'Gallery folder not found' });
    }
    
    if (error.code === 403) {
      return res.status(403).json({ error: 'Access denied. Please check gallery folder permissions.' });
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