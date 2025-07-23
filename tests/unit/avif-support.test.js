/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');

describe('AVIF Format Support - Phase 3', () => {
  let imageProcessorCode;

  beforeAll(() => {
    // Load the actual image processor source code
    const imageProcessorPath = path.join(process.cwd(), 'api/utils/image-processor.js');
    imageProcessorCode = fs.readFileSync(imageProcessorPath, 'utf8');
  });

  describe('Source Code Validation', () => {
    test('should have AVIF quality constant defined', () => {
      expect(imageProcessorCode).toContain('const AVIF_QUALITY = 65');
    });

    test('should have AVIF case in format switch statement', () => {
      expect(imageProcessorCode).toContain("case 'avif':");
      expect(imageProcessorCode).toContain('.avif({');
      expect(imageProcessorCode).toContain('quality: quality || AVIF_QUALITY');
    });

    test('should export isAVIFSupported function', () => {
      expect(imageProcessorCode).toContain('isAVIFSupported');
      expect(imageProcessorCode).toContain('export {');
    });

    test('should have AVIF content type handling', () => {
      expect(imageProcessorCode).toContain('image/avif');
    });
  });

  describe('AVIF Browser Detection Logic', () => {
    test('should contain Chrome version detection logic', () => {
      expect(imageProcessorCode).toContain('/Chrome\\/(\\d+)/');
      expect(imageProcessorCode).toContain('>= 85');
    });

    test('should contain Firefox version detection logic', () => {
      expect(imageProcessorCode).toContain('/Firefox\\/(\\d+)/');
      expect(imageProcessorCode).toContain('>= 93');
    });

    test('should contain Edge version detection logic', () => {
      expect(imageProcessorCode).toContain('/Edg\\/(\\d+)/');
      expect(imageProcessorCode).toContain('>= 93');
    });

    test('should contain Safari version detection logic', () => {
      expect(imageProcessorCode).toContain('/Version\\/(\\d+)\\.(\\d+).*Safari/');
      expect(imageProcessorCode).toContain('14.1');
    });
  });

  describe('Format Detection Chain', () => {
    test('should have proper format priority in detectOptimalFormat', () => {
      expect(imageProcessorCode).toContain("acceptHeader?.includes('image/avif')");
      expect(imageProcessorCode).toContain("acceptHeader?.includes('image/webp')");
      expect(imageProcessorCode).toContain("return 'avif'");
      expect(imageProcessorCode).toContain("return 'webp'");
      expect(imageProcessorCode).toContain("return 'jpeg'");
    });

    test('should call isAVIFSupported for additional validation', () => {
      expect(imageProcessorCode).toContain('isAVIFSupported(userAgent)');
    });
  });

  describe('Error Handling and Fallbacks', () => {
    test('should have AVIF fallback to WebP logic', () => {
      expect(imageProcessorCode).toContain("format === 'avif'");
      expect(imageProcessorCode).toContain('AVIF processing failed, falling back to WebP');
      expect(imageProcessorCode).toContain('format: \'webp\'');
    });

    test('should have WebP fallback to JPEG logic', () => {
      expect(imageProcessorCode).toContain("format === 'webp'");
      expect(imageProcessorCode).toContain('WebP processing failed, falling back to JPEG');
      expect(imageProcessorCode).toContain('format: \'jpeg\'');
    });
  });

  describe('Return Format Enhancement', () => {
    test('should return both buffer and format', () => {
      expect(imageProcessorCode).toContain('return { buffer, format }');
      expect(imageProcessorCode).toContain('const buffer = await pipeline.toBuffer()');
    });

    test('should have proper JSDoc documentation', () => {
      expect(imageProcessorCode).toContain('@returns {Promise<{buffer: Buffer, format: string}>}');
      expect(imageProcessorCode).toContain('Processed image buffer and actual format used');
    });
  });

  describe('Cache Key Generation', () => {
    test('should handle AVIF format in cache keys', () => {
      // Test cache key generation logic exists
      expect(imageProcessorCode).toContain('generateCacheKey');
      expect(imageProcessorCode).toContain('if (format) parts.push(format)');
    });
  });

  describe('Image Proxy Integration', () => {
    test('should check image proxy has AVIF content type handling', () => {
      const imageProxyPath = path.join(process.cwd(), 'api/image-proxy/[fileId].js');
      const imageProxyCode = fs.readFileSync(imageProxyPath, 'utf8');
      
      expect(imageProxyCode).toContain("case 'avif':");
      expect(imageProxyCode).toContain("finalContentType = 'image/avif'");
      expect(imageProxyCode).toContain('userAgent');
      expect(imageProxyCode).toContain('result.format');
    });

    test('should verify User-Agent header is passed to format detection', () => {
      const imageProxyPath = path.join(process.cwd(), 'api/image-proxy/[fileId].js');
      const imageProxyCode = fs.readFileSync(imageProxyPath, 'utf8');
      
      expect(imageProxyCode).toContain("req.headers['user-agent']");
      expect(imageProxyCode).toContain('detectOptimalFormat(acceptHeader, userAgent)');
    });

    test('should include AVIF debug headers', () => {
      const imageProxyPath = path.join(process.cwd(), 'api/image-proxy/[fileId].js');
      const imageProxyCode = fs.readFileSync(imageProxyPath, 'utf8');
      
      expect(imageProxyCode).toContain('X-Browser-AVIF-Support');
      expect(imageProxyCode).toContain('isAVIFSupported(userAgent)');
      expect(imageProxyCode).toContain('import { processImage, detectOptimalFormat, generateCacheKey, isAVIFSupported }');
    });
  });
});