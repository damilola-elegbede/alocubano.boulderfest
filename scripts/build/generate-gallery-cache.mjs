// This script runs at build time to pre-fetch Google Drive data.
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

// ES module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load credentials from .env.local
dotenv.config({ path: ".env.local" });

// Skip if no Google credentials are available (e.g., in CI/CD)
if (
  !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
  !process.env.GOOGLE_PRIVATE_KEY
) {
  console.log(
    "Skipping gallery cache generation: Google credentials not found",
  );
  console.log(
    "This is expected in CI/CD environments where credentials aren't available",
  );
  process.exit(0);
}

// --- Configuration ---
// Event-based gallery configuration - list of event names to cache
// The build script will search for folders by name within the root gallery folder
// No more manual folder ID hunting required!
const EVENT_GALLERY_CONFIG = [
  "boulder-fest-2025",
  "weekender-2025-11",  // November 2025 Weekender
  "boulder-fest-2026",
  "weekender-2026-09",
];

// Root gallery folder ID from environment variable
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

// Legacy year-based config for backward compatibility
const LEGACY_GALLERY_CONFIG = {
  2025: "boulder-fest-2025", // Maps to event name, not folder ID
  2024: null, // Historical data if available
  2023: null, // Historical data if available
};
const OUTPUT_DIR = path.join(__dirname, "..", "public", "gallery-data");

// --- Google Drive Authentication ---
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  },
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});
const drive = google.drive({ version: "v3", auth });

// --- Folder Search Logic ---
/**
 * Search for an event folder by name within the root gallery folder
 * @param {string} eventName - Name of the event folder to find
 * @returns {Promise<string|null>} - Folder ID if found, null otherwise
 */
async function findEventFolderByName(eventName) {
  if (!ROOT_FOLDER_ID) {
    console.error("❌ GOOGLE_DRIVE_GALLERY_FOLDER_ID environment variable not set");
    return null;
  }

  try {
    const response = await drive.files.list({
      q: `'${ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${eventName}' and trashed = false`,
      fields: "files(id, name)",
    });

    if (!response.data.files || response.data.files.length === 0) {
      return null; // Folder doesn't exist yet
    }

    return response.data.files[0].id;
  } catch (error) {
    console.error(`Error searching for folder "${eventName}":`, error.message);
    return null;
  }
}

// --- Main Fetch Logic ---
async function fetchAllGalleryDataFromGoogle(eventName) {
  console.log(`Fetching gallery data for ${eventName}...`);

  // Find the event folder by name within root folder
  const folderId = await findEventFolderByName(eventName);

  if (!folderId) {
    console.warn(`⚠️ No folder found for "${eventName}" in root gallery folder - skipping`);
    return null;
  }

  console.log(`📁 Found folder for ${eventName}: ${folderId}`);

  try {
    // folderId is the discovered event folder

    // Get category folders within the event
    const categoryFolders = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      orderBy: "name",
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
        fields:
          "files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)",
        pageSize: 1000,
        orderBy: "createdTime desc",
      });

      const files = filesResponse.data.files || [];

      // Process files to create gallery items
      const galleryItems = files.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.mimeType.startsWith("image/") ? "image" : "video",
        mimeType: file.mimeType,
        category: categoryName,
        thumbnailUrl: `/api/image-proxy/${file.id}`,
        viewUrl: `/api/image-proxy/${file.id}`,
        downloadUrl: `/api/image-proxy/${file.id}`,
        size: parseInt(file.size || "0"),
        createdAt: file.createdTime,
      }));

      categories[categoryName] = galleryItems;
      totalCount += galleryItems.length;
    }

    console.log(`Found ${totalCount} items for ${eventName}.`);

    // Build response data
    const responseData = {
      eventId: eventName,
      event: eventName, // for backward compatibility
      totalCount,
      categories: categories,
      hasMore: false, // The static file contains all items
      cacheTimestamp: new Date().toISOString(),
    };

    return responseData;
  } catch (error) {
    console.error(`Error fetching gallery data for ${eventName}:`, error);
    return null;
  }
}

// --- Script Execution ---
async function main() {
  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_PRIVATE_KEY
  ) {
    console.log(
      "⚠️  Missing Google service account credentials. Creating placeholder files for CI/development.",
    );

    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Create placeholder files for each configured event
    for (const eventId of EVENT_GALLERY_CONFIG) {
      const outputPath = path.join(OUTPUT_DIR, `${eventId}.json`);
      const placeholderData = {
        eventId,
        event: eventId,
        items: [],
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        isPlaceholder: true,
        message: "Placeholder data - Google Drive credentials not available",
      };

      fs.writeFileSync(outputPath, JSON.stringify(placeholderData, null, 2));
      console.log(`📄 Created event placeholder: ${outputPath}`);
    }

    // Create legacy year placeholders for backward compatibility
    for (const [year] of Object.entries(LEGACY_GALLERY_CONFIG)) {
      const outputPath = path.join(OUTPUT_DIR, `${year}.json`);
      const placeholderData = {
        year,
        items: [],
        totalCount: 0,
        categories: { workshops: [], socials: [], other: [] },
        hasMore: false,
        cacheTimestamp: new Date().toISOString(),
        isPlaceholder: true,
        message: "Placeholder data - Google Drive credentials not available",
      };

      fs.writeFileSync(outputPath, JSON.stringify(placeholderData, null, 2));
      console.log(`📄 Created legacy placeholder: ${outputPath}`);
    }

    console.log("✅ Placeholder gallery cache files created successfully");
    return;
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Check for root folder ID
  if (!ROOT_FOLDER_ID) {
    console.error("❌ GOOGLE_DRIVE_GALLERY_FOLDER_ID environment variable not set");
    console.error("Cannot fetch gallery data without root folder ID");
    process.exit(1);
  }

  // Process event-based gallery data - searches by folder name
  for (const eventName of EVENT_GALLERY_CONFIG) {
    const galleryData = await fetchAllGalleryDataFromGoogle(eventName);
    if (galleryData) {
      const outputPath = path.join(OUTPUT_DIR, `${eventName}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(galleryData, null, 2));
      console.log(`✅ Gallery data for ${eventName} saved to ${outputPath}`);
    }
  }

  // Process legacy year-based gallery data for backward compatibility
  // Maps years to event names and reuses the same data
  for (const [year, eventName] of Object.entries(LEGACY_GALLERY_CONFIG)) {
    if (!eventName) {
      console.warn(`Skipping legacy year ${year}: No event mapping configured`);
      continue;
    }

    // Check if we already have data for this event
    const eventCachePath = path.join(OUTPUT_DIR, `${eventName}.json`);
    if (fs.existsSync(eventCachePath)) {
      // Copy event data to legacy year file
      const eventData = JSON.parse(fs.readFileSync(eventCachePath, 'utf8'));
      const legacyData = { ...eventData, year: parseInt(year) };
      const outputPath = path.join(OUTPUT_DIR, `${year}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(legacyData, null, 2));
      console.log(`✅ Legacy gallery data for ${year} (from ${eventName}) saved to ${outputPath}`);
    } else {
      console.warn(`Skipping legacy year ${year}: Event ${eventName} has no cached data`);
    }
  }
}

main().catch(console.error);
