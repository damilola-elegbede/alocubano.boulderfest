// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2024-07-20-fix
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
    loadedPages: 0,
    hasMorePages: true,
    lazyObserver: null,
    allCategories: {}
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
      
      // Fetch from API with pagination
      const apiUrl = `${CONFIG.API_ENDPOINT}?year=${year}&limit=${CONFIG.PAGINATION_SIZE}&offset=${offset}&timestamp=${Date.now()}`;
      console.log('🔥 Making paginated API call to:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`📦 Received page ${state.loadedPages + 1}: ${data.items.length} items, hasMore: ${data.hasMore}`);
      
      // Update state
      state.hasMorePages = data.hasMore || false;
      state.loadedPages++;
      
      // Merge categories for first page, append for subsequent pages
      if (state.loadedPages === 1) {
        state.allCategories = data.categories || {};
      } else {
        // Append new items to existing categories
        for (const [categoryName, items] of Object.entries(data.categories || {})) {
          if (!state.allCategories[categoryName]) {
            state.allCategories[categoryName] = [];
          }
          state.allCategories[categoryName].push(...items);
        }
      }
      
      // Display the gallery (append mode for subsequent pages)
      displayGalleryData({
        categories: state.allCategories,
        totalCount: data.totalCount,
        hasMore: data.hasMore
      }, contentEl, staticEl, loadingEl, state.loadedPages > 1);
      
      // Set up infinite scroll for more pages
      if (state.hasMorePages) {
        setupInfiniteScroll(year, loadingEl, contentEl, staticEl);
      }
      
    } catch (error) {
      console.error('Gallery API request failed:', error.message);
      
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
    console.log('displayGalleryData called with:', data, 'appendMode:', appendMode);
    
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
    function buildGalleryHTML(items, categoryOffset = 0, isAppend = false) {
      return items.map((item, index) => {
        const isVideo = item.type === 'video';
        const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
        const globalIndex = index + categoryOffset;
        
        return `
          <div class="gallery-item lazy-item" data-index="${globalIndex}" data-loaded="false">
            <div class="gallery-item-media">
              ${isVideo ? 
                `<video data-src="${item.viewUrl}" poster="${item.thumbnailUrl}" controls preload="none" class="lazy-video"></video>` :
                `<div class="lazy-placeholder">
                   <img data-src="${item.thumbnailUrl}" alt="${title}" class="lazy-image" style="display: none;">
                   <div class="loading-spinner">📸</div>
                 </div>`
              }
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
          workshopsGallery.insertAdjacentHTML('beforeend', buildGalleryHTML(workshopItems, 0, true));
        } else {
          // Replace all items
          workshopsGallery.innerHTML = buildGalleryHTML(workshopItems, 0);
        }
      }
      
      // Update Socials section
      const socialsSection = document.getElementById('socials-section');
      const socialsGallery = document.getElementById('socials-gallery');
      if (socialsSection && socialsGallery && socialItems.length > 0) {
        socialsSection.style.display = 'block';
        if (appendMode) {
          // Append new items
          socialsGallery.insertAdjacentHTML('beforeend', buildGalleryHTML(socialItems, workshopItems.length, true));
        } else {
          // Replace all items
          socialsGallery.innerHTML = buildGalleryHTML(socialItems, workshopItems.length);
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
    Object.values(data.categories).forEach(items => allItems.push(...items));
    if (appendMode) {
      state.lightboxItems.push(...allItems);
    } else {
      state.lightboxItems = allItems;
    }
  }

  // Setup click handlers for gallery items
  function setupGalleryItemHandlers(item, data) {
    const index = parseInt(item.dataset.index);
    const mediaElement = item.querySelector('img, video');
    
    // For images, add click handler to the whole item
    if (mediaElement && (mediaElement.tagName === 'IMG' || mediaElement.classList.contains('lazy-image'))) {
      item.addEventListener('click', () => {
        openLightbox(state.lightboxItems, index);
      });
      item.style.cursor = 'pointer';
    } else if (mediaElement && mediaElement.tagName === 'VIDEO') {
      // For videos, add click handler only to non-control areas
      const mediaContainer = item.querySelector('.gallery-item-media');
      if (mediaContainer) {
        mediaContainer.style.cursor = 'pointer';
        mediaContainer.addEventListener('click', (e) => {
          // Only open lightbox if not clicking on video controls
          if (e.target === mediaContainer || e.target === mediaElement) {
            const rect = mediaElement.getBoundingClientRect();
            const relativeY = e.clientY - rect.top;
            const controlsHeight = 40; // Approximate height of video controls
            
            // Only open if not clicking in the controls area
            if (relativeY < rect.height - controlsHeight) {
              openLightbox(state.lightboxItems, index);
            }
          }
        });
      }
    }
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
    const lazyVideo = item.querySelector('.lazy-video');
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
        };
        lazyImage.src = src;
      }
    }

    if (lazyVideo) {
      const src = lazyVideo.getAttribute('data-src');
      if (src) {
        lazyVideo.src = src;
        lazyVideo.preload = 'metadata';
        item.classList.add('loaded');
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
              <video class="lightbox-video" controls style="display: none;"></video>
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
    const lightbox = document.getElementById('gallery-lightbox');
    
    const img = lightbox.querySelector('.lightbox-image');
    const video = lightbox.querySelector('.lightbox-video');
    const title = lightbox.querySelector('.lightbox-title');
    const counter = lightbox.querySelector('.lightbox-counter');
    
    // Update media
    if (item.type === 'video') {
      img.style.display = 'none';
      video.style.display = 'block';
      video.src = item.viewUrl;
    } else {
      video.style.display = 'none';
      img.style.display = 'block';
      img.src = item.viewUrl;
      img.alt = item.name;
    }
    
    // Update caption
    title.textContent = item.name.replace(/\.[^/.]+$/, '');
    counter.textContent = `${state.currentLightboxIndex + 1} / ${state.lightboxItems.length}`;
    
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