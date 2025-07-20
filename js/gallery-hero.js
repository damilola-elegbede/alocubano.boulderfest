// Gallery Hero Module - Handles hero image with immediate display and background caching
(function() {
  'use strict';

  console.log('🎬 Gallery hero module loading... DOM state:', document.readyState);

  // Environment detection
  const isDev = window.location.hostname === 'localhost';
  
  // Configuration
  const CONFIG = {
    API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
    FEATURED_API_ENDPOINT: '/api/featured-photos',
    IS_DEV: isDev
  };

  // Helper function to generate image proxy URL based on environment
  function getImageProxyUrl(fileId) {
    if (CONFIG.IS_DEV) {
      // Development: Use Python server proxy
      return `/api/image-proxy/${fileId}`;
    } else {
      // Production: Use Vercel serverless function
      return `/api/image-proxy/${fileId}`;
    }
  }

  console.log('CONFIG:', CONFIG);

  // Initialize gallery hero - handle both cases where DOM is ready or still loading
  function initializeHero() {
    console.log('🚀 Gallery hero initializing...');
    console.log('Looking for hero image element...');
    const heroElement = document.getElementById('hero-splash-image');
    console.log('Hero element found:', !!heroElement);
    
    if (heroElement) {
      console.log('Current hero src:', heroElement.src);
      
      // Get appropriate image immediately (cache check or default)
      setupImmediateImage();
      
      // Backup: Ensure image is set after a short delay if still empty
      setTimeout(() => {
        if (!heroElement.src || heroElement.src.endsWith('/')) {
          console.log('Backup: Hero image still empty, setting default');
          heroElement.src = '/images/hero-default.jpg';
        }
      }, 100);
    }
    
    // Setup error handlers
    setupHeroImageHandlers();
  }

  // Initialize when DOM is ready (handles both cases)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeHero);
  } else {
    // DOM already loaded, initialize immediately
    initializeHero();
  }

  // Setup immediate image display (cache check first, then default)
  function setupImmediateImage() {
    const heroImg = document.getElementById('hero-splash-image');
    if (!heroImg) {
      console.warn('Hero image element not found');
      return;
    }

    // Check if ImageCacheManager is available
    console.log('🔍 Checking ImageCacheManager availability...');
    console.log('  - typeof window.ImageCacheManager:', typeof window.ImageCacheManager);
    console.log('  - window.ImageCacheManager exists:', !!window.ImageCacheManager);
    
    if (typeof window.ImageCacheManager === 'undefined') {
      console.error('ImageCacheManager not loaded, using default image');
      heroImg.src = '/images/hero-default.jpg';
      return;
    }

    // Get immediate image (cache check first, default on miss)
    const imageData = window.ImageCacheManager.getImageForPageImmediate();
    
    console.log('📸 Image data received:', imageData);
    
    if (imageData && imageData.url) {
      console.log('🔄 Setting hero image src to:', imageData.url);
      heroImg.src = imageData.url;
      heroImg.classList.remove('loading');
      heroImg.classList.add('loaded');
      
      if (imageData.isDefault) {
        console.log('✅ Displaying default image for current page');
      } else {
        console.log('🎯 Displaying assigned image:', imageData.name);
      }
    } else {
      console.error('❌ No image data returned, using fallback');
      heroImg.src = '/images/hero-default.jpg';
    }
  }

  // Setup error handling for hero image
  function setupHeroImageHandlers() {
    const heroImg = document.getElementById('hero-splash-image');
    if (!heroImg) return;

    heroImg.onerror = function() {
      console.error('Hero image failed to load:', this.src);
      
      // If it's not the default image that failed, fall back to default
      if (!this.src.includes('hero-default.jpg')) {
        console.log('Falling back to default image');
        this.src = '/images/hero-default.jpg';
      } else {
        // Default image failed, hide entirely
        this.style.display = 'none';
      }
    };

    heroImg.onload = function() {
      console.log('Hero image loaded successfully:', this.src);
      this.style.display = 'block';
    };
  }

  // Smooth transition from default to assigned image when it becomes available
  function upgradeToAssignedImage(imageData) {
    const heroImg = document.getElementById('hero-splash-image');
    if (!heroImg) return;

    const newImageUrl = `/api/image-proxy/${imageData.id}`;
    
    // Create new image element to preload
    const tempImg = new Image();
    
    tempImg.onload = function() {
      // Check if we're still on the same page and showing default image
      if (heroImg.src.includes('hero-default.jpg')) {
        // Smooth transition to assigned image
        heroImg.style.opacity = '0.7';
        
        setTimeout(() => {
          heroImg.src = newImageUrl;
          heroImg.style.opacity = '1';
          console.log('Upgraded to assigned image:', imageData.name);
        }, 200);
      }
    };
    
    tempImg.onerror = function() {
      console.warn('Failed to load assigned image for upgrade:', imageData.name);
    };
    
    tempImg.src = newImageUrl;
  }

  // Legacy method as fallback (simplified - just shows default)
  function fetchFeaturedPhotosLegacy() {
    const heroImg = document.getElementById('hero-splash-image');
    
    console.log('Using legacy fallback - showing default image');
    if (heroImg) {
      heroImg.src = '/images/hero-default.jpg';
    }
  }

  // DISABLED: Listen for image upgrade events from cache manager
  // NO LONGER UPGRADING IMAGES MID-PAGE VIEW - only show assigned on initial load
  // document.addEventListener('imageReadyForPage', (event) => {
  //   const { pageId, imageData } = event.detail;
  //   const currentPageId = window.ImageCacheManager ? window.ImageCacheManager.getCurrentPageId() : null;
  //   
  //   // Only upgrade if this event is for the current page
  //   if (pageId === currentPageId) {
  //     console.log('Image ready for current page upgrade:', pageId, imageData.name);
  //     upgradeToAssignedImage(imageData);
  //   }
  // });

  // Listen for cache manager ready events (for legacy compatibility)
  document.addEventListener('imageCacheReady', () => {
    console.log('Background cache process completed');
    // No action needed - individual image upgrades are handled by imageReadyForPage events
  });

})();