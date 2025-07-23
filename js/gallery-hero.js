// Gallery Hero Module - Handles hero image with immediate display and background caching
(function() {
    'use strict';

    console.log('🎬 Gallery hero module loading... DOM state:', document.readyState);

    // Environment detection
    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    // Configuration
    const CONFIG = {
        API_ENDPOINT: window.GALLERY_API_ENDPOINT || '/api/gallery',
        FEATURED_API_ENDPOINT: '/api/featured-photos',
        IS_DEV: isDev,
        DEBUG: new URLSearchParams(window.location.search).has('debug')
    };

    // Static fallbacks for development
    const STATIC_HERO_FALLBACKS = {
        'home': '/images/heroes/home-hero.jpg',
        'about': '/images/heroes/about-hero.jpg',
        'artists': '/images/heroes/artists-hero.jpg',
        'schedule': '/images/heroes/schedule-hero.jpg',
        'gallery': '/images/heroes/gallery-hero.jpg',
        'tickets': '/images/heroes/tickets-hero.jpg',
        'donations': '/images/heroes/donations-hero.jpg',
        'default': '/images/hero-default.jpg'
    };

    // Helper function to generate image proxy URL based on environment
    function getImageProxyUrl(fileId, width = null, format = null) {
        const baseUrl = CONFIG.IS_DEV ? 
            `/api/image-proxy/${fileId}` : 
            `/api/image-proxy/${fileId}`;
        
        const params = new URLSearchParams();
        if (width) params.append('w', width);
        if (format) params.append('format', format);
        
        return params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
    }

    // Generate responsive image sources for hero images
    function generateResponsiveSources(fileId) {
        const sizes = [800, 1200, 1600, 2000];
        
        // WebP sources
        const webpSrcset = sizes
            .map(size => `${getImageProxyUrl(fileId, size, 'webp')} ${size}w`)
            .join(', ');
        
        // JPEG fallback sources
        const jpegSrcset = sizes
            .map(size => `${getImageProxyUrl(fileId, size, 'jpeg')} ${size}w`)
            .join(', ');
        
        return { webpSrcset, jpegSrcset };
    }

    // Create responsive picture element for hero image
    function createResponsivePictureElement(heroElement, imageData) {
        // Check if we already have a picture wrapper
        let pictureElement = heroElement.parentElement;
        
        if (!pictureElement || pictureElement.tagName !== 'PICTURE') {
            // Create new picture element
            pictureElement = document.createElement('picture');
            
            // Copy relevant classes and attributes from img to picture
            if (heroElement.className) {
                pictureElement.className = heroElement.className;
            }
            
            // Insert picture element before img
            heroElement.parentNode.insertBefore(pictureElement, heroElement);
            
            // Move img inside picture
            pictureElement.appendChild(heroElement);
            
            // Clear classes from img (they're now on picture)
            heroElement.className = '';
        } else {
            // Clear existing sources
            const existingSources = pictureElement.querySelectorAll('source');
            existingSources.forEach(source => source.remove());
        }
        
        if (imageData?.id) {
            const { webpSrcset, jpegSrcset } = generateResponsiveSources(imageData.id);
            
            // Create WebP source
            const webpSource = document.createElement('source');
            webpSource.srcset = webpSrcset;
            webpSource.sizes = '100vw';
            webpSource.type = 'image/webp';
            
            // Create JPEG fallback source
            const jpegSource = document.createElement('source');
            jpegSource.srcset = jpegSrcset;
            jpegSource.sizes = '100vw';
            jpegSource.type = 'image/jpeg';
            
            // Insert sources before img element
            pictureElement.insertBefore(webpSource, heroElement);
            pictureElement.insertBefore(jpegSource, heroElement);
            
            // Update img element with srcset for additional fallback
            heroElement.srcset = jpegSrcset;
            heroElement.sizes = '100vw';
            heroElement.src = getImageProxyUrl(imageData.id, 1200, 'jpeg'); // Default size
        }
        
        return pictureElement;
    }

    console.log('CONFIG:', CONFIG);

    // Show error message in debug mode
    function showHeroError(message) {
        if (CONFIG.DEBUG) {
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(255,0,0,0.9); color: white; padding: 10px; z-index: 9999; font-size: 12px;';
            errorDiv.textContent = `Hero Error: ${message}`;
            document.body.appendChild(errorDiv);
            setTimeout(() => errorDiv.remove(), 5000);
        }
    }

    // Get static fallback for page
    function getStaticFallback(pageId) {
        return STATIC_HERO_FALLBACKS[pageId] || STATIC_HERO_FALLBACKS['default'];
    }

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
        console.log('⏳ DOM still loading, waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', initializeHero);
    } else {
    // DOM already loaded, but ensure ImageCacheManager is ready
        console.log('✅ DOM already loaded, checking ImageCacheManager...');
        if (window.ImageCacheManager) {
            initializeHero();
        } else {
            // Wait a bit for ImageCacheManager to initialize
            console.log('⏳ Waiting for ImageCacheManager...');
            setTimeout(initializeHero, 100);
        }
    }

    // Load hero image asynchronously
    async function loadHeroImage(heroElement) {
        const pageId = window.ImageCacheManager?.getCurrentPageId() || 'unknown';
        console.log(`🖼️ Loading hero image for page: ${pageId}`);
        console.log(`📍 Current URL: ${window.location.pathname}`);

        if (!window.ImageCacheManager) {
            console.error('❌ ImageCacheManager not loaded, using default image');
            showHeroError('ImageCacheManager not available');
            heroElement.src = '/images/hero-default.jpg';
            return;
        }

        try {
            console.log('🔍 Fetching assigned hero image...');
            const imageData = await window.ImageCacheManager.getImageForPage();
            console.log('🎲 Assigned image:', imageData);

            if (imageData && imageData.url) {
                console.log(`✅ Setting hero image src to: ${imageData.url}`);
                console.log(`📷 Image name: ${imageData.name || 'unknown'}`);
                console.log(`💾 From cache: ${imageData.cached || false}`);

                // Create responsive picture element with WebP support
                const pictureElement = createResponsivePictureElement(heroElement, imageData);
                
                // Update loading states on picture element
                pictureElement.classList.remove('loading');
                pictureElement.classList.add('loaded');

                // Add data attributes for debugging to img element
                heroElement.dataset.imageId = imageData.id || 'default';
                heroElement.dataset.imageName = imageData.name || 'default';
                heroElement.dataset.pageId = pageId;
                
                console.log('🖼️ Created responsive picture element with WebP support');
            } else {
                console.error('❌ No image data returned, using fallback');
                showHeroError('No image data available');
                heroElement.src = '/images/hero-default.jpg';
            }
        } catch (error) {
            console.error(`❌ Hero image failed for ${pageId}:`, error);
            showHeroError(error.message);
            heroElement.src = '/images/hero-default.jpg';
        }
    }

    // Setup error handling for hero image
    function setupHeroImageHandlers() {
        const heroImg = document.getElementById('hero-splash-image');
        if (!heroImg) {
            return;
        }

        heroImg.onerror = function() {
            const currentSrc = this.src;
            const pageId = this.dataset.pageId || window.ImageCacheManager?.getCurrentPageId() || 'default';

            if (currentSrc.includes('/api/image-proxy/')) {
                console.info('🔄 Google Drive image failed (likely rate limit or credentials)');
                console.info('💡 This is normal in local development without API credentials');

                // Try static fallback first in development
                if (CONFIG.IS_DEV) {
                    const staticFallback = getStaticFallback(pageId);
                    console.log(`🏞️ Trying static fallback for ${pageId}: ${staticFallback}`);
                    this.src = staticFallback;
                } else {
                    this.src = '/images/hero-default.jpg';
                }
            } else if (!currentSrc.includes('hero-default.jpg') && !currentSrc.includes('/heroes/')) {
                console.warn('🔄 Falling back to default hero image');
                this.src = '/images/hero-default.jpg';
            } else {
                console.error('❌ All hero image options failed to load');
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
        if (!heroImg) {
            return;
        }

        const newImageUrl = getImageProxyUrl(imageData.id, 1200, 'jpeg');

        // Create new image element to preload
        const tempImg = new Image();

        tempImg.onload = function() {
            // Check if we're still on the same page and showing default image
            if (heroImg.src.includes('hero-default.jpg')) {
                // Smooth transition to assigned image with responsive support
                const parentElement = heroImg.parentElement;
                parentElement.style.opacity = '0.7';

                setTimeout(() => {
                    // Create responsive picture element
                    const pictureElement = createResponsivePictureElement(heroImg, imageData);
                    pictureElement.style.opacity = '1';
                    
                    console.log('Upgraded to responsive assigned image:', imageData.name);
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