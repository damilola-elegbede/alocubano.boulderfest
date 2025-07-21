// This script runs at build time to pre-fetch Google Drive data.
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials from .env.local
dotenv.config({ path: '.env.local' });

// --- Configuration ---
// Map year to actual folder ID
const GALLERY_CONFIG = {
  '2025': '1hB8ajnn3RFaFBlEJ_7GuPpUHmt6-_w8e', // ALoCubano_BoulderFest_2025
  // Add other years here as needed
};
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'gallery-data');

// --- Google Drive Authentication ---
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });

// --- Main Fetch Logic ---
async function fetchAllGalleryDataFromGoogle(year, yearFolderId) {
  console.log(`Fetching all gallery data for ${year} from Google Drive folder: ${yearFolderId}...`);
  
  try {
    // yearFolderId is already the specific year folder, no need to search

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
      // Keep original case for folder names but use lowercase for keys
      const categoryName = folder.name.toLowerCase();
      const categoryDisplayName = folder.name;
      
      // Get files in this category folder - ONLY IMAGES, NO VIDEOS
      const filesResponse = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed = false`,
        fields: 'files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)',
        pageSize: 1000,
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

    console.log(`Found ${totalCount} items for ${year}.`);
    return {
      year,
      totalCount,
      categories: categories,
      hasMore: false, // The static file contains all items
      cacheTimestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching gallery data for ${year}:`, error);
    return null;
  }
}

// --- Script Execution ---
async function main() {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.error('Missing Google service account credentials. Please check .env.local file.');
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const [year, folderId] of Object.entries(GALLERY_CONFIG)) {
    if (!folderId) {
      console.warn(`Skipping ${year}: No folder ID configured`);
      continue;
    }
    
    const galleryData = await fetchAllGalleryDataFromGoogle(year, folderId);
    if (galleryData) {
      const outputPath = path.join(OUTPUT_DIR, `${year}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(galleryData, null, 2));
      console.log(`✅ Gallery data for ${year} saved to ${outputPath}`);
    }
  }
}

main().catch(console.error);