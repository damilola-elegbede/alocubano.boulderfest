/**
 * RequestManager Coverage Demo Test
 * Demonstrates that Jest coverage collection now works with ES6 modules
 */

import { GalleryRequestManager } from '../../js/gallery/request-manager.js';

describe('RequestManager Coverage Demo', () => {
    test('should import and execute RequestManager to achieve real coverage', () => {
        const config = {
            RATE_LIMIT: {
                MAX_REQUESTS: 3,
                WINDOW_MS: 60000,
                RETRY_DELAY: 1000
            },
            REQUEST_CACHE_DURATION: 300000
        };

        const state = {
            rateLimitTracker: { requests: [] },
            requestCache: new Map(),
            performanceMetrics: { cacheHits: 0, cacheMisses: 0, loadTimes: [] }
        };

        // This actually executes the source code, generating coverage
        const manager = new GalleryRequestManager(config, state);
        
        expect(manager).toBeInstanceOf(GalleryRequestManager);
        expect(manager.config).toBe(config);
        expect(manager.state).toBe(state);

        // Execute methods to increase coverage
        expect(manager.isRateLimited()).toBe(false);
        
        manager.recordRequest();
        expect(state.rateLimitTracker.requests).toHaveLength(1);
        
        manager.clearCache();
        expect(state.requestCache.size).toBe(0);
        
        const stats = manager.getPerformanceStats();
        expect(stats.totalRequests).toBe(0);
        expect(stats.averageLoadTime).toBe(0);
    });
});