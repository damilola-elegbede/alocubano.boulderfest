/**
 * Unified Lazy Loading Component
 * Consolidated from main.js and gallery-detail.js implementations
 * Supports both simple image lazy loading and advanced item loading with placeholders
 */

if (typeof LazyLoader === 'undefined') {
    class LazyLoader {
        constructor(options = {}) {
            this.config = {
                rootMargin: options.rootMargin || '50px 0px',
                threshold: options.threshold || 0.1,
                selector: options.selector || 'img[data-src]',
                advancedSelector: options.advancedSelector || '.lazy-item[data-loaded="false"]',
                loadedClass: options.loadedClass || 'loaded',
                advanced: options.advanced || false,
                maxRetries: options.maxRetries || 3
            };

            this.observer = null;
            this.failedImages = new Map(); // Track failed images with retry count
            this.init();
        }

        init() {
            // Check for IntersectionObserver support
            if (!('IntersectionObserver' in window)) {
                // IntersectionObserver not supported, falling back to immediate loading
                this.fallbackLoad();
                return;
            }

            this.createObserver();
            this.observeElements();
        }

        createObserver() {
            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        if (this.config.advanced) {
                            this.loadAdvancedItem(entry.target);
                        } else {
                            this.loadSimpleImage(entry.target);
                        }
                        this.observer.unobserve(entry.target);
                    }
                });
            }, {
                rootMargin: this.config.rootMargin,
                threshold: this.config.threshold
            });
        }

        observeElements() {
            const selector = this.config.advanced ? this.config.advancedSelector : this.config.selector;
            const elements = document.querySelectorAll(selector);

            elements.forEach(element => {
                this.observer.observe(element);
            });
        }

        // Simple image loading (from main.js)
        loadSimpleImage(img) {
            if (img.dataset.src) {
                const src = img.dataset.src;

                img.onload = () => {
                    // Success - remove from failed images if it was there
                    this.failedImages.delete(img);

                    img.classList.add(this.config.loadedClass);
                    // Add fade-in effect
                    img.style.transition = 'opacity 0.3s ease-in-out';
                    img.style.opacity = '1';
                };

                img.onerror = () => {
                    // Handle error state for simple images
                    img.style.opacity = '1';
                    img.style.cursor = 'pointer';
                    img.title = 'Click to retry loading';
                    img.alt = '❌ Failed to load - Click to retry';

                    // Store failed image info
                    const retryInfo = {
                        element: img,
                        src: src,
                        retryCount: 0
                    };
                    this.failedImages.set(img, retryInfo);

                    // Add click handler for retry
                    img.onclick = (e) => {
                        e.stopPropagation();
                        this.retrySimpleImage(img);
                    };

                    console.warn('Failed to load image:', src);
                };

                // Start loading
                img.src = src;
                img.style.opacity = '0';

                // Clean up data attribute
                delete img.dataset.src;
            }
        }

        // Advanced item loading (from gallery-detail.js)
        loadAdvancedItem(item) {
            const lazyImage = item.querySelector('.lazy-image');
            const placeholder = item.querySelector('.lazy-placeholder');
            const spinner = item.querySelector('.loading-spinner');

            if (lazyImage) {
                const src = lazyImage.getAttribute('data-src');
                if (src) {
                    // Show loading state
                    if (spinner) {
                        spinner.style.display = 'block';
                    }

                    lazyImage.onload = () => {
                        // Hide placeholder and spinner
                        if (placeholder) {
                            placeholder.style.display = 'none';
                        }
                        if (spinner) {
                            spinner.style.display = 'none';
                        }

                        // Show image with transition
                        lazyImage.style.display = 'block';
                        lazyImage.style.opacity = '1';

                        // Mark as loaded
                        item.classList.add(this.config.loadedClass);
                        item.setAttribute('data-loaded', 'true');
                    };

                    lazyImage.onerror = () => {
                        // Handle error state
                        if (spinner) {
                            spinner.textContent = '❌';
                            spinner.style.display = 'block';
                            spinner.style.cursor = 'pointer';
                            spinner.title = 'Click to retry loading';

                            // Store failed image info
                            const retryInfo = {
                                element: item,
                                src: src,
                                retryCount: 0
                            };
                            this.failedImages.set(item, retryInfo);

                            // Add click handler for retry
                            spinner.onclick = (e) => {
                                e.stopPropagation();
                                this.retryFailedImage(item);
                            };
                        }
                        if (placeholder) {
                            placeholder.style.display = 'block'; // Keep placeholder visible on error
                        }

                        // Failed to load image - logged for debugging
                        console.warn('Failed to load image:', src);
                    };

                    // Start loading
                    lazyImage.src = src;
                    lazyImage.removeAttribute('data-src');
                }
            }
        }

        // Fallback for browsers without IntersectionObserver
        fallbackLoad() {
            if (this.config.advanced) {
                const items = document.querySelectorAll(this.config.advancedSelector);
                items.forEach(item => this.loadAdvancedItem(item));
            } else {
                const images = document.querySelectorAll(this.config.selector);
                images.forEach(img => this.loadSimpleImage(img));
            }
        }

        // Method to observe new elements (useful for dynamic content)
        observeNewElements(elements) {
            if (!this.observer) {
                return;
            }

            if (elements) {
                // Observe specific elements
                elements.forEach(element => {
                    this.observer.observe(element);
                });
            } else {
                // Re-scan and observe all matching elements
                this.observeElements();
            }
        }

        // Method to load all remaining elements immediately
        loadAll() {
            const selector = this.config.advanced ? this.config.advancedSelector : this.config.selector;
            const elements = document.querySelectorAll(selector);

            elements.forEach(element => {
                if (this.config.advanced) {
                    this.loadAdvancedItem(element);
                } else {
                    this.loadSimpleImage(element);
                }

                if (this.observer) {
                    this.observer.unobserve(element);
                }
            });
        }

        // Cleanup method
        destroy() {
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }
        }

        // Static factory methods for common use cases
        static createSimple(options = {}) {
            return new LazyLoader({
                ...options,
                advanced: false,
                selector: options.selector || 'img[data-src]'
            });
        }

        static createAdvanced(options = {}) {
            return new LazyLoader({
                ...options,
                advanced: true,
                advancedSelector: options.selector || '.lazy-item[data-loaded="false"]',
                rootMargin: options.rootMargin || '100px 0px'
            });
        }

        // Method to update configuration and reinitialize
        updateConfig(newConfig) {
            this.destroy();
            this.config = { ...this.config, ...newConfig };
            this.init();
        }

        // Retry a specific failed image
        retryFailedImage(item) {
            const retryInfo = this.failedImages.get(item);
            if (!retryInfo) {
                return;
            }

            const { src, retryCount } = retryInfo;

            // Check if we've exceeded max retries
            if (retryCount >= this.config.maxRetries) {
                console.warn('Max retries exceeded for image:', src);
                return;
            }

            const lazyImage = item.querySelector('.lazy-image');
            const spinner = item.querySelector('.loading-spinner');
            const placeholder = item.querySelector('.lazy-placeholder');

            if (lazyImage && spinner) {
                // Show loading state again
                spinner.textContent = '';
                spinner.innerHTML = '<div class="spinner-icon"></div>';
                spinner.style.cursor = 'default';
                spinner.onclick = null;

                // Update retry count
                retryInfo.retryCount++;
                this.failedImages.set(item, retryInfo);

                // Create new image element to force reload
                const newImage = new Image();

                newImage.onload = () => {
                    // Success - remove from failed images
                    this.failedImages.delete(item);

                    // Update the actual image
                    lazyImage.src = src;

                    // Hide placeholder and spinner
                    if (placeholder) {
                        placeholder.style.display = 'none';
                    }
                    if (spinner) {
                        spinner.style.display = 'none';
                    }

                    // Show image with transition
                    lazyImage.style.display = 'block';
                    lazyImage.style.opacity = '1';

                    // Mark as loaded
                    item.classList.add(this.config.loadedClass);
                    item.setAttribute('data-loaded', 'true');
                };

                newImage.onerror = () => {
                    // Failed again
                    if (spinner) {
                        spinner.textContent = '❌';
                        spinner.style.cursor = 'pointer';
                        spinner.title = `Click to retry loading (${retryInfo.retryCount}/${this.config.maxRetries} attempts)`;

                        // Re-add click handler
                        spinner.onclick = (e) => {
                            e.stopPropagation();
                            this.retryFailedImage(item);
                        };
                    }

                    console.warn(`Retry ${retryInfo.retryCount} failed for image:`, src);
                };

                // Attempt to load with cache-busting parameter
                const cacheBuster = `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
                newImage.src = src + cacheBuster;
            }
        }

        // Retry a simple image
        retrySimpleImage(img) {
            const retryInfo = this.failedImages.get(img);
            if (!retryInfo) {
                return;
            }

            const { src, retryCount } = retryInfo;

            // Check if we've exceeded max retries
            if (retryCount >= this.config.maxRetries) {
                console.warn('Max retries exceeded for image:', src);
                img.alt = '❌ Failed to load (max retries exceeded)';
                img.title = 'Max retries exceeded';
                img.style.cursor = 'not-allowed';
                img.onclick = null;
                return;
            }

            // Update retry count
            retryInfo.retryCount++;
            this.failedImages.set(img, retryInfo);

            // Reset state
            img.style.cursor = 'wait';
            img.alt = 'Loading...';
            img.title = 'Loading...';
            img.onclick = null;

            // Create new image element to force reload
            const newImage = new Image();

            newImage.onload = () => {
                // Success - remove from failed images
                this.failedImages.delete(img);

                // Update the actual image
                img.src = src + `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
                img.style.cursor = 'default';
                img.alt = '';
                img.title = '';
                img.classList.add(this.config.loadedClass);
            };

            newImage.onerror = () => {
                // Failed again
                img.style.cursor = 'pointer';
                img.alt = '❌ Failed to load - Click to retry';
                img.title = `Click to retry loading (${retryInfo.retryCount}/${this.config.maxRetries} attempts)`;

                // Re-add click handler
                img.onclick = (e) => {
                    e.stopPropagation();
                    this.retrySimpleImage(img);
                };

                console.warn(`Retry ${retryInfo.retryCount} failed for image:`, src);
            };

            // Attempt to load with cache-busting parameter
            newImage.src = src + `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
        }

        // Retry all failed images
        retryAllFailedImages() {
            const failedItems = Array.from(this.failedImages.keys());
            console.log(`Retrying ${failedItems.length} failed images...`);

            failedItems.forEach(item => {
                // Check if it's a simple image or advanced item
                if (item.tagName === 'IMG') {
                    this.retrySimpleImage(item);
                } else {
                    this.retryFailedImage(item);
                }
            });

            return failedItems.length;
        }

        // Get count of failed images
        getFailedImageCount() {
            return this.failedImages.size;
        }

        // Clear failed images tracking
        clearFailedImages() {
            this.failedImages.clear();
        }
    }

    // Export for use in other modules
    window.LazyLoader = LazyLoader;
}