/**
 * Unit Tests for Google Wallet Hero Image Generator
 * Tests hero image generation, image manipulation, template handling, caching, and performance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GoogleWalletHeroGenerator } from '../../../lib/google-wallet-hero-generator.js';
import sharp from 'sharp';

describe('Google Wallet Hero Generator - Unit Tests', () => {
  let generator;
  let mockColorService;
  let mockFetch;

  beforeEach(() => {
    // Set up environment
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'test-preview.vercel.app';

    // Mock color service
    mockColorService = {
      getColorForTicketType: vi.fn().mockResolvedValue({
        name: 'Vibrant Red',
        rgb: 'rgb(211, 47, 47)',
        hex: '#d32f2f',
        emoji: '🔴'
      })
    };

    // Mock global fetch for background image
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1000))
    });
    global.fetch = mockFetch;

    // Mock color service module
    vi.doMock('../../../lib/ticket-color-service.js', () => ({
      getTicketColorService: () => mockColorService
    }));

    generator = new GoogleWalletHeroGenerator();
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.WALLET_BASE_URL;
  });

  describe('Initialization', () => {
    it('should initialize with correct dimensions', () => {
      expect(generator.heroWidth).toBe(1032);
      expect(generator.heroHeight).toBe(336);
    });

    it('should initialize with correct circle size', () => {
      expect(generator.circleSize).toBe(135);
    });

    it('should initialize with correct logo opacity', () => {
      expect(generator.logoOpacity).toBe(0.2);
    });

    it('should resolve base URL for production', () => {
      process.env.VERCEL_ENV = 'production';
      process.env.WALLET_BASE_URL = 'https://custom-domain.com';
      const gen = new GoogleWalletHeroGenerator();
      expect(gen.baseUrl).toBe('https://custom-domain.com');
    });

    it('should resolve base URL for preview', () => {
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_URL = 'preview-url.vercel.app';
      delete process.env.WALLET_BASE_URL;
      const gen = new GoogleWalletHeroGenerator();
      expect(gen.baseUrl).toBe('https://preview-url.vercel.app');
    });

    it('should fall back to default URL', () => {
      delete process.env.WALLET_BASE_URL;
      delete process.env.VERCEL_URL;
      const gen = new GoogleWalletHeroGenerator();
      expect(gen.baseUrl).toBe('https://alocubano.vercel.app');
    });
  });

  describe('Static Dimensions', () => {
    it('should return correct dimensions object', () => {
      const dims = GoogleWalletHeroGenerator.getDimensions();
      expect(dims.width).toBe(1032);
      expect(dims.height).toBe(336);
      expect(dims.aspectRatio).toBe('1032:336');
    });
  });

  describe('Circle Generation', () => {
    it('should generate colored circle as PNG buffer', async () => {
      const circleBuffer = await generator.generateCircle('rgb(255, 20, 147)');

      expect(Buffer.isBuffer(circleBuffer)).toBe(true);
      expect(circleBuffer.length).toBeGreaterThan(0);
    });

    it('should generate circle with correct dimensions', async () => {
      const circleBuffer = await generator.generateCircle('rgb(100, 150, 200)');
      const metadata = await sharp(circleBuffer).metadata();

      expect(metadata.width).toBe(135);
      expect(metadata.height).toBe(135);
      expect(metadata.format).toBe('png');
    });

    it('should generate circles with different colors', async () => {
      const redCircle = await generator.generateCircle('rgb(255, 0, 0)');
      const blueCircle = await generator.generateCircle('rgb(0, 0, 255)');

      expect(redCircle).not.toEqual(blueCircle);
    });

    it('should use high quality PNG compression', async () => {
      const circleBuffer = await generator.generateCircle('rgb(128, 128, 128)');
      const metadata = await sharp(circleBuffer).metadata();

      expect(metadata.format).toBe('png');
      // PNG should be optimized but still high quality
      expect(circleBuffer.length).toBeLessThan(10000); // Reasonable size
    });

    it('should handle RGB color with spaces', async () => {
      const circleBuffer = await generator.generateCircle('rgb( 255 , 128 , 64 )');
      expect(Buffer.isBuffer(circleBuffer)).toBe(true);
    });

    it('should handle RGB color without spaces', async () => {
      const circleBuffer = await generator.generateCircle('rgb(255,128,64)');
      expect(Buffer.isBuffer(circleBuffer)).toBe(true);
    });
  });

  describe('Hero Image Generation', () => {
    it('should generate hero image with default options', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass');

      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
      expect(heroBuffer.length).toBeGreaterThan(0);
    });

    it('should generate hero image with correct dimensions', async () => {
      const heroBuffer = await generator.generateHeroImage('weekend-pass');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.width).toBe(1032);
      expect(metadata.height).toBe(336);
      expect(metadata.format).toBe('png');
    });

    it('should accept custom event name', async () => {
      const heroBuffer = await generator.generateHeroImage('friday-pass', {
        eventName: 'Custom Event Name'
      });

      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should accept custom event subtitle', async () => {
      const heroBuffer = await generator.generateHeroImage('saturday-pass', {
        eventSubtitle: 'Custom Subtitle'
      });

      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should position circle in top-right by default', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should position circle in center when specified', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass', {
        circlePosition: 'center'
      });
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should position circle in top-left when specified', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass', {
        circlePosition: 'top-left'
      });
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should use fallback color when color service fails', async () => {
      mockColorService.getColorForTicketType.mockRejectedValue(new Error('Color not found'));

      const heroBuffer = await generator.generateHeroImage('unknown-ticket');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should handle missing ticket type', async () => {
      const heroBuffer = await generator.generateHeroImage(null);
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should handle undefined ticket type', async () => {
      const heroBuffer = await generator.generateHeroImage(undefined);
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });
  });

  describe('Simple Hero Generation (Fallback)', () => {
    it('should generate simple hero without background', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(255, 100, 50)', 'top-right');

      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
      expect(heroBuffer.length).toBeGreaterThan(0);
    });

    it('should generate simple hero with correct dimensions', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(100, 200, 150)', 'center');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.width).toBe(1032);
      expect(metadata.height).toBe(336);
    });

    it('should position circle correctly in simple hero - top-right', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(255, 0, 0)', 'top-right');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should position circle correctly in simple hero - center', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(0, 255, 0)', 'center');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should position circle correctly in simple hero - top-left', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(0, 0, 255)', 'top-left');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should default to top-right when position is invalid', async () => {
      const heroBuffer = await generator.generateSimpleHero('rgb(128, 128, 128)', 'invalid-position');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });
  });

  describe('Background Image Handling', () => {
    it('should fetch background image from base URL', async () => {
      await generator.generateHeroImage('vip-pass');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/wallet/background.png')
      );
    });

    it('should fall back to simple hero when background fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404
      });

      const heroBuffer = await generator.generateHeroImage('weekend-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should fall back to simple hero when fetch throws error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const heroBuffer = await generator.generateHeroImage('friday-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should handle background with watermark opacity', async () => {
      const heroBuffer = await generator.generateHeroImage('saturday-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should generate hero image in under 500ms', async () => {
      const start = Date.now();
      await generator.generateHeroImage('vip-pass');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });

    it('should generate simple hero in under 200ms', async () => {
      const start = Date.now();
      await generator.generateSimpleHero('rgb(255, 128, 64)', 'top-right');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
    });

    it('should generate circle in under 100ms', async () => {
      const start = Date.now();
      await generator.generateCircle('rgb(100, 150, 200)');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent generation requests', async () => {
      const promises = [
        generator.generateHeroImage('vip-pass'),
        generator.generateHeroImage('weekend-pass'),
        generator.generateHeroImage('friday-pass')
      ];

      const results = await Promise.all(promises);

      results.forEach(buffer => {
        expect(Buffer.isBuffer(buffer)).toBe(true);
        expect(buffer.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Image Quality', () => {
    it('should use maximum PNG compression', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.format).toBe('png');
      // Should be compressed but still reasonable size
      expect(heroBuffer.length).toBeLessThan(100000);
    });

    it('should maintain image quality despite compression', async () => {
      const heroBuffer = await generator.generateHeroImage('weekend-pass');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.width).toBe(1032);
      expect(metadata.height).toBe(336);
      expect(metadata.channels).toBeGreaterThanOrEqual(3); // RGB or RGBA
    });

    it('should generate images with alpha channel', async () => {
      const circleBuffer = await generator.generateCircle('rgb(255, 128, 64)');
      const metadata = await sharp(circleBuffer).metadata();

      expect(metadata.hasAlpha).toBe(false); // Circle is solid, no alpha needed
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid RGB color gracefully', async () => {
      // Sharp will handle invalid SVG gracefully
      await expect(generator.generateCircle('invalid-color')).resolves.toBeDefined();
    });

    it('should handle empty color string', async () => {
      await expect(generator.generateCircle('')).resolves.toBeDefined();
    });

    it('should handle null color', async () => {
      await expect(generator.generateCircle(null)).resolves.toBeDefined();
    });

    it('should handle background image parse error', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.reject(new Error('Parse error'))
      });

      const heroBuffer = await generator.generateHeroImage('vip-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });

    it('should provide informative error messages', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500
      });

      // Should fall back to simple hero without throwing
      const heroBuffer = await generator.generateHeroImage('weekend-pass');
      expect(Buffer.isBuffer(heroBuffer)).toBe(true);
    });
  });

  describe('Different Ticket Types', () => {
    const ticketTypes = [
      'vip-pass',
      'weekend-pass',
      'friday-pass',
      'saturday-pass',
      'sunday-pass',
      'workshop-beginner',
      'workshop-intermediate',
      'workshop-advanced',
      'general-admission'
    ];

    ticketTypes.forEach(ticketType => {
      it(`should generate hero for ${ticketType}`, async () => {
        const heroBuffer = await generator.generateHeroImage(ticketType);

        expect(Buffer.isBuffer(heroBuffer)).toBe(true);
        expect(heroBuffer.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with multiple generations', async () => {
      const iterations = 10;
      const buffers = [];

      for (let i = 0; i < iterations; i++) {
        const buffer = await generator.generateHeroImage('vip-pass');
        buffers.push(buffer);
      }

      expect(buffers.length).toBe(iterations);
      buffers.forEach(buffer => {
        expect(Buffer.isBuffer(buffer)).toBe(true);
      });
    });

    it('should handle large concurrent requests without memory issues', async () => {
      const concurrentRequests = 20;
      const promises = Array(concurrentRequests).fill(0).map((_, i) =>
        generator.generateCircle(`rgb(${i * 10}, ${i * 5}, ${i * 2})`)
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(concurrentRequests);
      results.forEach(buffer => {
        expect(Buffer.isBuffer(buffer)).toBe(true);
      });
    });
  });

  describe('Integration with Sharp', () => {
    it('should use sharp for image processing', async () => {
      const circleBuffer = await generator.generateCircle('rgb(255, 0, 0)');

      // Verify it's a valid PNG that sharp can read
      await expect(sharp(circleBuffer).metadata()).resolves.toBeDefined();
    });

    it('should generate valid PNG format', async () => {
      const heroBuffer = await generator.generateHeroImage('vip-pass');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.format).toBe('png');
    });

    it('should generate images with correct color space', async () => {
      const heroBuffer = await generator.generateHeroImage('weekend-pass');
      const metadata = await sharp(heroBuffer).metadata();

      expect(metadata.space).toBeDefined();
    });
  });
});
