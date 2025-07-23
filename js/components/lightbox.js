/**
 * Unified Lightbox Component
 * Consolidated from main.js and gallery-detail.js implementations
 * Supports both simple image galleries and advanced categorized galleries
 */

if (typeof Lightbox === 'undefined') {
    class Lightbox {
        constructor(options = {}) {
            this.currentIndex = 0;
            this.images = [];
            this.items = []; // For advanced mode with metadata
            this.categories = []; // For categorized galleries
            this.categoryCounts = {};
            this.lightboxId = options.lightboxId || 'unified-lightbox';
            this.showCaption = options.showCaption || false;
            this.showCounter = options.showCounter !== undefined ? options.showCounter : true;
            this.advanced = options.advanced || false; // Enable advanced features

            this.init();
        }

        init() {
            this.createLightboxHTML();
            this.bindGlobalEvents();
        }

        createLightboxHTML() {
            // Create lightbox HTML if it doesn't exist
            if (!document.getElementById(this.lightboxId)) {
                const lightboxHTML = `
          <div id="${this.lightboxId}" class="lightbox gallery-lightbox" style="display: none;">
            <div class="lightbox-content">
              <button class="lightbox-close" aria-label="Close">&times;</button>
              <button class="lightbox-prev" aria-label="Previous">‹</button>
              <button class="lightbox-next" aria-label="Next">›</button>
              <div class="lightbox-media-container">
                <img class="lightbox-image" src="" alt="">
              </div>
              <div class="lightbox-caption">
                <h3 class="lightbox-title font-display"></h3>
                <p class="lightbox-counter font-mono"></p>
              </div>
            </div>
          </div>
        `;

                document.body.insertAdjacentHTML('beforeend', lightboxHTML);

                // Add event listeners
                const lightbox = document.getElementById(this.lightboxId);
                const closeBtn = lightbox.querySelector('.lightbox-close');
                const prevBtn = lightbox.querySelector('.lightbox-prev');
                const nextBtn = lightbox.querySelector('.lightbox-next');

                closeBtn.addEventListener('click', () => this.close());
                prevBtn.addEventListener('click', () => this.previous());
                nextBtn.addEventListener('click', () => this.next());

                // Close on background click (improved to handle nested elements)
                lightbox.addEventListener('click', (e) => {
                    // Close if clicking on lightbox background or lightbox-content (but not on image or controls)
                    if (e.target === lightbox ||
                        (e.target.classList.contains('lightbox-content') && !e.target.closest('.lightbox-media-container'))) {
                        this.close();
                    }
                });

                // Additional click handler for lightbox-content to ensure overlay clicks work
                const lightboxContent = lightbox.querySelector('.lightbox-content');
                lightboxContent.addEventListener('click', (e) => {
                    // Close if clicking directly on the content area (not on image or buttons)
                    if (e.target === lightboxContent) {
                        this.close();
                    }
                });
            }
        }

        bindGlobalEvents() {
            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                const lightbox = document.getElementById(this.lightboxId);
                if (!lightbox || (!lightbox.classList.contains('is-open') && !lightbox.classList.contains('active'))) {
                    return;
                }

                // Prevent default behavior for arrow keys when lightbox is open
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Escape') {
                    e.preventDefault();
                }

                switch (e.key) {
                case 'Escape':
                    this.close();
                    break;
                case 'ArrowLeft':
                case 'Left': // Fallback for older browsers
                    this.previous();
                    break;
                case 'ArrowRight':
                case 'Right': // Fallback for older browsers
                    this.next();
                    break;
                }
            });
        }

        // Initialize simple gallery mode (from main.js)
        initSimpleGallery(selector = '.gallery-image') {
            const galleryImages = document.querySelectorAll(selector);
            this.images = [];

            galleryImages.forEach((img, index) => {
                this.images.push(img.src);
                img.addEventListener('click', () => {
                    this.openSimple(index);
                });
            });
        }

        // Simple mode opening (from main.js)
        openSimple(index) {
            this.currentIndex = index;
            this.advanced = false;

            const lightbox = document.getElementById(this.lightboxId);
            if (!lightbox) {
                // Lightbox element not found - handled gracefully
                return;
            }

            // Update content for simple mode
            const img = lightbox.querySelector('.lightbox-image');
            const title = lightbox.querySelector('.lightbox-title');
            const counter = lightbox.querySelector('.lightbox-counter');

            img.src = this.images[index];
            img.alt = 'Gallery image';

            // Add error handling
            img.onerror = () => {
                img.alt = 'Image failed to load';
                // Try to show a placeholder or retry indicator
                const retryBtn = document.createElement('button');
                retryBtn.textContent = 'Retry';
                retryBtn.className = 'lightbox-retry-btn';
                retryBtn.onclick = () => {
                    img.src = this.images[index] + '?t=' + Date.now();
                };
                img.parentElement.appendChild(retryBtn);
            };

            // Hide caption elements for simple mode
            if (!this.showCaption) {
                title.style.display = 'none';
            }

            if (this.showCounter) {
                counter.textContent = `${index + 1} / ${this.images.length}`;
            } else {
                counter.style.display = 'none';
            }

            this.show();
        }

        // Advanced mode opening (from gallery-detail.js)
        openAdvanced(items, index, categories = [], categoryCounts = {}) {
            this.items = items;
            this.categories = categories;
            this.categoryCounts = categoryCounts;
            this.currentIndex = index;
            this.advanced = true;

            const lightbox = document.getElementById(this.lightboxId);
            if (!lightbox) {
                // Lightbox element not found - handled gracefully
                return;
            }

            this.updateAdvancedContent();
            this.show();
        }

        show() {
            const lightbox = document.getElementById(this.lightboxId);
            if (!lightbox) {
                return;
            }

            // Remove inline display style to let CSS handle it
            lightbox.style.display = '';
            // Add the class which sets display: flex in CSS
            lightbox.classList.add('is-open', 'active');
            document.body.style.overflow = 'hidden';

            // Update navigation buttons
            this.updateNavigationButtons();
        }

        close() {
            const lightbox = document.getElementById(this.lightboxId);
            if (!lightbox) {
                return;
            }

            lightbox.classList.remove('is-open', 'active');

            // Ensure lightbox is properly hidden
            // The CSS should handle this, but we set it explicitly for safety
            setTimeout(() => {
                if (!lightbox.classList.contains('is-open')) {
                    lightbox.style.display = 'none';
                }
                document.body.style.overflow = '';
            }, 300);
        }

        previous() {
            if (this.advanced) {
                const newIndex = this.currentIndex - 1;
                if (newIndex >= 0) {
                    this.currentIndex = newIndex;
                    this.updateAdvancedContent();
                }
            } else {
                this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
                this.updateSimpleContent();
            }
            this.updateNavigationButtons();
        }

        next() {
            if (this.advanced) {
                const newIndex = this.currentIndex + 1;
                if (newIndex < this.items.length) {
                    this.currentIndex = newIndex;
                    this.updateAdvancedContent();
                }
            } else {
                this.currentIndex = (this.currentIndex + 1) % this.images.length;
                this.updateSimpleContent();
            }
            this.updateNavigationButtons();
        }

        updateSimpleContent() {
            const lightbox = document.getElementById(this.lightboxId);
            const img = lightbox.querySelector('.lightbox-image');
            const counter = lightbox.querySelector('.lightbox-counter');

            img.style.opacity = '0';
            setTimeout(() => {
                img.src = this.images[this.currentIndex];
                img.style.opacity = '1';

                if (this.showCounter) {
                    counter.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
                }
            }, 200);
        }

        updateAdvancedContent() {
            const item = this.items[this.currentIndex];
            const category = this.categories[this.currentIndex];
            const lightbox = document.getElementById(this.lightboxId);

            const img = lightbox.querySelector('.lightbox-image');
            const title = lightbox.querySelector('.lightbox-title');
            const counter = lightbox.querySelector('.lightbox-counter');

            // Update image - check if the original gallery item has an updated src
            const galleryItem = document.querySelector(`[data-index="${this.currentIndex}"] .lazy-image`);
            let imageSrc = item.viewUrl || item.src;

            // If the gallery item has a successfully loaded image, use that src
            if (galleryItem?.src && !galleryItem.src.includes('data:image')) {
                imageSrc = galleryItem.src;
                // console.log('🔄 Using updated image source from gallery:', imageSrc);
            }
            img.style.display = 'block';
            img.src = imageSrc;
            img.alt = item.name || item.alt || 'Gallery image';

            // Add error handling
            img.onerror = () => {
                img.alt = 'Image failed to load';
                // Try to show a placeholder or retry indicator
                const existingBtn = img.parentElement.querySelector('.lightbox-retry-btn');
                if (existingBtn) {
                    existingBtn.remove();
                }

                const retryBtn = document.createElement('button');
                retryBtn.textContent = 'Retry';
                retryBtn.className = 'lightbox-retry-btn';
                retryBtn.onclick = () => {
                    img.src = imageSrc + (imageSrc.includes('?') ? '&' : '?') + 't=' + Date.now();
                };
                img.parentElement.appendChild(retryBtn);
            };

            // Use stored categoryIndex if available, otherwise calculate it
            let categoryIndex;
            if (item.categoryIndex !== undefined) {
                categoryIndex = item.categoryIndex;
            } else {
                // Fallback: calculate position within category
                categoryIndex = 0;
                for (let i = 0; i < this.currentIndex; i++) {
                    if (this.categories[i] === category) {
                        categoryIndex++;
                    }
                }
            }

            // Update caption
            if (this.showCaption && item.name) {
                title.textContent = item.name;
                title.style.display = 'block';
            } else {
                title.style.display = 'none';
            }

            if (this.showCounter) {
                const categoryCount = this.categoryCounts[category] || this.items.length;
                const categoryLabel = category && typeof category === 'string' ?
                    category.charAt(0).toUpperCase() + category.slice(1) :
                    'Gallery';
                counter.textContent = `${categoryLabel}: ${categoryIndex + 1} / ${categoryCount}`;
            }
        }

        updateNavigationButtons() {
            const lightbox = document.getElementById(this.lightboxId);
            const prevBtn = lightbox.querySelector('.lightbox-prev');
            const nextBtn = lightbox.querySelector('.lightbox-next');

            if (this.advanced) {
                prevBtn.style.display = this.currentIndex > 0 ? 'block' : 'none';
                nextBtn.style.display = this.currentIndex < this.items.length - 1 ? 'block' : 'none';
            } else {
                // Simple mode shows navigation for circular browsing
                prevBtn.style.display = 'block';
                nextBtn.style.display = 'block';
            }
        }

        // Utility method to initialize based on gallery type
        static initializeFor(galleryType, options = {}) {
            const lightbox = new Lightbox(options);

            if (galleryType === 'simple') {
                lightbox.initSimpleGallery(options.selector);
            }

            return lightbox;
        }
    }

    // Export for use in other modules
    window.Lightbox = Lightbox;
}