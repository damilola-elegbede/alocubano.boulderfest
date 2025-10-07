/**
 * URL Transformer Utility
 * Transforms Vercel Blob storage URLs to use the image proxy endpoint
 * This solves CORS issues by routing requests through our own API
 */

/**
 * Transform a Vercel Blob URL to an image proxy URL
 * @param {string} url - The original Vercel Blob storage URL
 * @returns {string} - The transformed image proxy URL
 */
export function transformBlobUrl(url) {
  if (!url || typeof url !== 'string') {
    return url;
  }

  // Check if this is a Vercel Blob storage URL
  if (!url.includes('.blob.vercel-storage.com')) {
    return url; // Not a blob URL, return as-is
  }

  try {
    // Extract file ID from Vercel Blob URL
    // Format: https://[storage].blob.vercel-storage.com/gallery/[FILE_ID]/[variant].[ext]
    // Example: https://mikya8vluytqhmff.public.blob.vercel-storage.com/gallery/1aoY5n3dKlFQCCPV1dd2T8GUrdRIax2DY/thumb.avif
    const match = url.match(/\/gallery\/([^\/]+)\/(thumb|full)\.(avif|webp|jpg|jpeg)/i);

    if (!match) {
      console.warn('URL Transformer: Could not extract file ID from URL:', url);
      return url; // Return original URL if pattern doesn't match
    }

    const [, fileId, variant, format] = match;

    // Build image proxy URL with query parameters
    // The image proxy will handle format negotiation and optimization
    return `/api/image-proxy/${fileId}?type=${variant}&format=${format}`;

  } catch (error) {
    console.error('URL Transformer: Error transforming URL:', url, error);
    return url; // Return original URL on error
  }
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
