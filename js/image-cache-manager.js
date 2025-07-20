// Image Cache Manager - Session-scoped caching (Simplified v2)
console.log('📦 ImageCacheManager v2 loading...');

class ImageCacheManager {
    constructor() {
        this.cacheKey = 'alocubano_image_cache_v2';
        this.imageCacheKey = 'alocubano_image_data_cache';
        this.defaultImageUrl = '/images/hero-default.jpg';
        this.pageMapping = {
            'home.html': 'home', 'about.html': 'about', 'artists.html': 'artists',
            'schedule.html': 'schedule', 'gallery.html': 'gallery', 'tickets.html': 'tickets',
            'donations.html': 'donations'
        };
        this.sessionAssignments = null;
        this.imageDataCache = this.loadImageDataCache();
        this.lastApiCall = 0;
        this.minApiInterval = 2000; // Minimum 2 seconds between API calls
    }
    
    loadImageDataCache() {
        try {
            const cached = localStorage.getItem(this.imageCacheKey);
            return cached ? JSON.parse(cached) : {};
        } catch (error) {
            console.warn('Failed to load image data cache:', error);
            return {};
        }
    }
    
    saveImageDataCache() {
        try {
            localStorage.setItem(this.imageCacheKey, JSON.stringify(this.imageDataCache));
        } catch (error) {
            console.warn('Failed to save image data cache:', error);
        }
    }
    
    isImageCached(fileId) {
        const cached = this.imageDataCache[fileId];
        if (!cached) return false;
        
        // Check if cache is less than 24 hours old
        const now = Date.now();
        const cacheAge = now - (cached.timestamp || 0);
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        return cacheAge < maxAge;
    }
    
    async rateLimitedApiCall(fileId) {
        const now = Date.now();
        const timeSinceLastCall = now - this.lastApiCall;
        
        if (timeSinceLastCall < this.minApiInterval) {
            const waitTime = this.minApiInterval - timeSinceLastCall;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms before API call`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastApiCall = Date.now();
        return `/api/image-proxy/${fileId}?size=medium&quality=85&cache=24h`;
    }

    getCurrentPageId() {
        const pathname = window.location.pathname;
        const filename = pathname.split('/').pop() || 'home.html';
        return this.pageMapping[filename] || 'default';
    }

    // This is the main public method. It's now asynchronous.
    async getImageForPage() {
        const pageId = this.getCurrentPageId();

        // 1. Check if assignments are already made for this session
        if (!this.sessionAssignments) {
            try {
                // 2. Check sessionStorage first
                const cachedAssignments = sessionStorage.getItem(this.cacheKey);
                if (cachedAssignments) {
                    this.sessionAssignments = JSON.parse(cachedAssignments);
                    console.log('📦 Using cached session assignments');
                } else {
                    // 3. If no session cache, fetch static JSON and create assignments
                    console.log('No session cache. Fetching static featured photos list...');
                    const response = await fetch('/featured-photos.json');
                    if (!response.ok) throw new Error('Failed to load featured-photos.json');
                    const data = await response.json();
                    
                    if (!data.items || data.items.length === 0) {
                        throw new Error('No images found in featured photos');
                    }
                    
                    this.sessionAssignments = this.createRandomAssignments(data.items);
                    sessionStorage.setItem(this.cacheKey, JSON.stringify(this.sessionAssignments));
                    console.log('Created and cached new session assignments.');
                }
            } catch (error) {
                console.error('Failed to get hero image assignments:', error);
                return { id: null, url: this.defaultImageUrl }; // Fallback to default
            }
        }

        // 4. Return the assigned image ID for the current page
        const assignedImage = this.sessionAssignments[pageId];
        if (assignedImage) {
            const fileId = assignedImage.id;
            
            // Check if image data is already cached locally
            if (this.isImageCached(fileId)) {
                const cachedData = this.imageDataCache[fileId];
                console.log(`📦 Using cached image for ${pageId}:`, assignedImage.name);
                return { 
                    id: fileId, 
                    url: cachedData.url, 
                    name: assignedImage.name,
                    cached: true 
                };
            }
            
            // If not cached, prepare API call with rate limiting
            console.log(`🔄 Image not cached for ${pageId}, will make API call:`, assignedImage.name);
            const url = await this.rateLimitedApiCall(fileId);
            
            // Cache the URL for future use
            this.imageDataCache[fileId] = {
                url: url,
                name: assignedImage.name,
                timestamp: Date.now()
            };
            this.saveImageDataCache();
            
            console.log(`🖼️ New image assigned for ${pageId}:`, assignedImage.name);
            return { id: fileId, url: url, name: assignedImage.name, cached: false };
        }

        console.log(`📷 No assigned image for ${pageId}, using default`);
        return { id: null, url: this.defaultImageUrl }; // Fallback
    }

    createRandomAssignments(imagePool) {
        const assignments = {};
        const pages = Object.values(this.pageMapping);
        const shuffledImages = [...imagePool].sort(() => Math.random() - 0.5);
        
        pages.forEach((pageId, index) => {
            if (shuffledImages.length > 0) {
                assignments[pageId] = shuffledImages[index % shuffledImages.length];
            }
        });
        return assignments;
    }
}

// Create global instance
window.ImageCacheManager = new ImageCacheManager();