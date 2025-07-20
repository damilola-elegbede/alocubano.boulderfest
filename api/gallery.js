import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

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
  // Set secure CORS headers with domain restrictions
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://alocubano.boulderfest.com',
    'https://www.alocubano.boulderfest.com',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate and sanitize query parameters
    const yearParam = req.query.year || '2025';
    const categoryParam = req.query.category;
    const limitParam = req.query.limit || '50';
    const offsetParam = req.query.offset || '0';
    
    // Validate year (must be 4-digit number)
    const year = yearParam.match(/^\d{4}$/) ? yearParam : '2025';
    if (year !== yearParam) {
      return res.status(400).json({ error: 'Invalid year format. Must be 4-digit year.' });
    }
    
    // Validate category (only allowed values)
    const allowedCategories = ['workshops', 'socials', 'performances'];
    const category = categoryParam && allowedCategories.includes(categoryParam.toLowerCase()) 
      ? categoryParam.toLowerCase() 
      : null;
    if (categoryParam && !category) {
      return res.status(400).json({ 
        error: 'Invalid category. Allowed values: ' + allowedCategories.join(', ') 
      });
    }
    
    // Validate limit (must be positive integer, max 100)
    const limit = Math.min(Math.max(parseInt(limitParam) || 50, 1), 100);
    if (isNaN(limit) || limit.toString() !== limitParam) {
      return res.status(400).json({ error: 'Invalid limit. Must be integer between 1 and 100.' });
    }
    
    // Validate offset (must be non-negative integer)
    const offset = Math.max(parseInt(offsetParam) || 0, 0);
    if (isNaN(offset) || offset.toString() !== offsetParam) {
      return res.status(400).json({ error: 'Invalid offset. Must be non-negative integer.' });
    }
    
    // Try to read from pre-generated cache first
    const cacheFile = path.join(process.cwd(), 'public', 'gallery-data', `${year}.json`);
    
    if (fs.existsSync(cacheFile)) {
      // Read from cache for much better performance
      const cachedData = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      
      let { categories, totalCount } = cachedData;
      
      // Filter by category if specified
      if (category) {
        const filteredCategories = {};
        const categoryLower = category.toLowerCase();
        if (categories[categoryLower]) {
          filteredCategories[categoryLower] = categories[categoryLower];
          categories = filteredCategories;
          totalCount = categories[categoryLower].length;
        } else {
          // Category not found
          categories = {};
          totalCount = 0;
        }
      }
      
      // Apply pagination to flattened items
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
        cacheTimestamp: cachedData.cacheTimestamp || new Date().toISOString(),
        source: 'cache' // Indicate this came from cache
      };

      // Set cache headers
      res.setHeader('Cache-Control', `s-maxage=${CACHE_DURATION}, stale-while-revalidate`);
      
      return res.status(200).json(result);
    }
    
    // Fallback to Google Drive API if cache doesn't exist
    console.log(`Cache file not found for year ${year}, falling back to Google Drive API`);
    
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

      // Get files in this category folder - ONLY IMAGES, NO VIDEOS
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`,
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
      source: 'google-drive' // Indicate this came from Google Drive
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