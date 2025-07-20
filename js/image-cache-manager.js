// Image Cache Manager - Session-scoped caching (Simplified v2)
console.log('📦 ImageCacheManager v2 loading...');

class ImageCacheManager {
    constructor() {
        this.cacheKey = 'alocubano_image_cache_v2';
        this.defaultImageUrl = '/images/hero-default.jpg';
        this.pageMapping = {
            'home.html': 'home', 'about.html': 'about', 'artists.html': 'artists',
            'schedule.html': 'schedule', 'gallery.html': 'gallery', 'tickets.html': 'tickets',
            'donations.html': 'donations'
        };
        this.sessionAssignments = null;
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
            // For test data, use the URL directly; in production this would use Vercel optimization
            const url = assignedImage.thumbnailUrl || assignedImage.viewUrl || `/api/image-proxy/${assignedImage.id}`;
            return { id: assignedImage.id, url: url };
        }

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