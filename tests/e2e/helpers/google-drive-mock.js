/**
 * Google Drive Mock Helper - Comprehensive Google Drive API mocking
 * 
 * Provides realistic Google Drive API mocking for gallery testing,
 * including image metadata, thumbnails, and error scenarios.
 */

import { generateTestId } from './test-isolation.js';

/**
 * Google Drive Mock Generator - Creates realistic mock data
 */
class GoogleDriveMockGenerator {
  constructor(options = {}) {
    this.baseUrl = 'https://drive.google.com';
    this.options = {
      imageCount: 50,
      videoCount: 10,
      yearRange: [2020, 2024],
      ...options
    };
  }

  /**
   * Generate mock image metadata
   * @param {string} id - Image ID
   * @param {Object} overrides - Override default values
   * @returns {Object} Mock image metadata
   */
  generateImageMetadata(id = null, overrides = {}) {
    const imageId = id || generateTestId('img');
    const year = this.getRandomYear();
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    
    return {
      id: imageId,
      name: `Cuban_Salsa_Festival_${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}_${Math.floor(Math.random() * 100)}.jpg`,
      mimeType: 'image/jpeg',
      size: String(Math.floor(Math.random() * 5000000) + 500000), // 0.5MB to 5MB
      createdTime: new Date(year, month - 1, day).toISOString(),
      modifiedTime: new Date(year, month - 1, day + 1).toISOString(),
      webViewLink: `${this.baseUrl}/file/d/${imageId}/view?usp=sharing`,
      webContentLink: `${this.baseUrl}/uc?id=${imageId}&export=download`,
      thumbnailLink: `${this.baseUrl}/thumbnail?id=${imageId}&sz=w400-h300`,
      parents: [this.options.folderId || 'test-folder-id'],
      properties: {
        year: year.toString(),
        event: 'A Lo Cubano Boulder Fest',
        category: this.getRandomCategory(),
        photographer: this.getRandomPhotographer()
      },
      ...overrides
    };
  }

  /**
   * Generate mock video metadata
   * @param {string} id - Video ID
   * @param {Object} overrides - Override default values
   * @returns {Object} Mock video metadata
   */
  generateVideoMetadata(id = null, overrides = {}) {
    const videoId = id || generateTestId('vid');
    const year = this.getRandomYear();
    const month = Math.floor(Math.random() * 12) + 1;
    const day = Math.floor(Math.random() * 28) + 1;
    
    return {
      id: videoId,
      name: `Cuban_Salsa_Performance_${year}_${String(month).padStart(2, '0')}_${String(day).padStart(2, '0')}.mp4`,
      mimeType: 'video/mp4',
      size: String(Math.floor(Math.random() * 50000000) + 10000000), // 10MB to 60MB
      createdTime: new Date(year, month - 1, day).toISOString(),
      modifiedTime: new Date(year, month - 1, day + 1).toISOString(),
      webViewLink: `${this.baseUrl}/file/d/${videoId}/view?usp=sharing`,
      webContentLink: `${this.baseUrl}/uc?id=${videoId}&export=download`,
      thumbnailLink: `${this.baseUrl}/thumbnail?id=${videoId}&sz=w400-h300`,
      parents: [this.options.folderId || 'test-folder-id'],
      videoMediaMetadata: {
        width: 1920,
        height: 1080,
        durationMillis: String(Math.floor(Math.random() * 300000) + 30000) // 30s to 5min
      },
      properties: {
        year: year.toString(),
        event: 'A Lo Cubano Boulder Fest',
        category: 'Performance',
        videographer: this.getRandomPhotographer()
      },
      ...overrides
    };
  }

  /**
   * Generate a collection of mock files
   * @param {Object} options - Generation options
   * @returns {Object} Mock files response
   */
  generateMockFiles(options = {}) {
    const {
      imageCount = this.options.imageCount,
      videoCount = this.options.videoCount,
      year = null,
      category = null,
      pageSize = 100,
      nextPageToken = null
    } = options;

    const files = [];

    // Generate images
    for (let i = 0; i < imageCount; i++) {
      const image = this.generateImageMetadata(null, {
        properties: {
          year: year?.toString() || this.getRandomYear().toString(),
          category: category || this.getRandomCategory(),
          event: 'A Lo Cubano Boulder Fest',
          photographer: this.getRandomPhotographer()
        }
      });
      files.push(image);
    }

    // Generate videos
    for (let i = 0; i < videoCount; i++) {
      const video = this.generateVideoMetadata(null, {
        properties: {
          year: year?.toString() || this.getRandomYear().toString(),
          category: 'Performance',
          event: 'A Lo Cubano Boulder Fest',
          videographer: this.getRandomPhotographer()
        }
      });
      files.push(video);
    }

    // Sort by creation date (newest first)
    files.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    // Apply pagination
    const startIndex = 0;
    const endIndex = Math.min(pageSize, files.length);
    const paginatedFiles = files.slice(startIndex, endIndex);

    return {
      kind: 'drive#fileList',
      nextPageToken: endIndex < files.length ? generateTestId('token') : null,
      files: paginatedFiles,
      incompleteSearch: false
    };
  }

  /**
   * Generate mock folder structure
   * @returns {Object} Mock folder response
   */
  generateMockFolders() {
    const folders = [];
    
    for (const year of this.getYearRange()) {
      folders.push({
        id: generateTestId(`folder_${year}`),
        name: year.toString(),
        mimeType: 'application/vnd.google-apps.folder',
        createdTime: new Date(year, 0, 1).toISOString(),
        modifiedTime: new Date(year, 11, 31).toISOString(),
        parents: [this.options.parentFolderId || 'root'],
        properties: {
          year: year.toString(),
          event: 'A Lo Cubano Boulder Fest'
        }
      });
    }

    return {
      kind: 'drive#fileList',
      files: folders
    };
  }

  /**
   * Get random year from range
   * @returns {number} Random year
   */
  getRandomYear() {
    const [minYear, maxYear] = this.options.yearRange;
    return Math.floor(Math.random() * (maxYear - minYear + 1)) + minYear;
  }

  /**
   * Get year range
   * @returns {Array} Array of years
   */
  getYearRange() {
    const [minYear, maxYear] = this.options.yearRange;
    return Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  }

  /**
   * Get random category
   * @returns {string} Random category
   */
  getRandomCategory() {
    const categories = [
      'Dance Performance',
      'Workshops',
      'Social Dancing',
      'Live Music',
      'Behind the Scenes',
      'Venue',
      'Attendees',
      'Awards'
    ];
    return categories[Math.floor(Math.random() * categories.length)];
  }

  /**
   * Get random photographer name
   * @returns {string} Random photographer name
   */
  getRandomPhotographer() {
    const photographers = [
      'Maria Rodriguez',
      'Carlos Gonzalez',
      'Ana Martinez',
      'Luis Torres',
      'Sofia Herrera',
      'Festival Team',
      'Volunteer Photographer'
    ];
    return photographers[Math.floor(Math.random() * photographers.length)];
  }
}

/**
 * API Response Scenarios - Predefined response scenarios
 */
class APIResponseScenarios {
  /**
   * Success response with files
   * @param {Object} options - Response options
   * @returns {Object} Success response
   */
  static success(options = {}) {
    const generator = new GoogleDriveMockGenerator();
    return {
      status: 200,
      data: generator.generateMockFiles(options)
    };
  }

  /**
   * Empty response (no files)
   * @returns {Object} Empty response
   */
  static empty() {
    return {
      status: 200,
      data: {
        kind: 'drive#fileList',
        files: []
      }
    };
  }

  /**
   * Rate limit error response
   * @returns {Object} Rate limit error
   */
  static rateLimited() {
    return {
      status: 429,
      data: {
        error: {
          code: 429,
          message: 'Rate limit exceeded',
          errors: [
            {
              domain: 'usageLimits',
              reason: 'rateLimitExceeded',
              message: 'Rate limit exceeded'
            }
          ]
        }
      }
    };
  }

  /**
   * Quota exceeded error response
   * @returns {Object} Quota exceeded error
   */
  static quotaExceeded() {
    return {
      status: 403,
      data: {
        error: {
          code: 403,
          message: 'The request cannot be completed because you have exceeded your quota',
          errors: [
            {
              domain: 'usageLimits',
              reason: 'quotaExceeded',
              message: 'Quota exceeded'
            }
          ]
        }
      }
    };
  }

  /**
   * Invalid API key error response
   * @returns {Object} Invalid API key error
   */
  static invalidApiKey() {
    return {
      status: 400,
      data: {
        error: {
          code: 400,
          message: 'API key not valid',
          errors: [
            {
              domain: 'global',
              reason: 'badRequest',
              message: 'API key not valid'
            }
          ]
        }
      }
    };
  }

  /**
   * Folder not found error response
   * @returns {Object} Folder not found error
   */
  static folderNotFound() {
    return {
      status: 404,
      data: {
        error: {
          code: 404,
          message: 'File not found',
          errors: [
            {
              domain: 'global',
              reason: 'notFound',
              message: 'File not found'
            }
          ]
        }
      }
    };
  }

  /**
   * Server error response
   * @returns {Object} Server error
   */
  static serverError() {
    return {
      status: 500,
      data: {
        error: {
          code: 500,
          message: 'Internal server error'
        }
      }
    };
  }

  /**
   * Network timeout simulation
   * @returns {Promise} Never resolving promise (simulates timeout)
   */
  static timeout() {
    return new Promise(() => {
      // Never resolves, simulates network timeout
    });
  }
}

/**
 * Gallery Performance Mock - Simulates performance characteristics
 */
class GalleryPerformanceMock {
  constructor(options = {}) {
    this.options = {
      baseDelay: 100,
      varianceMs: 50,
      errorRate: 0, // Set to 0 to prevent flaky tests
      ...options
    };
  }

  /**
   * Simulate API response with realistic delay
   * @param {Object} response - Response to return
   * @returns {Promise<Object>} Delayed response
   */
  async simulateResponse(response) {
    // Simulate network delay
    const delay = this.options.baseDelay + 
                 (Math.random() * this.options.varianceMs * 2 - this.options.varianceMs);
    
    await new Promise(resolve => setTimeout(resolve, Math.max(0, delay)));

    // Simulate random errors
    if (Math.random() < this.options.errorRate) {
      throw new Error('Simulated network error');
    }

    return response;
  }

  /**
   * Simulate progressive loading
   * @param {Array} items - Items to load progressively
   * @param {number} batchSize - Items per batch
   * @returns {AsyncGenerator} Progressive loading generator
   */
  async* simulateProgressiveLoading(items, batchSize = 10) {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      // Simulate loading delay for each batch
      await this.simulateResponse({ batch });
      
      yield {
        items: batch,
        loadedCount: i + batch.length,
        totalCount: items.length,
        isComplete: i + batch.length >= items.length
      };
    }
  }
}

/**
 * Create comprehensive Google Drive mock
 * @param {Object} options - Mock configuration
 * @returns {Object} Mock instance with all capabilities
 */
export default function createGalleryMock(options = {}) {
  const generator = new GoogleDriveMockGenerator(options);
  const performanceMock = new GalleryPerformanceMock(options.performance || options);

  return {
    generator,
    scenarios: APIResponseScenarios,
    performance: performanceMock,

    /**
     * Mock API endpoint
     * @param {string} endpoint - API endpoint to mock
     * @param {Object} scenario - Scenario options
     * @returns {Promise<Object>} Mock response
     */
    async mockEndpoint(endpoint, scenario = 'success') {
      console.log(`🎭 Mocking Google Drive API: ${endpoint} (${scenario})`);
      
      let response;
      
      switch (scenario) {
        case 'success':
          response = APIResponseScenarios.success(options);
          break;
        case 'empty':
          response = APIResponseScenarios.empty();
          break;
        case 'rate-limited':
          response = APIResponseScenarios.rateLimited();
          break;
        case 'quota-exceeded':
          response = APIResponseScenarios.quotaExceeded();
          break;
        case 'invalid-api-key':
          response = APIResponseScenarios.invalidApiKey();
          break;
        case 'folder-not-found':
          response = APIResponseScenarios.folderNotFound();
          break;
        case 'server-error':
          response = APIResponseScenarios.serverError();
          break;
        case 'timeout':
          await new Promise(resolve => setTimeout(resolve, 30000)); // 30s timeout
          throw new Error('Request timeout');
        default:
          response = APIResponseScenarios.success(options);
      }

      return performanceMock.simulateResponse(response);
    },

    /**
     * Get mock data for specific scenario
     * @param {string} type - Type of mock data
     * @param {Object} params - Parameters
     * @returns {Object} Mock data
     */
    getMockData(type, params = {}) {
      switch (type) {
        case 'files':
          return generator.generateMockFiles(params);
        case 'folders':
          return generator.generateMockFolders();
        case 'image':
          return generator.generateImageMetadata(params.id, params);
        case 'video':
          return generator.generateVideoMetadata(params.id, params);
        default:
          throw new Error(`Unknown mock data type: ${type}`);
      }
    }
  };
}

export { GoogleDriveMockGenerator, APIResponseScenarios, GalleryPerformanceMock };