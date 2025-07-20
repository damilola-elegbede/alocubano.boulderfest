// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2025-07-20-DEBUG-ENHANCED
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
    CACHE_KEY: 'gallery_cache',
    CACHE_DURATION: 3600000, // 1 hour in milliseconds
    LOADING_TIMEOUT: 10000, // 10 seconds for initial load
    PAGINATION_SIZE: 20, // Load 20 photos at a time
    LAZY_LOAD_THRESHOLD: '200px' // Start loading when 200px away from viewport
  };

  // Gallery state
  const state = {
    isLoading: false,
    galleryData: null,
    currentLightboxIndex: -1,
    lightboxItems: [],
    lightboxCategories: [], // Track category for each item
    loadedPages: 0,
    hasMorePages: true,
    lazyObserver: null,
    allCategories: {},
    categoryCounts: {} // Store counts per category
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

  // Load next page of photos
  async function loadNextPage(year, loadingEl, contentEl, staticEl) {
    if (state.isLoading || !state.hasMorePages) {
      return;
    }

    console.log(`📸 Loading page ${state.loadedPages + 1}...`);
    
    try {
      state.isLoading = true;
      
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
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
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
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        url: apiUrl
      });
      
      // Show static fallback only on first page
      if (state.loadedPages === 0) {
        if (loadingEl) loadingEl.style.display = 'none';
        if (staticEl) staticEl.style.display = 'block';
      }
      
    } finally {
      state.isLoading = false;
    }
  }

  // Display gallery data with lazy loading and append mode
  function displayGalleryData(data, contentEl, staticEl, loadingEl, appendMode = false) {
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

    // Function to build gallery HTML for a category with lazy loading
    function buildGalleryHTML(items, categoryName, categoryOffset = 0, isAppend = false) {
      return items.map((item, index) => {
        const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
        const globalIndex = index + categoryOffset;
        
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
    }

    // Update content sections
    if (contentEl) {
      contentEl.style.display = 'block';
      
      // Update Workshops section
      const workshopsSection = document.getElementById('workshops-section');
      const workshopsGallery = document.getElementById('workshops-gallery');
      if (workshopsSection && workshopsGallery && workshopItems.length > 0) {
        workshopsSection.style.display = 'block';
        if (appendMode) {
          // Append new items
          workshopsGallery.insertAdjacentHTML('beforeend', buildGalleryHTML(workshopItems, 'workshops', 0, true));
        } else {
          // Replace all items
          workshopsGallery.innerHTML = buildGalleryHTML(workshopItems, 'workshops', 0);
        }
      }
      
      // Update Socials section
      const socialsSection = document.getElementById('socials-section');
      const socialsGallery = document.getElementById('socials-gallery');
      if (socialsSection && socialsGallery && socialItems.length > 0) {
        socialsSection.style.display = 'block';
        if (appendMode) {
          // Append new items
          socialsGallery.insertAdjacentHTML('beforeend', buildGalleryHTML(socialItems, 'socials', workshopItems.length, true));
        } else {
          // Replace all items
          socialsGallery.innerHTML = buildGalleryHTML(socialItems, 'socials', workshopItems.length);
        }
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

  // Initialize lazy loading observer
  function initLazyLoading() {
    if (!('IntersectionObserver' in window)) {
      console.warn('IntersectionObserver not supported, falling back to immediate loading');
      return;
    }

    state.lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const item = entry.target;
          loadLazyItem(item);
          state.lazyObserver.unobserve(item);
        }
      });
    }, {
      rootMargin: CONFIG.LAZY_LOAD_THRESHOLD,
      threshold: 0.1
    });
  }

  // Observe new lazy items
  function observeLazyItems() {
    if (!state.lazyObserver) return;
    
    const lazyItems = document.querySelectorAll('.lazy-item[data-loaded="false"]');
    lazyItems.forEach(item => {
      state.lazyObserver.observe(item);
    });
  }

  // Load lazy item
  function loadLazyItem(item) {
    const lazyImage = item.querySelector('.lazy-image');
    const placeholder = item.querySelector('.lazy-placeholder');
    const spinner = item.querySelector('.loading-spinner');

    if (lazyImage) {
      const src = lazyImage.getAttribute('data-src');
      if (src) {
        lazyImage.onload = () => {
          if (placeholder) placeholder.style.display = 'none';
          lazyImage.style.display = 'block';
          item.classList.add('loaded');
        };
        lazyImage.onerror = () => {
          if (spinner) spinner.textContent = '❌';
          if (placeholder) placeholder.style.display = 'block'; // Keep placeholder visible on error
        };
        lazyImage.src = src;
      }
    }
  }

  // Setup infinite scroll
  function setupInfiniteScroll(year, loadingEl, contentEl, staticEl) {
    // Create or update load more sentinel
    let sentinel = document.getElementById('load-more-sentinel');
    if (!sentinel) {
      sentinel = document.createElement('div');
      sentinel.id = 'load-more-sentinel';
      sentinel.innerHTML = '<div class="loading-more">Loading more photos...</div>';
      sentinel.style.cssText = 'height: 50px; display: flex; align-items: center; justify-content: center; margin: 2rem 0;';
      
      // Insert before gallery stats section
      const galleryStats = document.querySelector('.gallery-stats');
      if (galleryStats) {
        galleryStats.parentNode.insertBefore(sentinel, galleryStats);
      } else {
        document.querySelector('main').appendChild(sentinel);
      }
    }

    // Observe the sentinel for infinite scroll
    const scrollObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && state.hasMorePages && !state.isLoading) {
          console.log('📜 Infinite scroll triggered');
          loadNextPage(year, loadingEl, contentEl, staticEl);
        }
      });
    }, {
      rootMargin: '100px',
      threshold: 0.1
    });

    scrollObserver.observe(sentinel);

    // Clean up when no more pages
    if (!state.hasMorePages) {
      sentinel.style.display = 'none';
      scrollObserver.disconnect();
    }
  }

  // Lightbox functionality (reusing from gallery.js)
  function initLightbox() {
    // Create lightbox HTML if it doesn't exist
    if (!document.getElementById('gallery-lightbox')) {
      const lightboxHTML = `
        <div id="gallery-lightbox" class="gallery-lightbox">
          <div class="lightbox-content">
            <button class="lightbox-close" aria-label="Close">&times;</button>
            <button class="lightbox-prev" aria-label="Previous">‹</button>
            <button class="lightbox-next" aria-label="Next">›</button>
            <div class="lightbox-media-container">
              <img class="lightbox-image" src="" alt="">
            </div>
            <div class="lightbox-caption">
              <h3 class="lightbox-title font-display"></h3>
              <p class="lightbox-counter font-mono"></p>
            </div>
          </div>
        </div>
      `;
      
      document.body.insertAdjacentHTML('beforeend', lightboxHTML);
      
      // Add event listeners
      const lightbox = document.getElementById('gallery-lightbox');
      const closeBtn = lightbox.querySelector('.lightbox-close');
      const prevBtn = lightbox.querySelector('.lightbox-prev');
      const nextBtn = lightbox.querySelector('.lightbox-next');
      
      closeBtn.addEventListener('click', closeLightbox);
      prevBtn.addEventListener('click', () => navigateLightbox(-1));
      nextBtn.addEventListener('click', () => navigateLightbox(1));
      
      // Close on background click
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeLightbox();
      });
      
      // Keyboard navigation
      document.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        
        if (e.key === 'Escape') closeLightbox();
        if (e.key === 'ArrowLeft') navigateLightbox(-1);
        if (e.key === 'ArrowRight') navigateLightbox(1);
      });
    }
  }

  function openLightbox(items, index) {
    state.lightboxItems = items;
    state.currentLightboxIndex = index;
    
    const lightbox = document.getElementById('gallery-lightbox');
    if (!lightbox) {
      console.error('Lightbox element not found!');
      return;
    }
    lightbox.classList.add('active');
    
    updateLightboxContent();
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    const lightbox = document.getElementById('gallery-lightbox');
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }

  function navigateLightbox(direction) {
    const newIndex = state.currentLightboxIndex + direction;
    if (newIndex >= 0 && newIndex < state.lightboxItems.length) {
      state.currentLightboxIndex = newIndex;
      updateLightboxContent();
    }
  }

  function updateLightboxContent() {
    const item = state.lightboxItems[state.currentLightboxIndex];
    const category = state.lightboxCategories[state.currentLightboxIndex];
    const lightbox = document.getElementById('gallery-lightbox');
    
    const img = lightbox.querySelector('.lightbox-image');
    const title = lightbox.querySelector('.lightbox-title');
    const counter = lightbox.querySelector('.lightbox-counter');
    
    // Update image
    img.style.display = 'block';
    img.src = item.viewUrl;
    img.alt = item.name;
    
    // Calculate position within category
    let categoryIndex = 0;
    for (let i = 0; i < state.currentLightboxIndex; i++) {
      if (state.lightboxCategories[i] === category) {
        categoryIndex++;
      }
    }
    
    // Update caption - Remove filename, only show counter
    title.style.display = 'none'; // Hide title element completely
    const categoryCount = state.categoryCounts[category] || state.lightboxItems.length;
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    counter.textContent = `${categoryLabel}: ${categoryIndex + 1} / ${categoryCount}`;
    
    // Update navigation buttons
    const prevBtn = lightbox.querySelector('.lightbox-prev');
    const nextBtn = lightbox.querySelector('.lightbox-next');
    prevBtn.style.display = state.currentLightboxIndex > 0 ? 'block' : 'none';
    nextBtn.style.display = state.currentLightboxIndex < state.lightboxItems.length - 1 ? 'block' : 'none';
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

})();