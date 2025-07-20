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
      
      // Load hero image asynchronously
      loadHeroImage(heroElement);
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

  // Load hero image asynchronously
  async function loadHeroImage(heroElement) {
    if (!window.ImageCacheManager) {
      console.error('ImageCacheManager not loaded, using default image');
      heroElement.src = '/images/hero-default.jpg';
      return;
    }

    console.log('Fetching assigned hero image...');
    const imageData = await window.ImageCacheManager.getImageForPage();
    
    if (imageData && imageData.url) {
      console.log('Setting hero image src to:', imageData.url);
      heroElement.src = imageData.url;
      heroElement.classList.remove('loading');
      heroElement.classList.add('loaded');
    } else {
      console.error('No image data returned, using fallback');
      heroElement.src = '/images/hero-default.jpg';
    }
  }

  // Setup error handling for hero image
  function setupHeroImageHandlers() {
    const heroImg = document.getElementById('hero-splash-image');
    if (!heroImg) return;

    heroImg.onerror = function() {
      const currentSrc = this.src;
      if (currentSrc.includes('/api/image-proxy/')) {
        console.info('🔄 Google Drive image failed (likely rate limit or credentials) - falling back to default hero image');
        console.info('💡 This is normal in local development without API credentials');
        this.src = '/images/hero-default.jpg';
      } else if (!currentSrc.includes('hero-default.jpg')) {
        console.warn('🔄 Falling back to default hero image');
        this.src = '/images/hero-default.jpg';
      } else {
        console.error('❌ Default hero image also failed to load');
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


  // Listen for cache manager ready events (for legacy compatibility)
  document.addEventListener('imageCacheReady', () => {
    console.log('Background cache process completed');
    // No action needed - individual image upgrades are handled by imageReadyForPage events
  });

})();