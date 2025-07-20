/**
 * Unit tests for serverless function patterns and utilities
 * Tests common patterns used in Vercel/Netlify serverless functions
 */

describe('Serverless Function Patterns', () => {
  describe('Request/Response Handling', () => {
    test('should parse request bodies correctly', () => {
      const parseRequestBody = (req) => {
        if (req.method === 'GET') {
          const url = new URL(req.url, 'http://localhost');
          return Object.fromEntries(url.searchParams);
        }
        
        if (req.headers['content-type']?.includes('application/json')) {
          return JSON.parse(req.body);
        }
        
        return {};
      };
      
      const getRequest = {
        method: 'GET',
        url: '/api/gallery?page=1&limit=20',
        headers: {}
      };
      
      const postRequest = {
        method: 'POST',
        url: '/api/gallery',
        headers: { 'content-type': 'application/json' },
        body: '{"filter": "images"}'
      };
      
      expect(parseRequestBody(getRequest)).toEqual({
        page: '1',
        limit: '20'
      });
      
      expect(parseRequestBody(postRequest)).toEqual({
        filter: 'images'
      });
    });
    
    test('should handle malformed request bodies gracefully', () => {
      const safeParseJson = (jsonString) => {
        try {
          return { success: true, data: JSON.parse(jsonString) };
        } catch (error) {
          return { success: false, error: error.message };
        }
      };
      
      expect(safeParseJson('{"valid": "json"}')).toEqual({
        success: true,
        data: { valid: 'json' }
      });
      
      expect(safeParseJson('invalid json')).toEqual({
        success: false,
        error: expect.stringContaining('Unexpected token')
      });
    });
  });

  describe('Environment Configuration', () => {
    test('should handle environment variable parsing', () => {
      const parseEnvConfig = (env) => {
        return {
          googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
          googlePrivateKey: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
          defaultFolderId: env.DEFAULT_FOLDER_ID || '1default',
          cacheEnabled: env.CACHE_ENABLED !== 'false',
          cacheTtl: parseInt(env.CACHE_TTL) || 3600,
          rateLimitEnabled: env.RATE_LIMIT_ENABLED !== 'false',
          rateLimitMax: parseInt(env.RATE_LIMIT_MAX) || 100
        };
      };
      
      const mockEnv = {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: 'service@example.com',
        GOOGLE_PRIVATE_KEY: 'key\\nwith\\nnewlines',
        DEFAULT_FOLDER_ID: 'folder123',
        CACHE_ENABLED: 'true',
        CACHE_TTL: '7200',
        RATE_LIMIT_ENABLED: 'true',
        RATE_LIMIT_MAX: '150'
      };
      
      const config = parseEnvConfig(mockEnv);
      
      expect(config.googleServiceAccountEmail).toBe('service@example.com');
      expect(config.googlePrivateKey).toBe('key\nwith\nnewlines');
      expect(config.defaultFolderId).toBe('folder123');
      expect(config.cacheEnabled).toBe(true);
      expect(config.cacheTtl).toBe(7200);
      expect(config.rateLimitMax).toBe(150);
    });
    
    test('should provide sensible defaults', () => {
      const parseEnvConfig = (env) => {
        return {
          defaultFolderId: env.DEFAULT_FOLDER_ID || '1default',
          cacheEnabled: env.CACHE_ENABLED !== 'false',
          cacheTtl: parseInt(env.CACHE_TTL) || 3600,
          rateLimitMax: parseInt(env.RATE_LIMIT_MAX) || 100
        };
      };
      
      const emptyEnv = {};
      const config = parseEnvConfig(emptyEnv);
      
      expect(config.defaultFolderId).toBe('1default');
      expect(config.cacheEnabled).toBe(true);
      expect(config.cacheTtl).toBe(3600);
      expect(config.rateLimitMax).toBe(100);
    });
  });

  describe('Featured Photos Logic', () => {
    test('should select featured photos correctly', () => {
      const selectFeaturedPhotos = (allPhotos, maxCount = 6) => {
        // Sort by creation date (newest first)
        const sorted = [...allPhotos].sort((a, b) => 
          new Date(b.createdTime) - new Date(a.createdTime)
        );
        
        // Prefer images over videos for featured display
        const images = sorted.filter(photo => photo.type === 'image');
        const videos = sorted.filter(photo => photo.type === 'video');
        
        // Take mostly images, but include some videos
        const imageCount = Math.min(images.length, Math.ceil(maxCount * 0.8));
        const videoCount = Math.min(videos.length, maxCount - imageCount);
        
        return [
          ...images.slice(0, imageCount),
          ...videos.slice(0, videoCount)
        ];
      };
      
      const mockPhotos = [
        { id: '1', type: 'image', createdTime: '2025-01-01T00:00:00.000Z' },
        { id: '2', type: 'video', createdTime: '2025-01-02T00:00:00.000Z' },
        { id: '3', type: 'image', createdTime: '2025-01-03T00:00:00.000Z' },
        { id: '4', type: 'image', createdTime: '2025-01-04T00:00:00.000Z' },
        { id: '5', type: 'video', createdTime: '2025-01-05T00:00:00.000Z' },
        { id: '6', type: 'image', createdTime: '2025-01-06T00:00:00.000Z' },
        { id: '7', type: 'image', createdTime: '2025-01-07T00:00:00.000Z' }
      ];
      
      const featured = selectFeaturedPhotos(mockPhotos, 6);
      
      expect(featured).toHaveLength(6);
      
      // Should prefer newer content
      expect(featured[0].id).toBe('7'); // Newest image
      
      // Should be mostly images (80% = 4.8, so 5 images max)
      const imageCount = featured.filter(p => p.type === 'image').length;
      const videoCount = featured.filter(p => p.type === 'video').length;
      
      expect(imageCount).toBeGreaterThanOrEqual(4);
      expect(videoCount).toBeLessThanOrEqual(2);
    });
    
    test('should handle empty or small photo collections', () => {
      const selectFeaturedPhotos = (allPhotos, maxCount = 6) => {
        return allPhotos.slice(0, maxCount);
      };
      
      expect(selectFeaturedPhotos([])).toEqual([]);
      
      const onePhoto = [{ id: '1', type: 'image' }];
      expect(selectFeaturedPhotos(onePhoto)).toEqual(onePhoto);
    });
  });

  describe('API Response Formatting', () => {
    test('should format successful API responses consistently', () => {
      const formatSuccessResponse = (data, metadata = {}) => {
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=3600'
          },
          body: JSON.stringify({
            success: true,
            data: data,
            metadata: {
              timestamp: new Date().toISOString(),
              count: Array.isArray(data) ? data.length : 1,
              ...metadata
            }
          })
        };
      };
      
      const response = formatSuccessResponse(
        [{ id: '1', name: 'photo.jpg' }],
        { source: 'google-drive', cached: false }
      );
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.metadata.count).toBe(1);
      expect(body.metadata.source).toBe('google-drive');
      expect(body.metadata.cached).toBe(false);
    });
    
    test('should format error responses consistently', () => {
      const formatErrorResponse = (statusCode, message, details = null) => {
        return {
          statusCode,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            success: false,
            error: {
              message: message,
              details: details,
              timestamp: new Date().toISOString()
            }
          })
        };
      };
      
      const response = formatErrorResponse(
        404, 
        'Folder not found',
        { folderId: 'invalid123' }
      );
      
      expect(response.statusCode).toBe(404);
      
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.message).toBe('Folder not found');
      expect(body.error.details.folderId).toBe('invalid123');
    });
  });

  describe('Serverless Function Utilities', () => {
    test('should extract client IP from various sources', () => {
      const getClientIp = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] ||
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               '127.0.0.1';
      };
      
      const req1 = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' }
      };
      expect(getClientIp(req1)).toBe('192.168.1.1');
      
      const req2 = {
        headers: { 'x-real-ip': '203.0.113.1' }
      };
      expect(getClientIp(req2)).toBe('203.0.113.1');
      
      const req3 = {
        headers: {},
        connection: { remoteAddress: '198.51.100.1' }
      };
      expect(getClientIp(req3)).toBe('198.51.100.1');
      
      const req4 = { headers: {} };
      expect(getClientIp(req4)).toBe('127.0.0.1');
    });
    
    test('should validate and sanitize query parameters', () => {
      const sanitizeQueryParams = (params) => {
        const sanitized = {};
        
        // Page number validation
        if (params.page) {
          const page = parseInt(params.page);
          sanitized.page = (page > 0 && page <= 1000) ? page : 1;
        }
        
        // Limit validation
        if (params.limit) {
          const limit = parseInt(params.limit);
          sanitized.limit = (limit > 0 && limit <= 100) ? limit : 50;
        }
        
        // String parameters sanitization
        if (params.type) {
          sanitized.type = params.type.replace(/[^a-zA-Z]/g, '').toLowerCase();
        }
        
        if (params.folderId) {
          sanitized.folderId = params.folderId.replace(/[^a-zA-Z0-9_-]/g, '');
        }
        
        return sanitized;
      };
      
      const dirtyParams = {
        page: '2',
        limit: '25',
        type: 'image<>!@#',
        folderId: 'folder123!@#'
      };
      
      const clean = sanitizeQueryParams(dirtyParams);
      
      expect(clean.page).toBe(2);
      expect(clean.limit).toBe(25);
      expect(clean.type).toBe('image');
      expect(clean.folderId).toBe('folder123');
    });
    
    test('should handle invalid parameter ranges', () => {
      const sanitizeQueryParams = (params) => {
        const sanitized = {};
        
        if (params.page) {
          const page = parseInt(params.page);
          sanitized.page = (page > 0 && page <= 1000) ? page : 1;
        }
        
        if (params.limit) {
          const limit = parseInt(params.limit);
          sanitized.limit = (limit > 0 && limit <= 100) ? limit : 50;
        }
        
        return sanitized;
      };
      
      expect(sanitizeQueryParams({ page: '-1' })).toEqual({ page: 1 });
      expect(sanitizeQueryParams({ page: '9999' })).toEqual({ page: 1 });
      expect(sanitizeQueryParams({ limit: '0' })).toEqual({ limit: 50 });
      expect(sanitizeQueryParams({ limit: '999' })).toEqual({ limit: 50 });
    });
  });
});