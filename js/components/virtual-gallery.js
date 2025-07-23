/**
 * Virtual Gallery Manager
 *
 * Implements virtual scrolling for large photo galleries with DOM recycling,
 * responsive layouts, and performance optimizations. Supports AVIF/WebP/JPEG
 * formats with intelligent fallbacks and integrates with existing lightbox system.
 *
 * Key Features:
 * - Virtual scrolling with buffer zones for smooth performance
 * - DOM element recycling to minimize memory usage
 * - Responsive grid layouts with automatic column calculation
 * - Modern image format support (AVIF → WebP → JPEG)
 * - Intersection Observer for optimal loading
 * - Integration with existing lightbox system
 * - Performance monitoring and analytics
 * - Graceful error handling and fallbacks
 */

export class VirtualGalleryManager {
    constructor(container, options = {}) {
        // Validate container
        if (!container) {
            throw new Error('VirtualGalleryManager requires a container element');
        }

        this.container = container;
        this.photos = [];
        this.visibleItems = new Map();
        this.itemPool = [];
        this.isInitialized = false;

        // Configuration with defaults
        this.config = {
            itemHeight: options.itemHeight || 250,
            itemsPerRow: options.itemsPerRow || 'auto',
            bufferSize: options.bufferSize || 5,
            loadingPlaceholder: options.loadingPlaceholder || '/images/gallery/placeholder-1.svg',
            enableLightbox: options.enableLightbox ?? true,
            enableAnalytics: options.enableAnalytics ?? true,
            imageFormats: options.imageFormats || ['avif', 'webp', 'jpeg'],
            quality: options.quality || 80,
            ...options
        };

        // State management
        this.state = {
            scrollTop: 0,
            containerHeight: 0,
            contentHeight: 0,
            itemsPerRow: 1,
            totalRows: 0,
            visibleStart: 0,
            visibleEnd: 0,
            isScrolling: false,
            lastScrollTime: 0
        };

        // Performance tracking
        this.metrics = {
            renderCount: 0,
            recycleCount: 0,
            totalScrollEvents: 0,
            averageRenderTime: 0,
            startTime: Date.now()
        };

        // Bind methods
        this.handleScroll = this.throttle(this.handleScroll.bind(this), 16); // 60fps
        this.handleResize = this.debounce(this.handleResize.bind(this), 250);
        this.handleItemClick = this.handleItemClick.bind(this);

        // Initialize intersection observer for lazy loading
        this.intersectionObserver = new IntersectionObserver(
            this.handleIntersection.bind(this),
            {
                root: this.container,
                rootMargin: '50px',
                threshold: 0.1
            }
        );

        // Set up container
        this.setupContainer();

        // Initialize resize observer for responsive behavior
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(this.container);
        }

        // Log initialization for debugging (production deployments should set up proper logging)
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:manager-initialized', {
                config: this.config,
                container: container.id || 'unnamed'
            });
        }
    }

    /**
     * Set up the container with required structure and styles
     */
    setupContainer() {
        this.container.classList.add('virtual-gallery');
        this.container.style.position = 'relative';
        this.container.style.overflow = 'auto';
        this.container.style.height = this.container.style.height || '600px';

        // Create content wrapper for absolute positioning
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.className = 'virtual-gallery-content';
        this.contentWrapper.style.position = 'relative';
        this.contentWrapper.style.width = '100%';

        // Create viewport for visible items
        this.viewport = document.createElement('div');
        this.viewport.className = 'virtual-gallery-viewport';
        this.viewport.style.position = 'absolute';
        this.viewport.style.top = '0';
        this.viewport.style.left = '0';
        this.viewport.style.width = '100%';

        this.contentWrapper.appendChild(this.viewport);
        this.container.appendChild(this.contentWrapper);

        // Add event listeners
        this.container.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('resize', this.handleResize, { passive: true });
        this.container.addEventListener('click', this.handleItemClick);

        // Calculate initial dimensions
        this.updateDimensions();
    }

    /**
     * Load photos into the virtual gallery
     * @param {Array} photos - Array of photo objects with src, alt, etc.
     */
    async loadPhotos(photos) {
        if (!Array.isArray(photos)) {
            throw new Error('VirtualGalleryManager.loadPhotos expects an array');
        }

        this.photos = photos.map((photo, index) => ({
            id: photo.id || `photo-${index}`,
            src: photo.src,
            alt: photo.alt || `Photo ${index + 1}`,
            title: photo.title,
            caption: photo.caption,
            width: photo.width,
            height: photo.height,
            thumbnail: photo.thumbnail,
            index: index,
            ...photo
        }));

        // Emit load completion event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:photos-loaded', {
                photoCount: this.photos.length
            });
        }

        // Update layout calculations
        this.updateDimensions();
        this.calculateLayout();

        // Initial render
        this.render();

        this.isInitialized = true;

        // Emit initialization event
        this.emitEvent('gallery:initialized', {
            photoCount: this.photos.length,
            itemsPerRow: this.state.itemsPerRow
        });
    }

    /**
     * Update container and layout dimensions
     */
    updateDimensions() {
        const containerStyles = getComputedStyle(this.container);

        this.state.containerHeight = this.container.clientHeight;

        // Calculate available width (accounting for padding and scrollbar)
        const paddingLeft = parseInt(containerStyles.paddingLeft, 10) || 0;
        const paddingRight = parseInt(containerStyles.paddingRight, 10) || 0;
        const scrollbarWidth = this.container.offsetWidth - this.container.clientWidth;

        this.availableWidth = this.container.clientWidth - paddingLeft - paddingRight - scrollbarWidth;

        // Calculate items per row based on container width
        if (this.config.itemsPerRow === 'auto') {
            const minItemWidth = 200; // Minimum item width
            const gap = 16; // Gap between items
            const possibleItems = Math.floor((this.availableWidth + gap) / (minItemWidth + gap));
            this.state.itemsPerRow = Math.max(1, Math.min(possibleItems, 6)); // Clamp between 1-6
        } else {
            this.state.itemsPerRow = this.config.itemsPerRow;
        }

        // Calculate item width including gaps
        const totalGaps = (this.state.itemsPerRow - 1) * 16;
        this.itemWidth = Math.floor((this.availableWidth - totalGaps) / this.state.itemsPerRow);

        // Emit dimensions update event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:dimensions-updated', {
                containerHeight: this.state.containerHeight,
                availableWidth: this.availableWidth,
                itemsPerRow: this.state.itemsPerRow,
                itemWidth: this.itemWidth
            });
        }
    }

    /**
     * Calculate layout parameters
     */
    calculateLayout() {
        if (!this.photos.length) {
            return;
        }

        this.state.totalRows = Math.ceil(this.photos.length / this.state.itemsPerRow);
        this.state.contentHeight = this.state.totalRows * (this.config.itemHeight + 16) - 16; // Account for gaps

        // Update content wrapper height
        this.contentWrapper.style.height = `${this.state.contentHeight}px`;

        // Emit layout calculation event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:layout-calculated', {
                totalRows: this.state.totalRows,
                contentHeight: this.state.contentHeight,
                photosCount: this.photos.length
            });
        }
    }

    /**
     * Handle scroll events with virtual scrolling logic
     */
    handleScroll() {
        const startTime = performance.now();

        this.state.scrollTop = this.container.scrollTop;
        this.state.isScrolling = true;
        this.state.lastScrollTime = Date.now();
        this.metrics.totalScrollEvents++;

        // Calculate visible range with buffer
        const visibleStart = Math.floor(this.state.scrollTop / (this.config.itemHeight + 16));
        const visibleEnd = Math.ceil((this.state.scrollTop + this.state.containerHeight) / (this.config.itemHeight + 16));

        const bufferedStart = Math.max(0, visibleStart - this.config.bufferSize);
        const bufferedEnd = Math.min(this.state.totalRows - 1, visibleEnd + this.config.bufferSize);

        // Only re-render if visible range changed significantly
        if (Math.abs(bufferedStart - this.state.visibleStart) > 1 ||
            Math.abs(bufferedEnd - this.state.visibleEnd) > 1) {

            this.state.visibleStart = bufferedStart;
            this.state.visibleEnd = bufferedEnd;

            this.render();
        }

        // Clear scrolling flag after delay
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.state.isScrolling = false;
        }, 150);

        // Update performance metrics
        const renderTime = performance.now() - startTime;
        this.updateMetrics('render', renderTime);
    }

    /**
     * Handle container resize events
     */
    handleResize() {
        // Emit resize event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:resize-handled', {
                timestamp: Date.now()
            });
        }

        this.updateDimensions();
        this.calculateLayout();

        // Clear existing items and re-render
        this.clearVisibleItems();
        this.render();

        this.emitEvent('gallery:resized', {
            itemsPerRow: this.state.itemsPerRow,
            containerHeight: this.state.containerHeight
        });
    }

    /**
     * Render visible items in the viewport
     */
    render() {
        if (!this.photos.length) {
            return;
        }

        const startTime = performance.now();

        // Calculate which photos should be visible
        const startIndex = this.state.visibleStart * this.state.itemsPerRow;
        const endIndex = Math.min(
            (this.state.visibleEnd + 1) * this.state.itemsPerRow - 1,
            this.photos.length - 1
        );

        // Remove items that are now outside visible range
        for (const [index, item] of this.visibleItems) {
            if (index < startIndex || index > endIndex) {
                this.recycleItem(index, item);
            }
        }

        // Add items that are now visible
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this.visibleItems.has(i) && this.photos[i]) {
                const item = this.createOrReuseItem(i);
                this.visibleItems.set(i, item);
            }
        }

        // Update performance metrics
        const renderTime = performance.now() - startTime;
        this.updateMetrics('render', renderTime);
        this.metrics.renderCount++;

        // Emit render event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:rendered', {
                visibleItems: this.visibleItems.size,
                renderTime,
                scrollTop: this.state.scrollTop
            });
        }
    }

    /**
     * Create a new item or reuse from pool
     * @param {number} index - Photo index
     * @returns {HTMLElement} Gallery item element
     */
    createOrReuseItem(index) {
        const photo = this.photos[index];
        let item;

        // Try to reuse from pool
        if (this.itemPool.length > 0) {
            item = this.itemPool.pop();
            this.metrics.recycleCount++;
        } else {
            // Create new item
            item = this.createGalleryItem();
        }

        // Update item content and position
        this.updateItemContent(item, photo, index);
        this.updateItemPosition(item, index);

        // Add to viewport if not already there
        if (!item.parentNode) {
            this.viewport.appendChild(item);
        }

        return item;
    }

    /**
     * Create a new gallery item element
     * @returns {HTMLElement} New gallery item
     */
    createGalleryItem() {
        const item = document.createElement('div');
        item.className = 'gallery-item virtual-item';
        item.style.position = 'absolute';
        item.style.width = `${this.itemWidth}px`;
        item.style.height = `${this.config.itemHeight}px`;
        item.style.overflow = 'hidden';
        item.style.borderRadius = '8px';
        item.style.cursor = 'pointer';
        item.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';

        // Create image container
        const imageContainer = document.createElement('div');
        imageContainer.className = 'gallery-item-image';
        imageContainer.style.width = '100%';
        imageContainer.style.height = '100%';
        imageContainer.style.position = 'relative';
        imageContainer.style.backgroundColor = 'var(--color-gray-100, #f3f4f6)';

        // Create image element
        const img = document.createElement('img');
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.style.transition = 'opacity 0.3s ease';
        img.loading = 'lazy';

        // Create loading placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'gallery-item-placeholder';
        placeholder.style.position = 'absolute';
        placeholder.style.top = '50%';
        placeholder.style.left = '50%';
        placeholder.style.transform = 'translate(-50%, -50%)';
        placeholder.style.opacity = '0.5';
        placeholder.style.fontSize = '14px';
        placeholder.style.color = 'var(--color-gray-500, #6b7280)';
        placeholder.textContent = 'Loading...';

        // Create overlay for hover effects
        const overlay = document.createElement('div');
        overlay.className = 'gallery-item-overlay';
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.3)';
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.color = 'white';
        overlay.style.fontWeight = '500';
        overlay.innerHTML = '<span>View</span>';

        // Assemble item
        imageContainer.appendChild(img);
        imageContainer.appendChild(placeholder);
        imageContainer.appendChild(overlay);
        item.appendChild(imageContainer);

        // Add hover effects
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-4px)';
            item.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)';
            overlay.style.opacity = '1';
        });

        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
            overlay.style.opacity = '0';
        });

        return item;
    }

    /**
     * Update item content with photo data
     * @param {HTMLElement} item - Gallery item element
     * @param {Object} photo - Photo data
     * @param {number} index - Photo index
     */
    updateItemContent(item, photo, index) {
        const img = item.querySelector('img');
        const placeholder = item.querySelector('.gallery-item-placeholder');

        // Set data attributes
        item.dataset.photoId = photo.id;
        item.dataset.photoIndex = index;

        // Update image source with format negotiation
        const optimizedSrc = this.getOptimizedImageSrc(photo, this.itemWidth, this.config.itemHeight);

        if (img.src !== optimizedSrc) {
            // Show placeholder while loading
            placeholder.style.opacity = '1';
            img.style.opacity = '0';

            img.onload = () => {
                img.style.opacity = '1';
                placeholder.style.opacity = '0';

                // Observe for intersection once loaded
                this.intersectionObserver.observe(img);
            };

            img.onerror = () => {
                // Emit error event for monitoring
                this.emitEvent('gallery:image-load-error', {
                    src: optimizedSrc,
                    photoId: photo.id,
                    timestamp: Date.now()
                });

                placeholder.textContent = 'Failed to load';
                placeholder.style.color = 'var(--color-red, #ef4444)';

                // Try fallback image
                if (photo.thumbnail && photo.thumbnail !== optimizedSrc) {
                    img.src = photo.thumbnail;
                } else if (this.config.loadingPlaceholder) {
                    img.src = this.config.loadingPlaceholder;
                }
            };

            img.src = optimizedSrc;
            img.alt = photo.alt || `Photo ${index + 1}`;
        }
    }

    /**
     * Update item position in the grid
     * @param {HTMLElement} item - Gallery item element
     * @param {number} index - Photo index
     */
    updateItemPosition(item, index) {
        const row = Math.floor(index / this.state.itemsPerRow);
        const col = index % this.state.itemsPerRow;

        const x = col * (this.itemWidth + 16);
        const y = row * (this.config.itemHeight + 16);

        item.style.left = `${x}px`;
        item.style.top = `${y}px`;
    }

    /**
     * Get optimized image source with format negotiation
     * @param {Object} photo - Photo data
     * @param {number} width - Target width
     * @param {number} height - Target height
     * @returns {string} Optimized image URL
     */
    getOptimizedImageSrc(photo, width, height) {
        // Use thumbnail if available and appropriately sized
        if (photo.thumbnail && width <= 300) {
            return photo.thumbnail;
        }

        // Check if we have a Google Drive file ID for optimization
        const driveMatch = photo.src.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (driveMatch) {
            const fileId = driveMatch[1];

            // Determine best format based on browser support
            const format = this.getBestImageFormat();

            return `/api/image-proxy/${fileId}?w=${width}&h=${height}&format=${format}&q=${this.config.quality}`;
        }

        // Return original source if no optimization available
        return photo.src;
    }

    /**
     * Determine the best image format based on browser support
     * @returns {string} Best supported format
     */
    getBestImageFormat() {
        // Check for AVIF support
        if (this.config.imageFormats.includes('avif') && this.supportsFormat('avif')) {
            return 'avif';
        }

        // Check for WebP support
        if (this.config.imageFormats.includes('webp') && this.supportsFormat('webp')) {
            return 'webp';
        }

        // Fallback to JPEG
        return 'jpeg';
    }

    /**
     * Check if browser supports image format
     * @param {string} format - Image format to check
     * @returns {boolean} Support status
     */
    supportsFormat(format) {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;

        try {
            return canvas.toDataURL(`image/${format}`).startsWith(`data:image/${format}`);
        } catch {
            return false;
        }
    }

    /**
     * Recycle an item back to the pool
     * @param {number} index - Photo index
     * @param {HTMLElement} item - Gallery item element
     */
    recycleItem(index, item) {
        // Remove from visible items
        this.visibleItems.delete(index);

        // Remove from DOM but keep in pool for reuse
        if (item.parentNode) {
            item.parentNode.removeChild(item);
        }

        // Stop observing
        const img = item.querySelector('img');
        if (img) {
            this.intersectionObserver.unobserve(img);
        }

        // Add to pool for reuse
        this.itemPool.push(item);

        // Limit pool size to prevent memory leaks
        if (this.itemPool.length > 20) {
            this.itemPool.shift(); // Remove oldest item
        }
    }

    /**
     * Clear all visible items
     */
    clearVisibleItems() {
        for (const [index, item] of this.visibleItems) {
            this.recycleItem(index, item);
        }
        this.visibleItems.clear();
    }

    /**
     * Handle intersection observer events
     * @param {Array} entries - Intersection entries
     */
    handleIntersection(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const item = img.closest('.gallery-item');

                if (item && this.config.enableAnalytics) {
                    this.emitEvent('gallery:item-viewed', {
                        photoId: item.dataset.photoId,
                        photoIndex: parseInt(item.dataset.photoIndex, 10)
                    });
                }
            }
        });
    }

    /**
     * Handle item click events
     * @param {Event} event - Click event
     */
    handleItemClick(event) {
        const item = event.target.closest('.gallery-item');
        if (!item) {
            return;
        }

        const photoIndex = parseInt(item.dataset.photoIndex, 10);
        const photo = this.photos[photoIndex];

        if (!photo) {
            return;
        }

        event.preventDefault();

        // Emit click event
        this.emitEvent('gallery:item-clicked', {
            photo,
            photoIndex,
            item
        });

        // Open lightbox if enabled
        if (this.config.enableLightbox && window.LightboxManager) {
            window.LightboxManager.open(this.photos, photoIndex);
        }
    }

    /**
     * Update performance metrics
     * @param {string} type - Metric type
     * @param {number} value - Metric value
     */
    updateMetrics(type, value) {
        switch (type) {
        case 'render':
            const totalTime = this.metrics.averageRenderTime * this.metrics.renderCount + value;
            this.metrics.averageRenderTime = totalTime / (this.metrics.renderCount + 1);
            break;
        }
    }

    /**
     * Get current performance metrics
     * @returns {Object} Performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime,
            visibleItems: this.visibleItems.size,
            pooledItems: this.itemPool.length,
            memoryUsage: this.estimateMemoryUsage()
        };
    }

    /**
     * Estimate memory usage
     * @returns {Object} Memory usage estimate
     */
    estimateMemoryUsage() {
        const itemSize = 1024; // Estimated bytes per DOM item
        const imageSize = this.itemWidth * this.config.itemHeight * 4; // RGBA bytes

        return {
            domItems: this.visibleItems.size * itemSize,
            images: this.visibleItems.size * imageSize,
            total: (this.visibleItems.size * itemSize) + (this.visibleItems.size * imageSize)
        };
    }

    /**
     * Emit custom events
     * @param {string} eventName - Event name
     * @param {Object} data - Event data
     */
    emitEvent(eventName, data = {}) {
        const event = new CustomEvent(eventName, {
            detail: {
                ...data,
                gallery: this,
                timestamp: Date.now()
            }
        });

        this.container.dispatchEvent(event);

        // Also emit on document for global listeners
        document.dispatchEvent(event);
    }

    /**
     * Scroll to a specific photo
     * @param {number} index - Photo index
     * @param {boolean} smooth - Whether to scroll smoothly
     */
    scrollToPhoto(index, smooth = true) {
        if (index < 0 || index >= this.photos.length) {
            throw new Error(`Invalid photo index: ${index}. Must be between 0 and ${this.photos.length - 1}`);
        }

        const row = Math.floor(index / this.state.itemsPerRow);
        const targetScrollTop = row * (this.config.itemHeight + 16);

        this.container.scrollTo({
            top: targetScrollTop,
            behavior: smooth ? 'smooth' : 'auto'
        });

        this.emitEvent('gallery:scrolled-to-photo', {
            photoIndex: index,
            scrollTop: targetScrollTop
        });
    }

    /**
     * Refresh the gallery (useful after data changes)
     */
    refresh() {
        // Emit refresh event for analytics
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:refresh-started', {
                timestamp: Date.now()
            });
        }

        this.clearVisibleItems();
        this.updateDimensions();
        this.calculateLayout();
        this.render();

        this.emitEvent('gallery:refreshed', {
            photoCount: this.photos.length
        });
    }

    /**
     * Destroy the gallery manager and clean up resources
     */
    destroy() {
        // Emit destroy event for cleanup tracking
        if (this.config.enableAnalytics) {
            this.emitEvent('gallery:destroy-started', {
                uptime: Date.now() - this.metrics.startTime
            });
        }

        // Remove event listeners
        this.container.removeEventListener('scroll', this.handleScroll);
        this.container.removeEventListener('click', this.handleItemClick);
        window.removeEventListener('resize', this.handleResize);

        // Disconnect observers
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        // Clear items and pools
        this.clearVisibleItems();
        this.itemPool = [];

        // Clear container
        if (this.contentWrapper && this.contentWrapper.parentNode) {
            this.contentWrapper.parentNode.removeChild(this.contentWrapper);
        }

        // Clear timeouts
        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
        }

        this.emitEvent('gallery:destroyed');

        // Reset state
        this.isInitialized = false;
        this.photos = [];
        this.visibleItems.clear();
    }

    // Utility functions

    /**
     * Throttle function execution
     * @param {Function} func - Function to throttle
     * @param {number} limit - Time limit in ms
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Debounce function execution
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in ms
     * @returns {Function} Debounced function
     */
    debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
}

// Export for use in other modules
export default VirtualGalleryManager;

// Also make available globally for legacy compatibility
if (typeof window !== 'undefined') {
    window.VirtualGalleryManager = VirtualGalleryManager;
}