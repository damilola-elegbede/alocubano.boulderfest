// Gallery Hero Module - Handles hero image on main gallery page
(function() {
  'use strict';

  console.log('Gallery hero module loading...');

  // Environment detection
  const isDev = window.location.hostname === 'localhost';
  
  // Configuration
  const CONFIG = {
    API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
    FEATURED_API_ENDPOINT: '/api/featured-photos',
    CACHE_KEY: 'gallery_cache',
    FEATURED_CACHE_KEY: 'featured_photos_cache',
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

    heroImg.onerror = function() {
      console.error('Hero image failed to load:', this.src);
      // Simply hide the image if it fails to load
      this.style.display = 'none';
    };

    heroImg.onload = function() {
      console.log('Hero image loaded successfully:', this.src);
      this.style.display = 'block'; // Ensure image is visible
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
    
    // Setup error handlers
    setupHeroImageHandlers();
    
    // Skip cache since we want fresh random images each time
    const cachedData = null; // Disable cache usage for true randomness
    
    try {
      console.log('Fetching featured photos from Captured_Moments...');
      const response = await fetch(CONFIG.FEATURED_API_ENDPOINT);
      if (!response.ok) {
        console.error('Failed to fetch featured photos from Captured_Moments');
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
        
        // Always update hero image with a random featured photo
        if (heroImg) {
          const randomImage = data.items[Math.floor(Math.random() * data.items.length)];
          const proxyUrl = getImageProxyUrl(randomImage.id);
          console.log('Updating hero with featured image:', randomImage.name);
          console.log('Using proxy URL:', proxyUrl);
          heroImg.src = proxyUrl;
        }
      } else {
        console.log('No featured photos found in Captured_Moments folder');
      }
    } catch (error) {
      console.error('Error fetching featured photos from Captured_Moments:', error);
    }
  }



})();