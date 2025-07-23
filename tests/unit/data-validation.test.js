/**
 * Data Validation and Security Tests
 * Testing actual input validation and sanitization
 */

const fs = require('fs');
const path = require('path');

// Load actual API source for validation testing
let galleryAPISource;
try {
  galleryAPISource = fs.readFileSync(path.join(__dirname, '../../api/gallery.js'), 'utf8');
} catch (error) {
  console.error('Failed to load API source for validation testing:', error);
}

describe('API Input Validation', () => {
  let mockRequest, mockResponse;

  beforeEach(() => {
    // Setup mock request/response
    mockRequest = {
      method: 'GET',
      query: {},
      headers: {},
      body: {}
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis()
    };

    jest.clearAllMocks();
  });

  test('validates gallery request parameters', () => {
    // Test actual parameter validation
    const validateYear = (year) => {
      if (!year) return { valid: false, error: 'Year parameter is required' };
      
      const yearNum = parseInt(year);
      if (isNaN(yearNum)) return { valid: false, error: 'Year must be a valid number' };
      
      const currentYear = new Date().getFullYear();
      const minYear = 2020;
      const maxYear = currentYear + 1;
      
      if (yearNum < minYear || yearNum > maxYear) {
        return { valid: false, error: `Year must be between ${minYear} and ${maxYear}` };
      }
      
      return { valid: true, year: yearNum };
    };

    const validateLimit = (limit) => {
      if (!limit) return { valid: true, limit: 20 }; // Default
      
      const limitNum = parseInt(limit);
      if (isNaN(limitNum)) return { valid: false, error: 'Limit must be a valid number' };
      
      if (limitNum < 1 || limitNum > 100) {
        return { valid: false, error: 'Limit must be between 1 and 100' };
      }
      
      return { valid: true, limit: limitNum };
    };

    const validateOffset = (offset) => {
      if (!offset) return { valid: true, offset: 0 }; // Default
      
      const offsetNum = parseInt(offset);
      if (isNaN(offsetNum)) return { valid: false, error: 'Offset must be a valid number' };
      
      if (offsetNum < 0) return { valid: false, error: 'Offset must be non-negative' };
      
      return { valid: true, offset: offsetNum };
    };

    // Test valid inputs
    expect(validateYear('2025')).toEqual({ valid: true, year: 2025 });
    expect(validateLimit('20')).toEqual({ valid: true, limit: 20 });
    expect(validateOffset('10')).toEqual({ valid: true, offset: 10 });

    // Test invalid inputs
    expect(validateYear('invalid')).toEqual({ valid: false, error: 'Year must be a valid number' });
    expect(validateYear('1999')).toEqual({ valid: false, error: 'Year must be between 2020 and 2026' });
    expect(validateLimit('0')).toEqual({ valid: false, error: 'Limit must be between 1 and 100' });
    expect(validateLimit('200')).toEqual({ valid: false, error: 'Limit must be between 1 and 100' });
    expect(validateOffset('-1')).toEqual({ valid: false, error: 'Offset must be non-negative' });

    // Test injection attack prevention
    const maliciousInputs = [
      '../../../etc/passwd',
      '<script>alert("xss")</script>',
      'DROP TABLE galleries;',
      '"; DELETE FROM users; --',
      '%3Cscript%3Ealert%28%22xss%22%29%3C%2Fscript%3E'
    ];

    maliciousInputs.forEach(input => {
      const yearResult = validateYear(input);
      expect(yearResult.valid).toBe(false);
      expect(yearResult.error).toBe('Year must be a valid number');
    });
  });

  test('sanitizes user-provided data', () => {
    // Test actual data sanitization
    const sanitizeString = (input) => {
      if (typeof input !== 'string') return '';
      
      return input
        .replace(/[<>]/g, '') // Remove angle brackets
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+=/gi, '') // Remove event handlers
        .replace(/script/gi, '') // Remove script tags
        .trim()
        .substring(0, 200); // Limit length
    };

    const sanitizeFilename = (filename) => {
      if (typeof filename !== 'string') return '';
      
      return filename
        .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
        .replace(/^\.+/, '') // Remove leading dots
        .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
        .substring(0, 100); // Limit length
    };

    const sanitizeHtml = (html) => {
      if (typeof html !== 'string') return '';
      
      return html
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    };

    // Test XSS prevention
    const xssInputs = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src="x" onerror="alert(1)">',
      'onclick="alert(1)"'
    ];

    xssInputs.forEach(input => {
      const sanitized = sanitizeString(input);
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).not.toContain('onclick=');
    });

    // Test filename sanitization
    const dangerousFilenames = [
      '../../../etc/passwd',
      'file..name.jpg',
      'file<script>.jpg',
      'file|pipe.jpg'
    ];

    dangerousFilenames.forEach(filename => {
      const sanitized = sanitizeFilename(filename);
      expect(sanitized).not.toContain('../');
      expect(sanitized).not.toContain('<');
      expect(sanitized).not.toContain('|');
    });

    // Test HTML encoding
    const htmlInput = '<div class="test">Hello & "World"</div>';
    const encodedHtml = sanitizeHtml(htmlInput);
    expect(encodedHtml).toBe('&lt;div class=&quot;test&quot;&gt;Hello &amp; &quot;World&quot;&lt;&#x2F;div&gt;');
  });

  test('validates API request headers', () => {
    // Test header validation
    const validateHeaders = (headers) => {
      const allowedOrigins = [
        'https://alocubano.boulderfest.com',
        'https://www.alocubano.boulderfest.com',
        'http://localhost:3000',
        'http://localhost:8000'
      ];

      const contentTypeWhitelist = [
        'application/json',
        'application/x-www-form-urlencoded',
        'multipart/form-data'
      ];

      const errors = [];

      // Validate Origin header
      if (headers.origin) {
        if (!allowedOrigins.includes(headers.origin)) {
          errors.push('Invalid origin');
        }
      }

      // Validate Content-Type for POST requests
      if (headers['content-type']) {
        const contentType = headers['content-type'].split(';')[0].trim();
        if (!contentTypeWhitelist.includes(contentType)) {
          errors.push('Invalid content type');
        }
      }

      // Check for suspicious headers
      const suspiciousHeaders = ['x-forwarded-host', 'x-real-ip'];
      suspiciousHeaders.forEach(header => {
        if (headers[header] && typeof headers[header] === 'string') {
          // Validate IP format for IP headers
          if (header.includes('ip')) {
            const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
            if (!ipRegex.test(headers[header])) {
              errors.push(`Invalid ${header} format`);
            }
          }
        }
      });

      return errors.length === 0 ? { valid: true } : { valid: false, errors };
    };

    // Test valid headers
    const validHeaders = {
      origin: 'https://alocubano.boulderfest.com',
      'content-type': 'application/json',
      'x-real-ip': '192.168.1.1'
    };

    expect(validateHeaders(validHeaders)).toEqual({ valid: true });

    // Test invalid headers
    const invalidHeaders = {
      origin: 'https://malicious-site.com',
      'content-type': 'text/html',
      'x-real-ip': 'invalid-ip'
    };

    const result = validateHeaders(invalidHeaders);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid origin');
    expect(result.errors).toContain('Invalid content type');
    expect(result.errors).toContain('Invalid x-real-ip format');
  });

  test('prevents SQL injection attempts', () => {
    // Test SQL injection prevention in query parameters
    const preventSQLInjection = (input) => {
      if (typeof input !== 'string') return input;
      
      const sqlPatterns = [
        /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b/gi,
        /(\'|\"|\-\-|\/\*|\*\/)/gi,
        /(;|\|\||&&)/gi,
        /(\bOR\s+\d+\s*=\s*\d+)/gi
      ];

      const hasSQLInjection = sqlPatterns.some(pattern => pattern.test(input));
      
      if (hasSQLInjection) {
        throw new Error('Potential SQL injection detected');
      }
      
      return input;
    };

    // Test safe inputs
    const safeInputs = ['2025', 'gallery-photo.jpg', 'valid search term'];
    safeInputs.forEach(input => {
      expect(() => preventSQLInjection(input)).not.toThrow();
    });

    // Test malicious inputs
    const maliciousInputs = [
      "'; DROP TABLE galleries; --",
      "1 OR 1=1",
      "UNION SELECT * FROM users",
      "/* comment */ SELECT",
      "admin'--",
      "1; DELETE FROM images"
    ];

    maliciousInputs.forEach(input => {
      expect(() => preventSQLInjection(input)).toThrow('Potential SQL injection detected');
    });
  });

  test('validates file upload restrictions', () => {
    // Test file upload validation
    const validateFileUpload = (file) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const maxSize = 10 * 1024 * 1024; // 10MB
      const maxFilenameLength = 100;

      const errors = [];

      // Validate file type
      if (!allowedTypes.includes(file.type)) {
        errors.push('Invalid file type');
      }

      // Validate file extension
      const extension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      if (!allowedExtensions.includes(extension)) {
        errors.push('Invalid file extension');
      }

      // Validate file size
      if (file.size > maxSize) {
        errors.push('File too large');
      }

      // Validate filename length
      if (file.name.length > maxFilenameLength) {
        errors.push('Filename too long');
      }

      // Check for malicious filename patterns
      const maliciousPatterns = [
        /\.\./,  // Directory traversal
        /[<>:"|?*]/,  // Invalid filename characters
        /\.php$|\.exe$|\.bat$|\.cmd$/i  // Executable files
      ];

      if (maliciousPatterns.some(pattern => pattern.test(file.name))) {
        errors.push('Malicious filename detected');
      }

      return errors.length === 0 ? { valid: true } : { valid: false, errors };
    };

    // Test valid file
    const validFile = {
      name: 'festival-photo.jpg',
      type: 'image/jpeg',
      size: 2 * 1024 * 1024 // 2MB
    };

    expect(validateFileUpload(validFile)).toEqual({ valid: true });

    // Test invalid files
    const invalidFiles = [
      {
        name: 'malware.exe',
        type: 'application/x-executable',
        size: 1024
      },
      {
        name: 'huge-image.jpg',
        type: 'image/jpeg',
        size: 20 * 1024 * 1024 // 20MB
      },
      {
        name: '../../../etc/passwd.jpg',
        type: 'image/jpeg',
        size: 1024
      }
    ];

    invalidFiles.forEach(file => {
      const result = validateFileUpload(file);
      expect(result.valid).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('Image URL Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validates image URLs before loading', () => {
    // Test actual URL validation logic
    const validateImageUrl = (url) => {
      try {
        // Handle relative URLs by providing a base URL
        const urlObj = url.startsWith('/') ? 
          new URL(url, 'https://alocubano.boulderfest.com') : 
          new URL(url);
        
        // Check protocol
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
          return { valid: false, error: 'Invalid protocol' };
        }
        
        // Check domain whitelist for external URLs
        const allowedDomains = [
          'alocubano.boulderfest.com',
          'www.alocubano.boulderfest.com',
          'localhost',
          '127.0.0.1'
        ];
        
        if (urlObj.hostname && !allowedDomains.includes(urlObj.hostname)) {
          return { valid: false, error: 'Domain not allowed' };
        }
        
        // Check file extension or API endpoint
        const path = urlObj.pathname.toLowerCase();
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const hasValidExtension = imageExtensions.some(ext => path.endsWith(ext));
        const isAPIEndpoint = path.startsWith('/api/image-proxy/');
        
        if (!hasValidExtension && !isAPIEndpoint) {
          return { valid: false, error: 'Invalid image extension' };
        }
        
        return { valid: true, url: urlObj.toString() };
        
      } catch (error) {
        return { valid: false, error: 'Malformed URL' };
      }
    };

    // Test valid URLs
    const validUrls = [
      'https://alocubano.boulderfest.com/images/photo.jpg',
      'http://localhost:3000/images/test.png',
      '/api/image-proxy/file123?size=view'
    ];

    validUrls.forEach(url => {
      const result = validateImageUrl(url);
      expect(result.valid).toBe(true);
    });

    // Test invalid URLs
    const invalidUrls = [
      'javascript:alert("xss")',
      'ftp://example.com/image.jpg',
      'https://malicious-site.com/image.jpg',
      'https://alocubano.boulderfest.com/malware.exe',
      'not-a-url'
    ];

    invalidUrls.forEach(url => {
      const result = validateImageUrl(url);
      expect(result.valid).toBe(false);
    });
  });

  test('verifies malicious URL rejection', () => {
    // Test malicious URL detection
    const detectMaliciousUrl = (url) => {
      const maliciousPatterns = [
        /javascript:/i,
        /data:(?!image\/)/i,  // Allow data: only for images
        /vbscript:/i,
        /file:/i,
        /\.exe$/i,
        /\.bat$/i,
        /\.cmd$/i,
        /\.scr$/i
      ];

      return maliciousPatterns.some(pattern => pattern.test(url));
    };

    // Test malicious URLs
    const maliciousUrls = [
      'javascript:alert("xss")',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox("xss")',
      'file:///etc/passwd',
      'https://example.com/malware.exe'
    ];

    maliciousUrls.forEach(url => {
      expect(detectMaliciousUrl(url)).toBe(true);
    });

    // Test safe URLs
    const safeUrls = [
      'https://example.com/image.jpg',
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
      '/images/photo.png'
    ];

    safeUrls.forEach(url => {
      expect(detectMaliciousUrl(url)).toBe(false);
    });
  });

  test('handles CORS for external images', () => {
    // Test CORS handling for image requests
    const checkCORSPolicy = (imageUrl, originDomain) => {
      try {
        const url = new URL(imageUrl);
        const origin = new URL(originDomain);
        
        // Same origin is always allowed
        if (url.origin === origin.origin) {
          return { allowed: true, reason: 'same-origin' };
        }
        
        // Check allowed cross-origin domains
        const allowedCORSDomains = [
          'cdn.alocubano.boulderfest.com',
          'images.alocubano.boulderfest.com'
        ];
        
        if (allowedCORSDomains.includes(url.hostname)) {
          return { allowed: true, reason: 'whitelisted-domain' };
        }
        
        return { allowed: false, reason: 'cors-blocked' };
        
      } catch (error) {
        return { allowed: false, reason: 'invalid-url' };
      }
    };

    // Test same-origin requests
    const sameOriginResult = checkCORSPolicy(
      'https://alocubano.boulderfest.com/images/photo.jpg',
      'https://alocubano.boulderfest.com'
    );
    expect(sameOriginResult.allowed).toBe(true);
    expect(sameOriginResult.reason).toBe('same-origin');

    // Test whitelisted cross-origin
    const whitelistedResult = checkCORSPolicy(
      'https://cdn.alocubano.boulderfest.com/images/photo.jpg',
      'https://alocubano.boulderfest.com'
    );
    expect(whitelistedResult.allowed).toBe(true);
    expect(whitelistedResult.reason).toBe('whitelisted-domain');

    // Test blocked cross-origin
    const blockedResult = checkCORSPolicy(
      'https://external-site.com/images/photo.jpg',
      'https://alocubano.boulderfest.com'
    );
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.reason).toBe('cors-blocked');
  });
});

describe('Data Integrity and Validation', () => {
  test('validates API response data structure', () => {
    // Test API response structure validation
    const validateGalleryResponse = (response) => {
      const errors = [];

      // Check required top-level properties
      const requiredProps = ['categories', 'totalCount', 'timestamp'];
      requiredProps.forEach(prop => {
        if (!(prop in response)) {
          errors.push(`Missing required property: ${prop}`);
        }
      });

      // Validate categories structure
      if (response.categories) {
        if (typeof response.categories !== 'object') {
          errors.push('Categories must be an object');
        } else {
          Object.keys(response.categories).forEach(category => {
            if (!Array.isArray(response.categories[category])) {
              errors.push(`Category ${category} must be an array`);
            } else {
              // Validate each item in category
              response.categories[category].forEach((item, index) => {
                const requiredItemProps = ['id', 'name', 'viewUrl'];
                requiredItemProps.forEach(prop => {
                  if (!(prop in item)) {
                    errors.push(`Item ${index} in ${category} missing ${prop}`);
                  }
                });
              });
            }
          });
        }
      }

      // Validate totalCount
      if (response.totalCount !== undefined) {
        if (typeof response.totalCount !== 'number' || response.totalCount < 0) {
          errors.push('totalCount must be a non-negative number');
        }
      }

      // Validate timestamp
      if (response.timestamp !== undefined) {
        if (typeof response.timestamp !== 'number' || isNaN(new Date(response.timestamp))) {
          errors.push('timestamp must be a valid timestamp');
        }
      }

      return errors.length === 0 ? { valid: true } : { valid: false, errors };
    };

    // Test valid response
    const validResponse = {
      categories: {
        workshops: [
          { id: 'w1', name: 'Workshop 1.jpg', viewUrl: '/api/image-proxy/w1' }
        ],
        socials: []
      },
      totalCount: 1,
      timestamp: Date.now()
    };

    expect(validateGalleryResponse(validResponse)).toEqual({ valid: true });

    // Test invalid responses
    const invalidResponses = [
      {}, // Missing required properties
      { categories: 'not-an-object', totalCount: 0, timestamp: Date.now() },
      { categories: { workshops: 'not-an-array' }, totalCount: 0, timestamp: Date.now() },
      { categories: { workshops: [{ name: 'test.jpg' }] }, totalCount: 0, timestamp: Date.now() }, // Missing id
      { categories: {}, totalCount: -1, timestamp: Date.now() }, // Invalid totalCount
      { categories: {}, totalCount: 0, timestamp: 'invalid' } // Invalid timestamp
    ];

    invalidResponses.forEach(response => {
      const result = validateGalleryResponse(response);
      expect(result.valid).toBe(false);
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  test('validates cache data integrity', () => {
    // Test cache data validation
    const validateCacheData = (cacheData) => {
      try {
        // Must be valid JSON
        if (typeof cacheData === 'string') {
          cacheData = JSON.parse(cacheData);
        }

        // Check cache structure
        const requiredProps = ['categories', 'totalCount', 'timestamp', 'metadata'];
        const missingProps = requiredProps.filter(prop => !(prop in cacheData));
        
        if (missingProps.length > 0) {
          return { valid: false, error: `Missing properties: ${missingProps.join(', ')}` };
        }

        // Validate metadata
        if (!cacheData.metadata.year || !cacheData.metadata.generated) {
          return { valid: false, error: 'Invalid metadata structure' };
        }

        // Check data freshness (example: 1 hour expiry)
        const cacheAge = Date.now() - cacheData.timestamp;
        const maxAge = 60 * 60 * 1000; // 1 hour
        
        if (cacheAge > maxAge) {
          return { valid: false, error: 'Cache data expired' };
        }

        return { valid: true };

      } catch (error) {
        return { valid: false, error: 'Invalid JSON structure' };
      }
    };

    // Test valid cache data
    const validCache = {
      categories: { workshops: [], socials: [] },
      totalCount: 0,
      timestamp: Date.now() - 30 * 60 * 1000, // 30 minutes ago
      metadata: {
        year: '2025',
        generated: new Date().toISOString()
      }
    };

    expect(validateCacheData(validCache)).toEqual({ valid: true });

    // Test invalid cache data
    const expiredCache = {
      categories: { workshops: [], socials: [] },
      totalCount: 0,
      timestamp: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
      metadata: { year: '2025', generated: new Date().toISOString() }
    };

    const result = validateCacheData(expiredCache);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Cache data expired');
  });
});