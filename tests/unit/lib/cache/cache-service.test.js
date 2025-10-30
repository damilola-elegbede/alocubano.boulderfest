/**
 * Unit Tests for Cache Service
 * Tests high-level caching service for A Lo Cubano Boulder Fest API
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CacheService, getCacheService } from '../../../../lib/cache-service.js';
import { CACHE_TYPES } from '../../../../lib/cache/index.js';

describe('CacheService', () => {
  let cacheService;
  let mockCache;

  beforeEach(() => {
    // Create mock cache
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      delPattern: vi.fn(),
      incr: vi.fn(),
      healthCheck: vi.fn(),
      getStats: vi.fn(),
      warmCache: vi.fn(),
      close: vi.fn()
    };

    // Create new service instance
    cacheService = new CacheService();
    cacheService.cache = null;
    cacheService.initialized = false;
    cacheService.initPromise = null;
  });

  afterEach(async () => {
    if (cacheService && cacheService.initialized) {
      await cacheService.close();
    }
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize cache service successfully', async () => {
      await cacheService.init();

      expect(cacheService.initialized).toBe(true);
      expect(cacheService.cache).toBeDefined();
    });

    it('should not reinitialize if already initialized', async () => {
      await cacheService.init();
      const firstCache = cacheService.cache;

      await cacheService.init();
      expect(cacheService.cache).toBe(firstCache);
    });

    it('should reuse initialization promise if init called concurrently', async () => {
      const promise1 = cacheService.init();
      const promise2 = cacheService.init();

      // Both promises should resolve to the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(result2);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock getWarmUpData to throw error
      vi.spyOn(cacheService, 'getWarmUpData').mockRejectedValue(
        new Error('Init failed')
      );

      await cacheService.init();

      // Should still initialize with fallback
      expect(cacheService.initialized).toBe(true);
      expect(cacheService.cache).toBeDefined();
    });

    it('should load warm-up data during initialization', async () => {
      const warmUpData = await cacheService.getWarmUpData();

      expect(warmUpData).toBeDefined();
      expect(warmUpData['event:boulder-fest-2026']).toBeDefined();
      expect(warmUpData['artists:featured']).toBeInstanceOf(Array);
      expect(warmUpData['tickets:config']).toBeDefined();
      expect(warmUpData['gallery:years']).toBeInstanceOf(Array);
      expect(warmUpData['analytics:config']).toBeDefined();
    });
  });

  describe('Basic Cache Operations', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should get value from cache', async () => {
      const testKey = 'test:key';
      const testValue = { data: 'test' };

      await cacheService.set(testKey, testValue);
      const result = await cacheService.get(testKey);

      expect(result).toEqual(testValue);
    });

    it('should set value in cache', async () => {
      const testKey = 'test:key';
      const testValue = { data: 'test' };

      const success = await cacheService.set(testKey, testValue);
      expect(success).toBe(true);

      const result = await cacheService.get(testKey);
      expect(result).toEqual(testValue);
    });

    it('should delete value from cache', async () => {
      const testKey = 'test:key';
      const testValue = { data: 'test' };

      await cacheService.set(testKey, testValue);
      await cacheService.del(testKey);

      const result = await cacheService.get(testKey);
      expect(result).toBeNull();
    });

    it('should return null for non-existent keys', async () => {
      const result = await cacheService.get('non:existent:key');
      expect(result).toBeNull();
    });

    it('should handle undefined values gracefully', async () => {
      const testKey = 'test:undefined';
      await cacheService.set(testKey, undefined);

      const result = await cacheService.get(testKey);
      // undefined values are stored but may return undefined or null depending on cache implementation
      expect(result === undefined || result === null).toBe(true);
    });
  });

  describe('TTL Handling', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should respect TTL for dynamic data', async () => {
      const testKey = 'test:ttl';
      const testValue = { data: 'test' };

      await cacheService.set(testKey, testValue, {
        type: CACHE_TYPES.DYNAMIC,
        ttl: 1 // 1 second
      });

      const immediate = await cacheService.get(testKey);
      expect(immediate).toEqual(testValue);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1500));

      const expired = await cacheService.get(testKey);
      expect(expired).toBeNull();
    });

    it('should handle infinite TTL (null)', async () => {
      const testKey = 'test:infinite';
      const testValue = { data: 'test' };

      await cacheService.set(testKey, testValue, { ttl: null });

      const result = await cacheService.get(testKey);
      expect(result).toEqual(testValue);
    });
  });

  describe('Ticket Availability Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache ticket availability data', async () => {
      const ticketData = {
        earlyBird: { available: 50, price: 125 },
        regular: { available: 100, price: 150 },
        vip: { available: 25, price: 250 }
      };

      const success = await cacheService.cacheTicketAvailability(ticketData);
      expect(success).toBe(true);

      const cached = await cacheService.getTicketAvailability();
      expect(cached).toEqual(ticketData);
    });

    it('should return null for uncached ticket availability', async () => {
      const result = await cacheService.getTicketAvailability();
      expect(result).toBeNull();
    });

    it('should update ticket availability cache', async () => {
      const initialData = { earlyBird: { available: 50 } };
      const updatedData = { earlyBird: { available: 25 } };

      await cacheService.cacheTicketAvailability(initialData);
      await cacheService.cacheTicketAvailability(updatedData);

      const result = await cacheService.getTicketAvailability();
      expect(result).toEqual(updatedData);
    });
  });

  describe('Gallery Data Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache gallery data by year', async () => {
      const photos = [
        { id: '1', name: 'Photo 1', url: 'http://example.com/1.jpg' },
        { id: '2', name: 'Photo 2', url: 'http://example.com/2.jpg' }
      ];

      const success = await cacheService.cacheGalleryData('2024', photos);
      expect(success).toBe(true);

      const cached = await cacheService.getGalleryData('2024');
      expect(cached).toEqual(photos);
    });

    it('should return null for uncached gallery year', async () => {
      const result = await cacheService.getGalleryData('2025');
      expect(result).toBeNull();
    });

    it('should cache multiple gallery years independently', async () => {
      const photos2023 = [{ id: '1', year: 2023 }];
      const photos2024 = [{ id: '2', year: 2024 }];

      await cacheService.cacheGalleryData('2023', photos2023);
      await cacheService.cacheGalleryData('2024', photos2024);

      const cached2023 = await cacheService.getGalleryData('2023');
      const cached2024 = await cacheService.getGalleryData('2024');

      expect(cached2023).toEqual(photos2023);
      expect(cached2024).toEqual(photos2024);
    });
  });

  describe('Session Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache user session data', async () => {
      const sessionId = 'session-123';
      const userData = {
        userId: '456',
        email: 'test@example.com',
        isAdmin: false
      };

      const success = await cacheService.cacheUserSession(sessionId, userData);
      expect(success).toBe(true);

      const cached = await cacheService.getUserSession(sessionId);
      expect(cached).toEqual(userData);
    });

    it('should return null for invalid session', async () => {
      const result = await cacheService.getUserSession('invalid-session');
      expect(result).toBeNull();
    });
  });

  describe('Analytics Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache analytics data', async () => {
      const analyticsKey = 'pageviews:2024-01';
      const analyticsData = {
        total: 1000,
        unique: 750,
        pages: ['/tickets', '/gallery', '/about']
      };

      const success = await cacheService.cacheAnalytics(
        analyticsKey,
        analyticsData
      );
      expect(success).toBe(true);

      const cached = await cacheService.getAnalytics(analyticsKey);
      expect(cached).toEqual(analyticsData);
    });
  });

  describe('API Response Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache API response with sorted params', async () => {
      const endpoint = '/api/tickets';
      const method = 'GET';
      const params = { year: '2024', type: 'vip' };
      const response = { success: true, data: [] };

      await cacheService.cacheApiResponse(endpoint, method, params, response);
      const cached = await cacheService.getCachedApiResponse(
        endpoint,
        method,
        params
      );

      expect(cached).toEqual(response);
    });

    it('should create stable cache key regardless of param order', async () => {
      const endpoint = '/api/tickets';
      const method = 'GET';
      const params1 = { year: '2024', type: 'vip' };
      const params2 = { type: 'vip', year: '2024' }; // Different order
      const response = { success: true, data: [] };

      await cacheService.cacheApiResponse(endpoint, method, params1, response);
      const cached = await cacheService.getCachedApiResponse(
        endpoint,
        method,
        params2
      );

      expect(cached).toEqual(response);
    });

    it('should handle API responses with no params', async () => {
      const endpoint = '/api/health';
      const method = 'GET';
      const response = { status: 'ok' };

      await cacheService.cacheApiResponse(endpoint, method, null, response);
      const cached = await cacheService.getCachedApiResponse(
        endpoint,
        method,
        null
      );

      expect(cached).toEqual(response);
    });

    it('should differentiate between different HTTP methods', async () => {
      const endpoint = '/api/tickets';
      const getResponse = { data: 'GET response' };
      const postResponse = { data: 'POST response' };

      await cacheService.cacheApiResponse(endpoint, 'GET', null, getResponse);
      await cacheService.cacheApiResponse(endpoint, 'POST', null, postResponse);

      const cachedGet = await cacheService.getCachedApiResponse(
        endpoint,
        'GET',
        null
      );
      const cachedPost = await cacheService.getCachedApiResponse(
        endpoint,
        'POST',
        null
      );

      expect(cachedGet).toEqual(getResponse);
      expect(cachedPost).toEqual(postResponse);
    });
  });

  describe('Payment Data Caching', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should cache payment data temporarily', async () => {
      const paymentId = 'pay_123';
      const paymentData = {
        amount: 150,
        status: 'pending',
        timestamp: Date.now()
      };

      const success = await cacheService.cachePaymentData(
        paymentId,
        paymentData
      );
      expect(success).toBe(true);

      const cached = await cacheService.getPaymentData(paymentId);
      expect(cached).toEqual(paymentData);
    });
  });

  describe('Counter Operations', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should increment counter from zero', async () => {
      const key = 'test:counter';
      const value = await cacheService.incrementCounter(key);

      expect(value).toBe(1);
    });

    it('should increment counter multiple times', async () => {
      const key = 'test:counter';

      await cacheService.incrementCounter(key);
      await cacheService.incrementCounter(key);
      const value = await cacheService.incrementCounter(key);

      expect(value).toBe(3);
    });

    it('should get counter value', async () => {
      const key = 'test:counter';

      await cacheService.incrementCounter(key);
      await cacheService.incrementCounter(key);

      const value = await cacheService.getCounter(key);
      expect(value).toBe(2);
    });

    it('should return 0 for non-existent counter', async () => {
      const value = await cacheService.getCounter('non:existent:counter');
      expect(value).toBe(0);
    });

    it('should handle custom increment amounts', async () => {
      const key = 'test:counter';
      await cacheService.incrementCounter(key, { amount: 5 });

      const value = await cacheService.getCounter(key);
      expect(value).toBe(5);
    });
  });

  describe('Pattern-Based Invalidation', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should invalidate keys matching pattern', async () => {
      await cacheService.set('tickets:vip', { data: 1 });
      await cacheService.set('tickets:regular', { data: 2 });
      await cacheService.set('gallery:2024', { data: 3 });

      const deleted = await cacheService.invalidatePattern('tickets:*');

      expect(deleted).toBeGreaterThan(0);
      expect(await cacheService.get('tickets:vip')).toBeNull();
      expect(await cacheService.get('tickets:regular')).toBeNull();
      expect(await cacheService.get('gallery:2024')).not.toBeNull();
    });

    it('should invalidate all ticket-related cache', async () => {
      await cacheService.cacheTicketAvailability({ data: 'test' });
      await cacheService.set('tickets:config', { data: 'config' });

      const deleted = await cacheService.invalidateTicketCache();

      expect(deleted).toBeGreaterThan(0);
      expect(await cacheService.getTicketAvailability()).toBeNull();
    });

    it('should invalidate all gallery cache', async () => {
      await cacheService.cacheGalleryData('2024', [{ id: '1' }]);
      await cacheService.cacheGalleryData('2023', [{ id: '2' }]);

      const deleted = await cacheService.invalidateGalleryCache();

      expect(deleted).toBeGreaterThan(0);
      expect(await cacheService.getGalleryData('2024')).toBeNull();
      expect(await cacheService.getGalleryData('2023')).toBeNull();
    });
  });

  describe('Cache Warming', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should warm ticket cache section', async () => {
      await cacheService.warmCache('tickets');

      const availability = await cacheService.getTicketAvailability();
      expect(availability).toBeDefined();
    });

    it('should warm gallery cache section', async () => {
      await cacheService.warmCache('gallery');

      const cache = await cacheService.ensureInitialized();
      const years = await cache.get('gallery:years', { namespace: 'gallery' });
      expect(years).toBeInstanceOf(Array);
    });

    it('should handle unknown cache section', async () => {
      // Should not throw error
      await expect(
        cacheService.warmCache('unknown-section')
      ).resolves.not.toThrow();
    });
  });

  describe('Health Status', () => {
    it('should return not-initialized status before init', async () => {
      const status = await cacheService.getHealthStatus();

      expect(status.status).toBe('not-initialized');
      expect(status.timestamp).toBeDefined();
    });

    it('should return health status after init', async () => {
      await cacheService.init();
      const status = await cacheService.getHealthStatus();

      expect(status.status).toBeDefined();
      expect(status.timestamp).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should return error before initialization', async () => {
      const stats = await cacheService.getStats();

      expect(stats.error).toBeDefined();
    });

    it('should return statistics after initialization', async () => {
      await cacheService.init();
      const stats = await cacheService.getStats();

      expect(stats).toBeDefined();
    });
  });

  describe('Middleware Creation', () => {
    beforeEach(async () => {
      await cacheService.init();
    });

    it('should create cache middleware', () => {
      const middleware = cacheService.createMiddleware();

      expect(middleware).toBeInstanceOf(Function);
    });

    it('should create middleware with custom options', () => {
      const middleware = cacheService.createMiddleware({
        namespace: 'custom',
        type: CACHE_TYPES.STATIC
      });

      expect(middleware).toBeInstanceOf(Function);
    });
  });

  describe('Service Closure', () => {
    it('should close cache service gracefully', async () => {
      await cacheService.init();
      await cacheService.close();

      expect(cacheService.initialized).toBe(false);
    });

    it('should handle close without initialization', async () => {
      await expect(cacheService.close()).resolves.not.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getCacheService', () => {
      const instance1 = getCacheService();
      const instance2 = getCacheService();

      expect(instance1).toBe(instance2);
    });
  });
});
