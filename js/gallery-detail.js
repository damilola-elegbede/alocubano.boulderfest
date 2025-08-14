// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2025-07-22-PERFORMANCE-OPTIMIZED
(function() {
    // Import performance optimization modules
    // Removed unused variable: prefetchManager
    let progressiveLoader = null;
    let cacheWarmer = null;

    // Initialize performance modules when available
    function initPerformanceModules() {
        try {
            // Removed unused prefetchManager initialization

            if (typeof ProgressiveImageLoader !== 'undefined') {
                progressiveLoader = new ProgressiveImageLoader();
                // Console statement removed
            }

            if (typeof CacheWarmer !== 'undefined') {
                cacheWarmer = new CacheWarmer();
                // Console statement removed
            }
        } catch {
            // Console statement removed
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

        // Console statement removed
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
            // Console statement removed
        } catch {
            // Console statement removed
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

            // Console statement removed
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
                // Console statement removed
                return false;
            }

            const persistedState = JSON.parse(savedState);

            // Check version compatibility
            const stateVersion = persistedState.version || 1; // Default to v1 for old states
            if (stateVersion > CONFIG.STATE_VERSION) {
                // Console statement removed
                sessionStorage.removeItem(stateKey);
                return false;
            }

            // Migrate old state formats if needed
            if (stateVersion < CONFIG.STATE_VERSION) {
                // Console statement removed
                migrateState(persistedState, stateVersion);
            }

            // Store timestamp in state for later freshness checks
            state.timestamp = persistedState.timestamp;

            // Check if state is still valid (30 minutes expiry)
            const age = Date.now() - persistedState.timestamp;
            if (age > 30 * 60 * 1000) {
                // Console statement removed
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

            // Console statement removed

            return true;
        } catch {
            // Console statement removed
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

        // Console statement removed

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

        state.displayOrder.forEach((item) => {
            const itemKey = `${item.category}_${item.id}`;

            // Skip if item already exists in DOM
            if (existingItems.has(itemKey)) {
                // Console statement removed
                return;
            }
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

        // Console statement removed

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
            // Note: NOT setting data-loaded="true" yet - lazy loading needs to happen first
        });

        // Now observe lazy items (they still have data-loaded="false")
        observeLazyItems();

        // Wait a brief moment for lazy loading to initialize, then mark as loaded for tracking
        setTimeout(() => {
            items.forEach((item) => {
                // Only mark as loaded for tracking purposes, but don't interfere with lazy loading
                item.setAttribute('data-handler-loaded', 'true');
            });
        }, 100);

        // Restore lightbox state
        state.lightboxItems = state.displayOrder;
        state.lightboxCategories = state.displayOrder.map((item) => item.category);

        // Console statement removed

        // Re-setup infinite scroll if needed
        if (state.hasMorePages) {
            const year = getYearFromPage();
            setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
        }

        // After DOM is restored, check for failed images and retry them
        // Filter out images that were already successfully loaded
        const imagesToRetry = state.failedImages.filter(
            (src) => !state.successfulImages.has(src)
        );
        if (imagesToRetry.length > 0) {
            // Console statement removed

            // Wait a bit for LazyLoader to be fully initialized
            setTimeout(() => {
                // Access the global LazyLoader instance
                const lazyLoader = window.galleryLazyLoader || state.lazyObserver;

                if (
                    lazyLoader &&
          typeof lazyLoader.retryAllFailedImages === 'function'
                ) {
                    // Console statement removed
                    lazyLoader.retryAllFailedImages();
                } else {
                    // Console statement removed

                    // Fallback: manually trigger loading for failed images
                    imagesToRetry.forEach((imageSrc) => {
                        const imgElements = document.querySelectorAll(
                            `img[data-src="${imageSrc}"]`
                        );
                        imgElements.forEach((img) => {
                            // Mark as not loaded to trigger lazy loading again
                            const container = img.closest('.lazy-item');
                            if (container) {
                                container.setAttribute('data-loaded', 'false');
                            }
                        });
                    });

                    // Re-observe to trigger loading
                    observeLazyItems();
                }
            }, 500); // Small delay to ensure LazyLoader is ready
        }
    }

    // Sequential loading algorithm for category-aware pagination
    function getNextPageItems(allCategories, pageSize = 20) {
        // Console statement removed

        const items = [];
        let remainingSpace = pageSize;

        // First, fill with workshops if any remain
        if (state.workshopOffset < state.workshopTotal && remainingSpace > 0) {
            const workshopItems = allCategories.workshops.slice(
                state.workshopOffset,
                state.workshopOffset + remainingSpace
            );
            // Console statement removed

            items.push(
                ...workshopItems.map((item) => ({ ...item, category: 'workshops' }))
            );
            state.workshopOffset += workshopItems.length;
            remainingSpace -= workshopItems.length;
        } else {
            // Console statement removed
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
                // Console statement removed
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
                    // Console statement removed
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
                    // Console statement removed
                }
            }

            // Check rate limit
            if (this.isRateLimited()) {
                // Console statement removed
                await new Promise((resolve) =>
                    setTimeout(resolve, CONFIG.RATE_LIMIT.RETRY_DELAY)
                );

                if (this.isRateLimited()) {
                    throw new Error(
                        'Rate limit exceeded. Please wait before making more requests.'
                    );
                }
            }

            // Console statement removed
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
            // Console statement removed
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
        // Console statement removed

        // Clear any stale session storage that might interfere with workshop photos
        const event = getEventFromPage();
        const stateKey = `gallery_${event}_state`;
        // Console statement removed
        sessionStorage.removeItem(stateKey);

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

        // Console statement removed

        // Initialize lazy loading observer
        initLazyLoading();

        // Check for saved state FIRST - this is the key change
        const stateRestored = restoreState();

        if (stateRestored && state.displayOrder.length > 0) {
            // Check if state is fresh (less than 30 minutes old)
            const stateAge = Date.now() - (state.timestamp || 0);
            const STATE_FRESHNESS_THRESHOLD = 30 * 60 * 1000; // 30 minutes

            if (stateAge < STATE_FRESHNESS_THRESHOLD) {
                // Console statement removed
                // Console statement removed} minutes`);

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
                // Console statement removed

                return; // Exit early - no need to load fresh data
            } else {
                // Console statement removed

                // Clear stale state
                const eventForState = getEventFromPage();
                const stateKey = `gallery_${eventForState}_state`;
                sessionStorage.removeItem(stateKey);

                // Reset state to initial values
                resetGalleryState();
            }
        }

        // Only load fresh data if we don't have valid cached state
        // Console statement removed
        await loadNextPage(year, loadingEl, contentEl, staticEl);
    }

    // Load next page of photos with mutex protection
    async function loadNextPage(year, loadingEl, contentEl, staticEl) {
        // Prevent concurrent loading with mutex pattern
        if (state.loadingMutex || !state.hasMorePages) {
            // Console statement removed
            return;
        }

        // Console statement removed

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
            let apiUrl;
            let isStaticFetch = false;

            // For the first page, load the static JSON file.
            if (offset === 0) {
                isStaticFetch = true;
                // Try event-specific file first, fallback to year-based
                const event = getEventFromPage();
                apiUrl = `/gallery-data/${event}.json?timestamp=${Date.now()}`;
                // Console statement removed
            } else {
                // Check if we've already loaded all available items
                if (
                    state.hasCompleteDataset ||
          state.itemsDisplayed >= state.totalItemsAvailable
                ) {
                    // Console statement removed
                    state.hasMorePages = false;
                    // Double-check consistency
                    if (state.itemsDisplayed > state.totalItemsAvailable) {
                        // Console statement removed
                    }
                    return;
                }

                // For subsequent pages (infinite scroll), hit the API.
                const event = getEventFromPage();
                apiUrl = `${CONFIG.API_ENDPOINT}?year=${year}&event=${event}&limit=${CONFIG.PAGINATION_SIZE}&offset=${offset}&timestamp=${Date.now()}`;
                // Console statement removed
            }

            // Console statement removed
            const startTime = performance.now();

            const response = await RequestManager.cachedFetch(apiUrl, {
                method: 'GET',
                headers: {
                    Accept: 'application/json'
                }
            });

            const loadTime = performance.now() - startTime;
            state.performanceMetrics.loadTimes.push(loadTime);
            // Console statement removed}ms`);

            // Console statement removed});

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            // Console statement removed: []

            // If we fetched the static file, it contains ALL items.
            // We need to manually slice the first page.
            if (isStaticFetch) {
                // Console statement removed

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

                // Console statement removed

                // Debug: Log the state before getting first page
                // Console statement removed

                // Get first page using sequential algorithm
                const pageItems = getNextPageItems(
                    state.allCategories,
                    CONFIG.PAGINATION_SIZE
                );

                // Debug: Log what we got from getNextPageItems
                // Console statement removed

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

                // Console statement removed

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
                // For subsequent pages, use sequential algorithm with stored categories
                // Console statement removed

                // Get next page using sequential algorithm
                const pageItems = getNextPageItems(
                    state.allCategories,
                    CONFIG.PAGINATION_SIZE
                );

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

                state.itemsDisplayed += pageItems.length;
                state.loadedPages++;

                // Check if we've reached the total
                if (
                    state.itemsDisplayed >= state.totalItemsAvailable ||
          !state.hasMorePages
                ) {
                    state.hasCompleteDataset = true;
                    // Console statement removed
                }

                // Console statement removed
                // Console statement removed

                // Display the gallery with just the new items (append mode)
                displayGalleryData(
                    {
                        categories: paginatedCategories,
                        totalCount: state.totalItemsAvailable,
                        hasMore: state.hasMorePages
                    },
                    contentEl,
                    staticEl,
                    loadingEl,
                    true
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
        } catch {
            // Console statement removed
            // Console statement removed

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
        categoryOffset = 0, // eslint-disable-line no-unused-vars
        isAppend = false
    ) {
        // categoryOffset parameter kept for API compatibility but not used internally
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
            // Console statement removed
            return;
        }

        const uniqueItems = items.filter((item) => {
            // Create category-aware item ID to prevent duplicates within categories
            const itemId = `${categoryName}_${item.id || item.name}`;
            // Check against displayed items, not all loaded items
            if (state.displayedItemIds.has(itemId)) {
                // Only log if we're in debug mode or this is unexpected
                if (window.galleryDebug?.verbose) {
                    // Console statement removed
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
            // // Console statement removed

            return true;
        });

        // Console statement removed
        // Console statement removed

        for (let i = 0; i < uniqueItems.length; i += BATCH_SIZE) {
            const batch = uniqueItems.slice(i, i + BATCH_SIZE);
            const batchHTML = batch
                .map((item) => {
                    const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
                    // Use the actual display order index
                    const displayOrderItem = state.displayOrder.find(
                        (d) => d.id === item.id && d.category === categoryName
                    );
                    const globalIndex = displayOrderItem
                        ? displayOrderItem.displayIndex
                        : state.displayOrder.length - 1;

                    return `
          <div class="gallery-item lazy-item gallery-image-container" data-index="${globalIndex}" data-category="${categoryName}" data-loaded="false">
            <div class="gallery-item-media">
              <div class="lazy-placeholder">
                <div class="loading-spinner">📸</div>
              </div>
              <img data-src="${item.thumbnailUrl}" 
                   data-thumbnail="${item.thumbnailUrl}" 
                   data-dominant-color="#f0f0f0"
                   data-width="400" 
                   data-height="300"
                   data-progressive="true"
                   data-image-id="${item.id || globalIndex}"
                   alt="${title}" 
                   class="lazy-image gallery-image" 
                   style="display: none;">
            </div>
          </div>
        `;
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
    }

    // Display gallery data with lazy loading and append mode
    async function displayGalleryData(
        data,
        contentEl,
        staticEl,
        loadingEl,
        appendMode = false
    ) {
        // Console statement removed

        // Check if we have any categories with items
        let hasItems = false;
        Object.values(data.categories || {}).forEach((items) => {
            if (items?.length > 0) {
                hasItems = true;
            }
        });

        if (!hasItems && !appendMode) {
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
            if (workshopsSection && workshopsGallery && workshopItems.length > 0) {
                workshopsSection.style.display = 'block';
                await insertItemsProgressively(
                    workshopItems,
                    workshopsGallery,
                    'workshops',
                    0,
                    appendMode
                );
            }

            // Update Socials section
            const socialsSection = document.getElementById('socials-section');
            const socialsGallery = document.getElementById('socials-gallery');
            if (socialsSection && socialsGallery && socialItems.length > 0) {
                socialsSection.style.display = 'block';
                await insertItemsProgressively(
                    socialItems,
                    socialsGallery,
                    'socials',
                    workshopItems.length,
                    appendMode
                );
            }

            // Add click handlers for lightbox (only for new items if appending)
            const selector = appendMode
                ? '.gallery-item[data-loaded="false"]:not([data-handler-loaded="true"])'
                : '.gallery-item:not([data-handler-loaded="true"])';
            const items = contentEl.querySelectorAll(selector);
            // Console statement removed
            items.forEach((item) => {
                setupGalleryItemHandlers(item, data);
                // Don't set data-loaded="true" immediately - let lazy loading happen first
            });

            // Observe new lazy items AFTER handlers are attached
            observeLazyItems();

            // Mark items as handler-loaded for tracking without interfering with lazy loading
            setTimeout(() => {
                items.forEach((item) => {
                    item.setAttribute('data-handler-loaded', 'true');
                });
            }, 100);
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
    function setupGalleryItemHandlers(item) {
    // Skip if handlers already attached
        if (item.getAttribute('data-handler-loaded') === 'true') {
            return;
        }

        const displayIndex = parseInt(item.dataset.index);

        // Use event delegation to handle lazy-loaded content
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Console statement removed

            // Ensure we use the correct items array
            if (state.displayOrder.length > displayIndex) {
                openLightbox(state.displayOrder, displayIndex);
            } else {
                // Console statement removed
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
            // Console statement removed
            return;
        }

        state.lazyObserver = LazyLoader.createAdvanced({
            selector: '.lazy-item[data-loaded="false"]',
            rootMargin: CONFIG.LAZY_LOAD_THRESHOLD,
            threshold: 0.1,
            onError: (element, error, info) => {
                // Update failed images state immediately when an error occurs
                if (info?.src && !state.failedImages.includes(info.src)) {
                    state.failedImages.push(info.src);
                    // Remove from successful images if it was there
                    state.successfulImages.delete(info.src);
                    // Console statement removed
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
                state.lazyObserver.failedImages.forEach((info) => {
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
                        // Console statement removed

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
            // Console statement removed
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

    function openLightbox(items, index) {
        if (!state.lightbox) {
            // Console statement removed
            return;
        }

        // // Console statement removed

        // Verify category indices for debugging
        // if (currentItem.category === 'socials') {
        //     // Console statement removed.map(i => ({
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

    // Removed unused function: closeLightbox

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
    // Removed unused cache functions

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
            // Console statement removed
        },
        resetPerformanceMetrics: () => {
            state.performanceMetrics = {
                loadTimes: [],
                cacheHits: 0,
                cacheMisses: 0
            };
            // Console statement removed
        },
        retryFailedImages: () => {
            const lazyLoader = window.galleryLazyLoader || state.lazyObserver;
            if (lazyLoader && typeof lazyLoader.retryAllFailedImages === 'function') {
                // Console statement removed
                lazyLoader.retryAllFailedImages();
            } else {
                // Console statement removed
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
            // Console statement removed
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

        // Console statement removed
    };
})();
