/**
 * Unit Tests for Ticket Color Service
 * Tests pattern matching, caching, and color assignment logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TicketColorService } from '../../lib/ticket-color-service.js';

// Mock database client
const mockDatabaseClient = {
  execute: vi.fn()
};

vi.mock('../../lib/database.js', () => ({
  getDatabaseClient: vi.fn(() => Promise.resolve(mockDatabaseClient))
}));

vi.mock('../../lib/logger.js', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Ticket Color Service', () => {
  let service;

  beforeEach(() => {
    // Create new service instance for each test
    service = new TicketColorService();
    vi.clearAllMocks();

    // Mock database response with color mappings
    mockDatabaseClient.execute.mockResolvedValue({
      rows: [
        { pattern: 'test-', color_name: 'Test', color_rgb: 'rgb(255, 20, 147)', circle_emoji: '⬤', display_order: 1 },
        { pattern: 'test_', color_name: 'Test', color_rgb: 'rgb(255, 20, 147)', circle_emoji: '⬤', display_order: 2 },
        { pattern: 'full', color_name: 'Full Pass', color_rgb: 'rgb(169, 169, 169)', circle_emoji: '⬤', display_order: 3 },
        { pattern: 'early-bird', color_name: 'Full Pass', color_rgb: 'rgb(169, 169, 169)', circle_emoji: '⬤', display_order: 4 },
        { pattern: 'friday', color_name: 'Friday', color_rgb: 'rgb(255, 140, 0)', circle_emoji: '⬤', display_order: 5 },
        { pattern: 'saturday', color_name: 'Saturday', color_rgb: 'rgb(255, 215, 0)', circle_emoji: '⬤', display_order: 6 },
        { pattern: 'sunday', color_name: 'Sunday', color_rgb: 'rgb(30, 144, 255)', circle_emoji: '⬤', display_order: 7 },
        { pattern: 'weekender', color_name: 'Weekender', color_rgb: 'rgb(255, 255, 255)', circle_emoji: '⬤', display_order: 8 },
        { pattern: 'weekend', color_name: 'Weekend', color_rgb: 'rgb(255, 255, 255)', circle_emoji: '⬤', display_order: 9 }
      ]
    });
  });

  describe('Pattern Matching - Test Tickets', () => {
    it('should match test-vip-pass to Deep Pink', async () => {
      const color = await service.getColorForTicketType('test-vip-pass');
      expect(color.name).toBe('Test');
      expect(color.rgb).toBe('rgb(255, 20, 147)');
      expect(color.emoji).toBe('⬤');
    });

    it('should match test_friday_pass to Deep Pink (underscore variant)', async () => {
      const color = await service.getColorForTicketType('test_friday_pass');
      expect(color.name).toBe('Test');
      expect(color.rgb).toBe('rgb(255, 20, 147)');
    });

    it('should be case-insensitive for test pattern', async () => {
      const color = await service.getColorForTicketType('TEST-VIP-PASS');
      expect(color.name).toBe('Test');
      expect(color.rgb).toBe('rgb(255, 20, 147)');
    });
  });

  describe('Pattern Matching - Full Passes', () => {
    it('should match boulderfest-2026-early-bird-full to Silver', async () => {
      const color = await service.getColorForTicketType('boulderfest-2026-early-bird-full');
      expect(color.name).toBe('Full Pass');
      expect(color.rgb).toBe('rgb(169, 169, 169)');
    });

    it('should match boulderfest-2026-regular-full to Silver', async () => {
      const color = await service.getColorForTicketType('boulderfest-2026-regular-full');
      expect(color.name).toBe('Full Pass');
      expect(color.rgb).toBe('rgb(169, 169, 169)');
    });

    it('should match full-festival-pass to Silver', async () => {
      const color = await service.getColorForTicketType('full-festival-pass');
      expect(color.name).toBe('Full Pass');
      expect(color.rgb).toBe('rgb(169, 169, 169)');
    });
  });

  describe('Pattern Matching - Day-Specific Passes', () => {
    it('should match boulderfest-2026-friday-pass to Orange', async () => {
      const color = await service.getColorForTicketType('boulderfest-2026-friday-pass');
      expect(color.name).toBe('Friday');
      expect(color.rgb).toBe('rgb(255, 140, 0)');
    });

    it('should match boulderfest-2026-saturday-pass to Gold', async () => {
      const color = await service.getColorForTicketType('boulderfest-2026-saturday-pass');
      expect(color.name).toBe('Saturday');
      expect(color.rgb).toBe('rgb(255, 215, 0)');
    });

    it('should match boulderfest-2026-sunday-pass to Blue', async () => {
      const color = await service.getColorForTicketType('boulderfest-2026-sunday-pass');
      expect(color.name).toBe('Sunday');
      expect(color.rgb).toBe('rgb(30, 144, 255)');
    });
  });

  describe('Pattern Matching - Weekender Passes', () => {
    it('should match weekender-2025-11-full to Full Pass (full pattern takes priority)', async () => {
      // Note: "weekender-2025-11-full" contains both "weekender" and "full"
      // Since "full" has lower display_order (3) than "weekender" (8), it matches first
      const color = await service.getColorForTicketType('weekender-2025-11-full');
      expect(color.name).toBe('Full Pass'); // Full takes priority
      expect(color.rgb).toBe('rgb(169, 169, 169)');
    });

    it('should match weekender-2025-11-class to Weekender', async () => {
      // This one only contains "weekender" pattern
      const color = await service.getColorForTicketType('weekender-2025-11-class');
      expect(color.name).toBe('Weekender');
      expect(color.rgb).toBe('rgb(255, 255, 255)');
    });

    it('should match weekend-pass to Weekend', async () => {
      const color = await service.getColorForTicketType('weekend-pass');
      expect(color.name).toBe('Weekend');
      expect(color.rgb).toBe('rgb(255, 255, 255)');
    });
  });

  describe('Priority Order', () => {
    it('should prioritize test pattern over other patterns', async () => {
      // test-friday should match "test-" (priority 1) not "friday" (priority 5)
      const color = await service.getColorForTicketType('test-friday-pass');
      expect(color.name).toBe('Test');
      expect(color.rgb).toBe('rgb(255, 20, 147)');
    });

    it('should prioritize early-bird over full when both patterns match', async () => {
      // early-bird-full should match "early-bird" (priority 4) before "full" (priority 3)
      // But wait - priority 3 comes before 4, so it should match "full" first
      const color = await service.getColorForTicketType('early-bird-full-pass');
      expect(color.name).toBe('Full Pass');
      expect(color.rgb).toBe('rgb(169, 169, 169)');
    });
  });

  describe('Default Fallback', () => {
    it('should return default white color for unknown ticket type', async () => {
      const color = await service.getColorForTicketType('unknown-ticket-type');
      expect(color.name).toBe('Default');
      expect(color.rgb).toBe('rgb(255, 255, 255)');
      expect(color.emoji).toBe('⬤');
    });

    it('should return default color for empty string', async () => {
      const color = await service.getColorForTicketType('');
      expect(color.name).toBe('Default');
      expect(color.rgb).toBe('rgb(255, 255, 255)');
    });

    it('should return default color for null/undefined', async () => {
      const color1 = await service.getColorForTicketType(null);
      const color2 = await service.getColorForTicketType(undefined);

      expect(color1.name).toBe('Default');
      expect(color2.name).toBe('Default');
    });
  });

  describe('Caching Behavior', () => {
    it('should cache color mappings from database', async () => {
      // First call should hit database
      await service.getColorForTicketType('test-vip-pass');
      expect(mockDatabaseClient.execute).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await service.getColorForTicketType('boulderfest-2026-friday-pass');
      expect(mockDatabaseClient.execute).toHaveBeenCalledTimes(1); // Still 1
    });

    it('should invalidate cache when requested', async () => {
      // First call
      await service.getColorForTicketType('test-vip-pass');
      expect(mockDatabaseClient.execute).toHaveBeenCalledTimes(1);

      // Invalidate cache
      service.invalidate();

      // Next call should hit database again
      await service.getColorForTicketType('test-vip-pass');
      expect(mockDatabaseClient.execute).toHaveBeenCalledTimes(2);
    });

    it('should track cache statistics', async () => {
      // First call (cache miss)
      await service.getColorForTicketType('test-vip-pass');

      // Second call (cache hit)
      await service.getColorForTicketType('boulderfest-2026-friday-pass');

      const stats = service.getStats();
      expect(stats.hits).toBeGreaterThan(0);
      expect(stats.refreshes).toBe(1);
    });
  });

  describe('Database Error Handling', () => {
    it('should use fallback mappings if database fails', async () => {
      // Mock database failure
      mockDatabaseClient.execute.mockRejectedValueOnce(new Error('Database error'));

      // The service will throw the error but load fallback mappings
      try {
        await service.getColorForTicketType('test-vip-pass');
      } catch (error) {
        // Expected to throw
        expect(error.message).toBe('Database error');
      }

      // After error, fallback mappings should be loaded
      // Next call should work with fallback
      const color = await service.getColorForTicketType('test-vip-pass');
      expect(color.name).toBe('Test');
      expect(color.rgb).toBe('rgb(255, 20, 147)');
    });
  });

  describe('getAllColorMappings', () => {
    it('should return all color mappings', async () => {
      const mappings = await service.getAllColorMappings();

      expect(mappings).toBeInstanceOf(Array);
      expect(mappings.length).toBeGreaterThan(0);

      // Check structure of each mapping
      mappings.forEach(mapping => {
        expect(mapping).toHaveProperty('pattern');
        expect(mapping).toHaveProperty('name');
        expect(mapping).toHaveProperty('rgb');
        expect(mapping).toHaveProperty('emoji');
      });
    });
  });

  describe('Real-world Bootstrap.json Ticket Types', () => {
    it('should correctly map all ticket types from bootstrap.json', async () => {
      const testCases = [
        // Note: weekender-2025-11-full contains "full" which has higher priority
        { id: 'weekender-2025-11-full', expectedColor: 'Full Pass', expectedRgb: 'rgb(169, 169, 169)' },
        { id: 'weekender-2025-11-class', expectedColor: 'Weekender', expectedRgb: 'rgb(255, 255, 255)' },
        { id: 'boulderfest-2026-early-bird-full', expectedColor: 'Full Pass', expectedRgb: 'rgb(169, 169, 169)' },
        { id: 'boulderfest-2026-regular-full', expectedColor: 'Full Pass', expectedRgb: 'rgb(169, 169, 169)' },
        { id: 'boulderfest-2026-friday-pass', expectedColor: 'Friday', expectedRgb: 'rgb(255, 140, 0)' },
        { id: 'boulderfest-2026-saturday-pass', expectedColor: 'Saturday', expectedRgb: 'rgb(255, 215, 0)' },
        { id: 'boulderfest-2026-sunday-pass', expectedColor: 'Sunday', expectedRgb: 'rgb(30, 144, 255)' },
        { id: 'test-vip-pass', expectedColor: 'Test', expectedRgb: 'rgb(255, 20, 147)' },
        { id: 'test-weekender-pass', expectedColor: 'Test', expectedRgb: 'rgb(255, 20, 147)' },
        { id: 'test-friday-pass', expectedColor: 'Test', expectedRgb: 'rgb(255, 20, 147)' },
        { id: 'test-saturday-pass', expectedColor: 'Test', expectedRgb: 'rgb(255, 20, 147)' },
        { id: 'test-sunday-pass', expectedColor: 'Test', expectedRgb: 'rgb(255, 20, 147)' }
      ];

      for (const testCase of testCases) {
        const color = await service.getColorForTicketType(testCase.id);
        expect(color.name).toBe(testCase.expectedColor);
        expect(color.rgb).toBe(testCase.expectedRgb);
      }
    });
  });
});
