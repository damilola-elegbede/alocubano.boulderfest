/**
 * Gallery Years API Endpoint
 * Provides available gallery years with statistics and metadata
 */

const { google } = require("googleapis");

// Google Drive configuration
const FOLDER_CONFIGS = {
  2025: {
    folderId: "1YiZs4L-VYoqJXA3dSXjzST0Ft6aVGsJB",
    name: "2025 Festival Photos",
    description: "Photos from the 2025 A Lo Cubano Boulder Fest",
  },
  2024: {
    folderId: null, // Not connected to actual folder - use mock data
    name: "2024 Festival Photos",
    description: "Photos from the 2024 A Lo Cubano Boulder Fest",
  },
  2023: {
    folderId: null, // Not connected to actual folder - use mock data
    name: "2023 Festival Photos",
    description: "Photos from the inaugural 2023 A Lo Cubano Boulder Fest",
  },
};

// Supported image formats
const SUPPORTED_FORMATS = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/tiff",
]);

// Cache configuration
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
let yearStatsCache = null;
let cacheTimestamp = 0;

/**
 * Main API handler
 */
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    res.status(405).json({
      error: "Method not allowed",
      message: "Only GET requests are supported",
    });
    return;
  }

  try {
    // Check cache first
    const now = Date.now();
    if (yearStatsCache && now - cacheTimestamp < CACHE_DURATION) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=1800"); // 30 minutes
      res.status(200).json(yearStatsCache);
      return;
    }

    // Load fresh data
    const yearData = await loadYearStatistics();

    // Update cache
    yearStatsCache = yearData;
    cacheTimestamp = now;

    // Set response headers
    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=1800"); // 30 minutes
    res.setHeader("Content-Type", "application/json");

    res.status(200).json(yearData);
  } catch (error) {
    console.error("Gallery years API error:", error);

    // Return error response
    res.status(500).json({
      error: "Internal server error",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Failed to load gallery years",
    });
  }
}

/**
 * Load statistics for all available years
 */
async function loadYearStatistics() {
  const auth = await createGoogleAuth();
  const drive = google.drive({ version: "v3", auth });

  const years = [];
  const statistics = {};
  const metadata = {};

  // Process each configured year
  for (const [year, config] of Object.entries(FOLDER_CONFIGS)) {
    try {
      let stats;

      if (config.folderId) {
        // Get real statistics from Google Drive
        stats = await getYearStatistics(drive, year, config);
      } else {
        // Use mock data for testing
        stats = getMockYearStatistics(year);
      }

      // Only include years that have images
      if (stats.imageCount > 0) {
        years.push(year);
        statistics[year] = {
          imageCount: stats.imageCount,
          totalSize: stats.totalSize,
          lastModified: stats.lastModified,
          averageSize: stats.totalSize / stats.imageCount,
        };
        metadata[year] = {
          name: config.name,
          description: config.description,
          folderId: config.folderId,
        };
      }
    } catch (error) {
      console.error(`Failed to load statistics for year ${year}:`, error);
      // Continue processing other years
    }
  }

  // Sort years in descending order (newest first)
  years.sort((a, b) => b.localeCompare(a));

  return {
    years,
    statistics,
    metadata,
    totalYears: years.length,
    cacheTimestamp: Date.now(),
    apiVersion: "1.0",
  };
}

/**
 * Get mock statistics for testing years without actual folders
 */
function getMockYearStatistics(year) {
  const mockData = {
    2024: {
      imageCount: 42,
      totalSize: 85 * 1024 * 1024, // 85 MB
      lastModified: "2024-05-19T20:30:00.000Z",
    },
    2023: {
      imageCount: 28,
      totalSize: 56 * 1024 * 1024, // 56 MB
      lastModified: "2023-05-21T18:45:00.000Z",
    },
  };

  return (
    mockData[year] || {
      imageCount: 0,
      totalSize: 0,
      lastModified: null,
    }
  );
}

/**
 * Get statistics for a specific year
 */
async function getYearStatistics(drive, year, config) {
  try {
    // List all files in the folder
    const response = await drive.files.list({
      q: `'${config.folderId}' in parents and trashed=false`,
      fields: "files(id, name, mimeType, size, modifiedTime)",
      pageSize: 1000, // Adjust if needed
    });

    const files = response.data.files || [];

    // Filter image files and calculate statistics
    const imageFiles = files.filter((file) =>
      SUPPORTED_FORMATS.has(file.mimeType),
    );

    const statistics = {
      imageCount: imageFiles.length,
      totalSize: 0,
      lastModified: null,
    };

    let latestModified = 0;

    for (const file of imageFiles) {
      // Add to total size (size might be undefined for some files)
      const fileSize = parseInt(file.size) || 0;
      statistics.totalSize += fileSize;

      // Track latest modification time
      if (file.modifiedTime) {
        const modifiedTime = new Date(file.modifiedTime).getTime();
        if (modifiedTime > latestModified) {
          latestModified = modifiedTime;
          statistics.lastModified = file.modifiedTime;
        }
      }
    }

    return statistics;
  } catch (error) {
    console.error(`Error getting statistics for ${year}:`, error);
    throw error;
  }
}

/**
 * Create Google Drive authentication
 */
async function createGoogleAuth() {
  try {
    // Use service account authentication
    const credentials = JSON.parse(
      process.env.GOOGLE_DRIVE_CREDENTIALS || "{}",
    );

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("Google Drive credentials not properly configured");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    });

    return auth.getClient();
  } catch (error) {
    console.error("Google auth error:", error);
    throw new Error("Failed to authenticate with Google Drive");
  }
}

/**
 * Utility function to clear cache (for testing/debugging)
 */
export function clearCache() {
  yearStatsCache = null;
  cacheTimestamp = 0;
}

/**
 * Utility function to get cache status
 */
export function getCacheStatus() {
  return {
    cached: !!yearStatsCache,
    timestamp: cacheTimestamp,
    age: yearStatsCache ? Date.now() - cacheTimestamp : 0,
    expired: yearStatsCache
      ? Date.now() - cacheTimestamp > CACHE_DURATION
      : true,
  };
}
