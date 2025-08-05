/**
 * Unified Lazy Loading Component
 * Consolidated from main.js and gallery-detail.js implementations
 * Supports both simple image lazy loading and advanced item loading with placeholders
 * Enhanced with responsive images and WebP format support
 */

if (typeof LazyLoader === 'undefined') {
    class LazyLoader {
        constructor(options = {}) {
            this.config = {
                rootMargin: options.rootMargin || '50px 0px',
                threshold: options.threshold || 0.1,
                selector: options.selector || 'img[data-src]',
                advancedSelector:
          options.advancedSelector || '.lazy-item[data-loaded="false"]',
                loadedClass: options.loadedClass || 'loaded',
                advanced: options.advanced || false,
                maxRetries: options.maxRetries || 3,
                // Responsive image options
                responsive: options.responsive || false,
                widths: options.widths || [400, 800, 1200],
                sizes:
          options.sizes ||
          '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px',
                webpSupport: options.webpSupport !== false // Default to true unless explicitly disabled
            };

            this.observer = null;
            this.failedImages = new Map(); // Track failed images with retry count
            this.webpSupported = null; // Cache WebP support detection
            this.init();
        }

        init() {
            // Check for IntersectionObserver support
            if (!('IntersectionObserver' in window)) {
                // IntersectionObserver not supported, falling back to immediate loading
                this.fallbackLoad();
                return;
            }

            // Initialize WebP support detection if responsive images are enabled
            if (this.config.responsive && this.config.webpSupport) {
                this.detectWebPSupport();
            }

            this.createObserver();
            this.observeElements();
        }

        /**
     * Detect WebP support using a small test image
     * @returns {Promise<boolean>} Promise that resolves to WebP support status
     */
        async detectWebPSupport() {
            if (this.webpSupported !== null) {
                return this.webpSupported;
            }

            return new Promise((resolve) => {
                const webpTestImage = new Image();
                webpTestImage.onload = () => {
                    this.webpSupported =
            webpTestImage.width > 0 && webpTestImage.height > 0;
                    resolve(this.webpSupported);
                };
                webpTestImage.onerror = () => {
                    this.webpSupported = false;
                    resolve(this.webpSupported);
                };
                // 1x1 pixel WebP image in base64
                webpTestImage.src =
          'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
            });
        }

        /**
     * Create a responsive picture element with WebP and JPEG sources
     * @param {string} baseSrc - Base image source path
     * @param {string} alt - Alt text for the image
     * @param {string} className - CSS class for the img element
     * @returns {HTMLPictureElement} Picture element with responsive sources
     */
        createResponsiveImageElement(baseSrc, alt = '', className = '') {
            const picture = document.createElement('picture');

            // Extract file extension and base path
            const lastDotIndex = baseSrc.lastIndexOf('.');
            const basePath =
        lastDotIndex !== -1 ? baseSrc.substring(0, lastDotIndex) : baseSrc;
            const extension =
        lastDotIndex !== -1 ? baseSrc.substring(lastDotIndex) : '.jpg';

            // Create WebP source if supported
            if (this.config.webpSupport && this.webpSupported !== false) {
                const webpSource = document.createElement('source');
                webpSource.type = 'image/webp';

                // Generate srcset for different widths
                const webpSrcset = this.config.widths
                    .map((width) => `${basePath}_${width}w.webp ${width}w`)
                    .join(', ');

                webpSource.srcset = webpSrcset;
                webpSource.sizes = this.config.sizes;
                picture.appendChild(webpSource);
            }

            // Create JPEG/fallback source
            const jpegSource = document.createElement('source');
            jpegSource.type =
        extension === '.jpg' || extension === '.jpeg'
            ? 'image/jpeg'
            : `image/${extension.substring(1)}`;

            // Generate srcset for different widths
            const jpegSrcset = this.config.widths
                .map((width) => `${basePath}_${width}w${extension} ${width}w`)
                .join(', ');

            jpegSource.srcset = jpegSrcset;
            jpegSource.sizes = this.config.sizes;
            picture.appendChild(jpegSource);

            // Create fallback img element
            const img = document.createElement('img');
            img.src = baseSrc; // Fallback to original source
            img.alt = alt;
            if (className) {
                img.className = className;
            }

            // Add responsive attributes
            img.loading = 'lazy';
            img.decoding = 'async';

            picture.appendChild(img);

            return picture;
        }

        /**
     * Replace an existing img element with a responsive picture element
     * @param {HTMLImageElement} imgElement - The img element to replace
     * @returns {HTMLPictureElement} The new picture element
     */
        replaceWithResponsiveImage(imgElement) {
            const baseSrc = imgElement.dataset.src || imgElement.src;
            const alt = imgElement.alt || '';
            const className = imgElement.className || '';

            const picture = this.createResponsiveImageElement(
                baseSrc,
                alt,
                className
            );

            // Copy any data attributes
            Array.from(imgElement.attributes).forEach((attr) => {
                if (attr.name.startsWith('data-') && attr.name !== 'data-src') {
                    picture.querySelector('img').setAttribute(attr.name, attr.value);
                }
            });

            // Replace the original img element
            imgElement.parentNode.replaceChild(picture, imgElement);

            return picture;
        }

        createObserver() {
            this.observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            if (this.config.advanced) {
                                this.loadAdvancedItem(entry.target);
                            } else {
                                this.loadSimpleImage(entry.target);
                            }
                            this.observer.unobserve(entry.target);
                        }
                    });
                },
                {
                    rootMargin: this.config.rootMargin,
                    threshold: this.config.threshold
                }
            );
        }

        observeElements() {
            const selector = this.config.advanced
                ? this.config.advancedSelector
                : this.config.selector;
            const elements = document.querySelectorAll(selector);

            elements.forEach((element) => {
                this.observer.observe(element);
            });
        }

        // Simple image loading (from main.js)
        loadSimpleImage(img) {
            if (img.dataset.src) {
                const src = img.dataset.src;

                // Check if responsive images are enabled and replace if needed
                if (this.config.responsive && img.tagName === 'IMG') {
                    // Replace img with picture element for responsive images
                    const picture = this.replaceWithResponsiveImage(img);
                    const newImg = picture.querySelector('img');

                    // Continue with the new img element
                    this.loadResponsiveImage(newImg, picture, src);
                    return;
                }

                img.onload = () => {
                    // Success - remove from failed images if it was there
                    this.failedImages.delete(img);

                    img.classList.add(this.config.loadedClass);
                    // Add fade-in effect
                    img.style.transition = 'opacity 0.3s ease-in-out';
                    img.style.opacity = '1';
                };

                img.onerror = () => {
                    // Check if we already have retry info for this image
                    let retryInfo = this.failedImages.get(img);

                    if (!retryInfo) {
                        // First failure - initialize retry info
                        retryInfo = {
                            element: img,
                            src: src,
                            retryCount: 0
                        };
                        this.failedImages.set(img, retryInfo);
                    }

                    // Increment retry count
                    retryInfo.retryCount++;

                    // Check if we should retry automatically
                    if (retryInfo.retryCount <= this.config.maxRetries) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            `Image load failed, retrying (${retryInfo.retryCount}/${this.config.maxRetries}):`,
                            src
                        );

                        // Show loading state during retry
                        img.style.opacity = '0.5';
                        img.alt = `↻ Retrying... (${retryInfo.retryCount}/${this.config.maxRetries})`;

                        // Retry after a short delay with exponential backoff
                        const retryDelay = Math.min(
                            1000 * Math.pow(2, retryInfo.retryCount - 1),
                            5000
                        );
                        setTimeout(() => {
                            // Add cache buster to force reload
                            const cacheBuster = src.includes('?')
                                ? `&retry=${retryInfo.retryCount}&t=${Date.now()}`
                                : `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
                            img.src = src + cacheBuster;
                        }, retryDelay);
                    } else {
                        // Max retries exceeded - show error state
                        // eslint-disable-next-line no-console
                        console.error(
                            `Failed to load image after ${this.config.maxRetries} retries:`,
                            src
                        );

                        img.style.opacity = '1';
                        img.style.cursor = 'pointer';
                        img.title = 'Click to retry loading';
                        img.alt = '❌ Failed to load - Click to retry';

                        // Add click handler for manual retry
                        img.onclick = (e) => {
                            e.stopPropagation();
                            // Reset retry count for manual retry
                            retryInfo.retryCount = 0;
                            this.retrySimpleImage(img);
                        };
                    }
                };

                // Start loading
                img.src = src;
                img.style.opacity = '0';

                // Clean up data attribute
                delete img.dataset.src;
            }
        }

        /**
     * Load responsive image with WebP support
     * @param {HTMLImageElement} img - The img element inside the picture
     * @param {HTMLPictureElement} picture - The picture element
     * @param {string} originalSrc - Original source URL
     */
        loadResponsiveImage(img, picture, originalSrc) {
            const src = originalSrc || img.dataset.src || img.src;

            img.onload = () => {
                // Success - remove from failed images if it was there
                this.failedImages.delete(picture);

                img.classList.add(this.config.loadedClass);
                picture.classList.add(this.config.loadedClass);

                // Add fade-in effect
                img.style.transition = 'opacity 0.3s ease-in-out';
                img.style.opacity = '1';
            };

            img.onerror = () => {
                // Check if we already have retry info for this picture
                let retryInfo = this.failedImages.get(picture);

                if (!retryInfo) {
                    // First failure - initialize retry info
                    retryInfo = {
                        element: picture,
                        img: img,
                        src: src,
                        retryCount: 0
                    };
                    this.failedImages.set(picture, retryInfo);
                }

                // Increment retry count
                retryInfo.retryCount++;

                // Check if we should retry automatically
                if (retryInfo.retryCount <= this.config.maxRetries) {
                    // eslint-disable-next-line no-console
                    console.warn(
                        `Responsive image load failed, retrying (${retryInfo.retryCount}/${this.config.maxRetries}):`,
                        src
                    );

                    // Show loading state during retry
                    img.style.opacity = '0.5';
                    img.alt = `↻ Retrying... (${retryInfo.retryCount}/${this.config.maxRetries})`;

                    // Retry after a short delay with exponential backoff
                    const retryDelay = Math.min(
                        1000 * Math.pow(2, retryInfo.retryCount - 1),
                        5000
                    );
                    setTimeout(() => {
                        // Add cache buster to all sources
                        const cacheBuster = src.includes('?')
                            ? `&retry=${retryInfo.retryCount}&t=${Date.now()}`
                            : `?retry=${retryInfo.retryCount}&t=${Date.now()}`;

                        // Update all source elements
                        const sources = picture.querySelectorAll('source');
                        sources.forEach((source) => {
                            if (source.srcset) {
                                source.srcset = source.srcset
                                    .split(',')
                                    .map((srcItem) => {
                                        const [url, descriptor] = srcItem.trim().split(' ');
                                        return `${url}${cacheBuster} ${descriptor || ''}`.trim();
                                    })
                                    .join(', ');
                            }
                        });

                        // Update img src
                        img.src = src + cacheBuster;
                    }, retryDelay);
                } else {
                    // Max retries exceeded - show error state
                    // eslint-disable-next-line no-console
                    console.error(
                        `Failed to load responsive image after ${this.config.maxRetries} retries:`,
                        src
                    );

                    img.style.opacity = '1';
                    img.style.cursor = 'pointer';
                    img.title = 'Click to retry loading';
                    img.alt = '❌ Failed to load - Click to retry';

                    // Add click handler for manual retry
                    img.onclick = (e) => {
                        e.stopPropagation();
                        // Reset retry count for manual retry
                        retryInfo.retryCount = 0;
                        this.retryResponsiveImage(picture);
                    };
                }
            };

            // Clean up data attribute if it exists
            if (img.dataset.src) {
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
                        // Check if we already have retry info for this item
                        let retryInfo = this.failedImages.get(item);

                        if (!retryInfo) {
                            // First failure - initialize retry info
                            retryInfo = {
                                element: item,
                                src: src,
                                retryCount: 0
                            };
                            this.failedImages.set(item, retryInfo);
                        }

                        // Increment retry count
                        retryInfo.retryCount++;

                        // Check if we should retry automatically
                        if (retryInfo.retryCount <= this.config.maxRetries) {
                            // eslint-disable-next-line no-console
                            console.warn(
                                `Image load failed, retrying (${retryInfo.retryCount}/${this.config.maxRetries}):`,
                                src
                            );

                            // Show loading state during retry
                            if (spinner) {
                                spinner.textContent = '↻';
                                spinner.style.display = 'block';
                                spinner.title = `Retrying... (${retryInfo.retryCount}/${this.config.maxRetries})`;
                            }

                            // Retry after a short delay with exponential backoff
                            const retryDelay = Math.min(
                                1000 * Math.pow(2, retryInfo.retryCount - 1),
                                5000
                            );
                            setTimeout(() => {
                                // Add cache buster to force reload
                                const cacheBuster = src.includes('?')
                                    ? `&retry=${retryInfo.retryCount}&t=${Date.now()}`
                                    : `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
                                lazyImage.src = src + cacheBuster;
                            }, retryDelay);
                        } else {
                            // Max retries exceeded - show error state
                            // eslint-disable-next-line no-console
                            console.error(
                                `Failed to load image after ${this.config.maxRetries} retries:`,
                                src
                            );

                            if (spinner) {
                                spinner.textContent = '❌';
                                spinner.style.display = 'block';
                                spinner.style.cursor = 'pointer';
                                spinner.title = 'Click to retry loading';

                                // Add click handler for manual retry
                                spinner.onclick = (e) => {
                                    e.stopPropagation();
                                    // Reset retry count for manual retry
                                    retryInfo.retryCount = 0;
                                    this.retryFailedImage(item);
                                };
                            }
                            if (placeholder) {
                                placeholder.style.display = 'block'; // Keep placeholder visible on error
                            }
                        }
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
                items.forEach((item) => this.loadAdvancedItem(item));
            } else {
                const images = document.querySelectorAll(this.config.selector);
                images.forEach((img) => this.loadSimpleImage(img));
            }
        }

        // Method to observe new elements (useful for dynamic content)
        observeNewElements(elements) {
            if (!this.observer) {
                return;
            }

            if (elements) {
                // Observe specific elements
                elements.forEach((element) => {
                    this.observer.observe(element);
                });
            } else {
                // Re-scan and observe all matching elements
                this.observeElements();
            }
        }

        // Method to load all remaining elements immediately
        loadAll() {
            const selector = this.config.advanced
                ? this.config.advancedSelector
                : this.config.selector;
            const elements = document.querySelectorAll(selector);

            elements.forEach((element) => {
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
                responsive: false,
                selector: options.selector || 'img[data-src]'
            });
        }

        static createAdvanced(options = {}) {
            return new LazyLoader({
                ...options,
                advanced: true,
                responsive: false,
                advancedSelector: options.selector || '.lazy-item[data-loaded="false"]',
                rootMargin: options.rootMargin || '100px 0px'
            });
        }

        static createResponsive(options = {}) {
            return new LazyLoader({
                ...options,
                advanced: false,
                responsive: true,
                selector: options.selector || 'img[data-src]',
                widths: options.widths || [400, 800, 1200],
                sizes:
          options.sizes ||
          '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px',
                webpSupport: options.webpSupport !== false
            });
        }

        static createAdvancedResponsive(options = {}) {
            return new LazyLoader({
                ...options,
                advanced: true,
                responsive: true,
                advancedSelector: options.selector || '.lazy-item[data-loaded="false"]',
                rootMargin: options.rootMargin || '100px 0px',
                widths: options.widths || [400, 800, 1200],
                sizes:
          options.sizes ||
          '(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px',
                webpSupport: options.webpSupport !== false
            });
        }

        // Method to update configuration and reinitialize
        updateConfig(newConfig) {
            this.destroy();
            this.config = { ...this.config, ...newConfig };
            this.init();
        }

        // Retry a responsive image
        retryResponsiveImage(picture) {
            const retryInfo = this.failedImages.get(picture);
            if (!retryInfo) {
                return;
            }

            const { src, retryCount, img } = retryInfo;

            // Check if we've exceeded max retries
            if (retryCount >= this.config.maxRetries) {
                // eslint-disable-next-line no-console
                console.warn('Max retries exceeded for responsive image:', src);
                return;
            }

            if (img) {
                // Update retry count
                retryInfo.retryCount++;
                this.failedImages.set(picture, retryInfo);

                // Reset state
                img.style.cursor = 'wait';
                img.alt = 'Loading...';
                img.title = 'Loading...';
                img.onclick = null;

                // Create new image element to test loading
                const testImage = new Image();

                testImage.onload = () => {
                    // Success - remove from failed images
                    this.failedImages.delete(picture);

                    // Update all sources with cache buster
                    const cacheBuster = `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
                    const sources = picture.querySelectorAll('source');
                    sources.forEach((source) => {
                        if (source.srcset) {
                            source.srcset = source.srcset
                                .split(',')
                                .map((srcItem) => {
                                    const [url, descriptor] = srcItem.trim().split(' ');
                                    const cleanUrl = url.split('?')[0]; // Remove existing params
                                    return `${cleanUrl}${cacheBuster} ${descriptor || ''}`.trim();
                                })
                                .join(', ');
                        }
                    });

                    // Update img src
                    const cleanSrc = src.split('?')[0];
                    img.src = cleanSrc + cacheBuster;
                    img.style.cursor = 'default';
                    img.alt = '';
                    img.title = '';

                    // Add loaded classes
                    img.classList.add(this.config.loadedClass);
                    picture.classList.add(this.config.loadedClass);
                };

                testImage.onerror = () => {
                    // Failed again
                    img.style.cursor = 'pointer';
                    img.alt = '❌ Failed to load - Click to retry';
                    img.title = `Click to retry loading (${retryInfo.retryCount}/${this.config.maxRetries} attempts)`;

                    // Re-add click handler
                    img.onclick = (e) => {
                        e.stopPropagation();
                        this.retryResponsiveImage(picture);
                    };

                    // eslint-disable-next-line no-console
                    console.warn(
                        `Retry ${retryInfo.retryCount} failed for responsive image:`,
                        src
                    );
                };

                // Test loading with cache-busting parameter
                testImage.src = src + `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
            }
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
                // eslint-disable-next-line no-console
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

                    // eslint-disable-next-line no-console
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
                // eslint-disable-next-line no-console
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

                // eslint-disable-next-line no-console
                console.warn(`Retry ${retryInfo.retryCount} failed for image:`, src);
            };

            // Attempt to load with cache-busting parameter
            newImage.src = src + `?retry=${retryInfo.retryCount}&t=${Date.now()}`;
        }

        // Retry all failed images
        retryAllFailedImages() {
            const failedItems = Array.from(this.failedImages.keys());
            // eslint-disable-next-line no-console
            console.log(`Retrying ${failedItems.length} failed images...`);

            failedItems.forEach((item) => {
                // Check if it's a simple image, responsive picture, or advanced item
                if (item.tagName === 'IMG') {
                    this.retrySimpleImage(item);
                } else if (item.tagName === 'PICTURE') {
                    this.retryResponsiveImage(item);
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
