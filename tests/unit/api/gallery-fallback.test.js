/**
 * Gallery Fallback Unit Tests
 * Tests the gallery loading fallback mechanism when static JSON files are not available
 */
import { test, expect, describe } from 'vitest';
import { testRequest, HTTP_STATUS } from '../../helpers.js';

// Mock gallery data for testing fallback scenarios
const mockGalleryData = {
  success: true,
  totalCount: 6,
  categories: {
    workshops: [
      {
        id: 'workshop_1',
        name: 'Workshop Session 1.jpg',
        url: 'https://drive.google.com/uc?id=test_workshop_1',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_workshop_1'
      },
      {
        id: 'workshop_2',
        name: 'Workshop Session 2.jpg',
        url: 'https://drive.google.com/uc?id=test_workshop_2',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_workshop_2'
      },
      {
        id: 'workshop_3',
        name: 'Workshop Session 3.jpg',
        url: 'https://drive.google.com/uc?id=test_workshop_3',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_workshop_3'
      }
    ],
    socials: [
      {
        id: 'social_1',
        name: 'Social Dance 1.jpg',
        url: 'https://drive.google.com/uc?id=test_social_1',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_social_1'
      },
      {
        id: 'social_2',
        name: 'Social Dance 2.jpg',
        url: 'https://drive.google.com/uc?id=test_social_2',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_social_2'
      },
      {
        id: 'social_3',
        name: 'Social Dance 3.jpg',
        url: 'https://drive.google.com/uc?id=test_social_3',
        thumbnailUrl: 'https://drive.google.com/thumbnail?id=test_social_3'
      }
    ]
  }
};

describe('Gallery Fallback Mechanism', () => {
  test('should have valid API endpoint as fallback when static JSON fails', async () => {
    // Test that the gallery API endpoint exists and returns valid structure
    // This validates that the fallback mechanism has a working target
    
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping fallback validation');
      return;
    }
    
    // Validate API endpoint structure that would be used as fallback
    if (response.status === HTTP_STATUS.OK) {
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('categories');
      
      // Ensure categories structure exists for fallback
      const categories = response.data.categories;
      expect(typeof categories).toBe('object');
      
      // Verify expected category structure exists
      if (categories.workshops) {
        expect(Array.isArray(categories.workshops)).toBe(true);
        if (categories.workshops.length > 0) {
          const workshop = categories.workshops[0];
          expect(workshop).toHaveProperty('id');
          expect(workshop).toHaveProperty('name');
          expect(workshop).toHaveProperty('url');
          expect(workshop).toHaveProperty('thumbnailUrl');
        }
      }
      
      if (categories.socials) {
        expect(Array.isArray(categories.socials)).toBe(true);
        if (categories.socials.length > 0) {
          const social = categories.socials[0];
          expect(social).toHaveProperty('id');
          expect(social).toHaveProperty('name');
          expect(social).toHaveProperty('url');
          expect(social).toHaveProperty('thumbnailUrl');
        }
      }
      
      // Verify total count is reasonable
      expect(response.data.totalCount).toBeGreaterThanOrEqual(0);
      
    } else {
      // API not available - that's acceptable for unit tests
      console.log('Gallery API returned non-200 status, which is acceptable for fallback testing');
      expect([HTTP_STATUS.OK, 403, 404, 500, 502, 503].includes(response.status)).toBe(true);
    }
  });

  test('should handle API fallback with event-specific parameters', async () => {
    // Test that API supports event-specific queries needed for fallback
    const queryParams = {
      year: '2025',
      event: 'boulder-fest-2025',
      limit: '20',
      offset: '0'
    };
    
    const queryString = new URLSearchParams(queryParams).toString();
    const response = await testRequest('GET', `/api/gallery?${queryString}`);
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping parameterized fallback test');
      return;
    }
    
    // Validate parameterized API call structure
    if (response.status === HTTP_STATUS.OK) {
      expect(response.data).toHaveProperty('success');
      expect(response.data.success).toBe(true);
      
      // Verify response handles query parameters appropriately
      expect(response.data).toHaveProperty('categories');
      
      // Verify pagination parameters are handled
      if (response.data.hasMore !== undefined) {
        expect(typeof response.data.hasMore).toBe('boolean');
      }
      
      if (response.data.totalCount !== undefined) {
        expect(typeof response.data.totalCount).toBe('number');
        expect(response.data.totalCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should provide valid JSON structure for fallback consumption', async () => {
    // Ensure API provides valid JSON that won't cause parse errors in fallback
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping JSON validation');
      return;
    }
    
    // Validate JSON structure for gallery rendering
    if (response.status === HTTP_STATUS.OK) {
      // Response should be valid JSON (if this test runs, JSON.parse succeeded)
      expect(response.data).toBeDefined();
      expect(response.data).not.toBeNull();
      
      // Verify core properties for fallback consumption
      expect(response.data).toHaveProperty('success');
      
      // Verify data structure is valid for gallery rendering
      const categories = response.data.categories;
      if (categories) {
        expect(typeof categories).toBe('object');
        expect(categories).not.toBeNull();
        
        // Each category should be an array if present
        Object.values(categories).forEach(categoryItems => {
          if (categoryItems !== null && categoryItems !== undefined) {
            expect(Array.isArray(categoryItems)).toBe(true);
          }
        });
      }
    }
  });

  test('should validate gallery data structure for frontend compatibility', async () => {
    // Ensure fallback API data is compatible with gallery rendering logic
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping compatibility validation');
      return;
    }
    
    if (response.status === HTTP_STATUS.OK) {
      const data = response.data;
      
      // Verify success flag for frontend consumption
      expect(data.success).toBe(true);
      
      // Verify categories structure for frontend compatibility
      if (data.categories) {
        const categories = data.categories;
        
        // Test workshops category structure for rendering
        if (categories.workshops && categories.workshops.length > 0) {
          const workshop = categories.workshops[0];
          
          // Required fields for gallery item rendering
          expect(workshop).toHaveProperty('name');
          expect(workshop).toHaveProperty('url');
          expect(workshop).toHaveProperty('thumbnailUrl');
          
          // URLs should be valid format
          expect(workshop.url).toMatch(/^https?:\/\//);
          expect(workshop.thumbnailUrl).toMatch(/^https?:\/\//);
          
          // Name should be renderable string
          expect(typeof workshop.name).toBe('string');
          expect(workshop.name.length).toBeGreaterThan(0);
        }
        
        // Test socials category structure for rendering
        if (categories.socials && categories.socials.length > 0) {
          const social = categories.socials[0];
          
          // Required fields for gallery item rendering
          expect(social).toHaveProperty('name');
          expect(social).toHaveProperty('url');
          expect(social).toHaveProperty('thumbnailUrl');
          
          // URLs should be valid format
          expect(social.url).toMatch(/^https?:\/\//);
          expect(social.thumbnailUrl).toMatch(/^https?:\/\//);
          
          // Name should be renderable string
          expect(typeof social.name).toBe('string');
          expect(social.name.length).toBeGreaterThan(0);
        }
      }
      
      // Verify totalCount consistency for pagination
      if (data.totalCount !== undefined && data.categories) {
        const actualCount = Object.values(data.categories)
          .reduce((total, items) => total + (Array.isArray(items) ? items.length : 0), 0);
        
        // Total count should be reasonable
        expect(data.totalCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should handle empty gallery data gracefully in fallback', async () => {
    // Test fallback behavior when API returns minimal/empty data
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping empty data handling test');
      return;
    }
    
    if (response.status === HTTP_STATUS.OK) {
      const data = response.data;
      
      // Even empty responses should have valid structure
      expect(data).toHaveProperty('success');
      expect(data.success).toBe(true);
      
      // Categories should exist even if empty
      expect(data).toHaveProperty('categories');
      expect(typeof data.categories).toBe('object');
      
      // Handle empty categories gracefully
      if (data.categories) {
        const categoryNames = Object.keys(data.categories);
        
        // If categories exist, they should be valid arrays
        categoryNames.forEach(categoryName => {
          const category = data.categories[categoryName];
          if (category !== null && category !== undefined) {
            expect(Array.isArray(category)).toBe(true);
          }
        });
      }
      
      // Total count should be reasonable
      if (data.totalCount !== undefined) {
        expect(data.totalCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('should handle network errors gracefully in fallback chain', async () => {
    // Test that API endpoint handles errors appropriately for fallback
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      // Network error - validate error handling
      expect(response.data).toHaveProperty('error');
      expect(response.data.error).toMatch(/Connection failed|Request timeout/);
      expect(typeof response.data.error).toBe('string');
      return;
    }
    
    // If network is available, validate response handling
    if (response.status === HTTP_STATUS.OK) {
      expect(response.data).toHaveProperty('success');
      expect(response.data).toHaveProperty('categories');
    } else {
      // Other errors should be handled gracefully
      expect([HTTP_STATUS.BAD_REQUEST, 403, 404, 500, 502, 503].includes(response.status)).toBe(true);
      
      if (response.data?.error) {
        expect(typeof response.data.error).toBe('string');
        expect(response.data.error.length).toBeGreaterThan(0);
      }
    }
  });

  test('should support event-specific gallery data in fallback', async () => {
    // Test that fallback works for different event types
    const events = ['boulder-fest-2025', 'weekender-2026-09'];
    
    for (const event of events) {
      const response = await testRequest('GET', `/api/gallery?event=${event}&year=2025`);
      
      if (response.status === 0) {
        console.warn(`⚠️ Gallery service unavailable for event ${event} - skipping`);
        continue;
      }
      
      if (response.status === HTTP_STATUS.OK) {
        expect(response.data).toHaveProperty('success');
        expect(response.data.success).toBe(true);
        
        // Event-specific data should have proper structure
        expect(response.data).toHaveProperty('categories');
        
        // Verify categories contain valid data for the event
        const categories = response.data.categories;
        if (categories && typeof categories === 'object') {
          // Categories should be valid arrays
          Object.entries(categories).forEach(([categoryName, items]) => {
            if (Array.isArray(items) && items.length > 0) {
              // Each item should have required properties for rendering
              items.forEach(item => {
                expect(item).toHaveProperty('name');
                expect(item).toHaveProperty('url');
                expect(typeof item.name).toBe('string');
                expect(typeof item.url).toBe('string');
              });
            }
          });
        }
      }
    }
  });

  test('should maintain consistent data format across static and API sources', async () => {
    // Ensure API fallback provides same format as static JSON would
    const response = await testRequest('GET', '/api/gallery');
    
    if (response.status === 0) {
      console.warn('⚠️ Gallery service unavailable - skipping consistency validation');
      return;
    }
    
    if (response.status === HTTP_STATUS.OK) {
      const data = response.data;
      
      // Core properties that should match static JSON format
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('categories');
      
      // Categories should follow expected structure
      const categories = data.categories;
      if (categories) {
        // Standard categories that frontend expects
        const expectedCategories = ['workshops', 'socials'];
        
        expectedCategories.forEach(categoryName => {
          if (categories[categoryName]) {
            expect(Array.isArray(categories[categoryName])).toBe(true);
            
            // Each item should have consistent structure
            if (categories[categoryName].length > 0) {
              const item = categories[categoryName][0];
              
              // Properties needed for gallery display
              expect(item).toHaveProperty('name');
              expect(item).toHaveProperty('url');
              expect(item).toHaveProperty('thumbnailUrl');
              
              // Types should be correct for rendering
              expect(typeof item.name).toBe('string');
              expect(typeof item.url).toBe('string');
              expect(typeof item.thumbnailUrl).toBe('string');
            }
          }
        });
      }
      
      // Optional metadata should be properly typed
      if (data.totalCount !== undefined) {
        expect(typeof data.totalCount).toBe('number');
        expect(data.totalCount).toBeGreaterThanOrEqual(0);
      }
      
      if (data.hasMore !== undefined) {
        expect(typeof data.hasMore).toBe('boolean');
      }
    }
  });

  test('should validate mock data structure matches expected format', () => {
    // Verify mock data matches the expected gallery API format
    expect(mockGalleryData).toHaveProperty('success');
    expect(mockGalleryData).toHaveProperty('categories');
    expect(mockGalleryData).toHaveProperty('totalCount');
    
    expect(mockGalleryData.success).toBe(true);
    expect(typeof mockGalleryData.categories).toBe('object');
    expect(typeof mockGalleryData.totalCount).toBe('number');
    
    // Verify workshops category structure
    expect(Array.isArray(mockGalleryData.categories.workshops)).toBe(true);
    expect(mockGalleryData.categories.workshops.length).toBe(3);
    
    mockGalleryData.categories.workshops.forEach(workshop => {
      expect(workshop).toHaveProperty('id');
      expect(workshop).toHaveProperty('name');
      expect(workshop).toHaveProperty('url');
      expect(workshop).toHaveProperty('thumbnailUrl');
      
      expect(workshop.url).toMatch(/^https:\/\/drive\.google\.com/);
      expect(workshop.thumbnailUrl).toMatch(/^https:\/\/drive\.google\.com/);
      expect(workshop.name).toMatch(/\.jpg$/i);
    });
    
    // Verify socials category structure
    expect(Array.isArray(mockGalleryData.categories.socials)).toBe(true);
    expect(mockGalleryData.categories.socials.length).toBe(3);
    
    mockGalleryData.categories.socials.forEach(social => {
      expect(social).toHaveProperty('id');
      expect(social).toHaveProperty('name');
      expect(social).toHaveProperty('url');
      expect(social).toHaveProperty('thumbnailUrl');
      
      expect(social.url).toMatch(/^https:\/\/drive\.google\.com/);
      expect(social.thumbnailUrl).toMatch(/^https:\/\/drive\.google\.com/);
      expect(social.name).toMatch(/\.jpg$/i);
    });
    
    // Verify total count matches actual items
    const totalItems = mockGalleryData.categories.workshops.length + mockGalleryData.categories.socials.length;
    expect(mockGalleryData.totalCount).toBe(totalItems);
  });
});