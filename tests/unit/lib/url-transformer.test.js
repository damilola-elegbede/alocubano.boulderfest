/**
 * Unit Tests for URL Transformer Utility
 * Tests URL transformation for Vercel Blob, Google Drive, and other URLs
 */

import { describe, it, expect } from 'vitest';
import {
  transformBlobUrl,
  transformGalleryItem,
  transformGalleryData
} from '../../../lib/url-transformer.js';

describe('URL Transformer - Unit Tests', () => {
  describe('transformBlobUrl', () => {
    describe('Vercel Blob URLs', () => {
      it('should return Vercel Blob URLs unchanged', () => {
        const blobUrl = 'https://abc123.blob.vercel-storage.com/image.jpg';
        const result = transformBlobUrl(blobUrl);

        expect(result).toBe(blobUrl);
      });

      it('should handle Vercel Blob URLs with query parameters', () => {
        const blobUrl = 'https://xyz789.blob.vercel-storage.com/photo.webp?width=800';
        const result = transformBlobUrl(blobUrl);

        expect(result).toBe(blobUrl);
      });

      it('should handle Vercel Blob URLs with path segments', () => {
        const blobUrl = 'https://store.blob.vercel-storage.com/images/2024/photo.avif';
        const result = transformBlobUrl(blobUrl);

        expect(result).toBe(blobUrl);
      });
    });

    describe('Google Drive URLs', () => {
      it('should transform drive.google.com URLs to proxy', () => {
        const driveUrl = 'https://drive.google.com/file/d/ABC123/view';
        const result = transformBlobUrl(driveUrl);

        expect(result).toContain('/api/image-proxy/drive?url=');
        expect(result).toContain(encodeURIComponent(driveUrl));
      });

      it('should transform googleusercontent.com URLs to proxy', () => {
        const gucUrl = 'https://lh3.googleusercontent.com/d/ABC123';
        const result = transformBlobUrl(gucUrl);

        expect(result).toContain('/api/image-proxy/drive?url=');
        expect(result).toContain(encodeURIComponent(gucUrl));
      });

      it('should transform lh3.googleusercontent.com URLs to proxy', () => {
        const lh3Url = 'https://lh3.googleusercontent.com/image123';
        const result = transformBlobUrl(lh3Url);

        expect(result).toContain('/api/image-proxy/drive?url=');
        expect(result).toContain(encodeURIComponent(lh3Url));
      });

      it('should properly encode special characters in Google Drive URLs', () => {
        const driveUrl = 'https://drive.google.com/file?id=ABC&name=test image.jpg';
        const result = transformBlobUrl(driveUrl);

        expect(result).toContain('/api/image-proxy/drive?url=');
        expect(decodeURIComponent(result.split('url=')[1])).toBe(driveUrl);
      });
    });

    describe('Other URLs', () => {
      it('should return regular HTTP URLs unchanged', () => {
        const url = 'https://example.com/image.jpg';
        const result = transformBlobUrl(url);

        expect(result).toBe(url);
      });

      it('should return regular HTTPS URLs unchanged', () => {
        const url = 'https://cdn.example.com/photo.webp';
        const result = transformBlobUrl(url);

        expect(result).toBe(url);
      });

      it('should return relative URLs unchanged', () => {
        const url = '/images/photo.jpg';
        const result = transformBlobUrl(url);

        expect(result).toBe(url);
      });

      it('should return data URLs unchanged', () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANS';
        const result = transformBlobUrl(dataUrl);

        expect(result).toBe(dataUrl);
      });
    });

    describe('Edge Cases', () => {
      it('should handle null input', () => {
        const result = transformBlobUrl(null);

        expect(result).toBeNull();
      });

      it('should handle undefined input', () => {
        const result = transformBlobUrl(undefined);

        expect(result).toBeUndefined();
      });

      it('should handle empty string', () => {
        const result = transformBlobUrl('');

        expect(result).toBe('');
      });

      it('should handle non-string input', () => {
        const result = transformBlobUrl(123);

        expect(result).toBe(123);
      });

      it('should handle object input', () => {
        const obj = { url: 'test' };
        const result = transformBlobUrl(obj);

        expect(result).toBe(obj);
      });

      it('should handle array input', () => {
        const arr = ['url1', 'url2'];
        const result = transformBlobUrl(arr);

        expect(result).toBe(arr);
      });
    });

    describe('URL Detection Accuracy', () => {
      it('should detect Vercel Blob URL anywhere in string', () => {
        const url = 'prefix.blob.vercel-storage.com.suffix/image.jpg';
        const result = transformBlobUrl(url);

        expect(result).toBe(url); // Contains blob.vercel-storage.com
      });

      it('should detect Google Drive URL anywhere in string', () => {
        const url = 'https://subdomain.drive.google.com/file';
        const result = transformBlobUrl(url);

        expect(result).toContain('/api/image-proxy/drive?url=');
      });

      it('should not transform URLs with blob.vercel-storage.com in path only', () => {
        const url = 'https://example.com/blob.vercel-storage.com/fake.jpg';
        const result = transformBlobUrl(url);

        expect(result).toBe(url); // Still contains the string, will return as-is
      });
    });
  });

  describe('transformGalleryItem', () => {
    describe('Basic Transformation', () => {
      it('should transform url field', () => {
        const item = {
          url: 'https://drive.google.com/file/d/ABC123/view',
          title: 'Test Photo'
        };

        const result = transformGalleryItem(item);

        expect(result.url).toContain('/api/image-proxy/drive?url=');
        expect(result.title).toBe('Test Photo');
      });

      it('should transform thumbnailUrl field', () => {
        const item = {
          thumbnailUrl: 'https://drive.google.com/thumb/ABC123'
        };

        const result = transformGalleryItem(item);

        expect(result.thumbnailUrl).toContain('/api/image-proxy/drive?url=');
      });

      it('should transform multiple URL fields', () => {
        const item = {
          url: 'https://drive.google.com/file1',
          thumbnailUrl: 'https://drive.google.com/thumb1',
          viewUrl: 'https://drive.google.com/view1'
        };

        const result = transformGalleryItem(item);

        expect(result.url).toContain('/api/image-proxy/drive?url=');
        expect(result.thumbnailUrl).toContain('/api/image-proxy/drive?url=');
        expect(result.viewUrl).toContain('/api/image-proxy/drive?url=');
      });
    });

    describe('WebP URLs', () => {
      it('should transform thumbnailUrl_webp field', () => {
        const item = {
          thumbnailUrl_webp: 'https://lh3.googleusercontent.com/photo.webp'
        };

        const result = transformGalleryItem(item);

        expect(result.thumbnailUrl_webp).toContain('/api/image-proxy/drive?url=');
      });

      it('should transform viewUrl_webp field', () => {
        const item = {
          viewUrl_webp: 'https://lh3.googleusercontent.com/view.webp'
        };

        const result = transformGalleryItem(item);

        expect(result.viewUrl_webp).toContain('/api/image-proxy/drive?url=');
      });
    });

    describe('Additional URL Fields', () => {
      it('should transform webformatURL field', () => {
        const item = {
          webformatURL: 'https://drive.google.com/web/ABC123'
        };

        const result = transformGalleryItem(item);

        expect(result.webformatURL).toContain('/api/image-proxy/drive?url=');
      });

      it('should transform largeImageURL field', () => {
        const item = {
          largeImageURL: 'https://drive.google.com/large/ABC123'
        };

        const result = transformGalleryItem(item);

        expect(result.largeImageURL).toContain('/api/image-proxy/drive?url=');
      });

      it('should transform fullImageURL field', () => {
        const item = {
          fullImageURL: 'https://drive.google.com/full/ABC123'
        };

        const result = transformGalleryItem(item);

        expect(result.fullImageURL).toContain('/api/image-proxy/drive?url=');
      });
    });

    describe('Srcset Transformation', () => {
      it('should transform srcset with single source', () => {
        const item = {
          srcset: 'https://drive.google.com/image.jpg 1x'
        };

        const result = transformGalleryItem(item);

        expect(result.srcset).toContain('/api/image-proxy/drive?url=');
        expect(result.srcset).toContain('1x');
      });

      it('should transform srcset with multiple sources', () => {
        const item = {
          srcset: 'https://drive.google.com/small.jpg 1x, https://drive.google.com/large.jpg 2x'
        };

        const result = transformGalleryItem(item);

        const sources = result.srcset.split(',').map(s => s.trim());
        expect(sources).toHaveLength(2);
        expect(sources[0]).toContain('/api/image-proxy/drive?url=');
        expect(sources[0]).toContain('1x');
        expect(sources[1]).toContain('/api/image-proxy/drive?url=');
        expect(sources[1]).toContain('2x');
      });

      it('should transform srcset with width descriptors', () => {
        const item = {
          srcset: 'https://drive.google.com/s.jpg 480w, https://drive.google.com/m.jpg 800w'
        };

        const result = transformGalleryItem(item);

        expect(result.srcset).toContain('480w');
        expect(result.srcset).toContain('800w');
      });

      it('should handle srcset with mixed URLs', () => {
        const item = {
          srcset: 'https://cdn.example.com/image.jpg 1x, https://drive.google.com/image.jpg 2x'
        };

        const result = transformGalleryItem(item);

        const sources = result.srcset.split(',').map(s => s.trim());
        expect(sources[0]).toContain('cdn.example.com'); // Not transformed
        expect(sources[1]).toContain('/api/image-proxy/drive?url='); // Transformed
      });

      it('should handle srcset without descriptors', () => {
        const item = {
          srcset: 'https://drive.google.com/image.jpg'
        };

        const result = transformGalleryItem(item);

        expect(result.srcset).toContain('/api/image-proxy/drive?url=');
      });

      it('should handle non-string srcset', () => {
        const item = {
          srcset: null
        };

        const result = transformGalleryItem(item);

        expect(result.srcset).toBeNull();
      });
    });

    describe('Edge Cases', () => {
      it('should handle null item', () => {
        const result = transformGalleryItem(null);

        expect(result).toBeNull();
      });

      it('should handle undefined item', () => {
        const result = transformGalleryItem(undefined);

        expect(result).toBeUndefined();
      });

      it('should handle empty object', () => {
        const result = transformGalleryItem({});

        expect(result).toEqual({});
      });

      it('should handle item with no URL fields', () => {
        const item = {
          title: 'Test',
          description: 'Description',
          date: '2024-01-01'
        };

        const result = transformGalleryItem(item);

        expect(result).toEqual(item);
      });

      it('should not modify original object', () => {
        const item = {
          url: 'https://drive.google.com/file/ABC',
          title: 'Original'
        };

        const result = transformGalleryItem(item);

        expect(item.url).toBe('https://drive.google.com/file/ABC'); // Unchanged
        expect(result.url).not.toBe(item.url); // Changed
      });

      it('should handle item with undefined URL fields', () => {
        const item = {
          url: undefined,
          thumbnailUrl: null,
          title: 'Test'
        };

        const result = transformGalleryItem(item);

        expect(result.url).toBeUndefined();
        expect(result.thumbnailUrl).toBeNull();
      });
    });
  });

  describe('transformGalleryData', () => {
    describe('Categories Structure', () => {
      it('should transform items in categories', () => {
        const data = {
          categories: {
            photos: [
              { url: 'https://drive.google.com/photo1' },
              { url: 'https://drive.google.com/photo2' }
            ]
          }
        };

        const result = transformGalleryData(data);

        expect(result.categories.photos).toHaveLength(2);
        expect(result.categories.photos[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.categories.photos[1].url).toContain('/api/image-proxy/drive?url=');
      });

      it('should transform multiple categories', () => {
        const data = {
          categories: {
            dancers: [{ url: 'https://drive.google.com/d1' }],
            musicians: [{ url: 'https://drive.google.com/m1' }],
            venue: [{ url: 'https://drive.google.com/v1' }]
          }
        };

        const result = transformGalleryData(data);

        expect(result.categories.dancers[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.categories.musicians[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.categories.venue[0].url).toContain('/api/image-proxy/drive?url=');
      });

      it('should handle empty categories', () => {
        const data = {
          categories: {
            photos: []
          }
        };

        const result = transformGalleryData(data);

        expect(result.categories.photos).toEqual([]);
      });

      it('should handle non-array category values', () => {
        const data = {
          categories: {
            metadata: { count: 10 }
          }
        };

        const result = transformGalleryData(data);

        expect(result.categories.metadata).toEqual({ count: 10 });
      });
    });

    describe('Items Array Structure', () => {
      it('should transform items array', () => {
        const data = {
          items: [
            { url: 'https://drive.google.com/i1' },
            { url: 'https://drive.google.com/i2' }
          ]
        };

        const result = transformGalleryData(data);

        expect(result.items).toHaveLength(2);
        expect(result.items[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.items[1].url).toContain('/api/image-proxy/drive?url=');
      });

      it('should handle empty items array', () => {
        const data = {
          items: []
        };

        const result = transformGalleryData(data);

        expect(result.items).toEqual([]);
      });
    });

    describe('Photos Array Structure', () => {
      it('should transform photos array', () => {
        const data = {
          photos: [
            { url: 'https://drive.google.com/p1' },
            { url: 'https://drive.google.com/p2' }
          ]
        };

        const result = transformGalleryData(data);

        expect(result.photos).toHaveLength(2);
        expect(result.photos[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.photos[1].url).toContain('/api/image-proxy/drive?url=');
      });

      it('should handle empty photos array', () => {
        const data = {
          photos: []
        };

        const result = transformGalleryData(data);

        expect(result.photos).toEqual([]);
      });
    });

    describe('Combined Structures', () => {
      it('should transform all structures simultaneously', () => {
        const data = {
          categories: {
            featured: [{ url: 'https://drive.google.com/c1' }]
          },
          items: [{ url: 'https://drive.google.com/i1' }],
          photos: [{ url: 'https://drive.google.com/p1' }]
        };

        const result = transformGalleryData(data);

        expect(result.categories.featured[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.items[0].url).toContain('/api/image-proxy/drive?url=');
        expect(result.photos[0].url).toContain('/api/image-proxy/drive?url=');
      });

      it('should preserve other metadata fields', () => {
        const data = {
          categories: {
            photos: [{ url: 'https://drive.google.com/p1' }]
          },
          totalCount: 100,
          page: 1,
          metadata: {
            version: '1.0',
            lastUpdated: '2024-01-01'
          }
        };

        const result = transformGalleryData(data);

        expect(result.totalCount).toBe(100);
        expect(result.page).toBe(1);
        expect(result.metadata).toEqual({
          version: '1.0',
          lastUpdated: '2024-01-01'
        });
      });
    });

    describe('Edge Cases', () => {
      it('should handle null data', () => {
        const result = transformGalleryData(null);

        expect(result).toBeNull();
      });

      it('should handle undefined data', () => {
        const result = transformGalleryData(undefined);

        expect(result).toBeUndefined();
      });

      it('should handle empty object', () => {
        const result = transformGalleryData({});

        expect(result).toEqual({});
      });

      it('should handle data with no gallery structures', () => {
        const data = {
          title: 'Gallery',
          description: 'Test gallery'
        };

        const result = transformGalleryData(data);

        expect(result).toEqual(data);
      });

      it('should not modify original object', () => {
        const data = {
          categories: {
            photos: [{ url: 'https://drive.google.com/original' }]
          }
        };

        const result = transformGalleryData(data);

        expect(data.categories.photos[0].url).toBe('https://drive.google.com/original');
        expect(result.categories.photos[0].url).not.toBe(data.categories.photos[0].url);
      });

      it('should handle deeply nested structures', () => {
        const data = {
          categories: {
            year2024: {
              month01: [{ url: 'https://drive.google.com/nested' }]
            }
          }
        };

        const result = transformGalleryData(data);

        // Non-array category values are preserved as-is
        expect(result.categories.year2024).toEqual({
          month01: [{ url: 'https://drive.google.com/nested' }]
        });
      });
    });
  });

  describe('Default Export', () => {
    it('should export all functions as default object', async () => {
      const urlTransformer = await import('../../../lib/url-transformer.js');

      expect(urlTransformer.default).toBeDefined();
      expect(urlTransformer.default.transformBlobUrl).toBe(transformBlobUrl);
      expect(urlTransformer.default.transformGalleryItem).toBe(transformGalleryItem);
      expect(urlTransformer.default.transformGalleryData).toBe(transformGalleryData);
    });
  });
});
