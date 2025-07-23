import sharp from 'sharp';

const WEBP_QUALITY = 80;
const JPEG_QUALITY = 85;

/**
 * Process image with resizing and format conversion
 * @param {Buffer} inputBuffer - Original image buffer
 * @param {Object} options - Processing options
 * @param {number} options.width - Target width in pixels
 * @param {string} options.format - Target format (webp, jpeg)
 * @param {number} options.quality - Quality level (1-100)
 * @returns {Promise<Buffer>} Processed image buffer
 */
async function processImage(inputBuffer, options = {}) {
  const { width, format = 'jpeg', quality } = options;
  
  let pipeline = sharp(inputBuffer);
  
  // Apply width-based resizing if specified
  if (width) {
    pipeline = pipeline.resize(width, null, {
      withoutEnlargement: true,
      fit: 'inside'
    });
  }
  
  // Apply format conversion with appropriate quality
  switch (format) {
    case 'webp':
      pipeline = pipeline.webp({ 
        quality: quality || WEBP_QUALITY,
        effort: 4
      });
      break;
    default:
      pipeline = pipeline.jpeg({ 
        quality: quality || JPEG_QUALITY,
        progressive: true
      });
      break;
  }
  
  return await pipeline.toBuffer();
}

/**
 * Detect optimal image format based on Accept header
 * @param {string} acceptHeader - Browser Accept header
 * @returns {string} Optimal format (webp or jpeg)
 */
function detectOptimalFormat(acceptHeader) {
  // Check for WebP support
  if (acceptHeader?.includes('image/webp')) {
    return 'webp';
  }
  
  // Fallback to JPEG
  return 'jpeg';
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
  
  return parts.join('-');
}

export { 
  processImage, 
  detectOptimalFormat, 
  generateCacheKey 
};