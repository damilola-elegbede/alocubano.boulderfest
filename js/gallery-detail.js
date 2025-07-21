// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2025-07-20-DEBUG-ENHANCED
(function() {
  'use strict';

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
    observedSentinels: new Set(), // Track intersection observer sentinels
    requestCache: new Map(), // Cache for API requests
    rateLimitTracker: {
      requests: [],
      isBlocked: false
    },
    performanceMetrics: {
      loadTimes: [],
      cacheHits: 0,
      cacheMisses: 0
    }
  };

  // Rate limiting and request caching utilities
  class RequestManager {
    static isRateLimited() {
      const now = Date.now();
      const windowStart = now - CONFIG.RATE_LIMIT.WINDOW_MS;
      
      // Clean old requests
      state.rateLimitTracker.requests = state.rateLimitTracker.requests.filter(
        timestamp => timestamp > windowStart
      );
      
      return state.rateLimitTracker.requests.length >= CONFIG.RATE_LIMIT.MAX_REQUESTS;
    }

    static recordRequest() {
      state.rateLimitTracker.requests.push(Date.now());
    }

    static async cachedFetch(url, options = {}) {
      const cacheKey = `${url}:${JSON.stringify(options)}`;
      const cached = state.requestCache.get(cacheKey);
      const now = Date.now();

      // Check cache first
      if (cached && (now - cached.timestamp) < CONFIG.REQUEST_CACHE_DURATION) {
        console.log('🎯 Cache hit for:', url);
        state.performanceMetrics.cacheHits++;
        return cached.response;
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
    }

    static clearCache() {
      state.requestCache.clear();
      console.log('🧹 Request cache cleared');
    }

    static getPerformanceStats() {
      return {
        cacheHitRatio: state.performanceMetrics.cacheHits / (state.performanceMetrics.cacheHits + state.performanceMetrics.cacheMisses),
        totalRequests: state.performanceMetrics.cacheHits + state.performanceMetrics.cacheMisses,
        averageLoadTime: state.performanceMetrics.loadTimes.reduce((a, b) => a + b, 0) / state.performanceMetrics.loadTimes.length || 0
      };
    }
  }

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
    
    // Load first page
    await loadNextPage(year, loadingEl, contentEl, staticEl);
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
        if (loadingEl) loadingEl.style.display = 'block';
        if (staticEl) staticEl.style.display = 'none';
      }
      
      // Calculate offset
      const offset = state.loadedPages * CONFIG.PAGINATION_SIZE;
      let apiUrl;
      let isStaticFetch = false;
      let data;

      // For the first page, load the static JSON file.
      if (offset === 0) {
        isStaticFetch = true;
        // Use absolute path to ensure it works from any page location
        apiUrl = `/gallery-data/${year}.json?timestamp=${Date.now()}`;
        console.log('🔥 Loading initial data from static cache:', apiUrl);
      } else {
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
        const allItems = [];
        Object.values(data.categories || {}).forEach(categoryItems => {
          allItems.push(...categoryItems);
        });
        console.log(`📊 Total items in static data: ${allItems.length}`);
        
        state.hasMorePages = allItems.length > CONFIG.PAGINATION_SIZE;
        
        // Manually paginate the data from the static file for the first display
        const paginatedCategories = {};
        const workshopsPage = (data.categories.workshops || []).slice(0, 20);
        const socialsPage = (data.categories.socials || []).slice(0, 20);
        
        if (workshopsPage.length > 0) {
          paginatedCategories.workshops = workshopsPage;
        }
        if (socialsPage.length > 0) {
          paginatedCategories.socials = socialsPage;
        }
        const itemCount = workshopsPage.length + socialsPage.length;
        
        // Store all categories for future pagination
        state.allCategories = data.categories || {};
        
        // Store category counts
        for (const [categoryName, items] of Object.entries(data.categories || {})) {
          state.categoryCounts[categoryName] = items.length;
        }
        
        state.loadedPages++;
        
        console.log(`📦 Loaded static data, displaying first ${itemCount} items.`);
        
        // Display paginated data
        displayGalleryData({
          categories: paginatedCategories,
          totalCount: data.totalCount,
          hasMore: state.hasMorePages
        }, contentEl, staticEl, loadingEl, false);
        
      } else {
        // This is the existing logic for paginated API calls
        console.log(`📦 Received page ${state.loadedPages + 1}: ${data.items ? data.items.length : 0} items, hasMore: ${data.hasMore}`);
        state.hasMorePages = data.hasMore || false;
        state.loadedPages++;
        
        // Merge categories for subsequent pages
        if (!state.allCategories) {
          state.allCategories = {};
        }
        
        // Append new items to existing categories
        for (const [categoryName, items] of Object.entries(data.categories || {})) {
          if (!state.allCategories[categoryName]) {
            state.allCategories[categoryName] = [];
          }
          state.allCategories[categoryName].push(...items);
        }
        
        // Display the gallery (append mode for subsequent pages)
        displayGalleryData({
          categories: state.allCategories,
          totalCount: data.totalCount,
          hasMore: data.hasMore
        }, contentEl, staticEl, loadingEl, true);
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
        if (loadingEl) loadingEl.style.display = 'none';
        if (staticEl) staticEl.style.display = 'block';
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
    const uniqueItems = items.filter(item => {
      const itemId = `${categoryName}_${item.id || item.name}`;
      if (state.loadedItemIds.has(itemId)) {
        console.warn(`🚫 Duplicate item prevented: ${itemId}`);
        return false;
      }
      state.loadedItemIds.add(itemId);
      return true;
    });

    console.log(`🔄 Progressive insert: ${uniqueItems.length} items in batches of ${BATCH_SIZE}`);
    
    for (let i = 0; i < uniqueItems.length; i += BATCH_SIZE) {
      const batch = uniqueItems.slice(i, i + BATCH_SIZE);
      const batchHTML = batch.map((item, index) => {
        const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
        const globalIndex = (i + index) + categoryOffset;
        
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
    if (data && data.categories) {
      Object.values(data.categories).forEach(items => {
        if (items && items.length > 0) hasItems = true;
      });
    }
    
    if (!hasItems && !appendMode) {
      // Show static content if no items on first load
      if (loadingEl) loadingEl.style.display = 'none';
      if (staticEl) staticEl.style.display = 'block';
      return;
    }

    // Hide loading and static content on first load
    if (!appendMode) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (staticEl) staticEl.style.display = 'none';
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
    const index = parseInt(item.dataset.index);
    // Add click handler to gallery items
    item.addEventListener('click', () => {
      openLightbox(state.lightboxItems, index);
    });
    item.style.cursor = 'pointer';
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
      threshold: 0.1
    });
  }

  // Observe new lazy items
  function observeLazyItems() {
    if (!state.lazyObserver) return;
    
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
      if (!cached) return null;
      
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
    resetPerformanceMetrics: () => {
      state.performanceMetrics = {
        loadTimes: [],
        cacheHits: 0,
        cacheMisses: 0
      };
      console.log('📊 Performance metrics reset');
    },
    logCurrentState: () => {
      console.group('🔍 Gallery Debug Info');
      console.log('📊 Performance Stats:', RequestManager.getPerformanceStats());
      console.log('📋 State Overview:', {
        loadedPages: state.loadedPages,
        hasMorePages: state.hasMorePages,
        isLoading: state.isLoading,
        loadingMutex: state.loadingMutex,
        loadedItems: state.loadedItemIds.size,
        lightboxItems: state.lightboxItems.length
      });
      console.log('🎯 Cache Status:', {
        requestCacheSize: state.requestCache.size,
        rateLimitRequests: state.rateLimitTracker.requests.length
      });
      console.groupEnd();
    }
  };

  // Cleanup function for page navigation
  window.galleryCleanup = () => {
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