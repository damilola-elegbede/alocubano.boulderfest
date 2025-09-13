/**
 * Floating Cart Draggable Module
 * Makes the floating cart button draggable and remembers position
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'floating-cart-position';
    const DEFAULT_POSITION = { top: null, right: 20, bottom: null, left: null };
    
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;
    let cartButton = null;
    let dragTimeout = null;

    /**
     * Initialize draggable cart when DOM is ready
     */
    function init() {
        cartButton = document.querySelector('.floating-cart-button');
        if (!cartButton) {
            // Try again after a short delay if cart isn't ready
            setTimeout(init, 500);
            return;
        }

        // Set initial position (below hero, or from saved position)
        setInitialPosition();
        
        // Add draggable cursor style
        cartButton.style.cursor = 'move';
        
        // Add event listeners
        cartButton.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);
        
        // Touch events for mobile
        cartButton.addEventListener('touchstart', dragStart, { passive: false });
        document.addEventListener('touchmove', drag, { passive: false });
        document.addEventListener('touchend', dragEnd);

        // Prevent click event after drag
        cartButton.addEventListener('click', handleClick, true);
    }

    /**
     * Set initial position below hero or from saved position
     */
    function setInitialPosition() {
        const savedPosition = getSavedPosition();
        
        if (savedPosition && savedPosition.x !== null && savedPosition.y !== null) {
            // Use saved absolute position
            cartButton.style.position = 'fixed';
            cartButton.style.left = savedPosition.x + 'px';
            cartButton.style.top = savedPosition.y + 'px';
            cartButton.style.right = 'auto';
            cartButton.style.bottom = 'auto';
            xOffset = savedPosition.x;
            yOffset = savedPosition.y;
        } else {
            // Default position: below hero image on the right
            const heroElement = document.querySelector('.gallery-hero-splash, .hero-image-container, .hero-section');
            
            if (heroElement) {
                const heroRect = heroElement.getBoundingClientRect();
                const heroBottom = heroRect.bottom + window.scrollY;
                
                cartButton.style.position = 'fixed';
                cartButton.style.top = Math.min(heroBottom + 20, window.innerHeight - 100) + 'px';
                cartButton.style.right = '20px';
                cartButton.style.left = 'auto';
                cartButton.style.bottom = 'auto';
            } else {
                // Fallback: default position if no hero found
                cartButton.style.position = 'fixed';
                cartButton.style.top = '200px';
                cartButton.style.right = '20px';
                cartButton.style.left = 'auto';
                cartButton.style.bottom = 'auto';
            }
        }
    }

    /**
     * Handle click to prevent opening cart during drag
     */
    function handleClick(e) {
        if (dragTimeout) {
            e.stopPropagation();
            e.preventDefault();
            clearTimeout(dragTimeout);
            dragTimeout = null;
        }
    }

    /**
     * Start dragging
     */
    function dragStart(e) {
        e.preventDefault();
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        initialX = clientX - xOffset;
        initialY = clientY - yOffset;

        if (e.target === cartButton || cartButton.contains(e.target)) {
            isDragging = true;
            cartButton.style.transition = 'none';
            cartButton.style.zIndex = '10000';
        }
    }

    /**
     * During drag
     */
    function drag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        currentX = clientX - initialX;
        currentY = clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        // Keep button within viewport
        const maxX = window.innerWidth - cartButton.offsetWidth;
        const maxY = window.innerHeight - cartButton.offsetHeight;
        
        xOffset = Math.max(0, Math.min(xOffset, maxX));
        yOffset = Math.max(0, Math.min(yOffset, maxY));

        setTranslate(xOffset, yOffset);
    }

    /**
     * End dragging
     */
    function dragEnd(e) {
        if (!isDragging) return;
        
        initialX = currentX;
        initialY = currentY;

        isDragging = false;
        cartButton.style.transition = '';
        cartButton.style.zIndex = '';
        
        // Save position
        savePosition(xOffset, yOffset);
        
        // Prevent click event for a short time after drag
        dragTimeout = setTimeout(() => {
            dragTimeout = null;
        }, 100);
    }

    /**
     * Set element position
     */
    function setTranslate(xPos, yPos) {
        cartButton.style.left = xPos + 'px';
        cartButton.style.top = yPos + 'px';
        cartButton.style.right = 'auto';
        cartButton.style.bottom = 'auto';
    }

    /**
     * Save position to localStorage
     */
    function savePosition(x, y) {
        const position = { x, y };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
        } catch (error) {
            console.warn('Could not save cart position:', error);
        }
    }

    /**
     * Get saved position from localStorage
     */
    function getSavedPosition() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            console.warn('Could not retrieve saved cart position:', error);
            return null;
        }
    }

    /**
     * Reset position to default
     */
    window.resetFloatingCartPosition = function() {
        localStorage.removeItem(STORAGE_KEY);
        setInitialPosition();
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();