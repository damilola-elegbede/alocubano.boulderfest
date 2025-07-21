// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2025-07-20-DEBUG-ENHANCED
(function() {

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
        REQUEST_CACHE_DURATION: 300000 // Cache API requests for 5 minutes
    };

    // Gallery state with improved concurrency control and performance tracking
    const state = {
        isLoading: false,
        loadingMutex: false, // Prevent concurrent loading operations
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
        workshopOffset: 0,           // Current position in workshops array
        socialOffset: 0,             // Current position in socials array
        workshopTotal: 0,            // Total workshop items available
        socialTotal: 0,              // Total social items available
        currentCategory: 'workshops', // Which category we're currently loading
        displayOrder: [],            // Array tracking display order for lightbox
        failedImages: [],            // Track failed image loads for retry
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

    // State persistence functions
    function saveState() {
        try {
            const year = getYearFromPage();
            const stateKey = `gallery_${year}_state`;

            const persistedState = {
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
                categoryItemCounts: state.categoryItemCounts
            };

            sessionStorage.setItem(stateKey, JSON.stringify(persistedState));
            console.log('💾 Gallery state saved to sessionStorage');
        } catch (error) {
            console.error('Failed to save gallery state:', error);
        }
    }

    function restoreState() {
        try {
            const year = getYearFromPage();
            const stateKey = `gallery_${year}_state`;
            const savedState = sessionStorage.getItem(stateKey);

            if (!savedState) {
                console.log('No saved state found');
                return false;
            }

            const persistedState = JSON.parse(savedState);

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
            state.categoryItemCounts = persistedState.categoryItemCounts || { workshops: 0, socials: 0 };

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

        // Clear displayedItemIds before restoration to prevent duplicate detection
        // We'll rebuild it as we restore the DOM
        state.displayedItemIds.clear();

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

        state.displayOrder.forEach(item => {
            if (item.category === 'workshops') {
                categorizedItems.workshops.push(item);
                // Update counter to the highest categoryIndex + 1
                if (item.categoryIndex !== undefined) {
                    state.categoryItemCounts.workshops = Math.max(state.categoryItemCounts.workshops, item.categoryIndex + 1);
                }
            } else if (item.category === 'socials') {
                categorizedItems.socials.push(item);
                // Update counter to the highest categoryIndex + 1
                if (item.categoryIndex !== undefined) {
                    state.categoryItemCounts.socials = Math.max(state.categoryItemCounts.socials, item.categoryIndex + 1);
                }
            }
        });

        // Restore workshops section
        const workshopsSection = document.getElementById('workshops-section');
        const workshopsGallery = document.getElementById('workshops-gallery');
        if (workshopsSection && workshopsGallery && categorizedItems.workshops.length > 0) {
            workshopsSection.style.display = 'block';
            await insertItemsProgressively(categorizedItems.workshops, workshopsGallery, 'workshops', 0, false);
        }

        // Restore socials section
        const socialsSection = document.getElementById('socials-section');
        const socialsGallery = document.getElementById('socials-gallery');
        if (socialsSection && socialsGallery && categorizedItems.socials.length > 0) {
            socialsSection.style.display = 'block';
            await insertItemsProgressively(categorizedItems.socials, socialsGallery, 'socials', categorizedItems.workshops.length, false);
        }

        // Re-observe lazy items and attach handlers
        observeLazyItems();

        const items = contentEl.querySelectorAll('.gallery-item');
        items.forEach((item) => {
            setupGalleryItemHandlers(item, { categories: categorizedItems });
            item.setAttribute('data-loaded', 'true');
        });

        // Restore lightbox state
        state.lightboxItems = state.displayOrder;
        state.lightboxCategories = state.displayOrder.map(item => item.category);

        console.log('✅ DOM restored successfully');
        
        // Re-setup infinite scroll if needed
        if (state.hasMorePages) {
            const year = getYearFromPage();
            setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
        }

        // After DOM is restored, check for failed images and retry them
        if (state.failedImages && state.failedImages.length > 0) {
            console.log(`🔄 Found ${state.failedImages.length} failed images from previous session, retrying...`);

            // Wait a bit for LazyLoader to be fully initialized
            setTimeout(() => {
                // Access the global LazyLoader instance
                const lazyLoader = window.galleryLazyLoader || state.lazyObserver;

                if (lazyLoader && typeof lazyLoader.retryAllFailedImages === 'function') {
                    console.log('♻️ Retrying all failed images from previous session');
                    lazyLoader.retryAllFailedImages();
                } else {
                    console.warn('LazyLoader retry functionality not available');

                    // Fallback: manually trigger loading for failed images
                    state.failedImages.forEach(imageSrc => {
                        const imgElements = document.querySelectorAll(`img[data-src="${imageSrc}"]`);
                        imgElements.forEach(img => {
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
        const items = [];
        let remainingSpace = pageSize;

        // First, fill with workshops if any remain
        if (state.workshopOffset < state.workshopTotal && remainingSpace > 0) {
            const workshopItems = allCategories.workshops.slice(
                state.workshopOffset,
                state.workshopOffset + remainingSpace
            );
            items.push(...workshopItems.map(item => ({...item, category: 'workshops'})));
            state.workshopOffset += workshopItems.length;
            remainingSpace -= workshopItems.length;
        }

        // Then, fill remaining space with socials
        if (state.socialOffset < state.socialTotal && remainingSpace > 0) {
            const socialItems = allCategories.socials.slice(
                state.socialOffset,
                state.socialOffset + remainingSpace
            );
            items.push(...socialItems.map(item => ({...item, category: 'socials'})));
            state.socialOffset += socialItems.length;
        }

        // Update completion state
        state.hasMorePages = state.workshopOffset < state.workshopTotal ||
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
                timestamp => timestamp > windowStart
            );

            return state.rateLimitTracker.requests.length >= CONFIG.RATE_LIMIT.MAX_REQUESTS;
        },

        recordRequest() {
            state.rateLimitTracker.requests.push(Date.now());
        },

        async cachedFetch(url, options = {}) {
            const cacheKey = `${url}:${JSON.stringify(options)}`;
            const cached = state.requestCache.get(cacheKey);
            const now = Date.now();

            // Check cache first
            if (cached && (now - cached.timestamp) < CONFIG.REQUEST_CACHE_DURATION) {
                console.log('🎯 Cache hit for:', url);
                state.performanceMetrics.cacheHits++;
                return cached.response;
            }

            // Clean expired entries periodically
            if (state.requestCache.size > 0 && Math.random() < 0.1) {
                const expiredKeys = [];
                state.requestCache.forEach((value, key) => {
                    if ((now - value.timestamp) >= CONFIG.REQUEST_CACHE_DURATION) {
                        expiredKeys.push(key);
                    }
                });
                expiredKeys.forEach(key => state.requestCache.delete(key));
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
                await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT.RETRY_DELAY));

                if (this.isRateLimited()) {
                    throw new Error('Rate limit exceeded. Please wait before making more requests.');
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
                cacheHitRatio: state.performanceMetrics.cacheHits / (state.performanceMetrics.cacheHits + state.performanceMetrics.cacheMisses),
                totalRequests: state.performanceMetrics.cacheHits + state.performanceMetrics.cacheMisses,
                averageLoadTime: state.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / state.performanceMetrics.loadTimes.length || 0
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

        // Initialize lazy loading observer
        initLazyLoading();

        // Try to restore from saved state
        const stateRestored = restoreState();

        if (stateRestored && state.displayOrder.length > 0) {
            console.log('📚 Using restored state, recreating DOM...');
            await restoreDOM();

            // Update loading state
            updateLoadingState();

            // Set up infinite scroll if more pages exist
            if (state.hasMorePages) {
                setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
            }
        } else {
            // Load first page normally
            await loadNextPage(year, loadingEl, contentEl, staticEl);
        }
    }

    // Load next page of photos with mutex protection
    async function loadNextPage(year, loadingEl, contentEl, staticEl) {
    // Prevent concurrent loading with mutex pattern
        if (state.isLoading || !state.hasMorePages || state.loadingMutex) {
            console.log('⏸️ Skipping load - already loading or no more pages', {
                isLoading: state.isLoading,
                hasMorePages: state.hasMorePages,
                loadingMutex: state.loadingMutex
            });
            return;
        }

        console.log(`📸 Loading page ${state.loadedPages + 1}...`);

        try {
            // Set both loading flags for maximum protection
            state.isLoading = true;
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
            let data; // eslint-disable-line prefer-const

            // For the first page, load the static JSON file.
            if (offset === 0) {
                isStaticFetch = true;
                // Use absolute path to ensure it works from any page location
                apiUrl = `/gallery-data/${year}.json?timestamp=${Date.now()}`;
                console.log('🔥 Loading initial data from static cache:', apiUrl);
            } else {
                // Check if we've already loaded all available items
                if (state.hasCompleteDataset || state.itemsDisplayed >= state.totalItemsAvailable) {
                    console.log('✅ All items already displayed', {
                        hasCompleteDataset: state.hasCompleteDataset,
                        itemsDisplayed: state.itemsDisplayed,
                        totalItemsAvailable: state.totalItemsAvailable
                    });
                    state.hasMorePages = false;
                    // Double-check consistency
                    if (state.itemsDisplayed > state.totalItemsAvailable) {
                        console.warn('⚠️ State inconsistency detected: itemsDisplayed > totalItemsAvailable');
                    }
                    return;
                }

                // For subsequent pages (infinite scroll), hit the API.
                apiUrl = `${CONFIG.API_ENDPOINT}?year=${year}&limit=${CONFIG.PAGINATION_SIZE}&offset=${offset}&timestamp=${Date.now()}`;
                console.log('🔥 Making paginated API call to:', apiUrl);
            }

            console.log('Fetching from URL:', apiUrl);
            const startTime = performance.now();

            const response = await RequestManager.cachedFetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
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

            if (!response.ok) {
                throw new Error(`API error: ${response.status} ${response.statusText}`);
            }

            data = await response.json();
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

                for (const [categoryName, items] of Object.entries(data.categories || {})) {
                    state.categoryCounts[categoryName] = items.length;
                }

                console.log(`📊 Total items in static data: workshops=${state.workshopTotal}, socials=${state.socialTotal}, total=${state.totalItemsAvailable}`);

                // Get first page using sequential algorithm
                const pageItems = getNextPageItems(state.allCategories, CONFIG.PAGINATION_SIZE);

                // Organize items back into categories for display
                const paginatedCategories = {
                    workshops: [],
                    socials: []
                };

                pageItems.forEach(item => {
                    if (item.category === 'workshops') {
                        paginatedCategories.workshops.push(item);
                    } else if (item.category === 'socials') {
                        paginatedCategories.socials.push(item);
                    }
                });

                state.itemsDisplayed = pageItems.length;
                state.loadedPages++;

                // If we have 20 or fewer items total, we've loaded everything
                state.hasCompleteDataset = state.totalItemsAvailable <= CONFIG.PAGINATION_SIZE;

                console.log(`📦 Loaded static data: ${state.totalItemsAvailable} total items, displaying ${state.itemsDisplayed}, hasMore: ${state.hasMorePages}, complete: ${state.hasCompleteDataset}`);
                console.log(`📍 Offsets: workshops=${state.workshopOffset}/${state.workshopTotal}, socials=${state.socialOffset}/${state.socialTotal}`);

                // Display paginated data
                displayGalleryData({
                    categories: paginatedCategories,
                    totalCount: data.totalCount,
                    hasMore: state.hasMorePages
                }, contentEl, staticEl, loadingEl, false);

                // Update loading state (remove sentinel if complete)
                updateLoadingState();

                // Save state after initial load
                saveState();

            } else {
                // For subsequent pages, use sequential algorithm with stored categories
                console.log(`📦 Loading page ${state.loadedPages + 1} using sequential algorithm`);

                // Get next page using sequential algorithm
                const pageItems = getNextPageItems(state.allCategories, CONFIG.PAGINATION_SIZE);

                // Organize items back into categories for display
                const paginatedCategories = {
                    workshops: [],
                    socials: []
                };

                pageItems.forEach(item => {
                    if (item.category === 'workshops') {
                        paginatedCategories.workshops.push(item);
                    } else if (item.category === 'socials') {
                        paginatedCategories.socials.push(item);
                    }
                });

                state.itemsDisplayed += pageItems.length;
                state.loadedPages++;

                // Check if we've reached the total
                if (state.itemsDisplayed >= state.totalItemsAvailable || !state.hasMorePages) {
                    state.hasCompleteDataset = true;
                    console.log('✅ All items now displayed');
                }

                console.log(`📦 Loaded page ${state.loadedPages}: ${pageItems.length} items, hasMore: ${state.hasMorePages}`);
                console.log(`📍 Offsets: workshops=${state.workshopOffset}/${state.workshopTotal}, socials=${state.socialOffset}/${state.socialTotal}`);

                // Display the gallery with just the new items (append mode)
                displayGalleryData({
                    categories: paginatedCategories,
                    totalCount: state.totalItemsAvailable,
                    hasMore: state.hasMorePages
                }, contentEl, staticEl, loadingEl, true);

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
            // Always clear both loading flags
            state.isLoading = false;
            state.loadingMutex = false;
        }
    }

    // Progressive DOM insertion to prevent UI blocking
    async function insertItemsProgressively(items, container, categoryName, categoryOffset = 0, isAppend = false) {
        const BATCH_SIZE = 5; // Process 5 items at a time
        
        // Initialize category counters if not already present
        if (!state.categoryItemCounts) {
            state.categoryItemCounts = {
                workshops: 0,
                socials: 0
            };
        }
        
        const uniqueItems = items.filter(item => {
            // Create category-aware item ID to prevent duplicates within categories
            const itemId = `${categoryName}_${item.id || item.name}`;
            // Check against displayed items, not all loaded items
            if (state.displayedItemIds.has(itemId)) {
                console.warn(`🚫 Duplicate item prevented: ${itemId}`);
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
                state.categoryItemCounts[categoryName] = Math.max(state.categoryItemCounts[categoryName], categoryIndex + 1);
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
            
            // Debug log for category index tracking
            if (state.displayOrder.length % 10 === 0 || state.displayOrder.length <= 5) {
                console.log(`📍 Item added: ${categoryName} #${categoryIndex + 1}, total items: ${state.displayOrder.length}`);
            }

            return true;
        });

        console.log(`🔄 Progressive insert: ${uniqueItems.length} items in batches of ${BATCH_SIZE}`);
        console.log(`📊 Category counts: workshops=${state.categoryItemCounts.workshops}, socials=${state.categoryItemCounts.socials}`);

        for (let i = 0; i < uniqueItems.length; i += BATCH_SIZE) {
            const batch = uniqueItems.slice(i, i + BATCH_SIZE);
            const batchHTML = batch.map((item, index) => {
                const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
                // Use the actual display order index
                const displayOrderItem = state.displayOrder.find(d =>
                    d.id === item.id && d.category === categoryName
                );
                const globalIndex = displayOrderItem ? displayOrderItem.displayIndex : state.displayOrder.length - 1;

                return `
          <div class="gallery-item lazy-item" data-index="${globalIndex}" data-category="${categoryName}" data-loaded="false">
            <div class="gallery-item-media">
              <div class="lazy-placeholder">
                <div class="loading-spinner">📸</div>
              </div>
              <img data-src="${item.thumbnailUrl}" alt="${title}" class="lazy-image" style="display: none;">
            </div>
          </div>
        `;
            }).join('');

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
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
    }

    // Display gallery data with lazy loading and append mode
    async function displayGalleryData(data, contentEl, staticEl, loadingEl, appendMode = false) {
        console.log('displayGalleryData called with:', {
            hasData: !!data,
            categories: data?.categories ? Object.keys(data.categories) : [],
            appendMode: appendMode,
            contentEl: !!contentEl,
            staticEl: !!staticEl,
            loadingEl: !!loadingEl
        });

        // Check if we have any categories with items
        let hasItems = false;
        Object.values(data.categories || {}).forEach(items => {
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
                await insertItemsProgressively(workshopItems, workshopsGallery, 'workshops', 0, appendMode);
            }

            // Update Socials section
            const socialsSection = document.getElementById('socials-section');
            const socialsGallery = document.getElementById('socials-gallery');
            if (socialsSection && socialsGallery && socialItems.length > 0) {
                socialsSection.style.display = 'block';
                await insertItemsProgressively(socialItems, socialsGallery, 'socials', workshopItems.length, appendMode);
            }

            // Observe new lazy items
            observeLazyItems();

            // Add click handlers for lightbox (only for new items if appending)
            const selector = appendMode ? '.gallery-item[data-loaded="false"]' : '.gallery-item';
            const items = contentEl.querySelectorAll(selector);
            console.log(`🎯 Attaching click handlers to ${items.length} items (appendMode: ${appendMode})`);
            items.forEach((item) => {
                setupGalleryItemHandlers(item, data);
                item.setAttribute('data-loaded', 'true');
            });
        }

        // Store all items for lightbox (flatten categories)
        const allItems = [];
        const allCategories = [];

        for (const [categoryName, items] of Object.entries(data.categories)) {
            items.forEach(item => {
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
                console.error('Index out of bounds:', displayIndex, state.displayOrder.length);
            }
        });

        // Ensure clickable styling
        item.style.cursor = 'pointer';
        item.style.position = 'relative';
        item.style.zIndex = '1';
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
            onError: (element, error, info) => {
                // Update failed images state immediately when an error occurs
                if (info?.src && !state.failedImages.includes(info.src)) {
                    state.failedImages.push(info.src);
                    console.log(`📌 Added failed image to state: ${info.src}`);
                    // Save state immediately to persist failed images
                    saveState();
                }
            }
        });

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

        const lazyItems = document.querySelectorAll('.lazy-item[data-loaded="false"]');
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
        sentinel.innerHTML = '<div class="loading-more">Loading more photos...</div>';
        sentinel.style.cssText = 'height: 50px; display: flex; align-items: center; justify-content: center; margin: 2rem 0;';

        // Insert before gallery stats section
        const galleryStats = document.querySelector('.gallery-stats');
        if (galleryStats) {
            galleryStats.parentNode.insertBefore(sentinel, galleryStats);
        } else {
            document.querySelector('main').appendChild(sentinel);
        }

        // Create single-use observer to prevent duplicate triggers
        const scrollObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && state.hasMorePages && !state.isLoading && !state.loadingMutex) {
                    console.log('📜 Infinite scroll triggered');

                    // Immediately disconnect observer to prevent duplicate triggers
                    scrollObserver.unobserve(entry.target);

                    // Load next page
                    loadNextPage(year, loadingEl, contentEl, staticEl);
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.1
        });

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

    function openLightbox(items, index) {
        if (!state.lightbox) {
            console.error('Lightbox not initialized!');
            return;
        }

        console.log('🏞️ Opening lightbox:', {
            itemsCount: items.length,
            index: index,
            item: items[index]
        });

        state.lightboxItems = items;
        state.currentLightboxIndex = index;
        state.lightboxCategories = items.map(item => item.category || 'uncategorized');

        state.lightbox.openAdvanced(items, index, state.lightboxCategories, state.categoryCounts);
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
            const year = getYearFromPage();
            const stateKey = `gallery_${year}_state`;
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
            console.log('📊 Performance Stats:', RequestManager.getPerformanceStats());
            console.log('📋 State Overview:', {
                loadedPages: state.loadedPages,
                hasMorePages: state.hasMorePages,
                isLoading: state.isLoading,
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
                sessionStorageKey: `gallery_${getYearFromPage()}_state`,
                hasSessionStorage: !!sessionStorage.getItem(`gallery_${getYearFromPage()}_state`)
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
        sentinels.forEach(sentinel => {
            if (sentinel._observer) {
                sentinel._observer.disconnect();
            }
        });

        // Clear caches
        RequestManager.clearCache();

        console.log('🧹 Gallery cleanup completed');
    };

})();