/**
 * Image Processing Utilities using Sharp
 * Generates multiple formats and sizes for optimal web delivery
 */

import sharp from 'sharp';

/**
 * Image variant configurations
 */
export const VARIANTS = {
  thumbnail: {
    width: 400,
    formats: {
      avif: { quality: 70, effort: 4 },
      webp: { quality: 75, effort: 4 }
    }
  },
  full: {
    width: 1920,
    formats: {
      avif: { quality: 75, effort: 4 },
      webp: { quality: 80, effort: 4 }
    }
  }
};

/**
 * Process a single image into all required variants
 * @param {Buffer} inputBuffer - Original image buffer
 * @param {Object} options - Processing options
 * @returns {Promise<Object>} Processed variants
 */
export async function processImage(inputBuffer, options = {}) {
  const {
    generateThumbnails = true,
    generateFull = true,
    additionalSizes = []
  } = options;

  const results = {};

  try {
    // Get image metadata
    const metadata = await sharp(inputBuffer).metadata();
    results.metadata = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: inputBuffer.length
    };

    // Generate thumbnails
    if (generateThumbnails) {
      results.thumbnail = await processVariant(
        inputBuffer,
        VARIANTS.thumbnail.width,
        VARIANTS.thumbnail.formats
      );
    }

    // Generate full-size variants
    if (generateFull) {
      results.full = await processVariant(
        inputBuffer,
        VARIANTS.full.width,
        VARIANTS.full.formats
      );
    }

    // Generate additional custom sizes if requested
    for (const customSize of additionalSizes) {
      results[`custom_${customSize.width}`] = await processVariant(
        inputBuffer,
        customSize.width,
        customSize.formats || VARIANTS.full.formats
      );
    }

    return results;

  } catch (error) {
    console.error('Image processing failed:', error.message);
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Process image into a specific size with multiple formats
 * @param {Buffer} inputBuffer - Original image buffer
 * @param {number} targetWidth - Target width in pixels
 * @param {Object} formats - Format configurations
 * @returns {Promise<Object>} Processed buffers by format
 */
async function processVariant(inputBuffer, targetWidth, formats) {
  const results = {};

  // Create base pipeline with resize
  const basePipeline = sharp(inputBuffer, {
    limitInputPixels: 268402689, // Max 16384x16384
    sequentialRead: true
  }).rotate().resize(targetWidth, null, {
    fit: 'inside',
    withoutEnlargement: true,
    fastShrinkOnLoad: true // 3x faster for large images
  });

  // Generate each format
  for (const [format, config] of Object.entries(formats)) {
    try {
      let buffer;

      if (format === 'avif') {
        buffer = await basePipeline
          .clone()
          .avif({
            quality: config.quality,
            effort: config.effort || 4,
            chromaSubsampling: '4:2:0'
          })
          .toBuffer();
      } else if (format === 'webp') {
        buffer = await basePipeline
          .clone()
          .webp({
            quality: config.quality,
            effort: config.effort || 4
          })
          .toBuffer();
      } else if (format === 'jpeg') {
        buffer = await basePipeline
          .clone()
          .jpeg({
            quality: config.quality || 85,
            progressive: true,
            mozjpeg: true
          })
          .toBuffer();
      }

      if (buffer) {
        results[format] = {
          buffer,
          size: buffer.length,
          compression: (((inputBuffer.length - buffer.length) / inputBuffer.length) * 100).toFixed(1)
        };
      }
    } catch (error) {
      console.error(`Failed to generate ${format} variant:`, error.message);
      // Continue with other formats even if one fails
    }
  }

  return results;
}

/**
 * Get optimal image dimensions based on connection quality
 * @param {string} quality - Connection quality ('low', 'medium', 'high')
 * @returns {Object} Optimal dimensions
 */
export function getOptimalDimensions(quality = 'high') {
  const dimensions = {
    low: { thumbnail: 300, full: 1080 },
    medium: { thumbnail: 400, full: 1440 },
    high: { thumbnail: 400, full: 1920 }
  };

  return dimensions[quality] || dimensions.high;
}

/**
 * Validate image buffer
 * @param {Buffer} buffer - Image buffer to validate
 * @returns {Promise<boolean>} True if valid image
 */
export async function validateImage(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return !!(metadata.width && metadata.height);
  } catch (error) {
    return false;
  }
}

/**
 * Calculate estimated processing time
 * @param {number} imageSize - Original image size in bytes
 * @param {number} variantCount - Number of variants to generate
 * @returns {number} Estimated time in milliseconds
 */
export function estimateProcessingTime(imageSize, variantCount = 4) {
  // Rough estimate: 100ms per MB per variant
  const sizeMB = imageSize / 1024 / 1024;
  return Math.ceil(sizeMB * variantCount * 100);
}
