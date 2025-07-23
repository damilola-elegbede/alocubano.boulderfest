/**
 * Critical Resource Prefetch Module
 * 
 * Handles preloading of critical resources for improved Core Web Vitals.
 * This module was extracted from inline scripts to reduce code duplication
 * and improve parsing performance.
 */

(function() {
  'use strict';
  
  // Configuration object for API endpoints
  const PREFETCH_CONFIG = {
    heroImageApi: '/api/hero-image',
    galleryDataApi: '/api/gallery',
    // Default parameters
    defaultHeroParams: {
      width: 1200,
      format: 'webp'
    },
    defaultGalleryParams: {
      category: 'workshops'
    }
  };
  
  /**
   * Validate URL before creating preload link
   * @param {string} url - URL to validate
   * @returns {boolean} - Whether URL is valid
   */
  function isValidUrl(url) {
    try {
      new URL(url, window.location.origin);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Preload hero image for current page
   */
  function preloadHeroImage() {
    const rawPageId = window.location.pathname.split('/').pop() || 'home';
    const pageId = rawPageId.replace(/\.html$/, '');
    
    // Build hero image URL with configurable endpoint
    const params = new URLSearchParams({
      w: PREFETCH_CONFIG.defaultHeroParams.width,
      format: PREFETCH_CONFIG.defaultHeroParams.format
    });
    const heroUrl = `${PREFETCH_CONFIG.heroImageApi}/${pageId}?${params}`;
    
    // Validate URL before creating preload
    if (!isValidUrl(heroUrl)) {
      console.warn(`[Prefetch] Invalid hero image URL: ${heroUrl}`);
      return;
    }
    
    const heroPreload = document.createElement('link');
    heroPreload.rel = 'preload';
    heroPreload.as = 'image';
    heroPreload.href = heroUrl;
    heroPreload.crossOrigin = 'anonymous';
    heroPreload.fetchPriority = 'high';
    
    // Set crossOrigin attribute for compatibility
    heroPreload.setAttribute('crossorigin', 'anonymous');
    
    document.head.appendChild(heroPreload);
    
    console.log(`[Prefetch] Hero image preloaded for page: ${pageId}`);
  }
  
  /**
   * Extract year from gallery page ID using regex
   * @param {string} pageId - Page identifier
   * @returns {string|null} - Extracted year or null if not found
   */
  function extractYearFromPageId(pageId) {
    const yearMatch = pageId.match(/gallery[.-]?(\d{4})/);
    return yearMatch ? yearMatch[1] : null;
  }
  
  /**
   * Preload gallery data for gallery pages
   */
  function preloadGalleryData() {
    const rawPageId = window.location.pathname.split('/').pop() || 'home';
    const pageId = rawPageId.replace(/\.html$/, '');
    
    if (pageId.includes('gallery')) {
      // Extract year using regex pattern
      const extractedYear = extractYearFromPageId(pageId);
      
      // Skip prefetching for gallery index page (no specific year)
      if (pageId === 'gallery') {
        console.log('[Prefetch] Skipping gallery data prefetch for index page');
        return;
      }
      
      // Use extracted year or fall back to current year for generic pages
      const year = extractedYear || new Date().getFullYear();
      
      // Build gallery data URL with configurable endpoint
      const params = new URLSearchParams({
        year: year,
        category: PREFETCH_CONFIG.defaultGalleryParams.category
      });
      const galleryUrl = `${PREFETCH_CONFIG.galleryDataApi}?${params}`;
      
      // Validate URL before creating preload
      if (!isValidUrl(galleryUrl)) {
        console.warn(`[Prefetch] Invalid gallery data URL: ${galleryUrl}`);
        return;
      }
      
      const galleryDataPreload = document.createElement('link');
      galleryDataPreload.rel = 'preload';
      galleryDataPreload.as = 'fetch';
      galleryDataPreload.href = galleryUrl;
      galleryDataPreload.crossOrigin = 'anonymous';
      
      // Set crossOrigin attribute for compatibility
      galleryDataPreload.setAttribute('crossorigin', 'anonymous');
      
      document.head.appendChild(galleryDataPreload);
      
      console.log(`[Prefetch] Gallery data preloaded for year: ${year}`);
    }
  }
  
  /**
   * Initialize critical resource preloading
   */
  function initializePrefetch() {
    try {
      preloadHeroImage();
      preloadGalleryData();
    } catch (error) {
      console.warn('[Prefetch] Error during resource preloading:', error);
    }
  }
  
  // Execute immediately for critical path optimization
  initializePrefetch();
  
})();