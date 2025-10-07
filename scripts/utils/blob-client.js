/**
 * Vercel Blob Storage Client Wrapper
 * Provides utilities for uploading and managing gallery images in Vercel Blob
 */

import { put, list, del } from '@vercel/blob';

/**
 * Upload an image variant to Vercel Blob
 * @param {string} path - Path in blob storage (e.g., 'gallery/fileId/thumb.avif')
 * @param {Buffer} buffer - Image buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} Upload result with URL
 */
export async function uploadImage(path, buffer, options = {}) {
  try {
    const result = await put(path, buffer, {
      access: 'public',
      addRandomSuffix: false, // Keep URLs predictable
      cacheControlMaxAge: 31536000, // 1 year (immutable)
      ...options
    });

    return {
      url: result.url,
      pathname: result.pathname,
      size: buffer.length,
      uploadedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Failed to upload ${path}:`, error.message);
    throw new Error(`Blob upload failed for ${path}: ${error.message}`);
  }
}

/**
 * List all files in a Blob storage prefix
 * @param {string} prefix - Path prefix (e.g., 'gallery/')
 * @returns {Promise<Array>} List of blob files
 */
export async function listImages(prefix = 'gallery/') {
  try {
    const result = await list({ prefix });
    return result.blobs || [];
  } catch (error) {
    console.error(`Failed to list blobs with prefix ${prefix}:`, error.message);
    return [];
  }
}

/**
 * Delete an image from Blob storage
 * @param {string} url - Blob URL to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteImage(url) {
  try {
    await del(url);
    return true;
  } catch (error) {
    console.error(`Failed to delete ${url}:`, error.message);
    return false;
  }
}

/**
 * Check if a file exists in Blob storage
 * @param {string} fileId - Google Drive file ID
 * @param {string} variant - Image variant (e.g., 'thumb.avif')
 * @param {Array} blobList - Pre-fetched blob list (optional)
 * @returns {Promise<Object|null>} Blob info if exists, null otherwise
 */
export async function checkExists(fileId, variant, blobList = null) {
  const blobs = blobList || await listImages(`gallery/${fileId}/`);
  return blobs.find(blob => blob.pathname.includes(variant)) || null;
}

/**
 * Get Blob storage statistics
 * @returns {Promise<Object>} Storage stats
 */
export async function getStorageStats() {
  try {
    const allBlobs = await listImages('gallery/');

    const stats = {
      totalFiles: allBlobs.length,
      totalSize: allBlobs.reduce((sum, blob) => sum + (blob.size || 0), 0),
      byFormat: {},
      bySize: {
        thumb: 0,
        full: 0
      }
    };

    // Group by format
    allBlobs.forEach(blob => {
      const format = blob.pathname.split('.').pop();
      stats.byFormat[format] = (stats.byFormat[format] || 0) + 1;

      if (blob.pathname.includes('/thumb.')) {
        stats.bySize.thumb += blob.size || 0;
      } else if (blob.pathname.includes('/full.')) {
        stats.bySize.full += blob.size || 0;
      }
    });

    // Convert bytes to MB
    stats.totalSizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    stats.bySize.thumbMB = (stats.bySize.thumb / 1024 / 1024).toFixed(2);
    stats.bySize.fullMB = (stats.bySize.full / 1024 / 1024).toFixed(2);

    return stats;
  } catch (error) {
    console.error('Failed to get storage stats:', error.message);
    return null;
  }
}

/**
 * Validate Blob token is configured
 * @returns {boolean} True if token exists
 */
export function validateToken() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('ERROR: BLOB_READ_WRITE_TOKEN environment variable not set');
    console.error('Get your token from: https://vercel.com/dashboard → Storage → Blob');
    return false;
  }
  return true;
}
