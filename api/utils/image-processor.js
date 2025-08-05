import sharp from "sharp";

const AVIF_QUALITY = 65;
const WEBP_QUALITY = 80;
const JPEG_QUALITY = 85;

/**
 * Process image with resizing and format conversion
 * @param {Buffer} inputBuffer - Original image buffer
 * @param {Object} options - Processing options
 * @param {number} options.width - Target width in pixels
 * @param {string} options.format - Target format (avif, webp, jpeg)
 * @param {number} options.quality - Quality level (1-100)
 * @returns {Promise<{buffer: Buffer, format: string}>} Processed image buffer and actual format used
 */
async function processImage(inputBuffer, options = {}) {
  const { width, format = "jpeg", quality } = options;

  try {
    let pipeline = sharp(inputBuffer);

    // Apply width-based resizing if specified
    if (width) {
      pipeline = pipeline.resize(width, null, {
        withoutEnlargement: true,
        fit: "inside",
      });
    }

    // Apply format conversion with appropriate quality
    switch (format) {
      case "avif":
        pipeline = pipeline.avif({
          quality: quality || AVIF_QUALITY,
          effort: 4,
        });
        break;
      case "webp":
        pipeline = pipeline.webp({
          quality: quality || WEBP_QUALITY,
          effort: 4,
        });
        break;
      default:
        pipeline = pipeline.jpeg({
          quality: quality || JPEG_QUALITY,
          progressive: true,
        });
        break;
    }

    const buffer = await pipeline.toBuffer();
    return { buffer, format };
  } catch (error) {
    // If AVIF processing fails, fallback to WebP or JPEG
    if (format === "avif") {
      console.warn(
        "AVIF processing failed, falling back to WebP:",
        error.message,
      );
      return processImage(inputBuffer, { ...options, format: "webp" });
    } else if (format === "webp") {
      console.warn(
        "WebP processing failed, falling back to JPEG:",
        error.message,
      );
      return processImage(inputBuffer, { ...options, format: "jpeg" });
    }
    // Re-throw error for JPEG as it's the final fallback
    throw error;
  }
}

/**
 * Detect optimal image format based on Accept header and User-Agent
 * @param {string} acceptHeader - Browser Accept header
 * @param {string} userAgent - Browser User-Agent string
 * @returns {string} Optimal format (avif, webp, or jpeg)
 */
function detectOptimalFormat(acceptHeader, userAgent = "") {
  // Check for AVIF support
  if (acceptHeader?.includes("image/avif")) {
    // Additional check for known AVIF-supporting browsers
    if (isAVIFSupported(userAgent)) {
      return "avif";
    }
  }

  // Check for WebP support
  if (acceptHeader?.includes("image/webp")) {
    return "webp";
  }

  // Fallback to JPEG
  return "jpeg";
}

/**
 * Check if browser supports AVIF based on User-Agent
 * @param {string} userAgent - Browser User-Agent string
 * @returns {boolean} True if AVIF is supported
 */
function isAVIFSupported(userAgent) {
  if (!userAgent) return false;

  // Chrome 85+ supports AVIF
  const chromeMatch = userAgent.match(/Chrome\/(\d+)/);
  if (chromeMatch && parseInt(chromeMatch[1]) >= 85) {
    return true;
  }

  // Firefox 93+ supports AVIF
  const firefoxMatch = userAgent.match(/Firefox\/(\d+)/);
  if (firefoxMatch && parseInt(firefoxMatch[1]) >= 93) {
    return true;
  }

  // Edge 93+ supports AVIF (Chromium-based)
  const edgeMatch = userAgent.match(/Edg\/(\d+)/);
  if (edgeMatch && parseInt(edgeMatch[1]) >= 93) {
    return true;
  }

  // Safari on macOS Big Sur 11.4+ and iOS 14.6+ supports AVIF
  const safariMatch = userAgent.match(/Version\/(\d+)\.(\d+).*Safari/);
  if (safariMatch) {
    const majorVersion = parseInt(safariMatch[1]);
    const minorVersion = parseInt(safariMatch[2]);

    // Safari 14.1+ (corresponds to macOS Big Sur 11.4+ and iOS 14.6+)
    if (majorVersion > 14 || (majorVersion === 14 && minorVersion >= 1)) {
      return true;
    }
  }

  return false;
}

/**
 * Generate cache key for processed image
 * @param {string} fileId - Original file ID
 * @param {Object} options - Processing options
 * @returns {string} Cache key
 */
function generateCacheKey(fileId, options = {}) {
  const { width, format, quality } = options;
  const parts = [fileId];

  if (width) parts.push(`w${width}`);
  if (format) parts.push(format);
  if (quality) parts.push(`q${quality}`);

  return parts.join("-");
}

export { processImage, detectOptimalFormat, generateCacheKey, isAVIFSupported };
