/**
 * Critical Resource Prefetch Module
 * 
 * Handles preloading of critical resources for improved Core Web Vitals.
 * This module was extracted from inline scripts to reduce code duplication
 * and improve parsing performance.
 */

(function() {
  'use strict';
  
  /**
   * Preload hero image for current page
   */
  function preloadHeroImage() {
    const rawPageId = window.location.pathname.split('/').pop() || 'home';
    const pageId = rawPageId.replace(/\.html$/, '');
    
    const heroPreload = document.createElement('link');
    heroPreload.rel = 'preload';
    heroPreload.as = 'image';
    heroPreload.href = `/api/hero-image/${pageId}?w=1200&format=webp`;
    heroPreload.crossOrigin = 'anonymous';
    heroPreload.fetchPriority = 'high';
    
    // Set crossOrigin attribute for compatibility
    heroPreload.setAttribute('crossorigin', 'anonymous');
    
    document.head.appendChild(heroPreload);
    
    console.log(`[Prefetch] Hero image preloaded for page: ${pageId}`);
  }
  
  /**
   * Preload gallery data for gallery pages
   */
  function preloadGalleryData() {
    const rawPageId = window.location.pathname.split('/').pop() || 'home';
    const pageId = rawPageId.replace(/\.html$/, '');
    
    if (pageId.includes('gallery')) {
      const year = pageId.includes('2025') ? '2025' : new Date().getFullYear();
      
      const galleryDataPreload = document.createElement('link');
      galleryDataPreload.rel = 'preload';
      galleryDataPreload.as = 'fetch';
      galleryDataPreload.href = `/api/gallery?year=${year}&category=workshops`;
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