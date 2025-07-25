/**
 * Advanced Cache Warmer for A Lo Cubano Boulder Fest Gallery
 * Phase 2: Intelligent Cache Warming with Connection-Aware Strategies
 * 
 * Features:
 * - Connection-aware warming strategies (minimal/conservative/aggressive)
 * - Progressive warming phases (Critical → Essential → Predictive)
 * - Analytics tracking and bandwidth monitoring
 * - Resource prioritization and intelligent batching
 * - Service worker integration for persistent caching
 * - Performance monitoring and strategy optimization
 */

class AdvancedCacheWarmer {
    constructor() {
        this.warmingQueue = new Map(); // URL -> priority
        this.warmingInProgress = new Set();
        this.completedUrls = new Set();
        
        // Connection and device detection
        this.connectionInfo = this.detectConnectionCapabilities();
        this.strategy = this.determineStrategy();
        
        // Analytics tracking
        this.analytics = {
            warmed: 0,
            failed: 0,
            bandwidthUsed: 0,
            timeSpent: 0,
            strategySwitches: 0,
            phaseCompletions: {
                critical: false,
                essential: false,
                predictive: false
            }
        };
        
        // Resource categorization
        this.resources = this.categorizeResources();
        
        // Warming state
        this.currentPhase = 'idle';
        this.isWarming = false;
        
        console.log('[AdvancedCacheWarmer] Initialized with strategy:', this.strategy);
        console.log('[AdvancedCacheWarmer] Connection info:', this.connectionInfo);
        
        // Listen for connection changes
        this.setupConnectionMonitoring();
        
        // Setup service worker messaging
        this.setupServiceWorkerMessaging();
    }
    
    detectConnectionCapabilities() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        let effectiveType = 'unknown';
        let downlink = null;
        let rtt = null;
        let saveData = false;
        
        if (connection) {
            effectiveType = connection.effectiveType || 'unknown';
            downlink = connection.downlink;
            rtt = connection.rtt;
            saveData = connection.saveData;
        }
        
        // Detect device capabilities
        const deviceMemory = navigator.deviceMemory || 4; // Default to 4GB
        const hardwareConcurrency = navigator.hardwareConcurrency || 4;
        
        return {
            effectiveType,
            downlink,
            rtt,
            saveData,
            deviceMemory,
            hardwareConcurrency,
            isLowEnd: deviceMemory <= 2 || hardwareConcurrency <= 2
        };
    }
    
    determineStrategy() {
        const { effectiveType, saveData, isLowEnd, downlink } = this.connectionInfo;
        
        // Force minimal strategy for save-data or low-end devices
        if (saveData || isLowEnd) {
            return 'minimal';
        }
        
        // Strategy based on connection quality
        if (effectiveType === '4g' && downlink > 5) {
            return 'aggressive';
        } else if (effectiveType === '4g' || effectiveType === '3g') {
            return 'conservative';
        } else {
            return 'minimal';
        }
    }
    
    categorizeResources() {
        return {
            critical: {
                styles: [
                    '/css/base.css',
                    '/css/components.css',
                    '/css/typography.css'
                ],
                scripts: [
                    '/js/main.js',
                    '/js/navigation.js'
                ],
                images: [
                    '/images/logo.png',
                    '/images/favicons/favicon-32x32.png'
                ]
            },
            essential: {
                styles: [
                    '/css/navigation.css',
                    '/css/forms.css'
                ],
                scripts: [
                    '/js/gallery-detail.js',
                    '/js/components/lightbox.js'
                ],
                images: [
                    '/images/hero-default.jpg'
                ],
                fonts: [
                    'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
                    'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap'
                ]
            },
            predictive: {
                styles: [
                    '/css/mobile-overrides.css'
                ],
                scripts: [
                    '/js/components/lazy-loading.js',
                    '/js/typography.js'
                ],
                api: [
                    '/api/featured-photos',
                    '/api/gallery/2025'
                ]
            }
        };
    }
    
    setupConnectionMonitoring() {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        
        if (connection) {
            connection.addEventListener('change', () => {
                const oldStrategy = this.strategy;
                this.connectionInfo = this.detectConnectionCapabilities();
                this.strategy = this.determineStrategy();
                
                if (oldStrategy !== this.strategy) {
                    console.log('[AdvancedCacheWarmer] Strategy changed:', oldStrategy, '→', this.strategy);
                    this.analytics.strategySwitches++;
                    this.adaptToNewStrategy();
                }
            });
        }
    }
    
    setupServiceWorkerMessaging() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data.type === 'CACHE_WARM_COMPLETE') {
                    this.handleServiceWorkerCacheComplete(event.data);
                }
            });
        }
    }
    
    adaptToNewStrategy() {
        // Pause current warming if strategy becomes more restrictive
        if (this.strategy === 'minimal' && this.isWarming) {
            this.pauseWarming();
        }
        
        // Resume or intensify warming if strategy becomes more permissive
        if ((this.strategy === 'conservative' || this.strategy === 'aggressive') && !this.isWarming) {
            this.resumeWarming();
        }
    }
    
    getStrategyConfig() {
        const configs = {
            minimal: {
                batchSize: 2,
                batchDelay: 1000,
                maxConcurrent: 1,
                phases: ['critical']
            },
            conservative: {
                batchSize: 4,
                batchDelay: 500,
                maxConcurrent: 2,
                phases: ['critical', 'essential']
            },
            aggressive: {
                batchSize: 8,
                batchDelay: 200,
                maxConcurrent: 4,
                phases: ['critical', 'essential', 'predictive']
            }
        };
        
        return configs[this.strategy] || configs.conservative;
    }
    
    async startProgressiveWarming() {
        if (this.isWarming) {
            console.log('[AdvancedCacheWarmer] Already warming in progress');
            return;
        }
        
        console.log('[AdvancedCacheWarmer] Starting progressive warming with strategy:', this.strategy);
        this.isWarming = true;
        const startTime = performance.now();
        
        try {
            const config = this.getStrategyConfig();
            
            // Phase 1: Critical resources
            if (config.phases.includes('critical')) {
                await this.warmPhase('critical', config);
            }
            
            // Phase 2: Essential resources
            if (config.phases.includes('essential')) {
                await this.warmPhase('essential', config);
            }
            
            // Phase 3: Predictive resources
            if (config.phases.includes('predictive')) {
                await this.warmPhase('predictive', config);
            }
            
            const endTime = performance.now();
            this.analytics.timeSpent += endTime - startTime;
            
            this.reportAnalytics();
            
        } catch (error) {
            console.error('[AdvancedCacheWarmer] Progressive warming failed:', error);
        } finally {
            this.isWarming = false;
        }
    }
    
    async warmPhase(phaseName, config) {
        console.log(`[AdvancedCacheWarmer] Starting ${phaseName} phase`);
        this.currentPhase = phaseName;
        
        const phaseResources = this.resources[phaseName];
        const allUrls = [];
        
        // Flatten all resource types for this phase
        Object.keys(phaseResources).forEach(type => {
            phaseResources[type].forEach(url => {
                allUrls.push({ url, type, priority: this.getResourcePriority(type, phaseName) });
            });
        });
        
        // Sort by priority (higher numbers = higher priority)
        allUrls.sort((a, b) => b.priority - a.priority);
        
        // Warm resources in batches
        await this.warmResourcesBatched(allUrls, config);
        
        this.analytics.phaseCompletions[phaseName] = true;
        console.log(`[AdvancedCacheWarmer] Completed ${phaseName} phase`);
        
        // Add delay between phases for conservative/minimal strategies
        if (this.strategy !== 'aggressive') {
            await this.delay(config.batchDelay);
        }
    }
    
    getResourcePriority(type, phase) {
        const priorities = {
            critical: { styles: 10, scripts: 9, images: 8 },
            essential: { styles: 7, scripts: 6, images: 5, fonts: 4 },
            predictive: { styles: 3, scripts: 2, api: 1, images: 1 }
        };
        
        return priorities[phase]?.[type] || 1;
    }
    
    async warmResourcesBatched(resources, config) {
        const { batchSize, batchDelay, maxConcurrent } = config;
        
        for (let i = 0; i < resources.length; i += batchSize) {
            const batch = resources.slice(i, i + batchSize);
            
            // Create limited concurrent promises
            const batchPromises = batch.slice(0, maxConcurrent).map(resource => 
                this.warmSingleResource(resource.url, resource.type)
            );
            
            await Promise.allSettled(batchPromises);
            
            // Add delay between batches (except for last batch)
            if (i + batchSize < resources.length) {
                await this.delay(batchDelay);
            }
        }
    }
    
    async warmSingleResource(url, resourceType) {
        if (this.completedUrls.has(url) || this.warmingInProgress.has(url)) {
            return;
        }
        
        this.warmingInProgress.add(url);
        const startTime = performance.now();
        let bytesTransferred = 0;
        
        try {
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit',
                cache: 'force-cache',
                priority: this.getRequestPriority(resourceType)
            });
            
            if (response.ok) {
                // Track bandwidth usage
                const contentLength = response.headers.get('content-length');
                if (contentLength) {
                    bytesTransferred = parseInt(contentLength, 10);
                    this.analytics.bandwidthUsed += bytesTransferred;
                }
                
                // For images, ensure they're properly cached
                if (resourceType === 'images' && url.match(/\.(jpg|jpeg|png|webp|gif)$/i)) {
                    await this.ensureImageCached(url);
                }
                
                this.analytics.warmed++;
                this.completedUrls.add(url);
                
                console.log(`[AdvancedCacheWarmer] Warmed ${resourceType}:`, url, 
                    bytesTransferred > 0 ? `(${this.formatBytes(bytesTransferred)})` : '');
                
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
            
        } catch (error) {
            console.warn(`[AdvancedCacheWarmer] Failed to warm ${resourceType}:`, url, error.message);
            this.analytics.failed++;
        } finally {
            this.warmingInProgress.delete(url);
        }
    }
    
    getRequestPriority(resourceType) {
        // Use browser's resource prioritization hints
        const priorityMap = {
            styles: 'high',
            scripts: 'high',
            fonts: 'high',
            images: 'low',
            api: 'low'
        };
        
        return priorityMap[resourceType] || 'auto';
    }
    
    async ensureImageCached(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });
    }
    
    async warmGalleryImages(galleryId, limit = 10) {
        console.log(`[AdvancedCacheWarmer] Warming gallery images for: ${galleryId}`);
        
        try {
            // Get gallery data
            const galleryData = await this.fetchGalleryData(galleryId);
            
            if (!galleryData || !galleryData.photos) {
                return;
            }
            
            // Select top images based on strategy
            const config = this.getStrategyConfig();
            const imagesToWarm = galleryData.photos
                .slice(0, Math.min(limit, config.batchSize * 2))
                .map(photo => ({
                    url: photo.thumbnailUrl || photo.url,
                    type: 'images',
                    priority: 5
                }));
            
            await this.warmResourcesBatched(imagesToWarm, {
                ...config,
                batchDelay: config.batchDelay * 2 // Slower for gallery images
            });
            
        } catch (error) {
            console.error('[AdvancedCacheWarmer] Gallery warming failed:', error);
        }
    }
    
    async fetchGalleryData(galleryId) {
        try {
            const response = await fetch(`/gallery-data/${galleryId}.json`);
            if (response.ok) {
                const data = await response.json();
                return {
                    photos: [
                        ...(data.categories?.workshops || []),
                        ...(data.categories?.socials || [])
                    ]
                };
            }
        } catch (error) {
            console.warn(`[AdvancedCacheWarmer] Failed to fetch gallery data: ${galleryId}`, error);
        }
        return null;
    }
    
    // Service Worker Integration
    async warmWithServiceWorker(urls) {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'CACHE_WARM_REQUEST',
                data: { 
                    urls,
                    strategy: this.strategy,
                    priority: 'background'
                }
            });
        }
    }
    
    handleServiceWorkerCacheComplete(data) {
        console.log('[AdvancedCacheWarmer] Service worker cache warming completed:', data);
        
        // Update analytics based on service worker results
        if (data.results) {
            this.analytics.warmed += data.results.success || 0;
            this.analytics.failed += data.results.failed || 0;
            this.analytics.bandwidthUsed += data.results.bytesTransferred || 0;
        }
    }
    
    // Utility methods
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    pauseWarming() {
        this.isWarming = false;
        console.log('[AdvancedCacheWarmer] Warming paused due to strategy change');
    }
    
    resumeWarming() {
        if (!this.isWarming) {
            console.log('[AdvancedCacheWarmer] Resuming warming with new strategy:', this.strategy);
            setTimeout(() => this.startProgressiveWarming(), 1000);
        }
    }
    
    reportAnalytics() {
        const efficiency = this.analytics.warmed / (this.analytics.warmed + this.analytics.failed) * 100;
        const avgTimePerResource = this.analytics.timeSpent / this.analytics.warmed;
        
        console.log('[AdvancedCacheWarmer] Warming Analytics:', {
            strategy: this.strategy,
            warmed: this.analytics.warmed,
            failed: this.analytics.failed,
            efficiency: `${efficiency.toFixed(1)}%`,
            bandwidthUsed: this.formatBytes(this.analytics.bandwidthUsed),
            totalTime: `${(this.analytics.timeSpent / 1000).toFixed(2)}s`,
            avgTimePerResource: `${avgTimePerResource.toFixed(0)}ms`,
            strategySwitches: this.analytics.strategySwitches,
            phasesCompleted: Object.values(this.analytics.phaseCompletions).filter(Boolean).length
        });
    }
    
    // Public API methods
    getAnalytics() {
        return {
            ...this.analytics,
            strategy: this.strategy,
            connectionInfo: this.connectionInfo,
            currentPhase: this.currentPhase,
            isWarming: this.isWarming,
            queueSize: this.warmingQueue.size,
            inProgress: this.warmingInProgress.size,
            completed: this.completedUrls.size
        };
    }
    
    clearCache() {
        this.warmingQueue.clear();
        this.warmingInProgress.clear();
        this.completedUrls.clear();
        this.currentPhase = 'idle';
    }
    
    resetAnalytics() {
        this.analytics = {
            warmed: 0,
            failed: 0,
            bandwidthUsed: 0,
            timeSpent: 0,
            strategySwitches: 0,
            phaseCompletions: {
                critical: false,
                essential: false,
                predictive: false
            }
        };
    }
    
    // Auto-warming based on page context
    autoWarm() {
        const currentPath = window.location.pathname;
        
        if (currentPath === '/' || currentPath === '/home' || currentPath === '/index.html') {
            // Homepage: start full progressive warming
            this.startProgressiveWarming();
        } else if (currentPath.includes('/gallery')) {
            // Gallery page: warm critical first, then gallery-specific content
            this.warmPhase('critical', this.getStrategyConfig()).then(() => {
                const galleryMatch = currentPath.match(/gallery[/-]?(\d{4})\/?/);
                if (galleryMatch) {
                    this.warmGalleryImages(galleryMatch[1]);
                }
            });
        } else {
            // Other pages: warm critical resources only
            this.warmPhase('critical', this.getStrategyConfig());
        }
    }
    
    // Manual warming controls
    async warmCriticalOnly() {
        const config = this.getStrategyConfig();
        await this.warmPhase('critical', config);
    }
    
    async warmEssentialOnly() {
        const config = this.getStrategyConfig();
        await this.warmPhase('essential', config);
    }
    
    async warmPredictiveOnly() {
        const config = this.getStrategyConfig();
        await this.warmPhase('predictive', config);
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdvancedCacheWarmer;
}

// Legacy compatibility - create global instance
window.CacheWarmer = AdvancedCacheWarmer;