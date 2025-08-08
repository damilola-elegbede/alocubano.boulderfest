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
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
  console.log("Skipping gallery cache generation: Google credentials not found");
  console.log("This is expected in CI/CD environments where credentials aren't available");
  process.exit(0);
}

// --- Configuration ---
// Event-based gallery configuration - maps event IDs to Google Drive folder IDs
const EVENT_GALLERY_CONFIG = {
  "boulder-fest-2025": "1hB8ajnn3RFaFBlEJ_7GuPpUHmt6-_w8e", // ALoCubano_BoulderFest_2025
  "boulder-fest-2026": null, // To be configured when folder is available
  "weekender-2026-09": null, // To be configured when folder is available
  // Add future events here as needed
};

// Legacy year-based config for backward compatibility
const LEGACY_GALLERY_CONFIG = {
  2025: "1hB8ajnn3RFaFBlEJ_7GuPpUHmt6-_w8e", // ALoCubano_BoulderFest_2025
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

// --- Main Fetch Logic ---
async function fetchAllGalleryDataFromGoogle(eventIdOrYear, folderId) {
  console.log(
    `Fetching all gallery data for ${eventIdOrYear} from Google Drive folder: ${folderId}...`,
  );

  try {
    // folderId is already the specific event folder, no need to search

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

    console.log(`Found ${totalCount} items for ${eventIdOrYear}.`);

    // Determine if this is an event or legacy year format
    const isEventFormat = eventIdOrYear.includes("-");
    const responseData = {
      totalCount,
      categories: categories,
      hasMore: false, // The static file contains all items
      cacheTimestamp: new Date().toISOString(),
    };

    if (isEventFormat) {
      responseData.eventId = eventIdOrYear;
      responseData.event = eventIdOrYear; // for backward compatibility
    } else {
      responseData.year = eventIdOrYear;
    }

    return responseData;
  } catch (error) {
    console.error(`Error fetching gallery data for ${eventIdOrYear}:`, error);
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

    // Create placeholder files for each configured event and legacy year
    for (const [eventId] of Object.entries(EVENT_GALLERY_CONFIG)) {
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

  // Process event-based gallery data
  for (const [eventId, folderId] of Object.entries(EVENT_GALLERY_CONFIG)) {
    if (!folderId) {
      console.warn(`Skipping ${eventId}: No folder ID configured`);
      continue;
    }

    const galleryData = await fetchAllGalleryDataFromGoogle(eventId, folderId);
    if (galleryData) {
      const outputPath = path.join(OUTPUT_DIR, `${eventId}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(galleryData, null, 2));
      console.log(`✅ Gallery data for ${eventId} saved to ${outputPath}`);
    }
  }

  // Process legacy year-based gallery data for backward compatibility
  for (const [year, folderId] of Object.entries(LEGACY_GALLERY_CONFIG)) {
    if (!folderId) {
      console.warn(`Skipping legacy year ${year}: No folder ID configured`);
      continue;
    }

    const galleryData = await fetchAllGalleryDataFromGoogle(year, folderId);
    if (galleryData) {
      const outputPath = path.join(OUTPUT_DIR, `${year}.json`);
      fs.writeFileSync(outputPath, JSON.stringify(galleryData, null, 2));
      console.log(`✅ Legacy gallery data for ${year} saved to ${outputPath}`);
    }
  }
}

main().catch(console.error);
