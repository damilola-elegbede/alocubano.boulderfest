// This script runs at build time to pre-fetch featured photos data.
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
    "Skipping featured photos generation: Google credentials not found",
  );
  console.log(
    "This is expected in CI/CD environments where credentials aren't available",
  );
  process.exit(0);
}

// --- Configuration ---
const FEATURED_PHOTOS_FOLDER_ID =
  process.env.GOOGLE_DRIVE_FEATURED_PHOTOS_FOLDER_ID ||
  process.env.GOOGLE_DRIVE_FOLDER_ID;
const OUTPUT_FILE = path.join(
  __dirname,
  "..",
  "public",
  "featured-photos.json",
);

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
async function fetchFeaturedPhotos() {
  console.log(
    `Fetching featured photos from Google Drive folder: ${FEATURED_PHOTOS_FOLDER_ID}...`,
  );

  if (!FEATURED_PHOTOS_FOLDER_ID) {
    throw new Error(
      "Featured photos folder ID is required. Please set GOOGLE_DRIVE_FEATURED_PHOTOS_FOLDER_ID or GOOGLE_DRIVE_FOLDER_ID.",
    );
  }

  try {
    const response = await drive.files.list({
      q: `'${FEATURED_PHOTOS_FOLDER_ID}' in parents and mimeType contains 'image/' and trashed = false`,
      fields:
        "files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)",
      pageSize: 100, // Assuming a reasonable number of hero images
      orderBy: "createdTime desc",
    });

    const files = response.data.files || [];
    console.log(`Found ${files.length} featured photos.`);

    // Return the same structure as the API
    return files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      thumbnailUrl: `/api/image-proxy/${file.id}`,
      viewUrl: `/api/image-proxy/${file.id}`,
      size: parseInt(file.size || "0"),
      createdAt: file.createdTime,
    }));
  } catch (error) {
    console.error("Error fetching featured photos:", error);
    throw error;
  }
}

// --- Script Execution ---
async function main() {
  if (
    !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ||
    !process.env.GOOGLE_PRIVATE_KEY
  ) {
    console.log(
      "⚠️  Missing Google service account credentials. Creating placeholder featured photos file for CI/development.",
    );

    // Create placeholder data
    const placeholderData = {
      items: [],
      totalCount: 0,
      cacheTimestamp: new Date().toISOString(),
      isPlaceholder: true,
      message: "Placeholder data - Google Drive credentials not available",
    };

    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(placeholderData, null, 2));
    console.log(`📄 Created placeholder: ${OUTPUT_FILE}`);
    console.log("✅ Placeholder featured photos file created successfully");
    return;
  }

  try {
    const featuredPhotos = await fetchFeaturedPhotos();

    // Structure to match the API response
    const output = {
      items: featuredPhotos,
      totalCount: featuredPhotos.length,
      cacheTimestamp: new Date().toISOString(),
    };

    // Ensure public directory exists
    const publicDir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`✅ Featured photos data saved to ${OUTPUT_FILE}`);
  } catch (error) {
    console.error("Failed to generate featured photos cache:", error);
    process.exit(1);
  }
}

main().catch(console.error);
