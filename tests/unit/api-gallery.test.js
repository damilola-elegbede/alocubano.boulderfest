/**
 * Unit tests for API gallery serverless function
 */

// Mock googleapis
jest.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: jest.fn().mockImplementation(() => ({
        getClient: jest.fn()
      }))
    },
    drive: jest.fn()
  }
}));

describe('Gallery API Serverless Function', () => {
  let mockReq, mockRes;
  let originalEnv;
  
  beforeEach(() => {
    // Save original environment
    originalEnv = process.env;
    
    // Set test environment variables
    process.env = {
      ...originalEnv,
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'test@example.com',
      GOOGLE_PRIVATE_KEY: 'test-private-key',
      GOOGLE_PROJECT_ID: 'test-project',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id'
    };
    
    // Mock request and response objects
    mockReq = {
      method: 'GET',
      query: {},
      headers: {}
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      end: jest.fn()
    };
    
    // Clear module cache to ensure fresh imports
    jest.resetModules();
  });
  
  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.clearAllMocks();
  });
  
  describe('Request Method Validation', () => {
    test('should reject non-GET requests', async () => {
      mockReq.method = 'POST';
      
      // Import and call the handler
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(405);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Method not allowed'
      });
    });
    
    test('should accept GET requests', async () => {
      mockReq.method = 'GET';
      
      // Mock the Google Drive API response
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: {
              files: []
            }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Test Folder',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
  
  describe('CORS Headers', () => {
    test('should set proper CORS headers', async () => {
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: { files: [] }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Test Folder',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Methods', 'GET, OPTIONS');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Headers', 'Content-Type');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    });
    
    test('should handle OPTIONS requests for CORS preflight', async () => {
      mockReq.method = 'OPTIONS';
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
  
  describe('Environment Variable Validation', () => {
    test('should return error when GOOGLE_SERVICE_ACCOUNT_EMAIL is missing', async () => {
      delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      jest.resetModules();
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Server configuration error'
        })
      );
    });
    
    test('should return error when GOOGLE_PRIVATE_KEY is missing', async () => {
      delete process.env.GOOGLE_PRIVATE_KEY;
      jest.resetModules();
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Server configuration error'
        })
      );
    });
  });
  
  describe('Google Drive API Integration', () => {
    test('should format image files correctly', async () => {
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: {
              files: [{
                id: 'img-123',
                name: 'festival-photo.jpg',
                mimeType: 'image/jpeg',
                size: '2500000',
                createdTime: '2024-12-15T10:00:00Z'
              }]
            }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Test Gallery',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-12-20T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'img-123',
              name: 'festival-photo.jpg',
              type: 'image',
              mimeType: 'image/jpeg',
              thumbnailUrl: 'https://drive.google.com/thumbnail?id=img-123&sz=w400',
              viewUrl: 'https://drive.google.com/uc?export=view&id=img-123',
              downloadUrl: 'https://drive.google.com/uc?export=download&id=img-123',
              size: 2500000,
              createdAt: '2024-12-15T10:00:00Z'
            })
          ]),
          count: 1
        })
      );
    });
    
    test('should format video files correctly', async () => {
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: {
              files: [{
                id: 'vid-456',
                name: 'dance-performance.mp4',
                mimeType: 'video/mp4',
                size: '45000000',
                createdTime: '2024-12-16T14:30:00Z'
              }]
            }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Test Gallery',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-12-20T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          items: expect.arrayContaining([
            expect.objectContaining({
              id: 'vid-456',
              name: 'dance-performance.mp4',
              type: 'video',
              mimeType: 'video/mp4'
            })
          ])
        })
      );
    });
    
    test('should handle custom folder ID from query parameter', async () => {
      mockReq.query.folderId = 'custom-folder-id';
      
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: { files: [] }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Custom Folder',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockDrive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: "'custom-folder-id' in parents and trashed = false"
        })
      );
    });
    
    test('should filter out non-media files', async () => {
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: {
              files: [
                {
                  id: 'img-1',
                  name: 'photo.jpg',
                  mimeType: 'image/jpeg',
                  size: '1000000',
                  createdTime: '2024-01-01T00:00:00Z'
                },
                {
                  id: 'doc-1',
                  name: 'document.pdf',
                  mimeType: 'application/pdf',
                  size: '500000',
                  createdTime: '2024-01-01T00:00:00Z'
                },
                {
                  id: 'vid-1',
                  name: 'video.mp4',
                  mimeType: 'video/mp4',
                  size: '2000000',
                  createdTime: '2024-01-01T00:00:00Z'
                }
              ]
            }
          }),
          get: jest.fn().mockResolvedValue({
            data: {
              name: 'Test Gallery',
              createdTime: '2024-01-01T00:00:00Z',
              modifiedTime: '2024-01-01T00:00:00Z'
            }
          })
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      const response = mockRes.json.mock.calls[0][0];
      expect(response.items).toHaveLength(2); // Only image and video
      expect(response.items.every(item => item.type === 'image' || item.type === 'video')).toBe(true);
    });
  });
  
  describe('Error Handling', () => {
    test('should handle Google Drive API errors gracefully', async () => {
      const { google } = require('googleapis');
      const mockDrive = {
        files: {
          list: jest.fn().mockRejectedValue(new Error('API Error')),
          get: jest.fn()
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch gallery data'
        })
      );
    });
    
    test('should handle folder not found errors', async () => {
      const { google } = require('googleapis');
      const error = new Error('File not found');
      error.code = 404;
      
      const mockDrive = {
        files: {
          list: jest.fn().mockResolvedValue({
            data: { files: [] }
          }),
          get: jest.fn().mockRejectedValue(error)
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Folder not found'
      });
    });
    
    test('should handle permission errors', async () => {
      const { google } = require('googleapis');
      const error = new Error('Permission denied');
      error.code = 403;
      
      const mockDrive = {
        files: {
          list: jest.fn().mockRejectedValue(error),
          get: jest.fn()
        }
      };
      google.drive.mockReturnValue(mockDrive);
      
      const handler = require('../../api/gallery');
      await handler(mockReq, mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Access denied. Please check folder permissions.'
      });
    });
  });
});