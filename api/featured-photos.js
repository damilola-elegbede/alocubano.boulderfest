import { google } from "googleapis";

// Initialize Google Drive API client
const getDriveClient = () => {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });

  return google.drive({ version: "v3", auth });
};

// Cache configuration
const CACHE_DURATION = 3600; // 1 hour in seconds

export default async function handler(req, res) {
  // Set secure CORS headers with domain restrictions
  const origin = req.headers.origin;
  const allowedOrigins = [
    "https://alocubano.boulderfest.com",
    "https://www.alocubano.boulderfest.com",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "3600");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Use the main Google Drive folder ID or a specific featured photos folder
    const featuredPhotosFolderId =
      process.env.GOOGLE_DRIVE_FEATURED_PHOTOS_FOLDER_ID ||
      process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!featuredPhotosFolderId) {
      return res.status(400).json({
        error:
          "Featured photos folder ID is required. Please set GOOGLE_DRIVE_FEATURED_PHOTOS_FOLDER_ID or GOOGLE_DRIVE_FOLDER_ID.",
      });
    }

    // Initialize Drive client
    const drive = getDriveClient();

    // Get all image files from the featured photos folder
    const response = await drive.files.list({
      q: `'${featuredPhotosFolderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields:
        "files(id, name, mimeType, thumbnailLink, webViewLink, webContentLink, size, createdTime)",
      pageSize: 100, // Assuming a reasonable number of hero images
      orderBy: "createdTime desc",
    });

    const files = response.data.files || [];

    // Process files to create the items array
    const items = files.map((file) => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      thumbnailUrl: `/api/image-proxy/${file.id}`,
      viewUrl: `/api/image-proxy/${file.id}`,
      size: parseInt(file.size || "0"),
      createdAt: file.createdTime,
    }));

    const result = {
      items,
      totalCount: items.length,
      cacheTimestamp: new Date().toISOString(),
    };

    // Set cache headers
    res.setHeader(
      "Cache-Control",
      `s-maxage=${CACHE_DURATION}, stale-while-revalidate`,
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("Featured Photos API Error:", error);

    // Handle specific Google API errors
    if (error.code === 404) {
      return res
        .status(404)
        .json({ error: "Featured photos folder not found" });
    }

    if (error.code === 403) {
      return res
        .status(403)
        .json({
          error:
            "Access denied. Please check featured photos folder permissions.",
        });
    }

    // Generic error response
    return res.status(500).json({
      error: "Failed to fetch featured photos",
      message:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
}
