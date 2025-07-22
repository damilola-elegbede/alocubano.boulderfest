/**
 * Progressive Image Loader for A Lo Cubano Boulder Fest Gallery
 * Implements progressive loading with blur-up technique and skeleton screens
 * 
 * Features:
 * - Color placeholder extraction
 * - Blur-up thumbnail loading
 * - Smooth transitions
 * - Skeleton screen animation
 */

class ProgressiveImageLoader {
    constructor() {
        this.loadingImages = new Map();
        this.canvas = this.createOffscreenCanvas();
        this.ctx = this.canvas.getContext('2d');
        
        this.setupIntersectionObserver();
        console.log('[Progressive] Image loader initialized');
    }
    
    createOffscreenCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        return canvas;
    }
    
    setupIntersectionObserver() {
        this.imageObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.loadProgressiveImage(entry.target);
                        this.imageObserver.unobserve(entry.target);
                    }
                });
            },
            {
                rootMargin: '200px 0px', // Load 200px before visible
                threshold: 0.1
            }
        );
    }
    
    observeImage(imageElement) {
        if (imageElement.dataset.progressive === 'true') {
            this.imageObserver.observe(imageElement);
        }
    }
    
    async loadProgressiveImage(imageElement) {
        const imageId = imageElement.dataset.imageId || Math.random().toString(36);
        
        if (this.loadingImages.has(imageId)) {
            return this.loadingImages.get(imageId);
        }
        
        const loadingPromise = this.performProgressiveLoad(imageElement);
        this.loadingImages.set(imageId, loadingPromise);
        
        try {
            await loadingPromise;
        } catch (error) {
            console.error('[Progressive] Failed to load image:', error);
        } finally {
            this.loadingImages.delete(imageId);
        }
    }
    
    async performProgressiveLoad(imageElement) {
        const metadata = this.extractImageMetadata(imageElement);
        
        // Step 1: Show skeleton with dominant color
        this.showSkeletonPlaceholder(imageElement, metadata);
        
        // Step 2: Load and show blur-up thumbnail (if available)
        if (metadata.thumbnailUrl) {
            await this.loadBlurredThumbnail(imageElement, metadata);
        }
        
        // Step 3: Load full resolution image
        await this.loadFullImage(imageElement, metadata);
    }
    
    extractImageMetadata(imageElement) {
        return {
            fullUrl: imageElement.dataset.src || imageElement.src,
            thumbnailUrl: imageElement.dataset.thumbnail,
            dominantColor: imageElement.dataset.dominantColor || '#f0f0f0',
            width: imageElement.dataset.width || imageElement.width || 400,
            height: imageElement.dataset.height || imageElement.height || 300,
            alt: imageElement.alt || 'Festival image'
        };
    }
    
    showSkeletonPlaceholder(imageElement, metadata) {
        // Create skeleton container if it doesn't exist
        let skeleton = imageElement.nextElementSibling;
        if (!skeleton || !skeleton.classList.contains('image-skeleton')) {
            skeleton = this.createSkeletonElement(metadata);
            imageElement.parentNode.insertBefore(skeleton, imageElement.nextSibling);
        }
        
        // Set dominant color background
        skeleton.style.backgroundColor = metadata.dominantColor;
        skeleton.style.display = 'block';
        
        // Hide original image initially
        imageElement.style.opacity = '0';
        imageElement.style.transition = 'opacity 0.3s ease-in-out';
    }
    
    createSkeletonElement(metadata) {
        const skeleton = document.createElement('div');
        skeleton.className = 'image-skeleton';
        skeleton.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, 
                ${metadata.dominantColor} 25%, 
                rgba(255,255,255,0.5) 50%, 
                ${metadata.dominantColor} 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: inherit;
            z-index: 1;
        `;
        
        return skeleton;
    }
    
    async loadBlurredThumbnail(imageElement, metadata) {
        try {
            const thumbnailImg = new Image();
            thumbnailImg.crossOrigin = 'anonymous';
            
            const thumbnailLoaded = new Promise((resolve, reject) => {
                thumbnailImg.onload = resolve;
                thumbnailImg.onerror = reject;
                thumbnailImg.src = metadata.thumbnailUrl;
            });
            
            await thumbnailLoaded;
            
            // Create blurred version
            const blurredDataUrl = this.createBlurredVersion(thumbnailImg);
            
            // Show blurred thumbnail
            this.showBlurredPreview(imageElement, blurredDataUrl);
            
        } catch (error) {
            console.warn('[Progressive] Failed to load thumbnail:', error);
        }
    }
    
    createBlurredVersion(image) {
        // Scale down for blur effect
        const scale = 0.1;
        this.canvas.width = image.width * scale;
        this.canvas.height = image.height * scale;
        
        // Draw scaled down image
        this.ctx.filter = 'blur(2px)';
        this.ctx.drawImage(image, 0, 0, this.canvas.width, this.canvas.height);
        
        return this.canvas.toDataURL('image/jpeg', 0.5);
    }
    
    showBlurredPreview(imageElement, blurredDataUrl) {
        // Create or update blur overlay
        let blurOverlay = imageElement.parentNode.querySelector('.blur-overlay');
        if (!blurOverlay) {
            blurOverlay = document.createElement('div');
            blurOverlay.className = 'blur-overlay';
            blurOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-size: cover;
                background-position: center;
                filter: blur(8px);
                transform: scale(1.1);
                z-index: 2;
                transition: opacity 0.3s ease-in-out;
            `;
            imageElement.parentNode.appendChild(blurOverlay);
        }
        
        blurOverlay.style.backgroundImage = `url(${blurredDataUrl})`;
        blurOverlay.style.opacity = '1';
        
        // Hide skeleton
        const skeleton = imageElement.parentNode.querySelector('.image-skeleton');
        if (skeleton) {
            skeleton.style.opacity = '0';
        }
    }
    
    async loadFullImage(imageElement, metadata) {
        try {
            const fullImg = new Image();
            fullImg.crossOrigin = 'anonymous';
            
            const fullImageLoaded = new Promise((resolve, reject) => {
                fullImg.onload = resolve;
                fullImg.onerror = reject;
                fullImg.src = metadata.fullUrl;
            });
            
            await fullImageLoaded;
            
            // Transition to full image
            this.transitionToFullImage(imageElement, fullImg);
            
        } catch (error) {
            console.error('[Progressive] Failed to load full image:', error);
            this.handleImageLoadError(imageElement, metadata);
        }
    }
    
    transitionToFullImage(imageElement, fullImg) {
        // Set the full image source
        imageElement.src = fullImg.src;
        imageElement.style.opacity = '1';
        
        // Fade out overlays
        const blurOverlay = imageElement.parentNode.querySelector('.blur-overlay');
        const skeleton = imageElement.parentNode.querySelector('.image-skeleton');
        
        if (blurOverlay) {
            blurOverlay.style.opacity = '0';
            setTimeout(() => blurOverlay.remove(), 300);
        }
        
        if (skeleton) {
            skeleton.style.opacity = '0';
            setTimeout(() => skeleton.remove(), 300);
        }
        
        // Mark as loaded
        imageElement.classList.add('progressive-loaded');
        imageElement.dataset.progressive = 'loaded';
        
        // Dispatch custom event
        imageElement.dispatchEvent(new CustomEvent('progressiveload', {
            detail: { url: fullImg.src }
        }));
    }
    
    handleImageLoadError(imageElement, metadata) {
        // Show error placeholder
        const errorPlaceholder = this.createErrorPlaceholder(metadata);
        imageElement.src = errorPlaceholder;
        imageElement.style.opacity = '1';
        
        // Clean up overlays
        const blurOverlay = imageElement.parentNode.querySelector('.blur-overlay');
        const skeleton = imageElement.parentNode.querySelector('.image-skeleton');
        
        if (blurOverlay) blurOverlay.remove();
        if (skeleton) skeleton.remove();
        
        imageElement.classList.add('progressive-error');
    }
    
    createErrorPlaceholder(metadata) {
        const errorSvg = `
            <svg width="${metadata.width}" height="${metadata.height}" xmlns="http://www.w3.org/2000/svg">
                <rect width="100%" height="100%" fill="#f8f9fa"/>
                <text x="50%" y="50%" text-anchor="middle" dy="0.3em" 
                      fill="#6c757d" font-family="Arial, sans-serif" font-size="14">
                    Image unavailable
                </text>
            </svg>
        `;
        
        return 'data:image/svg+xml;base64,' + btoa(errorSvg);
    }
    
    // Utility method to extract dominant color from image
    async extractDominantColor(imageUrl) {
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            
            const imageLoaded = new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });
            
            await imageLoaded;
            
            // Scale down for color analysis
            this.canvas.width = 50;
            this.canvas.height = 50;
            this.ctx.drawImage(img, 0, 0, 50, 50);
            
            const imageData = this.ctx.getImageData(0, 0, 50, 50);
            const rgb = this.calculateAverageColor(imageData.data);
            
            return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            
        } catch (error) {
            console.warn('[Progressive] Failed to extract dominant color:', error);
            return '#f0f0f0';
        }
    }
    
    calculateAverageColor(data) {
        let r = 0, g = 0, b = 0;
        const pixelCount = data.length / 4;
        
        for (let i = 0; i < data.length; i += 4) {
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
        }
        
        return {
            r: Math.round(r / pixelCount),
            g: Math.round(g / pixelCount),
            b: Math.round(b / pixelCount)
        };
    }
    
    // Public API methods
    preloadImages(imageElements) {
        imageElements.forEach(img => {
            if (img.dataset.src && !img.classList.contains('progressive-loaded')) {
                this.observeImage(img);
            }
        });
    }
    
    forceLoadImage(imageElement) {
        this.imageObserver.unobserve(imageElement);
        return this.loadProgressiveImage(imageElement);
    }
    
    getLoadingStats() {
        return {
            loadingCount: this.loadingImages.size,
            observedCount: this.imageObserver.takeRecords().length
        };
    }
    
    destroy() {
        this.imageObserver.disconnect();
        this.loadingImages.clear();
    }
}

// Add CSS for skeleton animation if not already present
if (!document.querySelector('#progressive-loader-styles')) {
    const styles = document.createElement('style');
    styles.id = 'progressive-loader-styles';
    styles.textContent = `
        @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
        }
        
        .gallery-image-container {
            position: relative;
            overflow: hidden;
        }
        
        .image-skeleton {
            pointer-events: none;
        }
        
        .blur-overlay {
            pointer-events: none;
        }
        
        .progressive-loaded {
            transition: opacity 0.3s ease-in-out;
        }
        
        .progressive-error {
            opacity: 0.7;
        }
    `;
    document.head.appendChild(styles);
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProgressiveImageLoader;
}