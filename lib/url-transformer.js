/**
 * URL Transformer Utility
 * Intelligently routes image URLs for optimal performance:
 * - Vercel Blob URLs: Served directly from CDN (no transformation)
 * - Google Drive URLs: Routed through CORS proxy when needed
 * - Other URLs: Passed through unchanged
 */

/**
 * Transform URLs to use appropriate serving strategy
 * - Vercel Blob URLs: Serve directly from CDN (already optimized)
 * - Google Drive URLs: Route through CORS proxy
 * - Other URLs: Return as-is
 * @param {string} url - The original URL
 * @returns {string} - The transformed URL or original if no transformation needed
 */
export function transformBlobUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Strategy 1: Vercel Blob Storage URLs - serve directly from CDN
  // These are already optimized (AVIF/WebP) and cached, no transformation needed
  if (url.includes('.blob.vercel-storage.com')) {
    return url; // Serve directly from Vercel CDN
  }

  // Strategy 2: Google Drive URLs - route through CORS proxy
  // Required for CORS handling when images aren't in Blob Storage
  if (url.includes('drive.google.com') || url.includes('googleusercontent.com') || url.includes('lh3.googleusercontent.com')) {
    // Use CORS proxy for Google Drive images
    return `/api/image-proxy/drive?url=${encodeURIComponent(url)}`;
  }

  // Strategy 3: All other URLs - return as-is
  return url;
}

/**
 * Transform all URLs in a gallery item object
 * @param {Object} item - Gallery item with potentially multiple URL fields
 * @returns {Object} - Gallery item with transformed URLs
 */
export function transformGalleryItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  const transformed = { ...item };

  // Transform common URL fields
  const urlFields = [
    'url',
    'thumbnailUrl',
    'thumbnailUrl_webp',
    'viewUrl',
    'viewUrl_webp',
    'webformatURL',
    'largeImageURL',
    'fullImageURL'
  ];

  urlFields.forEach(field => {
    if (transformed[field]) {
      transformed[field] = transformBlobUrl(transformed[field]);
    }
  });

  // Transform srcset if present (used for responsive images)
  if (transformed.srcset && typeof transformed.srcset === 'string') {
    transformed.srcset = transformed.srcset
      .split(',')
      .map(src => {
        const [url, descriptor] = src.trim().split(/\s+/);
        return `${transformBlobUrl(url)} ${descriptor || ''}`.trim();
      })
      .join(', ');
  }

  return transformed;
}

/**
 * Transform all items in a gallery data structure
 * @param {Object} galleryData - Gallery data with categories containing items
 * @returns {Object} - Gallery data with all URLs transformed
 */
export function transformGalleryData(galleryData) {
  if (!galleryData || typeof galleryData !== 'object') {
    return galleryData;
  }

  const transformed = { ...galleryData };

  // Transform items in categories
  if (transformed.categories && typeof transformed.categories === 'object') {
    transformed.categories = Object.keys(transformed.categories).reduce((acc, category) => {
      const items = transformed.categories[category];
      acc[category] = Array.isArray(items)
        ? items.map(item => transformGalleryItem(item))
        : items;
      return acc;
    }, {});
  }

  // Transform items array (alternative structure)
  if (Array.isArray(transformed.items)) {
    transformed.items = transformed.items.map(item => transformGalleryItem(item));
  }

  // Transform photos array (featured photos structure)
  if (Array.isArray(transformed.photos)) {
    transformed.photos = transformed.photos.map(item => transformGalleryItem(item));
  }

  return transformed;
}

export default {
  transformBlobUrl,
  transformGalleryItem,
  transformGalleryData
};
