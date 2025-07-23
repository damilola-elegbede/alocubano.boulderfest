# Responsive Virtual Gallery Layout Specifications

## Overview
Comprehensive responsive design specifications for virtual gallery components, ensuring optimal user experience across all device types and screen sizes. These layouts prioritize performance, accessibility, and visual consistency.

## Responsive Breakpoint System

### Enhanced Breakpoint Strategy
```css
/* Enhanced breakpoint system for gallery optimization */
:root {
    /* Standard breakpoints */
    --bp-xs: 320px;   /* Small phones */
    --bp-sm: 480px;   /* Large phones */
    --bp-md: 768px;   /* Tablets */
    --bp-lg: 1024px;  /* Laptops */
    --bp-xl: 1200px;  /* Desktops */
    --bp-2xl: 1440px; /* Large desktops */
    --bp-3xl: 1920px; /* Ultra-wide displays */
    
    /* Gallery-specific breakpoints */
    --bp-gallery-compact: 600px;   /* Switch to compact layout */
    --bp-gallery-expanded: 900px;  /* Enable expanded features */
    --bp-gallery-masonry: 1100px;  /* Switch to masonry layout */
    
    /* Container queries for component-level responsiveness */
    --container-xs: 300px;
    --container-sm: 400px;
    --container-md: 600px;
    --container-lg: 800px;
    --container-xl: 1000px;
}
```

### Device-Specific Optimizations
```css
/* Device-specific media queries */
@media (hover: none) and (pointer: coarse) {
    /* Touch devices - larger touch targets, simplified interactions */
    .virtual-item {
        min-height: 48px; /* Minimum touch target */
    }
    
    .lightbox-trigger {
        min-width: 44px;
        min-height: 44px;
        padding: var(--space-md);
    }
}

@media (hover: hover) and (pointer: fine) {
    /* Mouse/trackpad devices - enable hover effects */
    .virtual-item {
        transition: transform 0.3s var(--ease-out-expo);
    }
    
    .virtual-item:hover {
        transform: translateY(-4px);
    }
}

/* High refresh rate displays */
@media (update: fast) {
    .virtual-item {
        transition-duration: 0.1s; /* Smoother on high refresh displays */
    }
}

/* Slow or limited hardware */
@media (update: slow) {
    .virtual-item {
        transition: none; /* Disable transitions on slow devices */
    }
    
    .virtual-scrolling-animations {
        display: none; /* Disable complex animations */
    }
}
```

## Mobile-First Layout Patterns

### 1. Mobile Gallery Layout (320px - 767px)
```css
/* Mobile: Single column, optimized for touch */
@media (max-width: 767px) {
    .virtual-gallery-container {
        /* Full viewport on mobile */
        height: 100vh;
        height: 100dvh; /* Dynamic viewport height when available */
        margin: 0;
        padding: 0;
        border-radius: 0;
    }
    
    .virtual-gallery-viewport {
        /* Optimized scrolling for mobile */
        -webkit-overflow-scrolling: touch;
        scroll-behavior: smooth;
        overscroll-behavior: contain;
        
        /* iOS Safari optimization */
        -webkit-transform: translateZ(0);
        transform: translateZ(0);
    }
    
    .virtual-gallery-content {
        /* Single column grid */
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-md);
        padding: var(--space-md);
        
        /* Reduce gap on very small screens */
        @media (max-width: 360px) {
            gap: var(--space-sm);
            padding: var(--space-sm);
        }
    }
    
    .virtual-item {
        /* Mobile-optimized aspect ratio */
        aspect-ratio: 4/3;
        border-radius: 8px;
        
        /* Touch-friendly sizing */
        min-height: 200px;
        
        /* Reduce border radius on small screens */
        @media (max-width: 360px) {
            border-radius: 6px;
            min-height: 180px;
        }
    }
    
    /* Mobile header adjustments */
    .gallery-header {
        padding: var(--space-sm) var(--space-md);
        
        /* Sticky with safe area */
        position: sticky;
        top: env(safe-area-inset-top, 0);
        z-index: 100;
        
        /* iOS notch support */
        padding-top: max(var(--space-sm), env(safe-area-inset-top));
    }
    
    .year-navigation {
        /* Horizontal scroll on mobile if needed */
        display: flex;
        gap: var(--space-xs);
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none; /* Firefox */
        
        &::-webkit-scrollbar {
            display: none; /* Chrome/Safari */
        }
    }
    
    .year-nav-btn {
        /* Consistent sizing */
        flex-shrink: 0;
        padding: var(--space-sm) var(--space-md);
        font-size: var(--font-size-sm);
        
        /* Touch-friendly minimum size */
        min-width: 60px;
        min-height: 36px;
    }
    
    .gallery-stats {
        /* Simplified stats on mobile */
        align-items: flex-end;
        
        .photo-count {
            font-size: var(--font-size-md);
        }
        
        .year-indicator {
            font-size: var(--font-size-xs);
        }
    }
}

/* Portrait phone specific (max 480px width) */
@media (max-width: 480px) and (orientation: portrait) {
    .virtual-gallery-content {
        /* Tighter spacing on small phones */
        padding: var(--space-sm);
    }
    
    .virtual-item {
        /* Optimized for one-handed use */
        aspect-ratio: 1/1; /* Square on very small screens */
        min-height: 150px;
    }
    
    .gallery-header {
        /* More compact header */
        padding: var(--space-xs) var(--space-sm);
        
        .gallery-stats {
            .photo-count {
                font-size: var(--font-size-sm);
            }
        }
    }
}
```

### 2. Tablet Layout (768px - 1023px)
```css
/* Tablet: Two-column, touch-optimized */
@media (min-width: 768px) and (max-width: 1023px) {
    .virtual-gallery-container {
        height: calc(100vh - 60px); /* Account for navigation */
        margin: var(--space-md);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
    }
    
    .virtual-gallery-content {
        /* Two-column grid */
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: var(--space-lg);
        padding: var(--space-lg);
        
        /* Dynamic columns based on container width */
        @container (min-width: 700px) {
            grid-template-columns: repeat(3, 1fr);
        }
    }
    
    .virtual-item {
        /* Tablet-optimized aspect ratio */
        aspect-ratio: 3/2;
        border-radius: 10px;
        min-height: 180px;
        
        /* Enhanced hover effects on tablets with mouse */
        @media (hover: hover) {
            &:hover {
                transform: translateY(-6px) scale(1.02);
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
            }
        }
    }
    
    .gallery-header {
        padding: var(--space-md) var(--space-lg);
        
        .year-navigation {
            gap: var(--space-sm);
        }
        
        .year-nav-btn {
            padding: var(--space-sm) var(--space-lg);
            font-size: var(--font-size-base);
            min-width: 80px;
        }
    }
    
    /* Portrait tablet adjustments */
    @media (orientation: portrait) {
        .virtual-gallery-content {
            grid-template-columns: repeat(2, 1fr);
            gap: var(--space-md);
        }
        
        .virtual-item {
            aspect-ratio: 4/3;
        }
    }
    
    /* Landscape tablet adjustments */
    @media (orientation: landscape) {
        .virtual-gallery-content {
            grid-template-columns: repeat(3, 1fr);
        }
        
        .virtual-item {
            aspect-ratio: 16/10;
        }
    }
}
```

### 3. Desktop Layout (1024px+)
```css
/* Desktop: Multi-column, full features */
@media (min-width: 1024px) {
    .virtual-gallery-container {
        height: calc(100vh - 80px);
        margin: var(--space-xl) auto;
        max-width: 1400px;
        border-radius: 16px;
        box-shadow: 0 8px 40px rgba(0, 0, 0, 0.12);
    }
    
    .virtual-gallery-content {
        /* Responsive grid with auto-fit */
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: var(--space-xl);
        padding: var(--space-xl);
        
        /* Masonry layout option for advanced layouts */
        &.masonry-layout {
            columns: auto;
            column-width: 300px;
            column-gap: var(--space-xl);
            column-fill: balance;
        }
    }
    
    .virtual-item {
        /* Desktop aspect ratio */
        aspect-ratio: 4/3;
        border-radius: 12px;
        min-height: 200px;
        
        /* Advanced hover effects */
        transition: all 0.3s var(--ease-out-expo);
        
        &:hover {
            transform: translateY(-8px) scale(1.03);
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
            z-index: 10;
            
            .gallery-overlay {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Masonry layout adjustments */
        .masonry-layout & {
            break-inside: avoid;
            margin-bottom: var(--space-xl);
            aspect-ratio: auto; /* Let content determine height */
        }
    }
    
    .gallery-header {
        padding: var(--space-lg) var(--space-xl);
        
        .year-navigation {
            gap: var(--space-md);
        }
        
        .year-nav-btn {
            padding: var(--space-md) var(--space-xl);
            font-size: var(--font-size-base);
            min-width: 100px;
            
            /* Enhanced hover effects */
            &:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
        }
        
        .gallery-stats {
            .photo-count {
                font-size: var(--font-size-xl);
            }
            
            .year-indicator {
                font-size: var(--font-size-base);
            }
        }
    }
}

/* Large desktop optimizations (1440px+) */
@media (min-width: 1440px) {
    .virtual-gallery-content {
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--space-2xl);
        padding: var(--space-2xl);
        
        &.masonry-layout {
            column-width: 350px;
            column-gap: var(--space-2xl);
        }
    }
    
    .virtual-item {
        min-height: 240px;
        border-radius: 16px;
    }
}

/* Ultra-wide display optimizations (1920px+) */
@media (min-width: 1920px) {
    .virtual-gallery-container {
        max-width: 1600px;
    }
    
    .virtual-gallery-content {
        grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
        
        &.masonry-layout {
            column-width: 380px;
        }
    }
}
```

## Container Query Support

### Component-Level Responsiveness
```css
/* Modern container queries for component-level responsiveness */
.virtual-gallery-container {
    container-type: inline-size;
    container-name: gallery;
}

/* Container query-based layouts */
@container gallery (min-width: 400px) {
    .virtual-gallery-content {
        grid-template-columns: repeat(2, 1fr);
    }
}

@container gallery (min-width: 600px) {
    .virtual-gallery-content {
        grid-template-columns: repeat(3, 1fr);
    }
}

@container gallery (min-width: 900px) {
    .virtual-gallery-content {
        grid-template-columns: repeat(4, 1fr);
    }
    
    /* Enable advanced features */
    .gallery-advanced-controls {
        display: flex;
    }
}

@container gallery (min-width: 1200px) {
    .virtual-gallery-content {
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    }
    
    /* Enable masonry layout option */
    .masonry-toggle {
        display: block;
    }
}

/* Fallback for browsers without container query support */
@supports not (container-type: inline-size) {
    /* Use regular media queries as fallback */
    @media (min-width: 400px) {
        .virtual-gallery-content {
            grid-template-columns: repeat(2, 1fr);
        }
    }
    
    @media (min-width: 600px) {
        .virtual-gallery-content {
            grid-template-columns: repeat(3, 1fr);
        }
    }
}
```

## Performance-Aware Responsive Design

### Adaptive Loading Based on Screen Size
```javascript
class ResponsiveVirtualGallery {
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        
        // Initialize gallery components - accept as parameters or create defaults
        this.gallery = options.gallery || new VirtualGalleryManager(container, options);
        this.imageManager = options.imageManager || new ImageManager(options);
        this.animationManager = options.animationManager || new AnimationManager(options);
        this.prefetchManager = options.prefetchManager || new PrefetchManager(options);
        
        this.currentBreakpoint = this.getCurrentBreakpoint();
        this.setupResponsiveOptimizations();
        this.setupResizeObserver();
    }
    
    getCurrentBreakpoint() {
        const width = window.innerWidth;
        
        if (width < 480) return 'xs';
        if (width < 768) return 'sm';
        if (width < 1024) return 'md';
        if (width < 1440) return 'lg';
        return 'xl';
    }
    
    setupResponsiveOptimizations() {
        const optimizations = {
            xs: {
                itemsPerRow: 1,
                overscan: 3,
                imageQuality: 85,
                animations: false,
                preloadAdjacent: false
            },
            sm: {
                itemsPerRow: 1,
                overscan: 5,
                imageQuality: 80,
                animations: 'minimal',
                preloadAdjacent: true
            },
            md: {
                itemsPerRow: 2,
                overscan: 6,
                imageQuality: 85,
                animations: true,
                preloadAdjacent: true
            },
            lg: {
                itemsPerRow: 3,
                overscan: 8,
                imageQuality: 80,
                animations: true,
                preloadAdjacent: true
            },
            xl: {
                itemsPerRow: 'auto',
                overscan: 10,
                imageQuality: 75,
                animations: 'enhanced',
                preloadAdjacent: true
            }
        };
        
        this.applyOptimizations(optimizations[this.currentBreakpoint]);
    }
    
    applyOptimizations(config) {
        // Update virtual scrolling parameters
        this.gallery.updateConfig({
            itemsPerRow: config.itemsPerRow,
            overscan: config.overscan
        });
        
        // Update image loading quality
        this.imageManager.setQuality(config.imageQuality);
        
        // Enable/disable animations
        this.animationManager.setLevel(config.animations);
        
        // Configure preloading
        this.prefetchManager.setEnabled(config.preloadAdjacent);
    }
    
    setupResizeObserver() {
        if ('ResizeObserver' in window) {
            const resizeObserver = new ResizeObserver(entries => {
                const newBreakpoint = this.getCurrentBreakpoint();
                
                if (newBreakpoint !== this.currentBreakpoint) {
                    this.handleBreakpointChange(this.currentBreakpoint, newBreakpoint);
                    this.currentBreakpoint = newBreakpoint;
                }
            });
            
            resizeObserver.observe(this.container);
        } else {
            // Fallback to resize event
            window.addEventListener('resize', this.debounce(() => {
                const newBreakpoint = this.getCurrentBreakpoint();
                if (newBreakpoint !== this.currentBreakpoint) {
                    this.handleBreakpointChange(this.currentBreakpoint, newBreakpoint);
                    this.currentBreakpoint = newBreakpoint;
                }
            }, 250));
        }
    }
    
    handleBreakpointChange(oldBreakpoint, newBreakpoint) {
        // Announce change to screen readers
        this.announceBreakpointChange(newBreakpoint);
        
        // Update optimizations
        this.setupResponsiveOptimizations();
        
        // Trigger re-layout
        this.gallery.recalculateLayout();
        
        // Emit event for other components
        this.container.dispatchEvent(new CustomEvent('breakpointchange', {
            detail: { oldBreakpoint, newBreakpoint }
        }));
    }
    
    announceBreakpointChange(breakpoint) {
        const messages = {
            xs: 'Switched to mobile layout',
            sm: 'Switched to large mobile layout',
            md: 'Switched to tablet layout',
            lg: 'Switched to desktop layout',
            xl: 'Switched to large desktop layout'
        };
        
        this.announceToScreenReader(messages[breakpoint]);
    }
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}
```

## Accessibility Responsive Features

### Screen Reader Navigation
```css
/* Screen reader responsive announcements */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}

/* Responsive focus indicators */
.virtual-item:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
    
    /* Larger focus indicators on mobile */
    @media (max-width: 767px) {
        outline-width: 3px;
        outline-offset: 3px;
    }
}

/* Skip links for keyboard navigation */
.skip-to-gallery {
    position: absolute;
    top: -40px;
    left: 6px;
    background: var(--color-white);
    color: var(--color-black);
    padding: 8px;
    text-decoration: none;
    border-radius: 4px;
    z-index: 1000;
    
    &:focus {
        top: 6px;
    }
    
    /* Responsive skip link positioning */
    @media (max-width: 767px) {
        left: var(--space-sm);
        right: var(--space-sm);
        text-align: center;
        
        &:focus {
            top: env(safe-area-inset-top, 6px);
        }
    }
}
```

### Touch and Keyboard Navigation
```css
/* Enhanced touch targets for mobile */
@media (max-width: 767px) {
    .gallery-controls button,
    .year-nav-btn,
    .lightbox-trigger {
        min-height: 44px;
        min-width: 44px;
        padding: var(--space-md);
    }
    
    /* Increased spacing between interactive elements */
    .year-navigation {
        gap: var(--space-md);
    }
}

/* Keyboard navigation improvements */
.virtual-item[tabindex="0"] {
    cursor: pointer;
    
    &:focus {
        /* Ensure focused items are visible */
        scroll-margin: 100px;
    }
}

/* Responsive keyboard shortcuts info */
.keyboard-shortcuts {
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: rgba(0, 0, 0, 0.8);
    color: white;
    padding: var(--space-md);
    border-radius: 8px;
    font-size: var(--font-size-sm);
    
    /* Hide on mobile, show on larger screens */
    display: none;
    
    @media (min-width: 768px) {
        display: block;
    }
    
    /* Show on focus for keyboard users */
    &:focus-within {
        display: block;
    }
}
```

## Dark Mode and High Contrast Support

### Responsive Dark Mode
```css
/* Dark mode with responsive adjustments */
@media (prefers-color-scheme: dark) {
    .virtual-gallery-container {
        background: var(--color-gray-900);
        border-color: var(--color-gray-700);
    }
    
    .gallery-header {
        background: var(--color-gray-800);
        border-color: var(--color-gray-700);
    }
    
    .virtual-item {
        background: var(--color-gray-800);
        
        /* Enhanced contrast on mobile dark mode */
        @media (max-width: 767px) {
            border: 1px solid var(--color-gray-700);
        }
    }
    
    .year-nav-btn {
        background: var(--color-gray-700);
        color: var(--color-gray-100);
        border-color: var(--color-gray-600);
        
        &.active {
            background: var(--color-red);
            border-color: var(--color-red);
        }
    }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
    .virtual-item {
        border: 2px solid currentColor;
    }
    
    .year-nav-btn {
        border-width: 2px;
        font-weight: 700;
    }
    
    /* Stronger focus indicators */
    .virtual-item:focus {
        outline-width: 4px;
        outline-offset: 4px;
    }
}
```

## Print Styles

### Print-Optimized Layout
```css
/* Print styles for gallery */
@media print {
    .virtual-gallery-container {
        /* Print optimization */
        height: auto;
        margin: 0;
        box-shadow: none;
        border: 1px solid #ccc;
    }
    
    .gallery-header {
        /* Simplified header for print */
        position: static;
        border-bottom: 2px solid #000;
        
        .gallery-stats {
            font-size: 12pt;
        }
    }
    
    .virtual-gallery-content {
        /* Grid layout for print */
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12pt;
        padding: 12pt;
        
        /* Single column on narrow paper */
        @page {
            size: A4;
            margin: 1in;
        }
        
        @media (max-width: 6in) {
            grid-template-columns: 1fr;
        }
    }
    
    .virtual-item {
        /* Print-friendly styling */
        break-inside: avoid;
        border: 1px solid #ccc;
        border-radius: 0;
        
        .gallery-overlay {
            /* Always show overlay information in print */
            opacity: 1;
            transform: none;
            position: static;
            background: transparent;
            color: #000;
            padding: 6pt;
        }
    }
    
    /* Hide interactive elements */
    .year-navigation,
    .lightbox-trigger,
    .gallery-controls {
        display: none;
    }
}
```

This comprehensive responsive specification ensures the virtual gallery components work optimally across all devices, screen sizes, and accessibility requirements while maintaining performance and visual consistency.