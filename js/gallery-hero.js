// Gallery Hero Module - Simple static hero image loader
(function() {
    'use strict';

    console.log('🎬 Gallery hero module loading (static version)... DOM state:', document.readyState);

    // Page-specific hero image mapping
    const HERO_IMAGES = {
        'home': '/images/hero/home.jpg',
        'about': '/images/hero/about.jpg',
        'artists': '/images/hero/boulder-fest-2026-hero.jpg',
        'schedule': '/images/hero/boulder-fest-2025-hero.jpg',
        'gallery': '/images/hero/weekender-2026-09-hero.jpg',
        'tickets': '/images/hero/tickets.jpg',
        'donations': '/images/hero/donations.jpg',
        'contact': '/images/hero/contact.jpg',
        'default': '/images/hero/hero-default.jpg'
    };

    // Get current page ID from URL
    function getCurrentPageId() {
        const path = window.location.pathname;
        let pageId = 'home';
        
        if (path.includes('about')) pageId = 'about';
        else if (path.includes('artists')) pageId = 'artists';
        else if (path.includes('schedule')) pageId = 'schedule';
        else if (path.includes('gallery')) pageId = 'gallery';
        else if (path.includes('tickets')) pageId = 'tickets';
        else if (path.includes('donations')) pageId = 'donations';
        else if (path.includes('contact')) pageId = 'contact';
        
        return pageId;
    }

    // Get hero image for current page
    function getHeroImagePath(pageId) {
        return HERO_IMAGES[pageId] || HERO_IMAGES['default'];
    }

    // Initialize hero image
    function initializeHero() {
        console.log('🚀 Gallery hero initializing (static version)...');
        
        const heroElement = document.getElementById('hero-splash-image');
        if (!heroElement) {
            console.log('No hero image element found');
            return;
        }

        const pageId = getCurrentPageId();
        const heroImagePath = getHeroImagePath(pageId);
        
        console.log(`📍 Current page: ${pageId}`);
        console.log(`🖼️ Hero image path: ${heroImagePath}`);

        // Set the hero image source
        heroElement.src = heroImagePath;
        heroElement.alt = getHeroAltText(pageId);

        // Add loading state management
        heroElement.addEventListener('load', function() {
            console.log('✅ Hero image loaded successfully:', this.src);
            
            // Remove loading class and add loaded class to parent container
            const container = this.closest('.gallery-hero-splash');
            if (container) {
                container.classList.remove('loading');
                container.classList.add('loaded');
            }
        });

        // Error handling
        heroElement.addEventListener('error', function() {
            console.warn('⚠️ Hero image failed to load:', this.src);
            
            // Fallback to default hero image if not already using it
            if (!this.src.includes('hero-default.jpg')) {
                console.log('🔄 Falling back to default hero image');
                this.src = HERO_IMAGES['default'];
                this.alt = 'A Lo Cubano Boulder Fest';
            } else {
                console.error('❌ Default hero image also failed to load');
            }
        });

        console.log('🎬 Static hero image initialized');
    }

    // Get appropriate alt text for hero image
    function getHeroAltText(pageId) {
        const altTexts = {
            'home': 'A Lo Cubano Boulder Fest - Cuban salsa festival in Boulder, Colorado',
            'about': 'About A Lo Cubano Boulder Fest - Behind the scenes moments',
            'artists': 'Featured Artists - Cuban salsa instructors and performers',
            'schedule': 'Festival Schedule - Workshop sessions and social dancing',
            'gallery': 'Photo Gallery - Memorable moments from past festivals',
            'tickets': 'Festival Tickets - Join us for Cuban salsa in Boulder',
            'donations': 'Support the Festival - Help grow our Cuban salsa community',
            'contact': 'Contact Us - Connect with the A Lo Cubano team',
            'default': 'A Lo Cubano Boulder Fest - Authentic Cuban salsa experience'
        };

        return altTexts[pageId] || altTexts['default'];
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        console.log('⏳ DOM still loading, waiting for DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', initializeHero);
    } else {
        console.log('✅ DOM already loaded');
        initializeHero();
    }

})();