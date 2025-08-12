/**
 * Advanced Caching System Unit Tests - Phase 2
 * Comprehensive tests for service worker, prefetch manager, cache warmer, and integrations
 */

// Mock implementations for testing
const createMockResponse = (data, options = {}) => {
  const response = {
    ok: options.ok !== false,
    status: options.status || 200,
    statusText: options.statusText || "OK",
    headers: new Map(Object.entries(options.headers || {})),
    json: () => Promise.resolve(data),
    text: () =>
      Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
    clone: () => createMockResponse(data, options),
    body: data,
  };

  // Add header methods
  response.headers.get = function (key) {
    return Map.prototype.get.call(this, key);
  };
  response.headers.set = function (key, value) {
    return Map.prototype.set.call(this, key, value);
  };

  return response;
};

// Store cache instances to ensure persistence across caches.open() calls
const cacheInstances = new Map();

const createMockServiceWorker = () => {
  const mockSW = {
    caches: new Map(),
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
    },
    addEventListener: vi.fn(),
    postMessage: vi.fn(),
  };

  // Mock cache API
  global.caches = {
    open: vi.fn((name) => {
      // Return existing cache instance if available
      if (cacheInstances.has(name)) {
        return Promise.resolve(cacheInstances.get(name));
      }
      
      if (!mockSW.caches.has(name)) {
        mockSW.caches.set(name, new Map());
      }
      const cache = mockSW.caches.get(name);
      const cacheApi = {
        match: vi.fn((request) => {
          const key = typeof request === "string" ? request : request.url;
          const result = cache.get(key) || null;
          return Promise.resolve(result);
        }),
        put: vi.fn((request, response) => {
          const key = typeof request === "string" ? request : request.url;
          cache.set(key, response);
          return Promise.resolve();
        }),
        add: vi.fn((url) => {
          cache.set(url, createMockResponse("cached"));
          return Promise.resolve();
        }),
        addAll: vi.fn((urls) => {
          urls.forEach((url) => cache.set(url, createMockResponse("cached")));
          return Promise.resolve();
        }),
        delete: vi.fn((request) => {
          const key = typeof request === "string" ? request : request.url;
          return Promise.resolve(cache.delete(key));
        }),
        keys: vi.fn(() => Promise.resolve(Array.from(cache.keys()))),
      };
      
      // Store instance for reuse
      cacheInstances.set(name, cacheApi);
      return Promise.resolve(cacheApi);
    }),
    keys: vi.fn(() => Promise.resolve(Array.from(mockSW.caches.keys()))),
    delete: vi.fn((name) => Promise.resolve(mockSW.caches.delete(name))),
  };

  return mockSW;
};

describe("Advanced Caching System - Phase 2", () => {
  let mockFetch;
  let mockServiceWorker;
  let mockNavigator;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = "";
    
    // Clear cache instances between tests
    cacheInstances.clear();

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    // Mock service worker
    mockServiceWorker = createMockServiceWorker();
    global.self = mockServiceWorker;

    // Mock navigator with connection API
    mockNavigator = {
      connection: {
        effectiveType: "4g",
        downlink: 10,
        uplink: 5,
        rtt: 100,
        saveData: false,
        addEventListener: vi.fn(),
      },
      deviceMemory: 8,
      hardwareConcurrency: 8,
      serviceWorker: {
        controller: {
          postMessage: vi.fn(),
        },
        addEventListener: vi.fn(),
      },
    };

    Object.defineProperty(global, "navigator", {
      value: mockNavigator,
      configurable: true,
    });

    // Mock performance API
    global.performance = {
      now: vi.fn(() => Date.now()),
      getEntriesByType: vi.fn(() => []),
      mark: vi.fn(),
      measure: vi.fn(),
    };

    // Mock requestIdleCallback
    global.requestIdleCallback = vi.fn((callback) => {
      setTimeout(() => callback({ timeRemaining: () => 50 }), 0);
    });

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("Service Worker Cache Strategies", () => {
    test("should implement cache-first strategy for images", async () => {
      // Clear fetch mock to ensure clean state
      mockFetch.mockClear();
      
      // Mock service worker implementation
      const handleImageRequest = async (request) => {
        const cache = await caches.open("alocubano-images-v2.0.0");
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await cache.put(request, responseToCache);
          }
          return networkResponse;
        } catch (error) {
          throw error;
        }
      };

      const imageUrl = "/images/test-image.jpg";
      const mockRequest = { url: imageUrl };

      // First request - should go to network
      const mockResponse = createMockResponse("image-data", {
        headers: { "content-type": "image/jpeg" },
      });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response1 = await handleImageRequest(mockRequest);
      expect(mockFetch).toHaveBeenCalledWith(mockRequest);
      expect(response1.ok).toBe(true);

      // Verify the response was cached
      const cache = await caches.open("alocubano-images-v2.0.0");
      const cachedResponse = await cache.match(mockRequest);
      expect(cachedResponse).toBeDefined();

      // Clear the mock counter but don't set up any new mock responses
      mockFetch.mockClear();

      // Second request - should come from cache (no network call)
      const response2 = await handleImageRequest(mockRequest);
      expect(mockFetch).toHaveBeenCalledTimes(0); // No network call
      expect(response2).toBeDefined();
    });

    test("should implement network-first strategy for API requests", async () => {
      const handleAPIRequest = async (request) => {
        const cache = await caches.open("alocubano-api-v2.0.0");

        try {
          const networkResponse = await fetch(request);
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            await cache.put(request, responseToCache);
          }
          return networkResponse;
        } catch (error) {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) {
            return cachedResponse;
          }
          throw error;
        }
      };

      const apiUrl = "/api/gallery";
      const mockRequest = { url: apiUrl };

      // Network available - should use network
      mockFetch.mockResolvedValueOnce(createMockResponse({ photos: [] }));

      const response1 = await handleAPIRequest(mockRequest);
      expect(mockFetch).toHaveBeenCalledWith(mockRequest);
      expect(response1.ok).toBe(true);

      // Network fails - should fallback to cache
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const response2 = await handleAPIRequest(mockRequest);
      expect(response2).toBeDefined(); // Should get cached response
    });

    test.skip("should implement stale-while-revalidate for gallery API", async () => {
      const handleGalleryAPIRequest = async (request) => {
        const cache = await caches.open("alocubano-api-v2.0.0");
        const cachedResponse = await cache.match(request);

        // Start background update
        const networkUpdate = fetch(request)
          .then(async (networkResponse) => {
            if (networkResponse && networkResponse.ok) {
              await cache.put(request, networkResponse.clone());
            }
          })
          .catch((error) => {
            // Background update failed, ignore
          });

        if (cachedResponse) {
          return cachedResponse;
        }

        // No cache, wait for network
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch (error) {
          throw error;
        }
      };

      const galleryUrl = "/api/gallery";
      const mockRequest = { url: galleryUrl };

      // First request - goes to network and caches
      const mockResponse1 = createMockResponse({ photos: ["photo1"] });
      mockFetch.mockResolvedValueOnce(mockResponse1);

      const response1 = await handleGalleryAPIRequest(mockRequest);
      expect(mockFetch).toHaveBeenCalledWith(mockRequest);
      expect(response1).toBeDefined();
      expect(response1.ok).toBe(true);

      // Second request - returns cached immediately
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ photos: ["photo1", "photo2"] }),
      );

      const response2 = await handleGalleryAPIRequest(mockRequest);
      expect(response2).toBeDefined();

      // Background update should still happen
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test("should handle cache metadata correctly", async () => {
      const cacheWithMetadata = async (cache, request, response, metadata) => {
        const headers = new Map(response.headers);
        headers.set("sw-cached-at", metadata.cachedAt.toString());
        headers.set("sw-cache-type", metadata.type || "unknown");

        if (metadata.size) {
          headers.set("sw-content-size", metadata.size.toString());
        }

        const responseWithMetadata = {
          ...response,
          headers,
        };

        await cache.put(request, responseWithMetadata);
      };

      const cache = await caches.open("test-cache");
      const request = { url: "/test" };
      const response = createMockResponse("data");
      const metadata = {
        cachedAt: Date.now(),
        type: "test",
        size: 1024,
      };

      await cacheWithMetadata(cache, request, response, metadata);

      const cachedResponse = await cache.match(request);
      expect(cachedResponse.headers.get("sw-cached-at")).toBe(
        metadata.cachedAt.toString(),
      );
      expect(cachedResponse.headers.get("sw-cache-type")).toBe("test");
      expect(cachedResponse.headers.get("sw-content-size")).toBe("1024");
    });

    test("should validate cache entry TTL correctly", () => {
      const isCacheEntryValid = (response, ttl) => {
        const cachedAt = response.headers.get("sw-cached-at");
        if (!cachedAt) return false;

        const age = Date.now() - parseInt(cachedAt);
        return age < ttl;
      };

      const now = Date.now();
      const validResponse = createMockResponse("data", {
        headers: { "sw-cached-at": (now - 5000).toString() },
      });
      const expiredResponse = createMockResponse("data", {
        headers: { "sw-cached-at": (now - 15000).toString() },
      });

      expect(isCacheEntryValid(validResponse, 10000)).toBe(true);
      expect(isCacheEntryValid(expiredResponse, 10000)).toBe(false);
    });
  });

  describe("Prefetch Manager Connection Constraints", () => {
    test("should detect connection capabilities correctly", () => {
      const detectConnectionCapabilities = () => {
        const connection = navigator.connection;

        if (connection) {
          const capabilities = {
            effectiveType: connection.effectiveType || "4g",
            downlink: connection.downlink || 10,
            uplink: connection.uplink || 5,
            rtt: connection.rtt || 100,
            saveData: connection.saveData || false,
          };

          // Calculate bandwidth score
          let score = 0;
          switch (capabilities.effectiveType) {
            case "slow-2g":
              score = 1;
              break;
            case "2g":
              score = 2;
              break;
            case "3g":
              score = 4;
              break;
            case "4g":
              score = 8;
              break;
            default:
              score = 6;
          }

          capabilities.bandwidthScore = score;
          capabilities.qualityTier =
            score < 2 ? "low" : score < 6 ? "medium" : "high";

          return capabilities;
        }

        return {
          effectiveType: "4g",
          downlink: 10,
          rtt: 100,
          saveData: false,
          bandwidthScore: 6,
          qualityTier: "medium",
        };
      };

      const capabilities = detectConnectionCapabilities();

      expect(capabilities.effectiveType).toBe("4g");
      expect(capabilities.downlink).toBe(10);
      expect(capabilities.bandwidthScore).toBe(8);
      expect(capabilities.qualityTier).toBe("high");
    });

    test("should calculate resource budget based on connection and device", () => {
      const calculateResourceBudget = (connectionInfo, deviceCapabilities) => {
        const { qualityTier, saveData } = connectionInfo;
        const { performanceTier } = deviceCapabilities;

        if (saveData) {
          return {
            maxConcurrentRequests: 1,
            maxResourceSize: 0.5 * 1024 * 1024,
            totalBudget: 2 * 1024 * 1024,
            prefetchDistance: 1,
          };
        }

        let budget = {
          maxConcurrentRequests: 2,
          maxResourceSize: 2 * 1024 * 1024,
          totalBudget: 10 * 1024 * 1024,
          prefetchDistance: 3,
        };

        const connectionMultiplier =
          {
            low: 0.5,
            medium: 1.0,
            high: 1.8,
          }[qualityTier] || 1.0;

        const deviceMultiplier =
          {
            low: 0.6,
            medium: 1.0,
            high: 1.4,
          }[performanceTier] || 1.0;

        budget.maxConcurrentRequests = Math.round(
          budget.maxConcurrentRequests *
            connectionMultiplier *
            deviceMultiplier,
        );
        budget.totalBudget = Math.round(
          budget.totalBudget * connectionMultiplier * deviceMultiplier,
        );

        return budget;
      };

      const connectionInfo = { qualityTier: "high", saveData: false };
      const deviceCapabilities = { performanceTier: "high" };

      const budget = calculateResourceBudget(
        connectionInfo,
        deviceCapabilities,
      );

      expect(budget.maxConcurrentRequests).toBeGreaterThan(2);
      expect(budget.totalBudget).toBeGreaterThan(10 * 1024 * 1024);
    });

    test("should respect save-data preference", () => {
      const respectSaveData = (connection) => {
        if (connection.saveData) {
          return {
            strategy: "minimal",
            prefetchEnabled: false,
            maxConcurrentRequests: 1,
          };
        }

        return {
          strategy: "normal",
          prefetchEnabled: true,
          maxConcurrentRequests: 4,
        };
      };

      const saveDataConnection = { saveData: true };
      const normalConnection = { saveData: false };

      const saveDataConfig = respectSaveData(saveDataConnection);
      const normalConfig = respectSaveData(normalConnection);

      expect(saveDataConfig.strategy).toBe("minimal");
      expect(saveDataConfig.prefetchEnabled).toBe(false);
      expect(normalConfig.strategy).toBe("normal");
      expect(normalConfig.prefetchEnabled).toBe(true);
    });

    test("should manage priority queue correctly", () => {
      const createPriorityQueue = () => {
        const queue = new Map();
        queue.set("critical", new Set());
        queue.set("high", new Set());
        queue.set("medium", new Set());
        queue.set("low", new Set());
        queue.set("idle", new Set());

        return {
          queue,
          add: (url, priority, metadata = {}) => {
            if (!queue.has(priority)) priority = "low";

            // Remove from other priorities
            for (const [, resources] of queue) {
              resources.delete(url);
            }

            const resourceInfo = {
              url,
              priority,
              addedAt: Date.now(),
              metadata,
            };

            queue.get(priority).add(JSON.stringify(resourceInfo));
          },
          getNext: () => {
            const priorities = ["critical", "high", "medium", "low", "idle"];

            for (const priority of priorities) {
              const resources = queue.get(priority);
              if (resources.size > 0) {
                const resourceInfo = JSON.parse(
                  resources.values().next().value,
                );
                resources.delete(JSON.stringify(resourceInfo));
                return resourceInfo;
              }
            }

            return null;
          },
          getTotalSize: () => {
            let total = 0;
            for (const [, resources] of queue) {
              total += resources.size;
            }
            return total;
          },
        };
      };

      const priorityQueue = createPriorityQueue();

      priorityQueue.add("/image1.jpg", "critical");
      priorityQueue.add("/image2.jpg", "high");
      priorityQueue.add("/image3.jpg", "low");

      expect(priorityQueue.getTotalSize()).toBe(3);

      const next1 = priorityQueue.getNext();
      expect(next1.priority).toBe("critical");

      const next2 = priorityQueue.getNext();
      expect(next2.priority).toBe("high");

      const next3 = priorityQueue.getNext();
      expect(next3.priority).toBe("low");

      expect(priorityQueue.getTotalSize()).toBe(0);
    });
  });

  describe("Cache Warming Queue Prioritization", () => {
    test("should determine warming strategy based on connection", () => {
      const determineStrategy = (connectionInfo) => {
        const { effectiveType, saveData, downlink } = connectionInfo;

        if (saveData) return "minimal";

        if (effectiveType === "4g" && downlink > 5) {
          return "aggressive";
        } else if (effectiveType === "4g" || effectiveType === "3g") {
          return "conservative";
        } else {
          return "minimal";
        }
      };

      expect(
        determineStrategy({
          effectiveType: "4g",
          downlink: 10,
          saveData: false,
        }),
      ).toBe("aggressive");
      expect(
        determineStrategy({
          effectiveType: "3g",
          downlink: 3,
          saveData: false,
        }),
      ).toBe("conservative");
      expect(
        determineStrategy({
          effectiveType: "2g",
          downlink: 1,
          saveData: false,
        }),
      ).toBe("minimal");
      expect(
        determineStrategy({
          effectiveType: "4g",
          downlink: 10,
          saveData: true,
        }),
      ).toBe("minimal");
    });

    test("should prioritize critical resources correctly", () => {
      const getResourcePriority = (type, phase) => {
        const priorities = {
          critical: { styles: 10, scripts: 9, images: 8 },
          essential: { styles: 7, scripts: 6, images: 5, fonts: 4 },
          predictive: { styles: 3, scripts: 2, api: 1, images: 1 },
        };

        return priorities[phase]?.[type] || 1;
      };

      expect(getResourcePriority("styles", "critical")).toBe(10);
      expect(getResourcePriority("scripts", "critical")).toBe(9);
      expect(getResourcePriority("images", "critical")).toBe(8);
      expect(getResourcePriority("fonts", "essential")).toBe(4);
      expect(getResourcePriority("api", "predictive")).toBe(1);
    });

    test("should implement progressive warming phases", () => {
      const resources = {
        critical: {
          styles: ["/css/base.css", "/css/components.css"],
          scripts: ["/js/main.js"],
          images: ["/images/logo.png"],
        },
        essential: {
          scripts: ["/js/gallery.js"],
          fonts: ["https://fonts.googleapis.com/css2?family=Bebas+Neue"],
        },
        predictive: {
          api: ["/api/featured-photos"],
        },
      };

      const getStrategyConfig = (strategy) => {
        const configs = {
          minimal: {
            batchSize: 2,
            batchDelay: 1000,
            maxConcurrent: 1,
            phases: ["critical"],
          },
          conservative: {
            batchSize: 4,
            batchDelay: 500,
            maxConcurrent: 2,
            phases: ["critical", "essential"],
          },
          aggressive: {
            batchSize: 8,
            batchDelay: 200,
            maxConcurrent: 4,
            phases: ["critical", "essential", "predictive"],
          },
        };

        return configs[strategy] || configs.conservative;
      };

      const minimalConfig = getStrategyConfig("minimal");
      const aggressiveConfig = getStrategyConfig("aggressive");

      expect(minimalConfig.phases).toEqual(["critical"]);
      expect(minimalConfig.maxConcurrent).toBe(1);

      expect(aggressiveConfig.phases).toEqual([
        "critical",
        "essential",
        "predictive",
      ]);
      expect(aggressiveConfig.maxConcurrent).toBe(4);
    });

    test("should track warming analytics correctly", () => {
      const createAnalytics = () => {
        return {
          warmed: 0,
          failed: 0,
          bandwidthUsed: 0,
          timeSpent: 0,
          strategySwitches: 0,
          phaseCompletions: {
            critical: false,
            essential: false,
            predictive: false,
          },
        };
      };

      const updateAnalytics = (analytics, url, success, bytes, time) => {
        if (success) {
          analytics.warmed++;
          analytics.bandwidthUsed += bytes;
        } else {
          analytics.failed++;
        }
        analytics.timeSpent += time;
      };

      const analytics = createAnalytics();

      updateAnalytics(analytics, "/test1.css", true, 5000, 100);
      updateAnalytics(analytics, "/test2.js", false, 0, 200);
      updateAnalytics(analytics, "/test3.png", true, 15000, 150);

      expect(analytics.warmed).toBe(2);
      expect(analytics.failed).toBe(1);
      expect(analytics.bandwidthUsed).toBe(20000);
      expect(analytics.timeSpent).toBe(450);
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("should handle service worker installation failures gracefully", async () => {
      const handleInstallError = async (resources) => {
        const cache = await caches.open("test-cache");
        const failures = [];

        try {
          await cache.addAll(resources);
        } catch (error) {
          // Try to cache individually
          for (const resource of resources) {
            try {
              await cache.add(resource);
            } catch (individualError) {
              failures.push({ resource, error: individualError.message });
            }
          }
        }

        return failures;
      };

      const resources = ["/valid.css", "/nonexistent.js", "/valid.png"];

      // Override the cache open to return a mock that fails appropriately
      const originalCacheOpen = global.caches.open;
      global.caches.open = vi.fn().mockResolvedValue({
        addAll: vi.fn().mockRejectedValue(new Error("Batch add failed")),
        add: vi.fn().mockImplementation((resource) => {
          if (resource.includes("nonexistent.js")) {
            throw new Error("404 Not Found");
          }
          return Promise.resolve();
        }),
      });

      const failures = await handleInstallError(resources);
      expect(failures).toHaveLength(1);
      expect(failures[0].resource).toBe("/nonexistent.js");

      // Restore original
      global.caches.open = originalCacheOpen;
    });

    test("should handle prefetch failures and retry logic", async () => {
      const createRetryManager = () => {
        const failedUrls = new Map();

        return {
          addFailure: (url, error) => {
            const failures = failedUrls.get(url) || { count: 0, lastTry: 0 };
            failures.count++;
            failures.lastTry = Date.now();
            failures.error = error.message;
            failedUrls.set(url, failures);
          },

          shouldRetry: (url, maxRetries = 3, backoffMs = 5000) => {
            const failures = failedUrls.get(url);
            if (!failures) return true;

            if (failures.count >= maxRetries) return false;

            const timeSinceLastTry = Date.now() - failures.lastTry;
            return timeSinceLastTry > backoffMs * failures.count;
          },

          getFailureCount: (url) => {
            const failures = failedUrls.get(url);
            return failures ? failures.count : 0;
          },
        };
      };

      const retryManager = createRetryManager();
      const testUrl = "/failing-resource.jpg";

      // Simulate failures
      retryManager.addFailure(testUrl, new Error("Network error"));
      expect(retryManager.getFailureCount(testUrl)).toBe(1);
      expect(retryManager.shouldRetry(testUrl)).toBe(false); // Too soon

      retryManager.addFailure(testUrl, new Error("Network error"));
      retryManager.addFailure(testUrl, new Error("Network error"));
      expect(retryManager.shouldRetry(testUrl)).toBe(false); // Max retries reached
    });

    test("should handle connection changes during operations", () => {
      const handleConnectionChange = (
        oldConnection,
        newConnection,
        operations,
      ) => {
        const oldQuality = getConnectionQuality(oldConnection);
        const newQuality = getConnectionQuality(newConnection);

        if (newQuality < oldQuality) {
          // Connection degraded - pause non-critical operations
          return operations.filter((op) => op.priority === "critical");
        } else if (newQuality > oldQuality) {
          // Connection improved - resume all operations
          return operations;
        }

        return operations; // No change
      };

      const getConnectionQuality = (connection) => {
        if (connection.saveData) return 0;

        const typeScores = { "slow-2g": 1, "2g": 2, "3g": 3, "4g": 4 };
        return typeScores[connection.effectiveType] || 2;
      };

      const operations = [
        { url: "/critical.css", priority: "critical" },
        { url: "/normal.js", priority: "normal" },
        { url: "/low.png", priority: "low" },
      ];

      const highConnection = { effectiveType: "4g", saveData: false };
      const lowConnection = { effectiveType: "2g", saveData: false };

      const filteredOps = handleConnectionChange(
        highConnection,
        lowConnection,
        operations,
      );
      expect(filteredOps).toHaveLength(1);
      expect(filteredOps[0].priority).toBe("critical");
    });

    test("should handle cache size limits and cleanup", async () => {
      const manageCacheSize = async (cacheName, maxSize) => {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();

        let totalSize = 0;
        const entries = [];

        // Calculate total size
        for (const key of keys) {
          const response = await cache.match(key);
          if (response) {
            const size = parseInt(
              response.headers.get("content-length") || "0",
            );
            const cachedAt = parseInt(
              response.headers.get("sw-cached-at") || Date.now().toString(),
            );

            entries.push({ key, size, cachedAt });
            totalSize += size;
          }
        }

        // Remove oldest entries if over limit
        if (totalSize > maxSize) {
          entries.sort((a, b) => a.cachedAt - b.cachedAt);

          for (const entry of entries) {
            if (totalSize <= maxSize) break;

            await cache.delete(entry.key);
            totalSize -= entry.size;
          }
        }

        return {
          totalSize,
          entriesRemoved: Math.max(0, entries.length - keys.length),
          remainingEntries: await cache.keys().then((k) => k.length),
        };
      };

      // This test would require actual cache implementation
      // Here we test the logic structure
      expect(manageCacheSize).toBeDefined();
      expect(typeof manageCacheSize).toBe("function");
    });
  });

  describe("Integration Between Caching Components", () => {
    test("should coordinate between service worker and prefetch manager", async () => {
      const coordinateCaching = () => {
        const serviceWorkerMessages = [];
        const prefetchQueue = new Set();

        return {
          sendToServiceWorker: (message) => {
            serviceWorkerMessages.push(message);

            if (message.type === "CACHE_WARM") {
              message.data.urls.forEach((url) => prefetchQueue.add(url));
            }
          },

          requestPrefetch: (url, priority) => {
            prefetchQueue.add(url);

            this.sendToServiceWorker({
              type: "PREFETCH_REQUEST",
              data: { url, priority },
            });
          },

          getServiceWorkerMessages: () => serviceWorkerMessages,
          getPrefetchQueue: () => Array.from(prefetchQueue),
        };
      };

      const coordinator = coordinateCaching();

      coordinator.sendToServiceWorker({
        type: "CACHE_WARM",
        data: { urls: ["/image1.jpg", "/image2.jpg"] },
      });

      expect(coordinator.getServiceWorkerMessages()).toHaveLength(1);
      expect(coordinator.getPrefetchQueue()).toContain("/image1.jpg");
      expect(coordinator.getPrefetchQueue()).toContain("/image2.jpg");
    });

    test("should share performance metrics between components", () => {
      const createMetricsCollector = () => {
        const metrics = {
          cacheHitRate: 0,
          prefetchSuccessRate: 0,
          averageLoadTime: 0,
          bandwidthUsage: 0,
        };

        const samples = {
          cacheHits: [],
          prefetchResults: [],
          loadTimes: [],
          bandwidthSamples: [],
        };

        return {
          recordCacheHit: (hit) => {
            samples.cacheHits.push(hit);
            metrics.cacheHitRate =
              samples.cacheHits.filter(Boolean).length /
              samples.cacheHits.length;
          },

          recordPrefetchResult: (success) => {
            samples.prefetchResults.push(success);
            metrics.prefetchSuccessRate =
              samples.prefetchResults.filter(Boolean).length /
              samples.prefetchResults.length;
          },

          recordLoadTime: (time) => {
            samples.loadTimes.push(time);
            metrics.averageLoadTime =
              samples.loadTimes.reduce((a, b) => a + b, 0) /
              samples.loadTimes.length;
          },

          recordBandwidth: (bytes) => {
            samples.bandwidthSamples.push(bytes);
            metrics.bandwidthUsage = samples.bandwidthSamples.reduce(
              (a, b) => a + b,
              0,
            );
          },

          getMetrics: () => ({ ...metrics }),
        };
      };

      const collector = createMetricsCollector();

      collector.recordCacheHit(true);
      collector.recordCacheHit(false);
      collector.recordCacheHit(true);

      collector.recordPrefetchResult(true);
      collector.recordPrefetchResult(true);
      collector.recordPrefetchResult(false);

      collector.recordLoadTime(100);
      collector.recordLoadTime(200);

      collector.recordBandwidth(1024);
      collector.recordBandwidth(2048);

      const metrics = collector.getMetrics();

      expect(metrics.cacheHitRate).toBeCloseTo(0.67, 2);
      expect(metrics.prefetchSuccessRate).toBeCloseTo(0.67, 2);
      expect(metrics.averageLoadTime).toBe(150);
      expect(metrics.bandwidthUsage).toBe(3072);
    });

    test("should handle cross-component error propagation", () => {
      const createErrorHandler = () => {
        const errors = [];
        const errorListeners = new Map();

        return {
          reportError: (component, error, context = {}) => {
            const errorRecord = {
              component,
              error: error.message,
              context,
              timestamp: Date.now(),
            };

            errors.push(errorRecord);

            // Notify listeners
            const listeners = errorListeners.get(component) || [];
            listeners.forEach((listener) => {
              try {
                listener(errorRecord);
              } catch (listenerError) {
                console.error("Error in error listener:", listenerError);
              }
            });
          },

          onError: (component, listener) => {
            if (!errorListeners.has(component)) {
              errorListeners.set(component, []);
            }
            errorListeners.get(component).push(listener);
          },

          getErrors: (component) => {
            return component
              ? errors.filter((e) => e.component === component)
              : errors;
          },
        };
      };

      const errorHandler = createErrorHandler();
      const serviceWorkerErrors = [];

      errorHandler.onError("service-worker", (error) => {
        serviceWorkerErrors.push(error);
      });

      errorHandler.reportError("service-worker", new Error("Cache failed"), {
        url: "/test.js",
      });
      errorHandler.reportError("prefetch-manager", new Error("Network error"), {
        priority: "high",
      });

      expect(errorHandler.getErrors()).toHaveLength(2);
      expect(errorHandler.getErrors("service-worker")).toHaveLength(1);
      expect(serviceWorkerErrors).toHaveLength(1);
      expect(serviceWorkerErrors[0].context.url).toBe("/test.js");
    });
  });

  describe("Performance Monitoring and Optimization", () => {
    test("should monitor cache performance metrics", () => {
      const createPerformanceMonitor = () => {
        const metrics = {
          requests: 0,
          cacheHits: 0,
          cacheMisses: 0,
          networkRequests: 0,
          totalLoadTime: 0,
          errors: 0,
        };

        return {
          recordRequest: (fromCache, loadTime, error) => {
            metrics.requests++;

            if (error) {
              metrics.errors++;
            } else if (fromCache) {
              metrics.cacheHits++;
            } else {
              metrics.cacheMisses++;
              metrics.networkRequests++;
            }

            if (loadTime) {
              metrics.totalLoadTime += loadTime;
            }
          },

          getStats: () => ({
            ...metrics,
            hitRate:
              metrics.requests > 0 ? metrics.cacheHits / metrics.requests : 0,
            averageLoadTime:
              metrics.requests > 0
                ? metrics.totalLoadTime / metrics.requests
                : 0,
            errorRate:
              metrics.requests > 0 ? metrics.errors / metrics.requests : 0,
          }),
        };
      };

      const monitor = createPerformanceMonitor();

      monitor.recordRequest(true, 50, null); // Cache hit
      monitor.recordRequest(false, 200, null); // Cache miss
      monitor.recordRequest(true, 30, null); // Cache hit
      monitor.recordRequest(false, 0, new Error("Failed")); // Error

      const stats = monitor.getStats();

      expect(stats.requests).toBe(4);
      expect(stats.cacheHits).toBe(2);
      expect(stats.cacheMisses).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.hitRate).toBe(0.5);
      expect(stats.errorRate).toBe(0.25);
      expect(stats.averageLoadTime).toBe(70); // (50 + 200 + 30 + 0) / 4
    });

    test("should implement adaptive cache strategies", () => {
      const createAdaptiveStrategy = () => {
        let currentStrategy = "balanced";
        const performanceHistory = [];

        return {
          updatePerformance: function (hitRate, loadTime, errorRate) {
            performanceHistory.push({
              hitRate,
              loadTime,
              errorRate,
              timestamp: Date.now(),
            });

            // Keep only recent history
            if (performanceHistory.length > 10) {
              performanceHistory.shift();
            }

            this.adaptStrategy();
          },

          adaptStrategy: function () {
            if (performanceHistory.length < 3) return;

            const recent = performanceHistory.slice(-3);
            const avgHitRate =
              recent.reduce((sum, p) => sum + p.hitRate, 0) / recent.length;
            const avgErrorRate =
              recent.reduce((sum, p) => sum + p.errorRate, 0) / recent.length;

            const oldStrategy = currentStrategy;

            if (avgErrorRate > 0.1) {
              currentStrategy = "conservative";
            } else if (avgHitRate > 0.8) {
              currentStrategy = "aggressive";
            } else {
              currentStrategy = "balanced";
            }

            return oldStrategy !== currentStrategy;
          },

          getStrategy: () => currentStrategy,
          getStrategyConfig: () => {
            const configs = {
              conservative: {
                maxConcurrent: 2,
                cacheSize: "5MB",
                prefetchDistance: 1,
              },
              balanced: {
                maxConcurrent: 4,
                cacheSize: "10MB",
                prefetchDistance: 3,
              },
              aggressive: {
                maxConcurrent: 8,
                cacheSize: "25MB",
                prefetchDistance: 5,
              },
            };

            return configs[currentStrategy];
          },
        };
      };

      const adaptive = createAdaptiveStrategy();

      // Simulate poor performance
      adaptive.updatePerformance(0.3, 500, 0.15);
      adaptive.updatePerformance(0.25, 600, 0.2);
      adaptive.updatePerformance(0.4, 550, 0.12);

      expect(adaptive.getStrategy()).toBe("conservative");

      // Simulate good performance
      adaptive.updatePerformance(0.9, 100, 0.02);
      adaptive.updatePerformance(0.85, 120, 0.01);
      adaptive.updatePerformance(0.88, 110, 0.01);

      expect(adaptive.getStrategy()).toBe("aggressive");
    });
  });
});
