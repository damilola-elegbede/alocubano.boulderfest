# Virtual Scrolling Gallery Components

## Overview
Virtual scrolling components optimize gallery performance by rendering only visible items, supporting thousands of photos with smooth scrolling performance. This system provides both single-year and multi-year gallery management with advanced DOM recycling.

## Components Architecture

### 1. Virtual Gallery Manager
The core component that handles DOM recycling and virtual scrolling logic.

#### Structure
```html
<div class="virtual-gallery-container" data-virtual-gallery>
    <div class="virtual-gallery-viewport">
        <div class="virtual-gallery-spacer-top"></div>
        <div class="virtual-gallery-content">
            <!-- Recycled DOM elements -->
            <div class="gallery-item virtual-item" data-index="0">
                <img class="gallery-image" loading="lazy" />
                <div class="gallery-overlay">
                    <h3 class="gallery-title"></h3>
                    <p class="gallery-meta"></p>
                </div>
            </div>
            <!-- More recycled items... -->
        </div>
        <div class="virtual-gallery-spacer-bottom"></div>
    </div>
    <div class="virtual-gallery-scrollbar">
        <div class="virtual-gallery-scrollbar-thumb"></div>
    </div>
</div>
```

#### CSS Specifications
```css
.virtual-gallery-container {
    /* Container */
    position: relative;
    height: 100vh;
    overflow: hidden;
    
    /* Performance */
    contain: layout style paint;
    will-change: scroll-position;
}

.virtual-gallery-viewport {
    /* Scrollable area */
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    
    /* Smooth scrolling */
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
    
    /* Performance optimization */
    transform: translateZ(0);
    backface-visibility: hidden;
}

.virtual-gallery-content {
    /* Grid layout */
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-lg);
    padding: var(--space-xl);
    
    /* Responsive columns */
    @media (max-width: 768px) {
        grid-template-columns: 1fr;
        gap: var(--space-md);
        padding: var(--space-md);
    }
    
    @media (min-width: 1200px) {
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    }
}

.gallery-item.virtual-item {
    /* Virtual item styling */
    position: relative;
    aspect-ratio: 4/3;
    border-radius: 8px;
    overflow: hidden;
    
    /* Transition for recycling */
    transition: transform 0.2s var(--ease-out-expo);
    
    /* Performance */
    contain: layout style paint;
    transform: translateZ(0);
}

.virtual-gallery-spacer-top,
.virtual-gallery-spacer-bottom {
    /* Spacers for virtual scrolling */
    width: 100%;
    flex-shrink: 0;
    pointer-events: none;
}
```

#### JavaScript Interface
```javascript
class VirtualGalleryManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            itemHeight: 300,
            itemsPerRow: 'auto',
            overscan: 5,
            recycleThreshold: 100,
            ...options
        };
        
        this.items = [];
        this.visibleItems = new Map();
        this.recycledElements = [];
        this.scrollTop = 0;
        this.containerHeight = 0;
    }
    
    // Core Methods
    setItems(items) { /* Set gallery items */ }
    render() { /* Render visible items */ }
    recycle() { /* Recycle DOM elements */ }
    updateScrollPosition() { /* Handle scroll updates */ }
    
    // Performance Methods
    calculateVisible() { /* Calculate visible items */ }
    measureItems() { /* Measure item dimensions */ }
    optimizeRendering() { /* Optimize render cycle */ }
}
```

### 2. Multi-Year Gallery Manager
Extends virtual scrolling to handle multiple years with navigation.

#### Structure
```html
<div class="multi-year-gallery" data-multi-year-gallery>
    <header class="gallery-header">
        <nav class="year-navigation">
            <button class="year-nav-btn active" data-year="2025">2025</button>
            <button class="year-nav-btn" data-year="2024">2024</button>
            <button class="year-nav-btn" data-year="2023">2023</button>
        </nav>
        <div class="gallery-stats">
            <span class="photo-count">Loading...</span>
            <span class="year-indicator">2025</span>
        </div>
    </header>
    
    <div class="gallery-content-wrapper">
        <div class="virtual-gallery-container" data-year="2025">
            <!-- Virtual gallery instance -->
        </div>
    </div>
    
    <div class="gallery-loading-state">
        <div class="loading-spinner"></div>
        <p class="loading-text">Loading photos...</p>
    </div>
</div>
```

#### CSS Specifications
```css
.multi-year-gallery {
    /* Layout */
    display: flex;
    flex-direction: column;
    height: 100vh;
    
    /* Performance */
    contain: layout style;
}

.gallery-header {
    /* Header layout */
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--color-white);
    border-bottom: 1px solid var(--color-gray-200);
    
    /* Sticky header */
    position: sticky;
    top: 0;
    z-index: 10;
}

.year-navigation {
    /* Navigation layout */
    display: flex;
    gap: var(--space-sm);
}

.year-nav-btn {
    /* Button styling */
    padding: var(--space-sm) var(--space-md);
    background: transparent;
    border: 2px solid var(--color-gray-300);
    border-radius: 6px;
    color: var(--color-gray-600);
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    
    /* Transitions */
    transition: all var(--transition-base);
    
    /* States */
    &:hover {
        border-color: var(--color-blue);
        color: var(--color-blue);
    }
    
    &.active {
        background: var(--color-red);
        border-color: var(--color-red);
        color: var(--color-white);
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.gallery-stats {
    /* Stats layout */
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-xs);
}

.photo-count {
    /* Count styling */
    font-family: var(--font-code);
    font-size: var(--font-size-lg);
    font-weight: 700;
    color: var(--color-black);
}

.year-indicator {
    /* Year indicator */
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    color: var(--color-gray-600);
}

.gallery-content-wrapper {
    /* Content area */
    flex: 1;
    position: relative;
    overflow: hidden;
}

.gallery-loading-state {
    /* Loading state */
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 5;
    
    /* Initially hidden */
    opacity: 0;
    visibility: hidden;
    transition: all var(--transition-base);
    
    &.is-loading {
        opacity: 1;
        visibility: visible;
    }
}
```

#### JavaScript Interface
```javascript
class MultiYearGalleryManager {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            years: ['2025', '2024', '2023'],
            defaultYear: '2025',
            preloadAdjacentYears: true,
            cacheStrategy: 'memory',
            ...options
        };
        
        this.galleryInstances = new Map();
        this.currentYear = options.defaultYear;
        this.photoCache = new Map();
        this.loadingStates = new Map();
    }
    
    // Core Methods
    switchYear(year) { /* Switch to different year */ }
    preloadYear(year) { /* Preload year data */ }
    cachePhotos(year, photos) { /* Cache photo data */ }
    
    // Navigation Methods
    setupNavigation() { /* Setup year navigation */ }
    updateStats(year, count) { /* Update photo stats */ }
    animateTransition(fromYear, toYear) { /* Animate year switch */ }
}
```

### 3. Advanced Image Component
Enhanced image component with AVIF support and performance optimization.

#### Structure
```html
<div class="advanced-image-container" data-advanced-image>
    <picture class="responsive-picture">
        <source 
            srcset="image.avif" 
            type="image/avif"
            media="(min-width: 1024px)">
        <source 
            srcset="image-mobile.avif" 
            type="image/avif"
            media="(max-width: 768px)">
        <source 
            srcset="image.webp" 
            type="image/webp"
            media="(min-width: 1024px)">
        <source 
            srcset="image-mobile.webp" 
            type="image/webp"
            media="(max-width: 768px)">
        <img 
            class="responsive-image"
            src="image.jpg"
            alt="Gallery image"
            loading="lazy"
            decoding="async">
    </picture>
    
    <div class="image-overlay">
        <div class="image-info">
            <h3 class="image-title"></h3>
            <p class="image-meta"></p>
        </div>
        <div class="image-actions">
            <button class="lightbox-trigger" aria-label="Open in lightbox">
                <!-- SVG icon -->
            </button>
        </div>
    </div>
    
    <div class="loading-placeholder">
        <div class="loading-skeleton"></div>
    </div>
</div>
```

#### CSS Specifications
```css
.advanced-image-container {
    /* Container */
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    background: var(--color-gray-100);
    
    /* Aspect ratio maintenance */
    aspect-ratio: 4/3;
    
    /* Performance */
    contain: layout style paint;
    
    /* Hover effects */
    &:hover .image-overlay {
        opacity: 1;
        transform: translateY(0);
    }
}

.responsive-picture {
    /* Picture element */
    display: block;
    width: 100%;
    height: 100%;
}

.responsive-image {
    /* Image styling */
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    
    /* Performance */
    transform: translateZ(0);
    backface-visibility: hidden;
    
    /* Loading state */
    opacity: 0;
    transition: opacity var(--transition-base);
    
    &.loaded {
        opacity: 1;
    }
}

.image-overlay {
    /* Overlay positioning */
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    
    /* Styling */
    background: linear-gradient(
        0deg, 
        rgba(0, 0, 0, 0.8) 0%, 
        transparent 100%
    );
    color: var(--color-white);
    padding: var(--space-md);
    
    /* Animation */
    opacity: 0;
    transform: translateY(100%);
    transition: all var(--transition-base) var(--ease-out-expo);
    
    /* Always visible on mobile */
    @media (max-width: 768px) {
        opacity: 1;
        transform: translateY(0);
    }
}

.image-info {
    /* Info layout */
    margin-bottom: var(--space-sm);
}

.image-title {
    /* Title styling */
    font-family: var(--font-display);
    font-size: var(--font-size-lg);
    font-weight: 600;
    margin-bottom: var(--space-xs);
    line-height: 1.2;
}

.image-meta {
    /* Meta styling */
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    opacity: 0.8;
    margin: 0;
}

.image-actions {
    /* Actions layout */
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
}

.lightbox-trigger {
    /* Button styling */
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    color: var(--color-white);
    padding: var(--space-sm);
    cursor: pointer;
    
    /* Backdrop filter if supported */
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    
    /* Transitions */
    transition: all var(--transition-base);
    
    &:hover {
        background: rgba(255, 255, 255, 0.3);
        transform: scale(1.05);
    }
}

.loading-placeholder {
    /* Loading state */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    
    /* Initially visible */
    opacity: 1;
    transition: opacity var(--transition-base);
    
    &.hidden {
        opacity: 0;
        pointer-events: none;
    }
}

.loading-skeleton {
    /* Skeleton animation */
    width: 100%;
    height: 100%;
    background: linear-gradient(
        90deg,
        var(--color-gray-200) 25%,
        var(--color-gray-100) 50%,
        var(--color-gray-200) 75%
    );
    background-size: 200% 100%;
    animation: loading-shimmer 2s infinite;
}

@keyframes loading-shimmer {
    0% {
        background-position: 200% 0;
    }
    100% {
        background-position: -200% 0;
    }
}
```

## Performance Optimizations

### Image Format Strategy
```javascript
const imageFormatStrategy = {
    // AVIF: Next-gen format with superior compression
    avif: {
        quality: 75,
        compression: 'lossy',
        browser_support: ['Chrome 85+', 'Firefox 93+', 'Safari 16+']
    },
    
    // WebP: Widely supported modern format
    webp: {
        quality: 80,
        compression: 'lossy',
        browser_support: ['Chrome 32+', 'Firefox 65+', 'Safari 14+']
    },
    
    // JPEG: Universal fallback
    jpeg: {
        quality: 85,
        compression: 'lossy',
        browser_support: ['Universal']
    }
};
```

### Responsive Breakpoints
```css
/* Mobile First Approach */
.responsive-image {
    /* Base: Mobile (320px - 767px) */
    width: 100%;
    max-width: 400px;
}

@media (min-width: 768px) {
    /* Tablet (768px - 1023px) */
    .responsive-image {
        max-width: 600px;
    }
}

@media (min-width: 1024px) {
    /* Desktop (1024px+) */
    .responsive-image {
        max-width: 800px;
    }
}

@media (min-width: 1440px) {
    /* Large Desktop (1440px+) */
    .responsive-image {
        max-width: 1000px;
    }
}
```

## Accessibility Specifications

### ARIA Labels and Roles
```html
<!-- Virtual Gallery Container -->
<div 
    class="virtual-gallery-container" 
    role="grid" 
    aria-label="Festival photo gallery"
    aria-rowcount="dynamic"
    data-virtual-gallery>
    
    <!-- Gallery Items -->
    <div 
        class="gallery-item virtual-item" 
        role="gridcell"
        aria-posinset="1"
        aria-setsize="500"
        tabindex="0">
        
        <img 
            class="gallery-image"
            alt="Festival moment: dancers in colorful attire"
            role="img" />
            
        <button 
            class="lightbox-trigger"
            aria-label="Open image in full size lightbox"
            aria-describedby="image-title-1">
        </button>
    </div>
</div>

<!-- Multi-Year Navigation -->
<nav class="year-navigation" role="tablist" aria-label="Gallery years">
    <button 
        class="year-nav-btn active"
        role="tab"
        aria-selected="true"
        aria-controls="gallery-2025"
        id="tab-2025">
        2025
    </button>
</nav>
```

### Keyboard Navigation
```css
/* Focus indicators */
.gallery-item:focus,
.year-nav-btn:focus,
.lightbox-trigger:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
}

/* Focus trap for virtual scrolling */
.virtual-gallery-container:focus-within {
    /* Ensure focused items remain visible */
    scroll-behavior: smooth;
}
```

### Screen Reader Support
```javascript
// Announce dynamic content changes
const announceToScreenReader = (message) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
};

// Usage examples
announceToScreenReader('Switched to 2025 gallery, loading 342 photos');
announceToScreenReader('Gallery loaded successfully');
```

## Browser Compatibility

### Feature Detection
```javascript
const features = {
    avif: () => {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL('image/avif').indexOf('image/avif') === 5;
    },
    
    webp: () => {
        const canvas = document.createElement('canvas');
        return canvas.toDataURL('image/webp').indexOf('image/webp') === 5;
    },
    
    intersectionObserver: () => {
        return 'IntersectionObserver' in window;
    },
    
    virtualScrolling: () => {
        return 'requestIdleCallback' in window && 
               'ResizeObserver' in window;
    }
};
```

### Progressive Enhancement
```javascript
// Graceful degradation for older browsers
if (!features.virtualScrolling()) {
    // Fall back to regular grid with pagination
    initializePaginatedGallery();
} else {
    // Full virtual scrolling experience
    initializeVirtualGallery();
}
```

## Implementation Guidelines

### Performance Best Practices
1. **DOM Recycling**: Reuse DOM elements to minimize creation/destruction
2. **Batch Updates**: Group DOM modifications using `requestAnimationFrame`
3. **Intersection Observer**: Use for efficient visibility detection
4. **Memory Management**: Clear unused cached data periodically
5. **Image Optimization**: Serve appropriate formats and sizes

### Development Workflow
1. **Component Isolation**: Test each component independently
2. **Performance Monitoring**: Track fps, memory usage, and scroll performance
3. **Accessibility Testing**: Verify keyboard navigation and screen reader support
4. **Cross-browser Testing**: Ensure compatibility across target browsers
5. **Mobile Testing**: Validate touch interactions and performance on devices

### Testing Requirements
- Unit tests for virtual scrolling logic
- Integration tests for year switching
- Performance tests for large datasets
- Accessibility tests with assistive technologies
- Visual regression tests for image rendering