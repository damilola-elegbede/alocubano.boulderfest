// Gallery Hero Module - Handles hero image on main gallery page
(function() {
  'use strict';

  console.log('Gallery hero module loading...');

  // Configuration
  const CONFIG = {
    API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
    FEATURED_API_ENDPOINT: '/api/featured-photos',
    CACHE_KEY: 'gallery_cache',
    FEATURED_CACHE_KEY: 'featured_photos_cache',
    DEFAULT_IMAGE: 'https://drive.google.com/thumbnail?id=1Z1BuOSET8jAwlYnA9IDwmg1bJLpRmGNI&sz=w1600'
  };

  console.log('CONFIG:', CONFIG);

  // Initialize gallery hero on page load
  document.addEventListener('DOMContentLoaded', () => {
    console.log('Gallery hero DOMContentLoaded fired');
    console.log('Looking for hero image element...');
    const heroElement = document.getElementById('hero-splash-image');
    console.log('Hero element found:', !!heroElement);
    
    if (heroElement) {
      console.log('Current hero src:', heroElement.src);
    }
    
    // Don't initialize immediately - wait for featured photos to load
    // This ensures we get a random image from the start
    fetchFeaturedPhotos();
  });

  // Setup error handling for hero image
  function setupHeroImageHandlers() {
    const heroImg = document.getElementById('hero-splash-image');
    if (!heroImg) return;

    // Add comprehensive error handling with loop prevention
    let errorCount = 0;
    heroImg.onerror = function() {
      errorCount++;
      console.error('Hero image failed to load:', this.src);
      
      // Prevent infinite loop - if default image also fails, give up
      if (errorCount > 1 || this.src === CONFIG.DEFAULT_IMAGE) {
        console.error('Failed to load default image, stopping retry');
        this.style.display = 'none'; // Hide broken image
        return;
      }
      
      // Try the default image
      console.log('Trying default image');
      this.src = CONFIG.DEFAULT_IMAGE;
    };

    heroImg.onload = function() {
      console.log('Hero image loaded successfully:', this.src);
      errorCount = 0; // Reset error count on success
    };
  }

  // Cache management
  function getCachedData(cacheKey = CONFIG.CACHE_KEY) {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      const now = Date.now();
      
      // No caching - always fetch fresh data
      localStorage.removeItem(cacheKey);
      return null;
      
      return data.content;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }

  // Fetch featured photos from Captured_Moments folder
  async function fetchFeaturedPhotos() {
    const heroImg = document.getElementById('hero-splash-image');
    
    // If image has data-src, set src directly
    if (heroImg && heroImg.dataset.src && !heroImg.src) {
      heroImg.src = heroImg.dataset.src;
    }
    
    // Setup error handlers
    setupHeroImageHandlers();
    
    // First check cache for immediate display
    const cachedData = getCachedData(CONFIG.FEATURED_CACHE_KEY);
    if (cachedData && cachedData.items && cachedData.items.length > 0 && heroImg) {
      const randomImage = cachedData.items[Math.floor(Math.random() * cachedData.items.length)];
      console.log('Using cached featured image:', randomImage.name);
      heroImg.src = randomImage.viewUrl;
    }
    
    try {
      console.log('Fetching featured photos from Captured_Moments...');
      const response = await fetch(CONFIG.FEATURED_API_ENDPOINT);
      if (!response.ok) {
        console.error('Failed to fetch featured photos, falling back to regular gallery');
        // Fall back to regular gallery images
        if (!cachedData) fetchLatestImages();
        return;
      }
      
      const data = await response.json();
      console.log('Featured photos response:', data);
      
      if (data.items && data.items.length > 0) {
        // No caching - comment out localStorage
        // localStorage.setItem(CONFIG.FEATURED_CACHE_KEY, JSON.stringify({
        //   timestamp: Date.now(),
        //   content: data
        // }));
        
        // If we didn't already set from cache, update hero image with a random featured photo
        if (heroImg && !cachedData) {
          const randomImage = data.items[Math.floor(Math.random() * data.items.length)];
          console.log('Updating hero with featured image:', randomImage.name);
          heroImg.src = randomImage.viewUrl;
        }
      } else {
        console.log('No featured photos found, falling back to regular gallery');
        if (!cachedData) fetchLatestImages();
      }
    } catch (error) {
      console.error('Error fetching featured photos:', error);
      // Fall back to regular gallery images if no cache
      if (!cachedData) fetchLatestImages();
    }
  }

  // Fetch latest images from API (fallback)
  async function fetchLatestImages() {
    try {
      // Fetch from 2025 gallery by default
      const response = await fetch(`${CONFIG.API_ENDPOINT}?year=2025`);
      if (!response.ok) {
        console.error('Failed to fetch gallery data');
        return;
      }
      
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        // No caching - comment out localStorage
        // localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({
        //   timestamp: Date.now(),
        //   content: data
        // }));
        
        // Update hero image with a random one from the fetched data
        const images = data.items.filter(item => item.type === 'image');
        if (images.length > 0) {
          const heroImg = document.getElementById('hero-splash-image');
          if (heroImg) {
            const randomImage = images[Math.floor(Math.random() * images.length)];
            console.log('Updating hero with random gallery image:', randomImage.name);
            // Use the viewUrl from the API response
            heroImg.src = randomImage.viewUrl || randomImage.thumbnailUrl;
          }
        }
      }
    } catch (error) {
      console.error('Error fetching gallery data:', error);
    }
  }

})();