/**
 * Virtual Gallery Manager
 * Provides high-performance virtual scrolling for large image galleries
 * with intelligent preloading, lazy loading, and memory management.
 */

class VirtualGalleryManager {
    constructor(options = {}) {
        this.container = options.container;
        this.apiEndpoint = options.apiEndpoint || '/api/gallery';
        this.year = options.year;
        this.itemHeight = options.itemHeight || 250;
        this.itemsPerRow = options.itemsPerRow || 4;
        this.bufferSize = options.bufferSize || 10;
        this.preloadDistance = options.preloadDistance || 500;
        this.enableVirtualScrolling = options.enableVirtualScrolling !== false;

        // State management
        this.items = [];
        this.loadedItems = new Set();
        this.visibleItems = new Map();
        this.scrollTop = 0;
        this.containerHeight = 0;
        this.totalHeight = 0;
        this.isLoading = false;
        this.hasMoreData = true;
        this.currentPage = 0;
        this.pageSize = 20;

        // DOM elements
        this.scrollContainer = null;
        this.virtualList = null;
        this.loadingIndicator = null;
        this.errorDisplay = null;

        // Performance tracking
        this.performanceMetrics = {
            renderTimes: [],
            scrollEvents: 0,
            itemsRendered: 0
        };

        // Throttled handlers
        this.boundScrollHandler = this.throttle(this.handleScroll.bind(this), 16);
        this.boundResizeHandler = this.throttle(this.handleResize.bind(this), 100);

        this.init();
    }

    /**
   * Initialize the virtual gallery
   */
    async init() {
        try {
            if (!this.container) {
                throw new Error('Container element is required');
            }

            this.createDOMStructure();
            this.setupEventListeners();
            await this.loadInitialData();
            this.render();

            return this;
        } catch (error) {

            this.showError('Failed to initialize gallery. Please refresh the page.');
            throw error;
        }
    }

    /**
   * Create the DOM structure for virtual scrolling
   */
    createDOMStructure() {
        this.container.innerHTML = `
            <div class="virtual-gallery">
                <!-- Loading Indicator -->
                <div class="virtual-loading" aria-hidden="true">
                    <div class="loading-spinner"></div>
                    <span class="loading-text">Loading gallery...</span>
                </div>
                
                <!-- Error Display -->
                <div class="virtual-error" role="alert" aria-hidden="true">
                    <div class="error-message"></div>
                    <button class="error-retry" type="button">Retry</button>
                </div>
                
                <!-- Virtual Scroll Container -->
                <div class="virtual-scroll-container">
                    <div class="virtual-list" role="grid">
                        <!-- Virtual items will be inserted here -->
                    </div>
                </div>
            </div>
        `;

        // Cache DOM elements
        this.scrollContainer = this.container.querySelector(
            '.virtual-scroll-container'
        );
        this.virtualList = this.container.querySelector('.virtual-list');
        this.loadingIndicator = this.container.querySelector('.virtual-loading');
        this.errorDisplay = this.container.querySelector('.virtual-error');

        // Set up error retry handler
        const retryButton = this.container.querySelector('.error-retry');
        retryButton.addEventListener('click', () => this.retryLoad());

        // Apply virtual scrolling styles
        if (this.enableVirtualScrolling) {
            this.scrollContainer.style.cssText = `
                height: 400px;
                overflow-y: auto;
                position: relative;
            `;

            this.virtualList.style.cssText = `
                position: relative;
                width: 100%;
            `;
        }
    }

    /**
   * Set up event listeners
   */
    setupEventListeners() {
        if (this.enableVirtualScrolling) {
            this.scrollContainer.addEventListener('scroll', this.boundScrollHandler);
            window.addEventListener('resize', this.boundResizeHandler);
        }

        // Intersection observer for infinite scroll (non-virtual mode)
        if (!this.enableVirtualScrolling) {
            this.setupInfiniteScroll();
        }
    }

    /**
   * Load initial data from API
   */
    async loadInitialData() {
        try {
            this.showLoading();

            const response = await this.fetchData(0, this.pageSize);
            const data = await response.json();

            this.processAPIResponse(data);
            this.hideLoading();
        } catch (error) {

            this.showError('Failed to load gallery data.');
            throw error;
        }
    }

    /**
   * Fetch data from API with pagination
   */
    async fetchData(offset, limit) {
        const url = `${this.apiEndpoint}?year=${this.year}&offset=${offset}&limit=${limit}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        return response;
    }

    /**
   * Process API response and update state
   */
    processAPIResponse(data) {
    // Handle both structured (categories) and flat responses
        let newItems = [];

        if (data.categories) {
            // Structured response with categories
            Object.entries(data.categories).forEach(([category, items]) => {
                items.forEach((item) => {
                    newItems.push({
                        ...item,
                        category: category,
                        id: item.id || item.name
                    });
                });
            });
        } else if (data.images) {
            // Flat image array
            newItems = data.images.map((item) => ({
                ...item,
                id: item.id || item.name
            }));
        }

        // Add new items
        this.items.push(...newItems);

        // Update pagination state
        this.hasMoreData = newItems.length === this.pageSize;
        this.currentPage++;

        // Calculate virtual list dimensions
        this.updateDimensions();
    }

    /**
   * Update virtual list dimensions
   */
    updateDimensions() {
        if (!this.enableVirtualScrolling) {
            return;
        }

        const rowCount = Math.ceil(this.items.length / this.itemsPerRow);
        this.totalHeight = rowCount * this.itemHeight;
        this.containerHeight = this.scrollContainer.clientHeight;

        // Update virtual list height
        this.virtualList.style.height = `${this.totalHeight}px`;
    }

    /**
   * Handle scroll events for virtual scrolling
   */
    handleScroll() {
        if (!this.enableVirtualScrolling) {
            return;
        }

        this.performanceMetrics.scrollEvents++;
        this.scrollTop = this.scrollContainer.scrollTop;

        // Check if we need to load more data
        const scrollBottom = this.scrollTop + this.containerHeight;
        if (
            scrollBottom > this.totalHeight - this.preloadDistance &&
      !this.isLoading &&
      this.hasMoreData
        ) {
            this.loadMoreData();
        }

        // Update visible items
        this.render();
    }

    /**
   * Handle resize events
   */
    handleResize() {
        this.containerHeight = this.scrollContainer.clientHeight;
        this.updateDimensions();
        this.render();
    }

    /**
   * Load more data for infinite scroll
   */
    async loadMoreData() {
        if (this.isLoading || !this.hasMoreData) {
            return;
        }

        try {
            this.isLoading = true;

            const offset = this.currentPage * this.pageSize;
            const response = await this.fetchData(offset, this.pageSize);
            const data = await response.json();

            this.processAPIResponse(data);
            this.render();
        } catch {

        } finally {
            this.isLoading = false;
        }
    }

    /**
   * Render virtual items
   */
    render() {
        const startTime = performance.now();

        if (this.enableVirtualScrolling) {
            this.renderVirtual();
        } else {
            this.renderStandard();
        }

        const renderTime = performance.now() - startTime;
        this.performanceMetrics.renderTimes.push(renderTime);

        // Keep only last 100 render times for memory efficiency
        if (this.performanceMetrics.renderTimes.length > 100) {
            this.performanceMetrics.renderTimes.shift();
        }
    }

    /**
   * Render items using virtual scrolling
   */
    renderVirtual() {
    // Calculate visible range
        const startRow = Math.floor(this.scrollTop / this.itemHeight);
        const endRow = Math.ceil(
            (this.scrollTop + this.containerHeight) / this.itemHeight
        );

        // Add buffer
        const bufferedStartRow = Math.max(0, startRow - this.bufferSize);
        const bufferedEndRow = Math.min(
            Math.ceil(this.items.length / this.itemsPerRow),
            endRow + this.bufferSize
        );

        // Calculate item indices
        const startIndex = bufferedStartRow * this.itemsPerRow;
        const endIndex = Math.min(
            this.items.length,
            bufferedEndRow * this.itemsPerRow
        );

        // Clear existing items
        this.virtualList.innerHTML = '';
        this.visibleItems.clear();

        // Render visible items
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.items[i];
            if (!item) {
                continue;
            }

            const row = Math.floor(i / this.itemsPerRow);
            const col = i % this.itemsPerRow;

            const element = this.createItemElement(item, i);
            element.style.cssText = `
                position: absolute;
                top: ${row * this.itemHeight}px;
                left: ${(col / this.itemsPerRow) * 100}%;
                width: ${100 / this.itemsPerRow}%;
                height: ${this.itemHeight}px;
            `;

            this.virtualList.appendChild(element);
            this.visibleItems.set(i, element);
        }

        this.performanceMetrics.itemsRendered = endIndex - startIndex;
    }

    /**
   * Render items using standard layout (non-virtual)
   */
    renderStandard() {
    // Only render new items
        const existingItems =
      this.virtualList.querySelectorAll('.gallery-item').length;

        for (let i = existingItems; i < this.items.length; i++) {
            const item = this.items[i];
            const element = this.createItemElement(item, i);
            this.virtualList.appendChild(element);
        }
    }

    /**
   * Create a gallery item element
   */
    createItemElement(item, index) {
        const element = document.createElement('div');
        element.className = 'gallery-item virtual-item';
        element.dataset.index = index;
        element.dataset.category = item.category || '';
        element.dataset.loaded = 'false';

        const title = (item.name || '').replace(/\.[^/.]+$/, '');

        element.innerHTML = `
            <div class="gallery-item-media">
                <div class="lazy-placeholder">
                    <div class="loading-spinner">📸</div>
                </div>
                <img 
                    data-src="${item.thumbnailUrl || item.url}" 
                    data-thumbnail="${item.thumbnailUrl || item.url}"
                    data-full-url="${item.url}"
                    alt="${title}" 
                    class="lazy-image gallery-image" 
                    style="display: none;"
                    loading="lazy"
                />
            </div>
        `;

        // Add click handler for lightbox
        element.addEventListener('click', (e) => {
            e.preventDefault();
            this.openLightbox(index);
        });

        // Set up lazy loading
        this.setupLazyLoading(element);

        return element;
    }

    /**
   * Set up lazy loading for an item
   */
    setupLazyLoading(element) {
    // Use Intersection Observer for lazy loading
        if (!this.lazyObserver) {
            this.lazyObserver = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            this.loadItemImage(entry.target);
                            this.lazyObserver.unobserve(entry.target);
                        }
                    });
                },
                {
                    rootMargin: '50px',
                    threshold: 0.1
                }
            );
        }

        const img = element.querySelector('img[data-src]');
        if (img) {
            this.lazyObserver.observe(img);
        }
    }

    /**
   * Load image for a specific item
   */
    loadItemImage(img) {
        const placeholder = img.parentElement.querySelector('.lazy-placeholder');

        img.onload = () => {
            img.style.display = 'block';
            if (placeholder) {
                placeholder.style.display = 'none';
            }

            const item = img.closest('.gallery-item');
            if (item) {
                item.dataset.loaded = 'true';
            }
        };

        img.onerror = () => {
            img.src = '/images/gallery/placeholder-1.svg';
            if (placeholder) {
                placeholder.innerHTML = '<div class="error-icon">❌</div>';
            }
        };

        img.src = img.dataset.src;
    }

    /**
   * Open lightbox for item at index
   */
    openLightbox(index) {
        if (typeof Lightbox === 'undefined') {

            return;
        }

        // Initialize lightbox if not already done
        if (!this.lightbox) {
            this.lightbox = new Lightbox({
                lightboxId: 'virtual-gallery-lightbox',
                showCaption: false,
                showCounter: true,
                advanced: true
            });
        }

        // Prepare items for lightbox
        const lightboxItems = this.items.map((item) => ({
            ...item,
            url: item.url,
            thumbnailUrl: item.thumbnailUrl || item.url,
            title: (item.name || '').replace(/\.[^/.]+$/, '')
        }));

        const categories = this.items.map(
            (item) => item.category || 'uncategorized'
        );
        const categoryCounts = this.getCategoryCounts();

        this.lightbox.openAdvanced(
            lightboxItems,
            index,
            categories,
            categoryCounts
        );
    }

    /**
   * Get category counts for lightbox
   */
    getCategoryCounts() {
        const counts = {};
        this.items.forEach((item) => {
            const category = item.category || 'uncategorized';
            counts[category] = (counts[category] || 0) + 1;
        });
        return counts;
    }

    /**
   * Set up infinite scroll for non-virtual mode
   */
    setupInfiniteScroll() {
    // Create sentinel element
        const sentinel = document.createElement('div');
        sentinel.className = 'infinite-scroll-sentinel';
        sentinel.style.cssText = 'height: 1px; margin: 20px 0;';

        // Observe sentinel
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting && !this.isLoading && this.hasMoreData) {
                        this.loadMoreData();
                    }
                });
            },
            {
                rootMargin: '100px'
            }
        );

        observer.observe(sentinel);
        this.container.appendChild(sentinel);
        this.infiniteScrollSentinel = sentinel;
        this.infiniteScrollObserver = observer;
    }

    /**
   * Show loading indicator
   */
    showLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.setAttribute('aria-hidden', 'false');
            this.loadingIndicator.style.display = 'flex';
        }
    }

    /**
   * Hide loading indicator
   */
    hideLoading() {
        if (this.loadingIndicator) {
            this.loadingIndicator.setAttribute('aria-hidden', 'true');
            this.loadingIndicator.style.display = 'none';
        }
    }

    /**
   * Show error message
   */
    showError(message) {
        if (this.errorDisplay) {
            const messageElement = this.errorDisplay.querySelector('.error-message');
            if (messageElement) {
                messageElement.textContent = message;
            }
            this.errorDisplay.setAttribute('aria-hidden', 'false');
            this.errorDisplay.style.display = 'block';
        }
    }

    /**
   * Hide error message
   */
    hideError() {
        if (this.errorDisplay) {
            this.errorDisplay.setAttribute('aria-hidden', 'true');
            this.errorDisplay.style.display = 'none';
        }
    }

    /**
   * Retry loading
   */
    async retryLoad() {
        this.hideError();
        try {
            await this.loadInitialData();
            this.render();
        } catch {

        }
    }

    /**
   * Throttle function for performance
   */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    /**
   * Get performance metrics
   */
    getPerformanceMetrics() {
        const avgRenderTime =
      this.performanceMetrics.renderTimes.length > 0
          ? this.performanceMetrics.renderTimes.reduce((a, b) => a + b, 0) /
          this.performanceMetrics.renderTimes.length
          : 0;

        return {
            averageRenderTime: avgRenderTime.toFixed(2),
            scrollEvents: this.performanceMetrics.scrollEvents,
            itemsRendered: this.performanceMetrics.itemsRendered,
            totalItems: this.items.length,
            visibleItems: this.visibleItems.size
        };
    }

    /**
   * Lifecycle methods for integration
   */
    onShow() {
        if (this.container) {
            this.container.style.display = 'block';
        }
        // Re-setup event listeners if needed
        this.handleResize();
    }

    onHide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    /**
   * Destroy the virtual gallery and clean up resources
   */
    destroy() {
    // Remove event listeners
        if (this.enableVirtualScrolling) {
            this.scrollContainer?.removeEventListener(
                'scroll',
                this.boundScrollHandler
            );
            window.removeEventListener('resize', this.boundResizeHandler);
        }

        // Clean up observers
        if (this.lazyObserver) {
            this.lazyObserver.disconnect();
        }

        if (this.infiniteScrollObserver) {
            this.infiniteScrollObserver.disconnect();
        }

        // Clean up lightbox
        if (this.lightbox && typeof this.lightbox.destroy === 'function') {
            this.lightbox.destroy();
        }

        // Clear references
        this.items = [];
        this.loadedItems.clear();
        this.visibleItems.clear();

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = VirtualGalleryManager;
}

// Global availability
window.VirtualGalleryManager = VirtualGalleryManager;
