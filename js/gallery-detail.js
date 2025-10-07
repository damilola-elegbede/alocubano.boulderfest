// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2025-07-22-PERFORMANCE-OPTIMIZED
(function() {
    // Import performance optimization modules
    let prefetchManager = null;
    let progressiveLoader = null;
    let cacheWarmer = null;

    // Initialize performance modules when available
    function initPerformanceModules() {
        try {
            if (typeof PrefetchManager !== 'undefined') {
                prefetchManager = new PrefetchManager();
                console.log('[Gallery] Prefetch manager initialized');
            }

            if (typeof ProgressiveImageLoader !== 'undefined') {
                progressiveLoader = new ProgressiveImageLoader();
                console.log('[Gallery] Progressive loader initialized');
            }

            if (typeof CacheWarmer !== 'undefined') {
                cacheWarmer = new CacheWarmer();
                console.log('[Gallery] Cache warmer initialized');
            }
        } catch (error) {
            console.warn(
                '[Gallery] Performance modules failed to initialize:',
                error
            );
        }
    }

    // Configuration with enhanced performance settings
    const CONFIG = {
        API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
        CACHE_KEY: 'gallery_cache',
        CACHE_DURATION: 3600000, // 1 hour in milliseconds
        LOADING_TIMEOUT: 10000, // 10 seconds for initial load
        PAGINATION_SIZE: 20, // Load 20 photos at a time
        LAZY_LOAD_THRESHOLD: '200px', // Start loading when 200px away from viewport
        RATE_LIMIT: {
            MAX_REQUESTS: 10, // Maximum requests per window
            WINDOW_MS: 60000, // Rate limit window in milliseconds (1 minute)
            RETRY_DELAY: 2000 // Base retry delay in milliseconds
        },
        REQUEST_CACHE_DURATION: 300000, // Cache API requests for 5 minutes
        STATE_VERSION: 2 // Current state version for migrations
    };

    // Gallery state with improved concurrency control and performance tracking
    const state = {
        loadingMutex: false, // Mutex to prevent concurrent loading operations
        galleryData: null,
        currentLightboxIndex: -1,
        lightboxItems: [],
        lightboxCategories: [], // Track category for each item
        loadedPages: 0,
        hasMorePages: true,
        lazyObserver: null,
        allCategories: {},
        categoryCounts: {}, // Store counts per category
        loadedItemIds: new Set(), // Track loaded items to prevent duplicates
        displayedItemIds: new Set(), // Items actually shown in DOM
        observedSentinels: new Set(), // Track intersection observer sentinels
        requestCache: new Map(), // Cache for API requests
        totalItemsAvailable: 0, // Total items in the dataset
        itemsDisplayed: 0, // Count of items actually displayed
        hasCompleteDataset: false, // Flag indicating we have all data
        // New state for sequential category-aware pagination
        workshopOffset: 0, // Current position in workshops array
        socialOffset: 0, // Current position in socials array
        // Image preloading optimization
        preloadedImages: new Set(), // Track preloaded images to avoid duplicates
        preloadQueue: [], // Queue for managing preloads
        workshopTotal: 0, // Total workshop items available
        socialTotal: 0, // Total social items available
        currentCategory: 'workshops', // Which category we're currently loading
        displayOrder: [], // Array tracking display order for lightbox
        failedImages: [], // Track failed image loads for retry
        successfulImages: new Set(), // Track successfully loaded images to avoid re-retrying
        rateLimitTracker: {
            requests: [],
            isBlocked: false
        },
        performanceMetrics: {
            loadTimes: [],
            cacheHits: 0,
            cacheMisses: 0
        },
        categoryItemCounts: {
            workshops: 0,
            socials: 0
        }
    };

    // Reset gallery state to initial values
    function resetGalleryState() {
        state.loadingMutex = false;
        state.galleryData = null;
        state.currentLightboxIndex = -1;
        state.lightboxItems = [];
        state.lightboxCategories = [];
        state.loadedPages = 0;
        state.hasMorePages = true;
        state.allCategories = {};
        state.categoryCounts = {};
        state.loadedItemIds = new Set();
        state.displayedItemIds = new Set();
        state.observedSentinels = new Set();
        state.totalItemsAvailable = 0;
        state.itemsDisplayed = 0;
        state.hasCompleteDataset = false;
        state.workshopOffset = 0;
        state.socialOffset = 0;
        state.workshopTotal = 0;
        state.socialTotal = 0;
        state.displayOrder = [];
        state.failedImages = [];
        state.successfulImages = new Set();
        state.categoryItemCounts = { workshops: 0, socials: 0 };
        state.timestamp = null;
        state.restoredFromCache = false;

        console.log('🔄 Gallery state reset to initial values');
    }

    // State persistence functions
    function saveState() {
        try {
            const event = getEventFromPage();
            const stateKey = `gallery_${event}_state`;

            const persistedState = {
                version: CONFIG.STATE_VERSION, // Add version for future migrations
                timestamp: Date.now(),
                allCategories: state.allCategories,
                categoryCounts: state.categoryCounts,
                workshopOffset: state.workshopOffset,
                socialOffset: state.socialOffset,
                workshopTotal: state.workshopTotal,
                socialTotal: state.socialTotal,
                totalItemsAvailable: state.totalItemsAvailable,
                itemsDisplayed: state.itemsDisplayed,
                hasCompleteDataset: state.hasCompleteDataset,
                hasMorePages: state.hasMorePages,
                loadedPages: state.loadedPages,
                displayOrder: state.displayOrder,
                loadedItemIds: Array.from(state.loadedItemIds),
                displayedItemIds: Array.from(state.displayedItemIds),
                failedImages: state.failedImages,
                successfulImages: Array.from(state.successfulImages),
                categoryItemCounts: state.categoryItemCounts
            };

            sessionStorage.setItem(stateKey, JSON.stringify(persistedState));
            console.log('💾 Gallery state saved to sessionStorage');
        } catch (error) {
            console.error('Failed to save gallery state:', error);
        }
    }

    // Migrate state from older versions
    function migrateState(state, fromVersion) {
    // Migration from v1 to v2
        if (fromVersion === 1) {
            // v2 adds better duplicate tracking and cache indicators
            // Ensure all required fields exist
            state.version = 2;
            state.restoredFromCache = state.restoredFromCache || false;
            state.categoryItemCounts = state.categoryItemCounts || {
                workshops: 0,
                socials: 0
            };

            // Ensure displayOrder items have categoryIndex
            if (state.displayOrder && Array.isArray(state.displayOrder)) {
                const categoryCounters = { workshops: 0, socials: 0 };
                state.displayOrder.forEach((item) => {
                    if (item.categoryIndex === undefined && item.category) {
                        item.categoryIndex = categoryCounters[item.category] || 0;
                        categoryCounters[item.category]++;
                    }
                });
            }

            console.log('✅ State migrated from v1 to v2');
        }

    // Future migrations can be added here
    // if (fromVersion === 2) { ... migrate to v3 ... }
    }

    function restoreState() {
        try {
            const event = getEventFromPage();
            const stateKey = `gallery_${event}_state`;
            const savedState = sessionStorage.getItem(stateKey);

            if (!savedState) {
                console.log('No saved state found');
                return false;
            }

            const persistedState = JSON.parse(savedState);

            // Check version compatibility
            const stateVersion = persistedState.version || 1; // Default to v1 for old states
            if (stateVersion > CONFIG.STATE_VERSION) {
                console.warn(
                    `⚠️ State version ${stateVersion} is newer than current version ${CONFIG.STATE_VERSION}`
                );
                sessionStorage.removeItem(stateKey);
                return false;
            }

            // Migrate old state formats if needed
            if (stateVersion < CONFIG.STATE_VERSION) {
                console.log(
                    `🔄 Migrating state from version ${stateVersion} to ${CONFIG.STATE_VERSION}`
                );
                migrateState(persistedState, stateVersion);
            }

            // Store timestamp in state for later freshness checks
            state.timestamp = persistedState.timestamp;

            // Check if state is still valid (30 minutes expiry)
            const age = Date.now() - persistedState.timestamp;
            if (age > 30 * 60 * 1000) {
                console.log('⏰ Saved state expired, clearing...');
                sessionStorage.removeItem(stateKey);
                return false;
            }

            // Restore state properties
            state.allCategories = persistedState.allCategories;
            state.categoryCounts = persistedState.categoryCounts;
            state.workshopOffset = persistedState.workshopOffset;
            state.socialOffset = persistedState.socialOffset;
            state.workshopTotal = persistedState.workshopTotal;
            state.socialTotal = persistedState.socialTotal;
            state.totalItemsAvailable = persistedState.totalItemsAvailable;
            state.itemsDisplayed = persistedState.itemsDisplayed;
            state.hasCompleteDataset = persistedState.hasCompleteDataset;
            state.hasMorePages = persistedState.hasMorePages;
            state.loadedPages = persistedState.loadedPages;
            state.displayOrder = persistedState.displayOrder;
            state.loadedItemIds = new Set(persistedState.loadedItemIds);
            state.displayedItemIds = new Set(persistedState.displayedItemIds);
            state.failedImages = persistedState.failedImages || [];
            state.successfulImages = new Set(persistedState.successfulImages || []);
            state.categoryItemCounts = persistedState.categoryItemCounts || {
                workshops: 0,
                socials: 0
            };

            console.log('✅ Gallery state restored from sessionStorage', {
                itemsDisplayed: state.itemsDisplayed,
                loadedPages: state.loadedPages,
                hasMorePages: state.hasMorePages
            });

            return true;
        } catch (error) {
            console.error('Failed to restore gallery state:', error);
            return false;
        }
    }

    async function restoreDOM() {
        const contentEl = document.getElementById('gallery-detail-content');
        const loadingEl = document.getElementById('gallery-detail-loading');
        const staticEl = document.getElementById('gallery-detail-static');

        if (!contentEl || state.displayOrder.length === 0) {
            return;
        }

        console.log('🔄 Restoring DOM from saved state...');

        // Hide loading and show content
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
        if (staticEl) {
            staticEl.style.display = 'none';
        }
        contentEl.style.display = 'block';

        // Don't clear displayedItemIds - we need to check against existing items
        // Instead, we'll verify what's actually in the DOM
        const existingItems = new Set();
        document.querySelectorAll('.gallery-item').forEach((item) => {
            const category = item.dataset.category;
            const imgSrc =
        item.querySelector('img')?.src ||
        item.querySelector('img')?.dataset.src;
            if (imgSrc) {
                // Extract ID from image source
                const match = imgSrc.match(/\/([^\/]+)$/);
                if (match) {
                    const id = match[1];
                    existingItems.add(`${category}_${id}`);
                }
            }
        });

        // Group items by category
        const categorizedItems = {
            workshops: [],
            socials: []
        };

        // Reset category counters based on the highest index in displayOrder
        state.categoryItemCounts = {
            workshops: 0,
            socials: 0
        };

        // Filter out items that already exist in DOM
        let restoredCount = 0;
        let skippedCount = 0;

        state.displayOrder.forEach((item) => {
            const itemKey = `${item.category}_${item.id}`;

            // Skip if item already exists in DOM
            if (existingItems.has(itemKey)) {
                skippedCount++;
                console.log(`⏭️ Skipping already displayed item: ${itemKey}`);
                return;
            }

            restoredCount++;
            if (item.category === 'workshops') {
                categorizedItems.workshops.push(item);
                // Update counter to the highest categoryIndex + 1
                if (item.categoryIndex !== undefined) {
                    state.categoryItemCounts.workshops = Math.max(
                        state.categoryItemCounts.workshops,
                        item.categoryIndex + 1
                    );
                }
            } else if (item.category === 'socials') {
                categorizedItems.socials.push(item);
                // Update counter to the highest categoryIndex + 1
                if (item.categoryIndex !== undefined) {
                    state.categoryItemCounts.socials = Math.max(
                        state.categoryItemCounts.socials,
                        item.categoryIndex + 1
                    );
                }
            }
        });

        console.log(
            `📊 Restoration summary: ${restoredCount} items restored, ${skippedCount} items skipped (already displayed)`
        );

        // Restore workshops section
        const workshopsSection = document.getElementById('workshops-section');
        const workshopsGallery = document.getElementById('workshops-gallery');
        if (
            workshopsSection &&
      workshopsGallery &&
      categorizedItems.workshops.length > 0
        ) {
            workshopsSection.style.display = 'block';
            await insertItemsProgressively(
                categorizedItems.workshops,
                workshopsGallery,
                'workshops',
                0,
                false
            );
        }

        // Restore socials section
        const socialsSection = document.getElementById('socials-section');
        const socialsGallery = document.getElementById('socials-gallery');
        if (
            socialsSection &&
      socialsGallery &&
      categorizedItems.socials.length > 0
        ) {
            socialsSection.style.display = 'block';
            await insertItemsProgressively(
                categorizedItems.socials,
                socialsGallery,
                'socials',
                categorizedItems.workshops.length,
                false
            );
        }

        // First, set up click handlers for all items (but keep them as data-loaded="false")
        const items = contentEl.querySelectorAll(
            '.gallery-item:not([data-handler-loaded="true"])'
        );
        items.forEach((item) => {
            setupGalleryItemHandlers(item, { categories: categorizedItems });
            // Eager loading enabled - images already have src set
            item.setAttribute('data-handler-loaded', 'true');
        });

        // Lazy loading disabled - thumbnails load eagerly
        // observeLazyItems();

        // Restore lightbox state
        state.lightboxItems = state.displayOrder;
        state.lightboxCategories = state.displayOrder.map((item) => item.category);

        console.log('✅ DOM restored successfully');

        // Re-setup infinite scroll if needed
        if (state.hasMorePages) {
            const year = getYearFromPage();
            setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
        }

        // Aggressively preload first 10 full images after restoration
        setTimeout(() => {
            preloadInitialFullImages(10);
        }, 100);

        // After DOM is restored, check for failed images and retry them
        // Filter out images that were already successfully loaded
        const imagesToRetry = state.failedImages.filter(
            (src) => !state.successfulImages.has(src)
        );
        if (imagesToRetry.length > 0) {
            console.log(
                `🔄 Found ${imagesToRetry.length} failed images from previous session, retrying...`
            );

            // Wait a bit for LazyLoader to be fully initialized
            setTimeout(() => {
                // Access the global LazyLoader instance
                const lazyLoader = window.galleryLazyLoader || state.lazyObserver;

                if (
                    lazyLoader &&
          typeof lazyLoader.retryAllFailedImages === 'function'
                ) {
                    console.log('♻️ Retrying all failed images from previous session');
                    lazyLoader.retryAllFailedImages();
                } else {
                    console.warn('LazyLoader retry functionality not available');

                    // Eager loading: images load immediately, no need to retry via lazy loading
                    // Failed images will show broken image icon and can be retried via browser reload
                }
            }, 500); // Small delay to ensure LazyLoader is ready
        }
    }

    // Sequential loading algorithm for category-aware pagination
    function getNextPageItems(allCategories, pageSize = 20) {
        const items = [];
        let remainingSpace = pageSize;

        // First, fill with workshops if any remain
        if (state.workshopOffset < state.workshopTotal && remainingSpace > 0) {
            const workshopItems = allCategories.workshops.slice(
                state.workshopOffset,
                state.workshopOffset + remainingSpace
            );

            items.push(
                ...workshopItems.map((item) => ({ ...item, category: 'workshops' }))
            );
            state.workshopOffset += workshopItems.length;
            remainingSpace -= workshopItems.length;
        }

        // Then, fill remaining space with socials
        if (state.socialOffset < state.socialTotal && remainingSpace > 0) {
            const socialItems = allCategories.socials.slice(
                state.socialOffset,
                state.socialOffset + remainingSpace
            );
            items.push(
                ...socialItems.map((item) => ({ ...item, category: 'socials' }))
            );
            state.socialOffset += socialItems.length;
        }

        // Update completion state
        state.hasMorePages =
      state.workshopOffset < state.workshopTotal ||
      state.socialOffset < state.socialTotal;

        return items;
    }

    // Update loading state and manage sentinel/completion message
    function updateLoadingState() {
        const sentinel = document.getElementById('load-more-sentinel');

        if (!state.hasMorePages) {
            // Remove sentinel immediately
            if (sentinel) {
                sentinel.remove();
                state.observedSentinels.delete('load-more-sentinel');
            }

            // Show completion message
            showCompletionMessage();
        }
    }

    // Show completion message when all items are loaded
    function showCompletionMessage() {
    // Completion message disabled - no longer showing "All photos loaded"
    // Remove any existing completion message
        const existing = document.getElementById('gallery-completion-message');
        if (existing) {
            existing.remove();
        }

        // The following code has been commented out to remove the completion message
    /*
    const completionMessage = document.createElement('div');
    completionMessage.id = 'gallery-completion-message';
    completionMessage.innerHTML = `
      <div class="completion-message">
        ✅ All ${state.totalItemsAvailable} photos loaded
      </div>
    `;
    completionMessage.style.cssText = 'text-align: center; padding: 2rem 0; color: #666; font-style: italic;';

    const galleryStats = document.querySelector('.gallery-stats');
    if (galleryStats) {
      galleryStats.parentNode.insertBefore(completionMessage, galleryStats);
    } else {
      document.querySelector('main').appendChild(completionMessage);
    }
    */
    }

    // Rate limiting and request caching utilities
    const RequestManager = {
        isRateLimited() {
            const now = Date.now();
            const windowStart = now - CONFIG.RATE_LIMIT.WINDOW_MS;

            // Clean old requests
            state.rateLimitTracker.requests = state.rateLimitTracker.requests.filter(
                (timestamp) => timestamp > windowStart
            );

            return (
                state.rateLimitTracker.requests.length >= CONFIG.RATE_LIMIT.MAX_REQUESTS
            );
        },

        recordRequest() {
            state.rateLimitTracker.requests.push(Date.now());
        },

        async cachedFetch(url, options = {}) {
            const cacheKey = `${url}:${JSON.stringify(options)}`;
            const cached = state.requestCache.get(cacheKey);
            const now = Date.now();

            // Check cache first
            if (cached && now - cached.timestamp < CONFIG.REQUEST_CACHE_DURATION) {
                console.log('🎯 Cache hit for:', url);
                state.performanceMetrics.cacheHits++;
                return cached.response;
            }

            // Clean expired entries periodically
            if (state.requestCache.size > 0 && Math.random() < 0.1) {
                const expiredKeys = [];
                state.requestCache.forEach((value, key) => {
                    if (now - value.timestamp >= CONFIG.REQUEST_CACHE_DURATION) {
                        expiredKeys.push(key);
                    }
                });
                expiredKeys.forEach((key) => state.requestCache.delete(key));
                if (expiredKeys.length > 0) {
                    console.log(`🧹 Cleaned ${expiredKeys.length} expired cache entries`);
                }
            }

            // Enforce max cache size (LRU eviction)
            const MAX_CACHE_SIZE = 50; // Maximum number of cached requests
            if (state.requestCache.size >= MAX_CACHE_SIZE) {
                // Find and remove the oldest entry
                let oldestKey = null;
                let oldestTime = Infinity;
                state.requestCache.forEach((value, key) => {
                    if (value.timestamp < oldestTime) {
                        oldestTime = value.timestamp;
                        oldestKey = key;
                    }
                });
                if (oldestKey) {
                    state.requestCache.delete(oldestKey);
                    console.log('🧹 Evicted oldest cache entry to maintain size limit');
                }
            }

            // Check rate limit
            if (this.isRateLimited()) {
                console.warn('⚠️ Rate limited, waiting...');
                await new Promise((resolve) =>
                    setTimeout(resolve, CONFIG.RATE_LIMIT.RETRY_DELAY)
                );

                if (this.isRateLimited()) {
                    throw new Error(
                        'Rate limit exceeded. Please wait before making more requests.'
                    );
                }
            }

            console.log('🌐 Making fresh request to:', url);
            state.performanceMetrics.cacheMisses++;
            this.recordRequest();

            const response = await fetch(url, options);

            // Cache successful responses
            if (response.ok) {
                const clonedResponse = response.clone();
                state.requestCache.set(cacheKey, {
                    response: clonedResponse,
                    timestamp: now
                });
            }

            return response;
        },

        clearCache() {
            state.requestCache.clear();
            console.log('🧹 Request cache cleared');
        },

        getPerformanceStats() {
            return {
                cacheHitRatio:
          state.performanceMetrics.cacheHits /
          (state.performanceMetrics.cacheHits +
            state.performanceMetrics.cacheMisses),
                totalRequests:
          state.performanceMetrics.cacheHits +
          state.performanceMetrics.cacheMisses,
                averageLoadTime:
          state.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) /
            state.performanceMetrics.loadTimes.length || 0
            };
        }
    };

    // Initialize gallery on page load
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Gallery detail initializing...');
        console.log('Loading elements:', {
            loading: document.getElementById('gallery-detail-loading'),
            content: document.getElementById('gallery-detail-content'),
            static: document.getElementById('gallery-detail-static')
        });

        // Initialize preloading optimizations
        setupHoverPreloading(); // Desktop hover preloading

        // Setup intersection preloading after a short delay to ensure gallery items are rendered
        setTimeout(() => {
            setupIntersectionPreloading(); // Mobile/scroll preloading
        }, 500);

        // Only clear sessionStorage if state is stale (> 30 minutes) or corrupted
        // Previous unconditional clear broke infinite scroll pagination
        const event = getEventFromPage();
        const stateKey = `gallery_${event}_state`;
        const savedState = sessionStorage.getItem(stateKey);

        if (savedState) {
            try {
                const parsed = JSON.parse(savedState);
                const stateAge = Date.now() - (parsed.timestamp || 0);
                const STATE_FRESHNESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes

                if (stateAge > STATE_FRESHNESS_THRESHOLD) {
                    console.log('🧹 Clearing stale sessionStorage (age > 30 mins)');
                    sessionStorage.removeItem(stateKey);
                } else {
                    console.log(`💾 Keeping fresh sessionStorage (age: ${Math.round(stateAge / 60000)} mins)`);
                }
            } catch (e) {
                // Corrupted state - clear it
                console.log('🧹 Clearing corrupted sessionStorage:', e.message);
                sessionStorage.removeItem(stateKey);
            }
        }

        // Initialize performance optimization modules
        initPerformanceModules();

        // Start cache warming if available
        if (cacheWarmer) {
            cacheWarmer.autoWarm();
        }

        loadGalleryDetailData();
        initLightbox();

        // Save state before page unload
        window.addEventListener('beforeunload', () => {
            saveState();
        });
    });

    // Load gallery detail data from API with pagination
    async function loadGalleryDetailData() {
        const loadingEl = document.getElementById('gallery-detail-loading');
        const contentEl = document.getElementById('gallery-detail-content');
        const staticEl = document.getElementById('gallery-detail-static');

        // Extract year from the page
        const year = getYearFromPage();

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🚀 GALLERY LOAD START - loadGalleryDetailData called', {
            year,
            loadingElExists: !!loadingEl,
            contentElExists: !!contentEl,
            staticElExists: !!staticEl,
            currentState: {
                loadingMutex: state.loadingMutex,
                loadedPages: state.loadedPages,
                itemsDisplayed: state.itemsDisplayed,
                workshopOffset: state.workshopOffset,
                socialOffset: state.socialOffset,
                totalItemsAvailable: state.totalItemsAvailable,
                hasCompleteDataset: state.hasCompleteDataset,
                allCategoriesKeys: Object.keys(state.allCategories || {})
            }
        });
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Lazy loading disabled - using eager loading for thumbnails
        // Full images still preload via intersection observer
        // initLazyLoading();

        // Check for saved state FIRST - this is the key change
        const stateRestored = restoreState();

        if (stateRestored && state.displayOrder.length > 0) {
            // Check if state is fresh (less than 30 minutes old)
            const stateAge = Date.now() - (state.timestamp || 0);
            const STATE_FRESHNESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes

            if (stateAge < STATE_FRESHNESS_THRESHOLD) {
                console.log('📚 Using fresh restored state, recreating DOM...');
                console.log(`📊 State age: ${Math.round(stateAge / 60000)} minutes`);

                // Restore DOM from saved state WITHOUT making API calls
                await restoreDOM();

                // Update loading state
                updateLoadingState();

                // Set up infinite scroll if more pages exist
                if (state.hasMorePages) {
                    setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
                }

                // Mark that we've successfully restored from cache
                state.restoredFromCache = true;

                // Log cache restoration to console (no visual indicator)
                console.log('💾 Gallery restored from cache - no API calls needed');

                return; // Exit early - no need to load fresh data
            } else {
                console.log(
                    '⏰ Saved state is stale, clearing and loading fresh data...'
                );
                console.log(
                    `📊 State age: ${Math.round(stateAge / 60000)} minutes (threshold: 30 minutes)`
                );

                // Clear stale state
                const eventForState = getEventFromPage();
                const stateKey = `gallery_${eventForState}_state`;
                sessionStorage.removeItem(stateKey);

                // Reset state to initial values
                resetGalleryState();
            }
        }

        // Only load fresh data if we don't have valid cached state
        console.log('📥 Loading fresh gallery data...');
        await loadNextPage(year, loadingEl, contentEl, staticEl);
    }

    // Load next page of photos with mutex protection
    async function loadNextPage(year, loadingEl, contentEl, staticEl) {
    // Prevent concurrent loading with mutex pattern
        if (state.loadingMutex || !state.hasMorePages) {
            console.log('⏸️ Skipping load - already loading or no more pages', {
                hasMorePages: state.hasMorePages,
                loadingMutex: state.loadingMutex
            });
            return;
        }

        console.log(`📸 Loading page ${state.loadedPages + 1}...`);

        // Declare apiUrl at function scope to avoid reference error in catch block
        let apiUrl = '';

        try {
            // Set loading mutex
            state.loadingMutex = true;

            // Show loading for first page only
            if (state.loadedPages === 0) {
                if (loadingEl) {
                    loadingEl.style.display = 'block';
                }
                if (staticEl) {
                    staticEl.style.display = 'none';
                }
            }

            // Calculate offset
            const offset = state.loadedPages * CONFIG.PAGINATION_SIZE;
            let isStaticFetch = false;

            // For the first page, load the static JSON file.
            if (offset === 0 && false) { // Temporarily disable static JSON loading due to Vercel routing issue
                isStaticFetch = true;
                // Try event-specific file first, fallback to year-based
                const event = getEventFromPage();
                apiUrl = `/gallery-data/${event}.json?timestamp=${Date.now()}`;
            } else {
                // Check if we've already loaded all available items
                // IMPORTANT: Don't exit early if we haven't loaded anything yet (totalItemsAvailable > 0)
                if (
                    state.hasCompleteDataset ||
          (state.totalItemsAvailable > 0 && state.itemsDisplayed >= state.totalItemsAvailable)
                ) {
                    console.log('✅ All items already displayed', {
                        hasCompleteDataset: state.hasCompleteDataset,
                        itemsDisplayed: state.itemsDisplayed,
                        totalItemsAvailable: state.totalItemsAvailable
                    });
                    state.hasMorePages = false;
                    // Double-check consistency
                    if (state.itemsDisplayed > state.totalItemsAvailable) {
                        console.warn(
                            '⚠️ State inconsistency detected: itemsDisplayed > totalItemsAvailable'
                        );
                    }
                    return;
                }

                // For subsequent pages (infinite scroll), hit the API.
                const event = getEventFromPage();
                apiUrl = `${CONFIG.API_ENDPOINT}?year=${year}&event=${event}&limit=${CONFIG.PAGINATION_SIZE}&offset=${offset}&timestamp=${Date.now()}`;
                console.log('🔥 Making paginated API call to:', apiUrl);
            }

            console.log('Fetching from URL:', apiUrl);
            const startTime = performance.now();

            let response = await RequestManager.cachedFetch(apiUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            });

            const loadTime = performance.now() - startTime;
            state.performanceMetrics.loadTimes.push(loadTime);
            console.log(`⏱️ Request took ${loadTime.toFixed(2)}ms`);

            console.log('Response received:', {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                headers: response.headers.get('content-type')
            });

            // Handle static JSON fallback for first page loads
            if (isStaticFetch && (!response.ok || !response.headers.get('content-type')?.includes('application/json'))) {
                console.warn(`⚠️ Static JSON failed (status: ${response.status}), falling back to API endpoint`);

                const event = getEventFromPage();
                const fallbackUrl = `${CONFIG.API_ENDPOINT}?year=${year}&event=${event}&limit=${CONFIG.PAGINATION_SIZE}&offset=0&timestamp=${Date.now()}`;

                console.log('🔄 Falling back to API endpoint:', fallbackUrl);

                try {
                    response = await RequestManager.cachedFetch(fallbackUrl, {
                        method: 'GET',
                        headers: {
                            Accept: 'application/json'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`Fallback API error: ${response.status} ${response.statusText}`);
                    }

                    // Mark as no longer static fetch since we're using API
                    isStaticFetch = false;
                    console.log('✅ Successfully fell back to API endpoint');
                } catch (fallbackError) {
                    console.error('❌ Fallback API request also failed:', fallbackError);
                    throw fallbackError;
                }
            } else if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            let data;
            try {
                data = await response.json();
            } catch (parseError) {
                if (isStaticFetch) {
                    console.warn('⚠️ Static JSON parse failed, falling back to API endpoint');

                    const event = getEventFromPage();
                    const fallbackUrl = `${CONFIG.API_ENDPOINT}?year=${year}&event=${event}&limit=${CONFIG.PAGINATION_SIZE}&offset=0&timestamp=${Date.now()}`;

                    console.log('🔄 Falling back to API endpoint due to parse error:', fallbackUrl);

                    try {
                        response = await RequestManager.cachedFetch(fallbackUrl, {
                            method: 'GET',
                            headers: {
                                Accept: 'application/json'
                            }
                        });

                        if (!response.ok) {
                            throw new Error(`Fallback API error: ${response.status} ${response.statusText}`);
                        }

                        data = await response.json();
                        isStaticFetch = false;
                        console.log('✅ Successfully fell back to API endpoint after parse error');
                    } catch (fallbackError) {
                        console.error('❌ Fallback API request failed after parse error:', fallbackError);
                        throw fallbackError;
                    }
                } else {
                    throw parseError;
                }
            }
            console.log('Data parsed successfully:', {
                totalCount: data.totalCount,
                hasCategories: !!data.categories,
                categoryNames: data.categories ? Object.keys(data.categories) : []
            });

            // If we fetched the static file, it contains ALL items.
            // We need to manually slice the first page.
            if (isStaticFetch) {
                console.log('📊 Static data loaded:', data);

                // Store all categories for future pagination
                state.allCategories = data.categories || {};

                // Store category counts and totals
                state.workshopTotal = (data.categories.workshops || []).length;
                state.socialTotal = (data.categories.socials || []).length;
                state.totalItemsAvailable = state.workshopTotal + state.socialTotal;

                for (const [categoryName, items] of Object.entries(
                    data.categories || {}
                )) {
                    state.categoryCounts[categoryName] = items.length;
                }

                console.log(
                    `📊 Total items in static data: workshops=${state.workshopTotal}, socials=${state.socialTotal}, total=${state.totalItemsAvailable}`
                );

                // Debug: Log the state before getting first page

                // Get first page using sequential algorithm
                const pageItems = getNextPageItems(
                    state.allCategories,
                    CONFIG.PAGINATION_SIZE
                );

                // Debug: Log what we got from getNextPageItems

                // Organize items back into categories for display
                const paginatedCategories = {
                    workshops: [],
                    socials: []
                };

                pageItems.forEach((item) => {
                    if (item.category === 'workshops') {
                        paginatedCategories.workshops.push(item);
                    } else if (item.category === 'socials') {
                        paginatedCategories.socials.push(item);
                    }
                });

                state.itemsDisplayed = pageItems.length;
                state.loadedPages++;

                // If we have 20 or fewer items total, we've loaded everything
                state.hasCompleteDataset =
          state.totalItemsAvailable <= CONFIG.PAGINATION_SIZE;

                // Display paginated data
                displayGalleryData(
                    {
                        categories: paginatedCategories,
                        totalCount: data.totalCount,
                        hasMore: state.hasMorePages
                    },
                    contentEl,
                    staticEl,
                    loadingEl,
                    false
                );

                // Update loading state (remove sentinel if complete)
                updateLoadingState();

                // Save state after initial load
                saveState();
            } else {
                // This is paginated API data from the server
                // Use the data directly without client-side slicing
                console.log('🔵 PAGINATED API PATH ENTERED', {
                    page: state.loadedPages + 1,
                    isStaticFetch: isStaticFetch,
                    dataReceived: !!data,
                    dataKeys: data ? Object.keys(data) : []
                });

                // Debug: Log the raw API response structure
                console.log('📊 API Response Structure:', {
                    totalCount: data.totalCount,
                    hasMore: data.hasMore,
                    categoriesExist: !!data.categories,
                    categoryNames: data.categories ? Object.keys(data.categories) : [],
                    workshopsCount: data.categories?.workshops?.length || 0,
                    socialsCount: data.categories?.socials?.length || 0,
                    returnedCount: data.returnedCount,
                    offset: data.offset,
                    limit: data.limit
                });

                // Update total counts from API response
                state.totalItemsAvailable = data.totalCount || 0;

                // The API returns paginated categories directly
                const paginatedCategories = data.categories || {};

                console.log('🔍 Processing categories:', {
                    categoriesReceived: Object.keys(paginatedCategories),
                    workshopsArray: Array.isArray(paginatedCategories.workshops),
                    workshopsLength: paginatedCategories.workshops?.length || 0,
                    socialsArray: Array.isArray(paginatedCategories.socials),
                    socialsLength: paginatedCategories.socials?.length || 0
                });

                // Count items in this page
                let pageItemCount = 0;
                const itemsByCategory = {};

                Object.entries(paginatedCategories).forEach(([category, items]) => {
                    const itemCount = (items || []).length;
                    pageItemCount += itemCount;
                    itemsByCategory[category] = itemCount;

                    console.log(`📁 Category "${category}":`, {
                        itemCount: itemCount,
                        firstItem: items?.[0]?.name || 'none',
                        lastItem: items?.[items.length - 1]?.name || 'none'
                    });
                });

                console.log('📈 State BEFORE update:', {
                    itemsDisplayed: state.itemsDisplayed,
                    loadedPages: state.loadedPages,
                    workshopOffset: state.workshopOffset,
                    socialOffset: state.socialOffset,
                    hasMorePages: state.hasMorePages,
                    hasCompleteDataset: state.hasCompleteDataset
                });

                state.itemsDisplayed += pageItemCount;
                state.loadedPages++;

                // Update category-specific offsets for tracking
                if (paginatedCategories.workshops) {
                    state.workshopOffset += paginatedCategories.workshops.length;
                }
                if (paginatedCategories.socials) {
                    state.socialOffset += paginatedCategories.socials.length;
                }

                // Use the API's hasMore flag or calculate based on total
                state.hasMorePages = data.hasMore === true ||
                                   (state.itemsDisplayed < state.totalItemsAvailable);

                if (!state.hasMorePages || state.itemsDisplayed >= state.totalItemsAvailable) {
                    state.hasCompleteDataset = true;
                    console.log('✅ All items now displayed');
                }

                console.log('📈 State AFTER update:', {
                    itemsDisplayed: state.itemsDisplayed,
                    loadedPages: state.loadedPages,
                    workshopOffset: state.workshopOffset,
                    socialOffset: state.socialOffset,
                    hasMorePages: state.hasMorePages,
                    hasCompleteDataset: state.hasCompleteDataset,
                    totalItemsAvailable: state.totalItemsAvailable
                });

                console.log(
                    `📦 SUMMARY: Loaded ${pageItemCount} items from API. Total displayed: ${state.itemsDisplayed}/${state.totalItemsAvailable}, hasMore: ${state.hasMorePages}`
                );

                // Display the gallery with the paginated data from API (append mode for subsequent pages)
                displayGalleryData(
                    {
                        categories: paginatedCategories,
                        totalCount: state.totalItemsAvailable,
                        hasMore: state.hasMorePages
                    },
                    contentEl,
                    staticEl,
                    loadingEl,
                    state.loadedPages > 1  // Append mode for pages after the first
                );

                // Update loading state (remove sentinel if complete)
                updateLoadingState();

                // Save state after each page load
                saveState();
            }

            // Set up infinite scroll for more pages
            if (state.hasMorePages) {
                setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
            }
        } catch (error) {
            console.error('Gallery API request failed:', error);
            const errorUrl = apiUrl || 'Unknown URL';
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                url: errorUrl
            });

            // Show static fallback only on first page
            if (state.loadedPages === 0) {
                if (loadingEl) {
                    loadingEl.style.display = 'none';
                }
                if (staticEl) {
                    staticEl.style.display = 'block';
                }
            }
        } finally {
            // Always clear loading mutex
            state.loadingMutex = false;
        }
    }

    // Progressive DOM insertion to prevent UI blocking
    async function insertItemsProgressively(
        items,
        container,
        categoryName,
        categoryOffset = 0,
        isAppend = false
    ) {
        const BATCH_SIZE = 5; // Process 5 items at a time

        // Initialize category counters if not already present
        if (!state.categoryItemCounts) {
            state.categoryItemCounts = {
                workshops: 0,
                socials: 0
            };
        }

        // Early exit if all items are already displayed
        const allDuplicates = items.every((item) => {
            const itemId = `${categoryName}_${item.id || item.name}`;
            return state.displayedItemIds.has(itemId);
        });

        if (allDuplicates && items.length > 0) {
            console.log(
                `⏭️ All ${items.length} ${categoryName} items already displayed, skipping insertion`
            );
            return;
        }

        const uniqueItems = items.filter((item) => {
            // Create category-aware item ID to prevent duplicates within categories
            const itemId = `${categoryName}_${item.id || item.name}`;
            // Check against displayed items, not all loaded items
            if (state.displayedItemIds.has(itemId)) {
                // Only log if we're in debug mode or this is unexpected
                if (window.galleryDebug?.verbose) {
                    console.log(`🚫 Duplicate item prevented: ${itemId}`);
                }
                return false;
            }
            state.displayedItemIds.add(itemId);
            state.loadedItemIds.add(itemId); // Still track for debugging

            // If item already has categoryIndex (from restoration), use it
            // Otherwise, assign a new one
            let categoryIndex;
            if (item.categoryIndex !== undefined) {
                categoryIndex = item.categoryIndex;
                // Update counter if this index is higher than current counter
                state.categoryItemCounts[categoryName] = Math.max(
                    state.categoryItemCounts[categoryName],
                    categoryIndex + 1
                );
            } else {
                // Assign new index and increment counter
                categoryIndex = state.categoryItemCounts[categoryName];
                state.categoryItemCounts[categoryName]++;
            }

            // Track display order for lightbox with category-specific index
            const displayOrderItem = {
                ...item,
                category: categoryName,
                displayIndex: state.displayOrder.length,
                categoryIndex: categoryIndex
            };

            state.displayOrder.push(displayOrderItem);

            // Enhanced debug logging for category index tracking
            // console.log(`📍 Item added to display order:`, {
            //     name: item.name,
            //     category: categoryName,
            //     categoryIndex: categoryIndex,
            //     displayIndex: state.displayOrder.length - 1,
            //     categoryCount: state.categoryItemCounts[categoryName]
            // });

            return true;
        });

        console.log(
            `🔄 Progressive insert: ${uniqueItems.length} items in batches of ${BATCH_SIZE}`
        );
        console.log(
            `📊 Category counts: workshops=${state.categoryItemCounts.workshops}, socials=${state.categoryItemCounts.socials}`
        );

        for (let i = 0; i < uniqueItems.length; i += BATCH_SIZE) {
            const batch = uniqueItems.slice(i, i + BATCH_SIZE);
            const batchHTML = batch
                .map((item, index) => {
                    const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
                    // Use the actual display order index
                    const displayOrderItem = state.displayOrder.find(
                        (d) => d.id === item.id && d.category === categoryName
                    );
                    const globalIndex = displayOrderItem
                        ? displayOrderItem.displayIndex
                        : state.displayOrder.length - 1;

                    // Build picture element with format fallbacks
                    const thumbnailUrl = item.thumbnailUrl;
                    const thumbnailUrl_webp = item.thumbnailUrl_webp || null;
                    const usingBlob = item.usingBlob || false;

                    // Determine fallback URL for <img> - use WebP for better browser support
                    const fallbackUrl = usingBlob && thumbnailUrl_webp ? thumbnailUrl_webp : thumbnailUrl;

                    let pictureHtml = `
          <div class="gallery-item lazy-item gallery-image-container" data-index="${globalIndex}" data-category="${categoryName}" data-loaded="true" data-using-blob="${usingBlob}">
            <div class="gallery-item-media">
              <div class="lazy-placeholder" style="display: none;">
                <div class="loading-spinner">📸</div>
              </div>
              <picture>`;

                    // Add AVIF source if using Blob (dedicated AVIF URL) - eager loading
                    if (usingBlob && thumbnailUrl) {
                      pictureHtml += `
                <source type="image/avif" srcset="${thumbnailUrl}">`;
                    }

                    // Add WebP source if available - eager loading
                    if (thumbnailUrl_webp) {
                      pictureHtml += `
                <source type="image/webp" srcset="${thumbnailUrl_webp}">`;
                    }

                    // Fallback img tag - uses WebP for better browser support when using blob
                    pictureHtml += `
                <img src="${fallbackUrl}"
                     data-thumbnail="${fallbackUrl}"
                     data-dominant-color="#f0f0f0"
                     data-width="400"
                     data-height="300"
                     data-progressive="true"
                     data-image-id="${item.id || globalIndex}"
                     alt="${title}"
                     class="lazy-image gallery-image"
                     loading="eager"
                     decoding="async"
                     style="display: block; opacity: 1;">
              </picture>
            </div>
          </div>
        `;

                    return pictureHtml;
                })
                .join('');

            // Insert batch and yield control to prevent UI blocking
            if (isAppend) {
                container.insertAdjacentHTML('beforeend', batchHTML);
            } else if (i === 0) {
                container.innerHTML = batchHTML;
            } else {
                container.insertAdjacentHTML('beforeend', batchHTML);
            }

            // Yield control to browser after each batch
            if (i + BATCH_SIZE < uniqueItems.length) {
                await new Promise((resolve) => requestAnimationFrame(resolve));
            }
        }

        // Add preload link tags for full images (first batch gets high priority)
        const isFirstBatch = categoryOffset === 0 && categoryName === 'workshops';
        if (isFirstBatch) {
            addPreloadLinks(uniqueItems.slice(0, 10), 'high');
        } else {
            addPreloadLinks(uniqueItems.slice(0, 5), 'auto');
        }
    }

    // Add <link rel="preload"> tags for full images
    function addPreloadLinks(items, priority = 'auto') {
        items.forEach(item => {
            if (item.viewUrl && !state.preloadedImages.has(item.viewUrl)) {
                const link = document.createElement('link');
                link.rel = 'preload';
                link.as = 'image';
                link.href = item.viewUrl;
                if (priority === 'high') {
                    link.fetchPriority = 'high';
                }
                // Add to head to trigger browser preload
                document.head.appendChild(link);

                // Remove link after 5 seconds to prevent "unused preload" warnings
                setTimeout(() => {
                    if (link.parentNode) {
                        link.parentNode.removeChild(link);
                    }
                }, 5000);

                // Mark as preloaded
                state.preloadedImages.add(item.viewUrl);
            }
        });
    }

    // Display gallery data with lazy loading and append mode
    async function displayGalleryData(
        data,
        contentEl,
        staticEl,
        loadingEl,
        appendMode = false
    ) {

        // Check if we have any categories with items
        let hasItems = false;
        let totalItemsToDisplay = 0;
        Object.entries(data.categories || {}).forEach(([category, items]) => {
            if (items?.length > 0) {
                hasItems = true;
                totalItemsToDisplay += items.length;
                console.log(`✔️ Category "${category}" has ${items.length} items to display`);
            } else {
                console.log(`⚠️ Category "${category}" has 0 items`);
            }
        });

        console.log('🎯 Display decision:', {
            hasItems,
            totalItemsToDisplay,
            appendMode,
            willShowStatic: !hasItems && !appendMode
        });

        if (!hasItems && !appendMode) {
            console.log('⚠️ NO ITEMS TO DISPLAY - Showing static fallback');
            // Show static content if no items on first load
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            if (staticEl) {
                staticEl.style.display = 'block';
            }
            return;
        }

        // Hide loading and static content on first load
        if (!appendMode) {
            if (loadingEl) {
                loadingEl.style.display = 'none';
            }
            if (staticEl) {
                staticEl.style.display = 'none';
            }
        }

        // Get items from categories
        const workshopItems = data.categories.workshops || [];
        const socialItems = data.categories.socials || [];

        // Update content sections with progressive loading
        if (contentEl) {
            contentEl.style.display = 'block';

            // Update Workshops section
            const workshopsSection = document.getElementById('workshops-section');
            const workshopsGallery = document.getElementById('workshops-gallery');
            console.log('🏗️ Workshops section update:', {
                sectionExists: !!workshopsSection,
                galleryExists: !!workshopsGallery,
                itemsToInsert: workshopItems.length,
                willDisplay: workshopsSection && workshopsGallery && workshopItems.length > 0
            });

            if (workshopsSection && workshopsGallery && workshopItems.length > 0) {
                console.log(`📝 Inserting ${workshopItems.length} workshop items into DOM...`);
                workshopsSection.style.display = 'block';
                await insertItemsProgressively(
                    workshopItems,
                    workshopsGallery,
                    'workshops',
                    0,
                    appendMode
                );
                console.log('✅ Workshop items inserted successfully');
            } else if (workshopItems.length === 0) {
                console.log('⚠️ No workshop items to insert');
            }

            // Update Socials section
            const socialsSection = document.getElementById('socials-section');
            const socialsGallery = document.getElementById('socials-gallery');
            console.log('🏗️ Socials section update:', {
                sectionExists: !!socialsSection,
                galleryExists: !!socialsGallery,
                itemsToInsert: socialItems.length,
                willDisplay: socialsSection && socialsGallery && socialItems.length > 0
            });

            if (socialsSection && socialsGallery && socialItems.length > 0) {
                console.log(`📝 Inserting ${socialItems.length} social items into DOM...`);
                socialsSection.style.display = 'block';
                await insertItemsProgressively(
                    socialItems,
                    socialsGallery,
                    'socials',
                    workshopItems.length,
                    appendMode
                );
                console.log('✅ Social items inserted successfully');
            } else if (socialItems.length === 0) {
                console.log('⚠️ No social items to insert');
            }

            // Add click handlers for lightbox (only for new items if appending)
            // Note: data-handler-loaded is the authoritative flag for tracking click handlers
            // data-loaded refers to image loading state and is not relevant for handler attachment
            const selector = '.gallery-item:not([data-handler-loaded="true"])';
            const items = contentEl.querySelectorAll(selector);
            console.log(
                `🎯 Attaching click handlers to ${items.length} items (appendMode: ${appendMode})`
            );

            // Final DOM verification
            const finalWorkshopCount = workshopsGallery ? workshopsGallery.querySelectorAll('.gallery-item').length : 0;
            const finalSocialCount = socialsGallery ? socialsGallery.querySelectorAll('.gallery-item').length : 0;
            console.log('✨ FINAL DOM VERIFICATION:', {
                workshopItemsInDOM: finalWorkshopCount,
                socialItemsInDOM: finalSocialCount,
                totalItemsInDOM: finalWorkshopCount + finalSocialCount,
                stateItemsDisplayed: state.itemsDisplayed
            });

            if (finalWorkshopCount + finalSocialCount === 0) {
                console.error('❌ CRITICAL: No items were added to the DOM!');
            }
            items.forEach((item) => {
                setupGalleryItemHandlers(item, data);
                // Eager loading enabled - images already have src set
                item.setAttribute('data-handler-loaded', 'true');
            });

            // Lazy loading disabled - thumbnails load eagerly
            // observeLazyItems();

            // Re-initialize intersection preloading for full images
            setupIntersectionPreloading();

            // Aggressively preload first 10 full images on initial load
            if (!appendMode) {
                setTimeout(() => {
                    preloadInitialFullImages(10);
                }, 100); // Small delay to let thumbnails finish loading first
            }
        }

        // Store all items for lightbox (flatten categories)
        const allItems = [];
        const allCategories = [];

        for (const [categoryName, items] of Object.entries(data.categories)) {
            items.forEach((item) => {
                allItems.push(item);
                allCategories.push(categoryName);
            });
        }

        if (appendMode) {
            state.lightboxItems.push(...allItems);
            state.lightboxCategories.push(...allCategories);
        } else {
            state.lightboxItems = allItems;
            state.lightboxCategories = allCategories;
        }
    }

    // Setup click handlers for gallery items
    function setupGalleryItemHandlers(item, data) {
    // Skip if handlers already attached
        if (item.getAttribute('data-handler-loaded') === 'true') {
            return;
        }

        const displayIndex = parseInt(item.dataset.index);

        // Use event delegation to handle lazy-loaded content
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log('🖱️ Gallery item clicked:', {
                displayIndex,
                totalItems: state.displayOrder.length,
                target: e.target.tagName,
                hasLightbox: !!state.lightbox
            });

            // Ensure we use the correct items array
            if (state.displayOrder.length > displayIndex) {
                openLightbox(state.displayOrder, displayIndex);
            } else {
                console.error(
                    'Index out of bounds:',
                    displayIndex,
                    state.displayOrder.length
                );
            }
        });

        // Ensure clickable styling
        item.style.cursor = 'pointer';
        item.style.position = 'relative';
        item.style.zIndex = '1';

        // Mark as having handlers loaded
        item.setAttribute('data-handler-loaded', 'true');
    }

    // Initialize lazy loading using shared component
    function initLazyLoading() {
        if (typeof LazyLoader === 'undefined') {
            console.warn('LazyLoader component not available');
            return;
        }

        state.lazyObserver = LazyLoader.createAdvanced({
            selector: '.lazy-item[data-loaded="false"]',
            rootMargin: CONFIG.LAZY_LOAD_THRESHOLD,
            threshold: 0.1,
            skipInitialObserve: true, // Gallery items don't exist yet - observeLazyItems() will handle observation
            onError: (element, error, info) => {
                // Update failed images state immediately when an error occurs
                if (info?.src && !state.failedImages.includes(info.src)) {
                    state.failedImages.push(info.src);
                    // Remove from successful images if it was there
                    state.successfulImages.delete(info.src);
                    console.log(`📌 Added failed image to state: ${info.src}`);
                    // Save state immediately to persist failed images
                    saveState();
                }
            },
            onLoad: (element) => {
                // Integrate with progressive loading when image starts loading
                if (progressiveLoader) {
                    const imgElement = element.querySelector(
                        'img[data-progressive="true"]'
                    );
                    if (imgElement) {
                        progressiveLoader.observeImage(imgElement);
                    }
                }
            }
        });

        // Listen for successful image loads to track them
        document.addEventListener(
            'load',
            (e) => {
                if (
                    e.target.tagName === 'IMG' &&
          e.target.classList.contains('lazy-image')
                ) {
                    const src = e.target.src;
                    if (src && !src.includes('data:image')) {
                        // Add to successful images
                        state.successfulImages.add(src);
                        // Remove from failed images if present
                        const failedIndex = state.failedImages.indexOf(src);
                        if (failedIndex > -1) {
                            state.failedImages.splice(failedIndex, 1);
                        }
                        // Save state periodically (throttled)
                        if (!state.saveStateTimeout) {
                            state.saveStateTimeout = setTimeout(() => {
                                saveState();
                                state.saveStateTimeout = null;
                            }, 1000);
                        }
                    }
                }
            },
            true
        ); // Use capture phase

        // Store LazyLoader instance globally for retry functionality
        window.galleryLazyLoader = state.lazyObserver;

        // Periodically sync failed images to our state as backup
        if (state.lazyObserver?.failedImages) {
            setInterval(() => {
                const failedSrcs = [];
                state.lazyObserver.failedImages.forEach((info, element) => {
                    if (!failedSrcs.includes(info.src)) {
                        failedSrcs.push(info.src);
                    }
                });
                // Only update if there are changes
                if (JSON.stringify(failedSrcs) !== JSON.stringify(state.failedImages)) {
                    state.failedImages = failedSrcs;
                    saveState(); // Persist changes
                }
            }, 5000); // Sync every 5 seconds
        }
    }

    // Observe new lazy items
    function observeLazyItems() {
        if (!state.lazyObserver) {
            return;
        }

        const lazyItems = document.querySelectorAll(
            '.lazy-item[data-loaded="false"]'
        );
        state.lazyObserver.observeNewElements(lazyItems);
    }

    // Setup infinite scroll with improved sentinel management
    function setupInfiniteScroll(year, loadingEl, contentEl, staticEl) {
        const sentinelId = 'load-more-sentinel';

        // Remove old sentinel if it exists to prevent duplicates
        const oldSentinel = document.getElementById(sentinelId);
        if (oldSentinel) {
            oldSentinel.remove();
            state.observedSentinels.delete(sentinelId);
        }

        // Only create sentinel if we have more pages
        if (!state.hasMorePages) {
            return;
        }

        // Create new sentinel element
        const sentinel = document.createElement('div');
        sentinel.id = sentinelId;
        sentinel.innerHTML =
      '<div class="loading-more">Loading more photos...</div>';
        sentinel.style.cssText =
      'height: 50px; display: flex; align-items: center; justify-content: center; margin: 2rem 0;';

        // Insert before gallery stats section
        const galleryStats = document.querySelector('.gallery-stats');
        if (galleryStats) {
            galleryStats.parentNode.insertBefore(sentinel, galleryStats);
        } else {
            document.querySelector('main').appendChild(sentinel);
        }

        // Create single-use observer to prevent duplicate triggers
        const scrollObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (
                        entry.isIntersecting &&
            state.hasMorePages &&
            !state.loadingMutex
                    ) {
                        console.log('📜 Infinite scroll triggered');

                        // Immediately disconnect observer to prevent duplicate triggers
                        scrollObserver.unobserve(entry.target);

                        // Load next page
                        loadNextPage(year, loadingEl, contentEl, staticEl);
                    }
                });
            },
            {
                rootMargin: '100px',
                threshold: 0.1
            }
        );

        scrollObserver.observe(sentinel);
        state.observedSentinels.add(sentinelId);

        // Store observer reference for cleanup
        sentinel._observer = scrollObserver;
    }

    // Lightbox functionality using shared component
    function initLightbox() {
        if (typeof Lightbox === 'undefined') {
            console.warn('Lightbox component not available');
            return;
        }

        // Initialize shared lightbox with advanced mode
        state.lightbox = new Lightbox({
            lightboxId: 'gallery-lightbox',
            showCaption: false,
            showCounter: true,
            advanced: true
        });
    }

    // Keep references to preloaded images to prevent browser cancellation
    const preloadedImageRefs = new Map();

    // Preload image utility
    function preloadImage(url, priority = 'auto') {
        if (!url || state.preloadedImages.has(url)) {
            return; // Already preloaded or invalid URL
        }

        const img = new Image();
        img.onload = () => {
            state.preloadedImages.add(url);
            // Keep reference for at least 30 seconds to prevent cancellation
            preloadedImageRefs.set(url, img);
            setTimeout(() => {
                preloadedImageRefs.delete(url);
            }, 30000);
        };
        img.onerror = () => {
            // Silent failure - browser will try again if needed
            preloadedImageRefs.delete(url);
        };

        // For high priority images, use fetchpriority attribute
        if (priority === 'high') {
            img.fetchPriority = 'high';
        }

        img.src = url;
        // Keep immediate reference to prevent garbage collection
        preloadedImageRefs.set(url, img);
    }

    // Aggressively preload first N full images immediately
    function preloadInitialFullImages(count = 10) {
        console.log(`🚀 Aggressively preloading first ${count} full images...`);

        let preloaded = 0;
        for (let i = 0; i < Math.min(count, state.displayOrder.length); i++) {
            const item = state.displayOrder[i];
            if (item && item.viewUrl) {
                preloadImage(item.viewUrl, 'high');
                preloaded++;
            }
        }

        console.log(`✅ Queued ${preloaded} full images for immediate preload`);
    }

    // Preload adjacent images for smooth lightbox navigation
    function preloadAdjacentImages(currentIndex) {
        const indices = [
            currentIndex - 1,  // Previous image
            currentIndex + 1,  // Next image
            currentIndex + 2,  // Next-next (for fast navigation)
            currentIndex - 2   // Previous-previous
        ];

        indices.forEach(i => {
            if (i >= 0 && i < state.displayOrder.length) {
                const item = state.displayOrder[i];
                if (item && item.viewUrl) {
                    preloadImage(item.viewUrl);
                }
            }
        });
    }

    // Preload on hover (desktop optimization)
    function setupHoverPreloading() {
        document.addEventListener('mouseover', (e) => {
            const galleryItem = e.target.closest('.gallery-item');
            if (galleryItem) {
                const index = parseInt(galleryItem.dataset.index);
                if (!isNaN(index) && state.displayOrder[index]) {
                    const item = state.displayOrder[index];
                    if (item.viewUrl) {
                        preloadImage(item.viewUrl);
                        // Also preload adjacent images since user might navigate
                        preloadAdjacentImages(index);
                    }
                }
            }
        }, { passive: true });
    }

    // Preload images that are about to come into view (mobile optimization)
    function setupIntersectionPreloading() {
        const preloadObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const galleryItem = entry.target;
                    const index = parseInt(galleryItem.dataset.index);
                    if (!isNaN(index) && state.displayOrder[index]) {
                        const item = state.displayOrder[index];
                        if (item.viewUrl) {
                            // Preload this image's full version
                            preloadImage(item.viewUrl);
                            // Also preload nearby images for smooth navigation
                            preloadAdjacentImages(index);
                        }
                    }
                }
            });
        }, {
            rootMargin: '500px' // Aggressively preload when 500px away from viewport
        });

        // Observe all gallery items
        document.querySelectorAll('.gallery-item').forEach(item => {
            preloadObserver.observe(item);
        });

        console.log(`📡 Intersection observer setup with 500px rootMargin for ${document.querySelectorAll('.gallery-item').length} items`);

        return preloadObserver;
    }

    function openLightbox(items, index) {
        if (!state.lightbox) {
            console.error('Lightbox not initialized!');
            return;
        }

        // Preload adjacent images when lightbox opens
        preloadAdjacentImages(index);

        const currentItem = items[index];
        // console.log('🏞️ Opening lightbox:', {
        //     itemsCount: items.length,
        //     index: index,
        //     item: currentItem,
        //     category: currentItem.category,
        //     categoryIndex: currentItem.categoryIndex,
        //     displayIndex: currentItem.displayIndex,
        //     categoryCounts: state.categoryCounts
        // });

        // Verify category indices for debugging
        // if (currentItem.category === 'socials') {
        //     console.log('🎭 Social item details:', {
        //         name: currentItem.name,
        //         categoryIndex: currentItem.categoryIndex,
        //         expectedCategoryCount: state.categoryCounts.socials,
        //         allSocialItems: items.filter(i => i.category === 'socials').map(i => ({
        //             name: i.name,
        //             categoryIndex: i.categoryIndex
        //         }))
        //     });
        // }

        state.lightboxItems = items;
        state.currentLightboxIndex = index;
        state.lightboxCategories = items.map(
            (item) => item.category || 'uncategorized'
        );

        state.lightbox.openAdvanced(
            items,
            index,
            state.lightboxCategories,
            state.categoryCounts
        );
    }

    function closeLightbox() {
        if (state.lightbox) {
            state.lightbox.close();
        }
    }

    // Get year from page (from URL path or data attribute)
    function getYearFromPage() {
    // Try to get from URL path (e.g., gallery-2025.html)
        const pathMatch = window.location.pathname.match(/gallery-(\d{4})\.html/);
        if (pathMatch) {
            return pathMatch[1];
        }

        // Try to get from data attribute
        const yearElement = document.querySelector('[data-gallery-year]');
        if (yearElement) {
            return yearElement.dataset.galleryYear;
        }

        // Default to 2025
        return '2025';
    }

    // Get event from page for event-specific gallery loading
    function getEventFromPage() {
    // Try to get from data attribute first
        const eventElement = document.querySelector('[data-gallery-event]');
        if (eventElement && eventElement.dataset.galleryEvent) {
            return eventElement.dataset.galleryEvent;
        }

        // Try to infer from URL path patterns
        const pathname = window.location.pathname;

        // Check for specific event patterns in URL
        if (pathname.includes('boulder-fest-2026')) {
            return 'boulder-fest-2026';
        }
        if (pathname.includes('weekender-2026-09')) {
            return 'weekender-2026-09';
        }
        if (
            pathname.includes('boulder-fest-2025') ||
      pathname.includes('gallery-2025')
        ) {
            return 'boulder-fest-2025';
        }

        // Default to boulder-fest-2025 for current year
        const year = getYearFromPage();
        return `boulder-fest-${year}`;
    }

    // Cache management
    function getCachedData(year) {
        try {
            const cacheKey = `${CONFIG.CACHE_KEY}_${year}`;
            const cached = localStorage.getItem(cacheKey);
            if (!cached) {
                return null;
            }

            const data = JSON.parse(cached);
            const now = Date.now();

            if (now - data.timestamp > CONFIG.CACHE_DURATION) {
                localStorage.removeItem(cacheKey);
                return null;
            }

            return data.content;
        } catch (error) {
            console.error('Cache read error:', error);
            return null;
        }
    }

    function setCachedData(data, year) {
        try {
            const cacheKey = `${CONFIG.CACHE_KEY}_${year}`;
            const cacheData = {
                timestamp: Date.now(),
                content: data
            };
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        } catch (error) {
            console.error('Cache write error:', error);
        }
    }

    // Performance monitoring and debugging utilities
    window.galleryDebug = {
        getState: () => state,
        getPerformanceStats: () => RequestManager.getPerformanceStats(),
        clearRequestCache: () => RequestManager.clearCache(),
        getLoadedItemCount: () => state.loadedItemIds.size,
        saveState: () => saveState(),
        restoreState: () => restoreState(),
        clearSavedState: () => {
            const event = getEventFromPage();
            const stateKey = `gallery_${event}_state`;
            sessionStorage.removeItem(stateKey);
            console.log('🗑️ Saved state cleared');
        },
        resetPerformanceMetrics: () => {
            state.performanceMetrics = {
                loadTimes: [],
                cacheHits: 0,
                cacheMisses: 0
            };
            console.log('📊 Performance metrics reset');
        },
        retryFailedImages: () => {
            const lazyLoader = window.galleryLazyLoader || state.lazyObserver;
            if (lazyLoader && typeof lazyLoader.retryAllFailedImages === 'function') {
                console.log('♻️ Manually retrying all failed images...');
                lazyLoader.retryAllFailedImages();
            } else {
                console.warn('LazyLoader retry functionality not available');
            }
        },
        getFailedImages: () => {
            const lazyLoader = window.galleryLazyLoader || state.lazyObserver;
            const failedList = [];
            lazyLoader?.failedImages?.forEach((info, element) => {
                failedList.push({
                    src: info.src,
                    attempts: info.attempts,
                    lastError: info.lastError,
                    element: element
                });
            });
            return failedList;
        },
        logCurrentState: () => {
            console.group('🔍 Gallery Debug Info');
            console.log(
                '📊 Performance Stats:',
                RequestManager.getPerformanceStats()
            );
            console.log('📋 State Overview:', {
                loadedPages: state.loadedPages,
                hasMorePages: state.hasMorePages,
                loadingMutex: state.loadingMutex,
                totalItemsAvailable: state.totalItemsAvailable,
                itemsDisplayed: state.itemsDisplayed,
                displayedItems: state.displayedItemIds.size,
                loadedItems: state.loadedItemIds.size,
                lightboxItems: state.lightboxItems.length,
                hasCompleteDataset: state.hasCompleteDataset,
                failedImages: state.failedImages.length
            });
            console.log('🎯 Cache Status:', {
                requestCacheSize: state.requestCache.size,
                rateLimitRequests: state.rateLimitTracker.requests.length,
                sessionStorageKey: `gallery_${getEventFromPage()}_state`,
                hasSessionStorage: !!sessionStorage.getItem(
                    `gallery_${getEventFromPage()}_state`
                )
            });
            console.log('🚫 Failed Images:', {
                persistedFailures: state.failedImages,
                liveFailures: window.galleryDebug.getFailedImages()
            });
            console.groupEnd();
        }
    };

    // Cleanup function for page navigation
    window.galleryCleanup = () => {
    // Save state before cleanup
        saveState();

        // Clean up observers
        if (state.lazyObserver) {
            state.lazyObserver.destroy();
        }

        // Clean up intersection observers for sentinels
        const sentinels = document.querySelectorAll('[id*="load-more-sentinel"]');
        sentinels.forEach((sentinel) => {
            if (sentinel._observer) {
                sentinel._observer.disconnect();
            }
        });

        // Clear caches
        RequestManager.clearCache();

        console.log('🧹 Gallery cleanup completed');
    };
})();
