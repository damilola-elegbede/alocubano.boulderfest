/**
 * Multi-Year Gallery Manager
 * Manages gallery displays across multiple years with intelligent preloading,
 * year switching, keyboard navigation, and statistics display.
 */

class MultiYearGalleryManager {
    constructor(options = {}) {
        this.container = options.container;
        this.defaultYear =
      options.defaultYear || new Date().getFullYear().toString();
        this.preloadAdjacentYears = options.preloadAdjacentYears !== false;
        this.enableKeyboardNavigation = options.enableKeyboardNavigation !== false;
        this.enableUrlStateManagement = options.enableUrlStateManagement !== false;
        this.showStatistics = options.showStatistics !== false;

        // State management
        this.currentYear = null;
        this.availableYears = [];
        this.galleryInstances = new Map(); // year -> VirtualGalleryManager instance
        this.preloadedYears = new Set();
        this.yearStatistics = new Map(); // year -> {imageCount, totalSize}
        this.isLoading = false;
        this.isInitialized = false;

        // DOM elements
        this.yearSelector = null;
        this.galleryContainer = null;
        this.loadingIndicator = null;
        this.statisticsDisplay = null;
        this.errorDisplay = null;

        // Event handlers
        this.boundHandlers = {
            keydown: this.handleKeydown.bind(this),
            popstate: this.handlePopState.bind(this),
            yearSelect: this.handleYearSelect.bind(this)
        };

        this.init();
    }

    /**
   * Initialize the multi-year gallery manager
   */
    async init() {
        try {
            if (!this.container) {
                throw new Error('Container element is required');
            }

            // Create the DOM structure
            this.createDOMStructure();

            // Load available years (now handles API failures gracefully)
            await this.loadAvailableYears();

            // Determine initial year from URL or default
            const initialYear = this.getInitialYear();

            // Load initial gallery
            await this.switchToYear(initialYear);

            // Set up event listeners
            this.setupEventListeners();

            // Start preloading adjacent years if enabled
            if (this.preloadAdjacentYears) {
                this.scheduleAdjacentYearPreloading();
            }

            this.isInitialized = true;
            this.dispatchEvent('initialized', { year: this.currentYear });
        } catch (error) {
            console.error('MultiYearGalleryManager initialization failed:', error);

            // Instead of showing error, dispatch event to trigger fallback
            this.dispatchEvent('initializationError', {
                error: error.message,
                shouldUseFallback: true
            });

            // Don't throw the error - let the parent handle fallback
            throw error;
        }
    }

    /**
   * Create the DOM structure for the multi-year gallery
   */
    createDOMStructure() {
        this.container.innerHTML = `
            <div class="multi-year-gallery">
                <!-- Year Selector -->
                <div class="year-selector-container">
                    <div class="year-selector" role="tablist" aria-label="Select gallery year">
                        <!-- Year buttons will be inserted here -->
                    </div>
                    <div class="year-statistics" aria-live="polite">
                        <!-- Statistics will be inserted here -->
                    </div>
                </div>
                
                <!-- Loading Indicator -->
                <div class="loading-indicator" aria-hidden="true">
                    <div class="loading-spinner"></div>
                    <span class="loading-text">Loading gallery...</span>
                </div>
                
                <!-- Error Display -->
                <div class="error-display" role="alert" aria-hidden="true">
                    <div class="error-message"></div>
                    <button class="error-retry" type="button">Retry</button>
                </div>
                
                <!-- Gallery Container -->
                <div class="gallery-container" role="tabpanel">
                    <!-- Individual year galleries will be inserted here -->
                </div>
            </div>
        `;

        // Cache DOM elements
        this.yearSelector = this.container.querySelector('.year-selector');
        this.galleryContainer = this.container.querySelector('.gallery-container');
        this.loadingIndicator = this.container.querySelector('.loading-indicator');
        this.statisticsDisplay = this.container.querySelector('.year-statistics');
        this.errorDisplay = this.container.querySelector('.error-display');

        // Set up error retry handler
        const retryButton = this.container.querySelector('.error-retry');
        retryButton.addEventListener('click', () => this.retryCurrentOperation());
    }

    /**
   * Load available years from the API
   */
    async loadAvailableYears() {
        try {
            const response = await fetch('/api/gallery/years');
            if (!response.ok) {
                throw new Error(`Failed to load available years: ${response.status}`);
            }

            const data = await response.json();
            this.availableYears = data.years || [];
            this.yearStatistics = new Map(
                Object.entries(data.statistics || {}).map(([year, stats]) => [
                    year,
                    stats
                ])
            );

            if (this.availableYears.length === 0) {
                throw new Error('No gallery years available');
            }

            // Create year selector buttons
            this.createYearSelectorButtons();
        } catch (error) {
            console.warn(
                'Failed to load years from API, using fallback data:',
                error.message
            );

            // Use fallback data when API fails
            this.availableYears = ['2025']; // Only show available year
            this.yearStatistics = new Map([
                ['2025', { imageCount: 0, totalSize: 0 }] // Basic stats
            ]);

            // Create year selector buttons with fallback data
            this.createYearSelectorButtons();

            // Emit warning event but don't throw - allow initialization to continue
            this.dispatchEvent('yearsLoadWarning', {
                error: error.message,
                fallbackUsed: true
            });
        }
    }

    /**
   * Create year selector buttons
   */
    createYearSelectorButtons() {
    // Sort years in descending order (newest first)
        const sortedYears = [...this.availableYears].sort((a, b) =>
            b.localeCompare(a)
        );

        this.yearSelector.innerHTML = sortedYears
            .map((year) => {
                const stats = this.yearStatistics.get(year);
                const imageCount = stats ? stats.imageCount : 0;

                return `
                <button 
                    type="button" 
                    class="year-button" 
                    data-year="${year}"
                    role="tab"
                    aria-selected="false"
                    aria-controls="gallery-${year}"
                    title="${year} Gallery (${imageCount} images)"
                >
                    <span class="year-label">${year}</span>
                    ${this.showStatistics ? `<span class="year-count">${imageCount}</span>` : ''}
                </button>
            `;
            })
            .join('');

        // Add click handlers to year buttons
        this.yearSelector.addEventListener('click', this.boundHandlers.yearSelect);
    }

    /**
   * Handle year selection from buttons
   */
    async handleYearSelect(event) {
        const button = event.target.closest('.year-button');
        if (!button) {
            return;
        }

        const year = button.dataset.year;
        if (year && year !== this.currentYear) {
            await this.switchToYear(year);
        }
    }

    /**
   * Switch to a specific year's gallery
   */
    async switchToYear(year) {
        if (this.isLoading || year === this.currentYear) {
            return;
        }

        try {
            this.isLoading = true;
            this.showLoading();
            this.hideError();

            // Update URL if enabled
            if (this.enableUrlStateManagement) {
                this.updateUrl(year);
            }

            // Update year selector UI
            this.updateYearSelectorUI(year);

            // Hide current gallery if exists
            if (this.currentYear) {
                this.hideGallery(this.currentYear);
            }

            // Load or show the requested year's gallery
            await this.loadYearGallery(year);

            // Update current year
            const previousYear = this.currentYear;
            this.currentYear = year;

            // Show the new gallery
            this.showGallery(year);

            // Update statistics display
            this.updateStatisticsDisplay(year);

            // Schedule preloading of adjacent years
            if (this.preloadAdjacentYears) {
                this.scheduleAdjacentYearPreloading();
            }

            // Dispatch year change event
            this.dispatchEvent('yearChanged', {
                previousYear,
                currentYear: year,
                galleryInstance: this.galleryInstances.get(year)
            });
        } catch (error) {
            this.showError(`Failed to load ${year} gallery. Please try again.`);
            // Emit error event for monitoring
            this.dispatchEvent('yearSwitchError', { year, error: error.message });
        } finally {
            this.isLoading = false;
            this.hideLoading();
        }
    }

    /**
   * Load a specific year's gallery
   */
    async loadYearGallery(year) {
    // Check if gallery is already loaded
        if (this.galleryInstances.has(year)) {
            return;
        }

        try {
            // Create container for this year's gallery
            const yearContainer = document.createElement('div');
            yearContainer.className = 'year-gallery-container';
            yearContainer.id = `gallery-${year}`;
            yearContainer.setAttribute('data-year', year);
            yearContainer.style.display = 'none';
            this.galleryContainer.appendChild(yearContainer);

            // Create a virtual gallery instance for this year
            const galleryInstance = await this.createVirtualGallery({
                container: yearContainer,
                year: year,
                apiEndpoint: '/api/gallery'
            });

            // Wait for gallery to initialize
            await galleryInstance.init();

            // Store the instance
            this.galleryInstances.set(year, galleryInstance);
            this.preloadedYears.add(year);
        } catch (error) {
            // Emit error event for monitoring
            this.dispatchEvent('galleryLoadError', { year, error: error.message });
            throw error;
        }
    }

    /**
   * Show a specific year's gallery
   */
    showGallery(year) {
        const container = this.galleryContainer.querySelector(
            `[data-year="${year}"]`
        );
        if (container) {
            container.style.display = 'block';
            container.setAttribute('aria-hidden', 'false');

            // Trigger any gallery-specific show animations
            const galleryInstance = this.galleryInstances.get(year);
            if (galleryInstance && typeof galleryInstance.onShow === 'function') {
                galleryInstance.onShow();
            }
        }
    }

    /**
   * Hide a specific year's gallery
   */
    hideGallery(year) {
        const container = this.galleryContainer.querySelector(
            `[data-year="${year}"]`
        );
        if (container) {
            container.style.display = 'none';
            container.setAttribute('aria-hidden', 'true');

            // Trigger any gallery-specific hide cleanup
            const galleryInstance = this.galleryInstances.get(year);
            if (galleryInstance && typeof galleryInstance.onHide === 'function') {
                galleryInstance.onHide();
            }
        }
    }

    /**
   * Update year selector UI
   */
    updateYearSelectorUI(selectedYear) {
        const buttons = this.yearSelector.querySelectorAll('.year-button');
        buttons.forEach((button) => {
            const isSelected = button.dataset.year === selectedYear;
            button.classList.toggle('active', isSelected);
            button.setAttribute('aria-selected', isSelected.toString());
        });
    }

    /**
   * Update statistics display
   */
    updateStatisticsDisplay(year) {
        if (!this.showStatistics || !this.statisticsDisplay) {
            return;
        }

        const stats = this.yearStatistics.get(year);
        if (stats) {
            const { imageCount, totalSize } = stats;
            const sizeFormatted = this.formatFileSize(totalSize);

            this.statisticsDisplay.innerHTML = `
                <div class="year-stats">
                    <span class="stat-item">
                        <span class="stat-label">Images:</span>
                        <span class="stat-value">${imageCount}</span>
                    </span>
                    <span class="stat-item">
                        <span class="stat-label">Total Size:</span>
                        <span class="stat-value">${sizeFormatted}</span>
                    </span>
                </div>
            `;
        } else {
            this.statisticsDisplay.innerHTML = '';
        }
    }

    /**
   * Schedule preloading of adjacent years
   */
    scheduleAdjacentYearPreloading() {
        if (!this.currentYear || !this.preloadAdjacentYears) {
            return;
        }

        // Use requestIdleCallback for low-priority preloading
        const schedulePreload = (callback) => {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(callback, { timeout: 5000 });
            } else {
                setTimeout(callback, 100);
            }
        };

        const currentIndex = this.availableYears.indexOf(this.currentYear);
        const adjacentYears = [];

        // Get previous and next years
        if (currentIndex > 0) {
            adjacentYears.push(this.availableYears[currentIndex - 1]);
        }
        if (currentIndex < this.availableYears.length - 1) {
            adjacentYears.push(this.availableYears[currentIndex + 1]);
        }

        // Preload adjacent years that aren't already loaded
        adjacentYears.forEach((year) => {
            if (!this.preloadedYears.has(year)) {
                schedulePreload(async() => {
                    try {
                        await this.loadYearGallery(year);
                        // Emit preload success event
                        this.dispatchEvent('yearPreloaded', { year });
                    } catch (error) {
                        // Emit preload error event for monitoring
                        this.dispatchEvent('yearPreloadError', {
                            year,
                            error: error.message
                        });
                    }
                });
            }
        });
    }

    /**
   * Set up event listeners
   */
    setupEventListeners() {
    // Keyboard navigation
        if (this.enableKeyboardNavigation) {
            document.addEventListener('keydown', this.boundHandlers.keydown);
        }

        // URL state management
        if (this.enableUrlStateManagement) {
            window.addEventListener('popstate', this.boundHandlers.popstate);
        }
    }

    /**
   * Handle keyboard navigation
   */
    handleKeydown(event) {
    // Only handle arrow keys when gallery is focused or no specific element is focused
        const activeElement = document.activeElement;
        const isGalleryFocused =
      this.container.contains(activeElement) || activeElement === document.body;

        if (!isGalleryFocused) {
            return;
        }

        const currentIndex = this.availableYears.indexOf(this.currentYear);
        let targetYear = null;

        switch (event.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
        // Previous year
            if (currentIndex > 0) {
                targetYear = this.availableYears[currentIndex - 1];
            }
            break;

        case 'ArrowRight':
        case 'ArrowDown':
        // Next year
            if (currentIndex < this.availableYears.length - 1) {
                targetYear = this.availableYears[currentIndex + 1];
            }
            break;
        }

        if (targetYear) {
            event.preventDefault();
            this.switchToYear(targetYear);
        }
    }

    /**
   * Handle browser back/forward navigation
   */
    handlePopState() {
        const year = this.getYearFromUrl();
        if (
            year &&
      year !== this.currentYear &&
      this.availableYears.includes(year)
        ) {
            this.switchToYear(year);
        }
    }

    /**
   * Get initial year from URL or use default
   */
    getInitialYear() {
        if (this.enableUrlStateManagement) {
            const urlYear = this.getYearFromUrl();
            if (urlYear && this.availableYears.includes(urlYear)) {
                return urlYear;
            }
        }

        // Return default year if available, otherwise the newest year
        return this.availableYears.includes(this.defaultYear)
            ? this.defaultYear
            : this.availableYears[0];
    }

    /**
   * Get year from URL parameters
   */
    getYearFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('year');
    }

    /**
   * Update URL with current year
   */
    updateUrl(year) {
        const url = new URL(window.location);
        url.searchParams.set('year', year);
        window.history.pushState({ year }, '', url);
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
   * Retry current operation
   */
    async retryCurrentOperation() {
        this.hideError();
        if (this.currentYear) {
            await this.switchToYear(this.currentYear);
        } else {
            await this.init();
        }
    }

    /**
   * Format file size for display
   */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = (bytes / Math.pow(1024, i)).toFixed(1);

        return `${size} ${units[i]}`;
    }

    /**
   * Dispatch custom events
   */
    dispatchEvent(eventName, detail = {}) {
        const event = new CustomEvent(`multiYearGallery:${eventName}`, {
            detail,
            bubbles: true
        });
        this.container.dispatchEvent(event);
    }

    /**
   * Get current gallery instance
   */
    getCurrentGalleryInstance() {
        return this.galleryInstances.get(this.currentYear);
    }

    /**
   * Get all available years
   */
    getAvailableYears() {
        return [...this.availableYears];
    }

    /**
   * Get statistics for a specific year
   */
    getYearStatistics(year) {
        return this.yearStatistics.get(year);
    }

    /**
   * Create a virtual gallery instance for a year
   * Uses VirtualGalleryManager for high-performance gallery display
   */
    async createVirtualGallery(options) {
        const { container, year, apiEndpoint } = options;

        // Check if VirtualGalleryManager is available
        if (typeof VirtualGalleryManager !== 'undefined') {
            // Use VirtualGalleryManager for advanced functionality
            try {
                const virtualGallery = new VirtualGalleryManager({
                    container: container,
                    apiEndpoint: apiEndpoint,
                    year: year,
                    enableVirtualScrolling: false, // Disable for embedded use
                    itemHeight: 300,
                    itemsPerRow: 3,
                    bufferSize: 5
                });

                // Store reference on container
                container.galleryInstance = virtualGallery;

                return virtualGallery;
            } catch (error) {
                // Emit fallback event for monitoring
                this.dispatchEvent('virtualGalleryFallback', {
                    year,
                    error: error.message
                });
            }
        }

        // Fallback to simple gallery if VirtualGalleryManager is not available
        return this.createSimpleGallery(options);
    }

    /**
   * Create a simple gallery instance as fallback
   */
    async createSimpleGallery(options) {
        const { container, year, apiEndpoint } = options;

        // Simple gallery instance with basic functionality
        const galleryInstance = {
            container,
            year,
            apiEndpoint,
            images: [],
            isInitialized: false,

            async init() {
                try {
                    // Load images from API
                    const response = await fetch(this.apiEndpoint);
                    if (!response.ok) {
                        throw new Error(`Failed to fetch gallery data: ${response.status}`);
                    }

                    const data = await response.json();

                    // Handle both structured (categories) and flat responses
                    if (data.categories) {
                        // Flatten categories into single array
                        this.images = [];
                        Object.entries(data.categories).forEach(([category, items]) => {
                            items.forEach((item) => {
                                this.images.push({
                                    ...item,
                                    category: category
                                });
                            });
                        });
                    } else {
                        this.images = data.images || [];
                    }

                    // Render gallery
                    this.render();

                    this.isInitialized = true;
                    return this;
                } catch (error) {
                    this.renderError(error.message);
                    // Emit error event for monitoring
                    this.dispatchEvent('simpleGalleryError', {
                        year,
                        error: error.message
                    });
                    throw error;
                }
            },

            render() {
                if (this.images.length === 0) {
                    this.container.innerHTML = `
                        <div class="gallery-empty">
                            <p>No images available for ${this.year}</p>
                        </div>
                    `;
                    return;
                }

                // Create simple grid layout
                const gridHTML = this.images
                    .map((image, index) => {
                        const title = (image.name || image.title || '').replace(
                            /\.[^/.]+$/,
                            ''
                        );
                        return `
                        <div class="gallery-item" data-index="${index}" data-category="${image.category || ''}">
                            <div class="gallery-item-media">
                                <img 
                                    src="${image.thumbnailUrl || image.url}" 
                                    alt="${title || `Festival photo ${index + 1}`}"
                                    loading="lazy"
                                    class="gallery-image"
                                    data-full-url="${image.url}"
                                />
                                <div class="lazy-placeholder" style="display: none;">
                                    <div class="loading-spinner">📷</div>
                                </div>
                            </div>
                        </div>
                    `;
                    })
                    .join('');

                this.container.innerHTML = `
                    <div class="gallery-grid">
                        ${gridHTML}
                    </div>
                `;

                // Add click handlers for lightbox (if available)
                this.setupImageHandlers();
            },

            renderError(message) {
                this.container.innerHTML = `
                    <div class="gallery-error">
                        <p>Failed to load gallery: ${message}</p>
                        <button class="gallery-retry" onclick="this.parentElement.parentElement.galleryInstance.init()">
                            Retry
                        </button>
                    </div>
                `;
            },

            setupImageHandlers() {
                const images = this.container.querySelectorAll('.gallery-image');
                images.forEach((img, index) => {
                    img.addEventListener('click', () => {
                        // Trigger lightbox using Lightbox component if available
                        if (typeof Lightbox !== 'undefined') {
                            // Initialize lightbox if not already done
                            if (!this.lightbox) {
                                this.lightbox = new Lightbox({
                                    lightboxId: 'multi-year-lightbox',
                                    showCaption: false,
                                    showCounter: true,
                                    advanced: true
                                });
                            }

                            // Prepare items for lightbox
                            const lightboxItems = this.images.map((item) => ({
                                ...item,
                                url: item.url,
                                thumbnailUrl: item.thumbnailUrl || item.url,
                                title: (item.name || item.title || '').replace(/\.[^/.]+$/, '')
                            }));

                            const categories = this.images.map(
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
                    });

                    // Handle image load errors
                    img.addEventListener('error', () => {
                        img.src = '/images/gallery/placeholder-1.svg';
                    });
                });
            },

            getCategoryCounts() {
                const counts = {};
                this.images.forEach((item) => {
                    const category = item.category || 'uncategorized';
                    counts[category] = (counts[category] || 0) + 1;
                });
                return counts;
            },

            onShow() {
                // Called when gallery is shown
                this.container.style.display = 'block';
            },

            onHide() {
                // Called when gallery is hidden
                this.container.style.display = 'none';
            },

            destroy() {
                // Clean up lightbox
                if (this.lightbox && typeof this.lightbox.destroy === 'function') {
                    this.lightbox.destroy();
                }

                // Clean up event listeners and DOM
                this.container.innerHTML = '';
                this.images = [];
                this.isInitialized = false;
            }
        };

        // Store reference to gallery instance on container for potential access
        container.galleryInstance = galleryInstance;

        return galleryInstance;
    }

    /**
   * Destroy the gallery manager and clean up resources
   */
    destroy() {
    // Remove event listeners
        if (this.enableKeyboardNavigation) {
            document.removeEventListener('keydown', this.boundHandlers.keydown);
        }
        if (this.enableUrlStateManagement) {
            window.removeEventListener('popstate', this.boundHandlers.popstate);
        }

        // Destroy all gallery instances
        this.galleryInstances.forEach((instance) => {
            if (typeof instance.destroy === 'function') {
                instance.destroy();
            }
        });

        // Clear state
        this.galleryInstances.clear();
        this.preloadedYears.clear();
        this.yearStatistics.clear();

        // Clear container
        if (this.container) {
            this.container.innerHTML = '';
        }

        this.isInitialized = false;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MultiYearGalleryManager;
}

// Global availability
window.MultiYearGalleryManager = MultiYearGalleryManager;
