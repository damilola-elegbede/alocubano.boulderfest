// Gallery Detail Module - Handles individual gallery page functionality
// Cache Buster: v2024-07-20-fix
(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
    CACHE_KEY: 'gallery_cache',
    CACHE_DURATION: 3600000, // 1 hour in milliseconds
    LOADING_TIMEOUT: 3000 // 3 seconds - shorter timeout for better UX
  };

  // Gallery state
  const state = {
    isLoading: false,
    galleryData: null,
    currentLightboxIndex: -1,
    lightboxItems: []
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

  // Load gallery detail data from API
  async function loadGalleryDetailData() {
    const loadingEl = document.getElementById('gallery-detail-loading');
    const contentEl = document.getElementById('gallery-detail-content');
    const staticEl = document.getElementById('gallery-detail-static');

    // Extract year from the page (could be from URL or data attribute)
    const year = getYearFromPage();
    
    // Check cache first (include year in cache key)
    const cachedData = getCachedData(year);
    if (cachedData) {
      displayGalleryData(cachedData, contentEl, staticEl, loadingEl);
      return;
    }

    // Show loading state
    if (loadingEl) loadingEl.style.display = 'block';
    if (staticEl) staticEl.style.display = 'none';

    // Since we know the API doesn't exist yet, show fallback quickly for better UX
    // TODO: Remove this when API is implemented
    console.log('🚨 EARLY RETURN: Gallery API not implemented yet, showing fallback content immediately');
    
    // Show fallback immediately for better UX since API doesn't exist
    if (loadingEl) loadingEl.style.display = 'none';
    if (staticEl) staticEl.style.display = 'block';
    state.isLoading = false;
    
    // EXPLICIT EARLY RETURN TO PREVENT ANY API CALLS
    console.log('🚨 EARLY RETURN: Exiting function to prevent API calls');
    return;
    
    // Comment out API code to prevent 404 errors in console
    // Uncomment when API is implemented
    /*
    try {
      state.isLoading = true;
      
      // Set timeout for loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), CONFIG.LOADING_TIMEOUT)
      );

      // Fetch from API with year parameter
      const fetchPromise = fetch(`${CONFIG.API_ENDPOINT}?year=${year}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const response = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      // Cache the data with year
      setCachedData(data, year);
      
      // Display the gallery
      displayGalleryData(data, contentEl, staticEl, loadingEl);
      
    } catch (error) {
      console.log('Gallery API request failed (expected):', error.message);
      
      // Show static fallback
      if (loadingEl) loadingEl.style.display = 'none';
      if (staticEl) staticEl.style.display = 'block';
      
    } finally {
      state.isLoading = false;
    }
    */
  }

  // Display gallery data
  function displayGalleryData(data, contentEl, staticEl, loadingEl) {
    console.log('displayGalleryData called with:', data);
    if (!data || !data.items || data.items.length === 0) {
      // Show static content if no items
      if (loadingEl) loadingEl.style.display = 'none';
      if (staticEl) staticEl.style.display = 'block';
      return;
    }

    // Hide loading and static content
    if (loadingEl) loadingEl.style.display = 'none';
    if (staticEl) staticEl.style.display = 'none';

    // Separate items by category
    const workshopItems = data.items.filter(item => item.category === 'Workshops');
    const socialItems = data.items.filter(item => item.category === 'Socials');

    // Function to build gallery HTML for a category
    function buildGalleryHTML(items, categoryOffset = 0) {
      return items.map((item, index) => {
        const isVideo = item.type === 'video';
        const title = item.name.replace(/\.[^/.]+$/, ''); // Remove file extension
        const globalIndex = index + categoryOffset;
        
        return `
          <div class="gallery-item" data-index="${globalIndex}">
            <div class="gallery-item-media">
              ${isVideo ? 
                `<video src="${item.viewUrl}" poster="${item.thumbnailUrl}" controls preload="metadata"></video>` :
                `<img src="${item.thumbnailUrl}" alt="${title}" loading="lazy">`
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
        workshopsGallery.innerHTML = buildGalleryHTML(workshopItems, 0);
      }
      
      // Update Socials section
      const socialsSection = document.getElementById('socials-section');
      const socialsGallery = document.getElementById('socials-gallery');
      if (socialsSection && socialsGallery && socialItems.length > 0) {
        socialsSection.style.display = 'block';
        socialsGallery.innerHTML = buildGalleryHTML(socialItems, workshopItems.length);
      }
      
      // Add click handlers for lightbox
      const items = contentEl.querySelectorAll('.gallery-item');
      items.forEach((item) => {
        const index = parseInt(item.dataset.index);
        const mediaElement = item.querySelector('img, video');
        
        // For images, add click handler to the whole item
        if (mediaElement && mediaElement.tagName === 'IMG') {
          item.addEventListener('click', () => {
            openLightbox(data.items, index);
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
                  openLightbox(data.items, index);
                }
              }
            });
          }
        }
      });
    }

    // Store items for lightbox
    state.lightboxItems = data.items;
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