/**
 * Google Drive API Mock Utilities for E2E Testing
 * Provides comprehensive mocking for gallery and image services
 */

import { test, expect } from '@playwright/test';

/**
 * Mock Gallery Data Generator
 * Creates realistic test data with configurable parameters
 */
export class GoogleDriveMockGenerator {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://drive.google.com/file/d';
    this.imageFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    this.videoFormats = ['video/mp4', 'video/webm', 'video/mov'];
    this.categories = ['workshops', 'socials', 'performances', 'other'];
  }

  /**
   * Generate mock gallery data for a specific year
   */
  generateGalleryData(year = 2025, options = {}) {
    const {
      imageCount = 50,
      videoCount = 10,
      categories = this.categories,
      includeMetadata = true,
      includeFeatured = true,
    } = options;

    const totalItems = imageCount + videoCount;
    const itemsPerCategory = Math.floor(totalItems / categories.length);
    const galleryData = {
      eventId: `boulder-fest-${year}`,
      event: `boulder-fest-${year}`,
      year: parseInt(year),
      totalCount: totalItems,
      categories: {},
      hasMore: totalItems > 100,
      cacheTimestamp: new Date().toISOString(),
      source: 'test-mock',
      api: {
        version: '2.0',
        timestamp: new Date().toISOString(),
        environment: 'test',
        queryParams: { year }
      }
    };

    // Generate items for each category
    categories.forEach((category, categoryIndex) => {
      galleryData.categories[category] = [];
      
      // Generate images for this category
      const categoryImageCount = Math.floor(imageCount / categories.length);
      const categoryVideoCount = Math.floor(videoCount / categories.length);
      
      for (let i = 0; i < categoryImageCount; i++) {
        const item = this.generateImageItem(category, i, year, includeMetadata);
        galleryData.categories[category].push(item);
      }
      
      for (let i = 0; i < categoryVideoCount; i++) {
        const item = this.generateVideoItem(category, i, year, includeMetadata);
        galleryData.categories[category].push(item);
      }
    });

    // Add featured photos if requested
    if (includeFeatured) {
      galleryData.featured = this.selectFeaturedItems(galleryData, 6);
    }

    return galleryData;
  }

  /**
   * Generate a mock image item
   */
  generateImageItem(category, index, year, includeMetadata = true) {
    const fileId = this.generateFileId();
    const format = this.imageFormats[index % this.imageFormats.length];
    const timestamp = new Date(year, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28));
    
    const item = {
      id: fileId,
      name: `${category}_photo_${String(index + 1).padStart(3, '0')}.${format.split('/')[1]}`,
      type: 'image',
      mimeType: format,
      url: `${this.baseUrl}/${fileId}/view`,
      thumbnailUrl: `${this.baseUrl}/${fileId}/preview`,
      downloadUrl: `${this.baseUrl}/${fileId}/export?format=${format.split('/')[1]}`,
      webViewLink: `${this.baseUrl}/${fileId}/view`,
      category,
      size: Math.floor(Math.random() * 5000000) + 500000, // 500KB - 5MB
      modifiedTime: timestamp.toISOString(),
      createdTime: timestamp.toISOString(),
    };

    if (includeMetadata) {
      item.metadata = {
        width: 1920 + Math.floor(Math.random() * 1080),
        height: 1080 + Math.floor(Math.random() * 720),
        aspectRatio: '16:9',
        colorSpace: 'sRGB',
        exif: {
          camera: ['Canon EOS R5', 'Sony A7IV', 'Nikon D850'][Math.floor(Math.random() * 3)],
          lens: '24-70mm f/2.8',
          focalLength: '35mm',
          aperture: 'f/2.8',
          shutterSpeed: '1/125',
          iso: 800 + Math.floor(Math.random() * 1200),
        }
      };
    }

    return item;
  }

  /**
   * Generate a mock video item
   */
  generateVideoItem(category, index, year, includeMetadata = true) {
    const fileId = this.generateFileId();
    const format = this.videoFormats[index % this.videoFormats.length];
    const timestamp = new Date(year, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28));
    
    const item = {
      id: fileId,
      name: `${category}_video_${String(index + 1).padStart(3, '0')}.${format.split('/')[1]}`,
      type: 'video',
      mimeType: format,
      url: `${this.baseUrl}/${fileId}/view`,
      thumbnailUrl: `${this.baseUrl}/${fileId}/preview`,
      downloadUrl: `${this.baseUrl}/${fileId}/export?format=${format.split('/')[1]}`,
      webViewLink: `${this.baseUrl}/${fileId}/view`,
      category,
      size: Math.floor(Math.random() * 50000000) + 10000000, // 10MB - 50MB
      modifiedTime: timestamp.toISOString(),
      createdTime: timestamp.toISOString(),
    };

    if (includeMetadata) {
      item.metadata = {
        duration: Math.floor(Math.random() * 300) + 30, // 30-330 seconds
        width: 1920,
        height: 1080,
        frameRate: '30fps',
        bitrate: '8000kbps',
        codec: 'H.264',
      };
    }

    return item;
  }

  /**
   * Select featured items from gallery data
   */
  selectFeaturedItems(galleryData, count = 6) {
    const allItems = [];
    
    // Collect all items from categories
    Object.values(galleryData.categories).forEach(categoryItems => {
      allItems.push(...categoryItems.filter(item => item.type === 'image'));
    });

    // Select featured items (prioritize certain categories)
    const featured = [];
    const priorities = ['performances', 'workshops', 'socials', 'other'];
    
    priorities.forEach(category => {
      if (galleryData.categories[category] && featured.length < count) {
        const categoryItems = galleryData.categories[category]
          .filter(item => item.type === 'image')
          .slice(0, Math.ceil(count / priorities.length));
        
        featured.push(...categoryItems.map(item => ({
          ...item,
          featured: true
        })));
      }
    });

    return featured.slice(0, count);
  }

  /**
   * Generate realistic file IDs
   */
  generateFileId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let i = 0; i < 28; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate year statistics mock data
   */
  generateYearStatistics(years = [2025, 2024, 2023]) {
    const statistics = {};
    const metadata = {};
    
    years.forEach(year => {
      const imageCount = 30 + Math.floor(Math.random() * 100);
      const totalSize = imageCount * (2000000 + Math.floor(Math.random() * 3000000));
      
      statistics[year] = {
        imageCount,
        totalSize,
        lastModified: new Date(year, 11, 31).toISOString(),
        averageSize: Math.floor(totalSize / imageCount),
      };
      
      metadata[year] = {
        name: `${year} Festival Photos`,
        description: `Photos from the ${year} A Lo Cubano Boulder Fest`,
        folderId: this.generateFileId(),
      };
    });

    return {
      years: years.sort((a, b) => b - a),
      statistics,
      metadata,
      totalYears: years.length,
      cacheTimestamp: Date.now(),
      apiVersion: '1.0',
    };
  }
}

/**
 * API Response Mock Scenarios
 * Simulates different network conditions and response patterns
 */
export class APIResponseScenarios {
  /**
   * Mock successful gallery response
   */
  static success(data, delay = 0) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=900',
        'X-Cache': 'MISS',
      },
      body: data,
      delay,
    };
  }

  /**
   * Mock slow network response
   */
  static slowNetwork(data, delay = 5000) {
    return this.success(data, delay);
  }

  /**
   * Mock server error
   */
  static serverError(message = 'Internal server error') {
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Internal server error',
        message,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Mock rate limiting error
   */
  static rateLimited(retryAfter = 60) {
    return {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
        'X-RateLimit-Remaining': '0',
      },
      body: {
        error: 'Too Many Requests',
        message: 'API rate limit exceeded',
        retryAfter,
      },
    };
  }

  /**
   * Mock authentication required
   */
  static unauthorized() {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'Unauthorized',
        message: 'Authentication required',
      },
    };
  }

  /**
   * Mock empty gallery
   */
  static emptyGallery() {
    return this.success({
      eventId: 'unknown',
      event: 'unknown',
      totalCount: 0,
      categories: {},
      hasMore: false,
      cacheTimestamp: new Date().toISOString(),
      source: 'test-mock',
      message: 'No photos available',
    });
  }

  /**
   * Mock partial failure (some categories load, others fail)
   */
  static partialFailure(year = 2025) {
    return this.success({
      eventId: `boulder-fest-${year}`,
      event: `boulder-fest-${year}`,
      year: parseInt(year),
      totalCount: 25,
      categories: {
        workshops: [/* some items */],
        socials: [/* some items */],
        performances: [], // empty due to error
        other: [] // empty due to error
      },
      hasMore: false,
      cacheTimestamp: new Date().toISOString(),
      source: 'test-mock',
      warnings: [
        'Failed to load performances category',
        'Failed to load other category'
      ],
    });
  }
}

/**
 * Gallery Mock Page Helper
 * Provides page-level mocking utilities for E2E tests
 */
export class GalleryMockHelper {
  constructor(page) {
    this.page = page;
    this.generator = new GoogleDriveMockGenerator();
  }

  /**
   * Mock gallery API endpoint
   */
  async mockGalleryAPI(scenario = 'success', options = {}) {
    const { year = 2025, delay = 0 } = options;
    
    let response;
    
    switch (scenario) {
      case 'success':
        const data = this.generator.generateGalleryData(year, options);
        response = APIResponseScenarios.success(data, delay);
        break;
        
      case 'slow':
        const slowData = this.generator.generateGalleryData(year, options);
        response = APIResponseScenarios.slowNetwork(slowData, delay || 5000);
        break;
        
      case 'error':
        response = APIResponseScenarios.serverError(options.message);
        break;
        
      case 'rate-limited':
        response = APIResponseScenarios.rateLimited(options.retryAfter);
        break;
        
      case 'empty':
        response = APIResponseScenarios.emptyGallery();
        break;
        
      case 'partial-failure':
        response = APIResponseScenarios.partialFailure(year);
        break;
        
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }

    await this.page.route('**/api/gallery**', async (route) => {
      if (response.delay > 0) {
        await this.page.waitForTimeout(response.delay);
      }
      
      await route.fulfill({
        status: response.status,
        headers: response.headers,
        body: JSON.stringify(response.body),
      });
    });
  }

  /**
   * Mock gallery years API endpoint
   */
  async mockGalleryYearsAPI(years = [2025, 2024, 2023], scenario = 'success') {
    let response;
    
    if (scenario === 'success') {
      const data = this.generator.generateYearStatistics(years);
      response = APIResponseScenarios.success(data);
    } else if (scenario === 'error') {
      response = APIResponseScenarios.serverError('Failed to load gallery years');
    }

    await this.page.route('**/api/gallery/years**', async (route) => {
      await route.fulfill({
        status: response.status,
        headers: response.headers,
        body: JSON.stringify(response.body),
      });
    });
  }

  /**
   * Mock featured photos API endpoint
   */
  async mockFeaturedPhotosAPI(count = 6, scenario = 'success') {
    let response;
    
    if (scenario === 'success') {
      const galleryData = this.generator.generateGalleryData(2025, { imageCount: 20 });
      const featured = this.generator.selectFeaturedItems(galleryData, count);
      
      response = APIResponseScenarios.success({
        photos: featured,
        totalCount: featured.length,
        cacheTimestamp: new Date().toISOString(),
      });
    } else if (scenario === 'error') {
      response = APIResponseScenarios.serverError('Failed to load featured photos');
    }

    await this.page.route('**/api/featured-photos**', async (route) => {
      await route.fulfill({
        status: response.status,
        headers: response.headers,
        body: JSON.stringify(response.body),
      });
    });
  }

  /**
   * Mock image proxy API (for optimized images)
   */
  async mockImageProxy(scenario = 'success') {
    await this.page.route('**/api/image-proxy/**', async (route) => {
      if (scenario === 'success') {
        // Return a simple 1x1 pixel image
        const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
        await route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'image/png' },
          body: Buffer.from(pixel.split(',')[1], 'base64'),
        });
      } else if (scenario === 'error') {
        await route.fulfill({
          status: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Image not found' }),
        });
      }
    });
  }

  /**
   * Clear all gallery-related mocks
   */
  async clearGalleryMocks() {
    await this.page.unroute('**/api/gallery**');
    await this.page.unroute('**/api/gallery/years**');
    await this.page.unroute('**/api/featured-photos**');
    await this.page.unroute('**/api/image-proxy/**');
  }

  /**
   * Verify gallery API calls were made
   */
  async verifyGalleryAPICalls(expectedCalls = ['gallery']) {
    const apiCalls = [];
    
    this.page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/gallery')) {
        apiCalls.push({
          url,
          method: request.method(),
          timestamp: Date.now(),
        });
      }
    });

    return {
      getCalls: () => apiCalls,
      hasCall: (pattern) => apiCalls.some(call => call.url.includes(pattern)),
      getCallCount: (pattern) => apiCalls.filter(call => call.url.includes(pattern)).length,
    };
  }
}

/**
 * Gallery Performance Testing Utilities
 */
export class GalleryPerformanceMock {
  constructor(page) {
    this.page = page;
    this.generator = new GoogleDriveMockGenerator();
  }

  /**
   * Mock large gallery for performance testing
   */
  async mockLargeGallery(itemCount = 1000) {
    const data = this.generator.generateGalleryData(2025, {
      imageCount: itemCount,
      videoCount: Math.floor(itemCount * 0.1),
      includeMetadata: true,
    });

    await this.page.route('**/api/gallery**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=900',
        },
        body: JSON.stringify(data),
      });
    });

    return data;
  }

  /**
   * Mock paginated gallery responses
   */
  async mockPaginatedGallery(pageSize = 50, totalItems = 200) {
    const allData = this.generator.generateGalleryData(2025, {
      imageCount: totalItems,
      includeMetadata: true,
    });

    await this.page.route('**/api/gallery**', async (route) => {
      const url = new URL(route.request().url());
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || pageSize;
      
      const start = (page - 1) * limit;
      const end = start + limit;
      
      // Paginate each category
      const paginatedData = { ...allData };
      Object.keys(paginatedData.categories).forEach(category => {
        paginatedData.categories[category] = paginatedData.categories[category].slice(start, end);
      });
      
      paginatedData.pagination = {
        page,
        limit,
        total: totalItems,
        hasMore: end < totalItems,
        nextPage: end < totalItems ? page + 1 : null,
      };

      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paginatedData),
      });
    });
  }
}

// Export default helper factory
export default function createGalleryMock(page, options = {}) {
  return new GalleryMockHelper(page, options);
}