# Virtual Gallery Accessibility Specifications

## Overview
Comprehensive accessibility specifications for virtual scrolling gallery components, ensuring WCAG 2.1 AA compliance and inclusive user experience across all assistive technologies and user needs.

## Accessibility Principles

### Core WCAG 2.1 AA Requirements
1. **Perceivable**: Information and UI components must be presentable in ways users can perceive
2. **Operable**: UI components and navigation must be operable by all users
3. **Understandable**: Information and UI operation must be understandable
4. **Robust**: Content must be robust enough for various assistive technologies

### Virtual Gallery Specific Considerations
- Large datasets require efficient navigation patterns
- Dynamic content needs proper announcements
- Virtual DOM elements require careful focus management
- Performance optimizations must not compromise accessibility

## Screen Reader Support

### ARIA Structure for Virtual Gallery
```html
<!-- Main Gallery Container -->
<div 
    class="virtual-gallery-container"
    role="region"
    aria-label="Festival photo gallery"
    aria-describedby="gallery-description">
    
    <!-- Gallery Description -->
    <div id="gallery-description" class="sr-only">
        Virtual photo gallery with 342 images from A Lo Cubano Boulder Fest 2025. 
        Use arrow keys to navigate between photos, Enter to open in lightbox, 
        and Tab to access gallery controls.
    </div>
    
    <!-- Gallery Header -->
    <header class="gallery-header">
        <nav class="year-navigation" role="tablist" aria-label="Festival years">
            <button 
                class="year-nav-btn active"
                role="tab"
                aria-selected="true"
                aria-controls="gallery-content-2025"
                id="tab-2025"
                tabindex="0">
                2025
            </button>
            <button 
                class="year-nav-btn"
                role="tab"
                aria-selected="false"
                aria-controls="gallery-content-2024"
                id="tab-2024"
                tabindex="-1">
                2024
            </button>
            <button 
                class="year-nav-btn"
                role="tab"
                aria-selected="false"
                aria-controls="gallery-content-2023"
                id="tab-2023"
                tabindex="-1">
                2023
            </button>
        </nav>
        
        <div class="gallery-stats" role="status" aria-live="polite">
            <span class="photo-count" aria-label="Photo count">342 photos</span>
            <span class="year-indicator" aria-label="Current year">2025</span>
        </div>
    </header>
    
    <!-- Virtual Scrolling Area -->
    <div 
        class="virtual-gallery-viewport"
        role="grid"
        aria-label="Photo grid"
        aria-rowcount="-1"
        aria-colcount="3"
        tabindex="0"
        aria-activedescendant="photo-item-0">
        
        <!-- Live Region for Dynamic Announcements -->
        <div 
            class="gallery-announcements sr-only"
            aria-live="polite"
            aria-atomic="true">
        </div>
        
        <!-- Virtual Content Area -->
        <div class="virtual-gallery-content">
            <!-- Virtual Items (dynamically rendered) -->
            <div 
                class="gallery-item virtual-item"
                role="gridcell"
                aria-posinset="1"
                aria-setsize="342"
                id="photo-item-0"
                tabindex="-1"
                aria-describedby="photo-description-0">
                
                <img 
                    class="gallery-image"
                    src="..."
                    alt="Festival dancers in vibrant red and white traditional Cuban attire performing salsa in the main ballroom"
                    role="img"
                    loading="lazy"
                    decoding="async" />
                
                <div class="gallery-overlay">
                    <h3 class="gallery-title" id="photo-title-0">
                        Opening Night Performance
                    </h3>
                    <p class="gallery-meta" id="photo-description-0">
                        Saturday evening, Main Ballroom. 
                        Traditional Cuban salsa performance by Havana Dance Company.
                    </p>
                    
                    <button 
                        class="lightbox-trigger"
                        aria-label="Open Opening Night Performance image in full size lightbox"
                        aria-describedby="photo-description-0">
                        <svg class="icon-expand" aria-hidden="true">
                            <!-- Expand icon -->
                        </svg>
                        <span class="sr-only">View full size</span>
                    </button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Loading State -->
    <div 
        class="gallery-loading-state"
        role="status"
        aria-live="polite"
        aria-label="Loading gallery content">
        <div class="loading-spinner" aria-hidden="true"></div>
        <p class="loading-text">Loading photos...</p>
    </div>
</div>
```

### Dynamic Content Announcements
```javascript
class VirtualGalleryA11yManager {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.announcer = this.createLiveRegion();
        this.lastAnnouncedIndex = -1;
        this.announcementQueue = [];
        
        this.setupA11yFeatures();
    }
    
    createLiveRegion() {
        const announcer = document.createElement('div');
        announcer.className = 'gallery-announcements sr-only';
        announcer.setAttribute('aria-live', 'polite');
        announcer.setAttribute('aria-atomic', 'true');
        
        this.gallery.container.appendChild(announcer);
        return announcer;
    }
    
    setupA11yFeatures() {
        // Announce when new images come into view
        this.gallery.on('items-rendered', (data) => {
            this.announceNewContent(data);
        });
        
        // Announce year changes
        this.gallery.on('year-changed', (data) => {
            this.announce(
                `Switched to ${data.year} gallery. Loading ${data.photoCount} photos.`,
                'assertive'
            );
        });
        
        // Announce loading states
        this.gallery.on('loading-start', () => {
            this.announce('Loading gallery content...', 'polite');
        });
        
        this.gallery.on('loading-complete', (data) => {
            this.announce(
                `Gallery loaded successfully. ${data.itemCount} photos available.`,
                'polite'
            );
        });
        
        // Announce errors
        this.gallery.on('error', (error) => {
            this.announce(
                `Error loading gallery: ${error.message}. Please try again.`,
                'assertive'
            );
        });
    }
    
    announceNewContent(data) {
        const { startIndex, endIndex, totalItems } = data;
        const itemCount = endIndex - startIndex + 1;
        
        // Avoid over-announcing during rapid scrolling
        if (Math.abs(startIndex - this.lastAnnouncedIndex) > 10) {
            this.announce(
                `Showing photos ${startIndex + 1} to ${endIndex + 1} of ${totalItems}`,
                'polite'
            );
            this.lastAnnouncedIndex = startIndex;
        }
    }
    
    announce(message, priority = 'polite') {
        // Queue announcements to avoid conflicts
        this.announcementQueue.push({ message, priority });
        this.processAnnouncementQueue();
    }
    
    processAnnouncementQueue() {
        if (this.announcementQueue.length === 0) return;
        
        const { message, priority } = this.announcementQueue.shift();
        
        // Update live region properties
        this.announcer.setAttribute('aria-live', priority);
        this.announcer.textContent = message;
        
        // Process next announcement after delay
        setTimeout(() => {
            this.processAnnouncementQueue();
        }, 1000);
    }
    
    // Update ARIA attributes for virtual items
    updateVirtualItemA11y(item, index, totalItems) {
        const element = item.element;
        
        // Update position in set
        element.setAttribute('aria-posinset', index + 1);
        element.setAttribute('aria-setsize', totalItems);
        
        // Update IDs for proper relationships
        const itemId = `photo-item-${index}`;
        const titleId = `photo-title-${index}`;
        const descId = `photo-description-${index}`;
        
        element.id = itemId;
        element.setAttribute('aria-describedby', descId);
        
        const title = element.querySelector('.gallery-title');
        const description = element.querySelector('.gallery-meta');
        
        if (title) title.id = titleId;
        if (description) description.id = descId;
        
        // Update lightbox button
        const lightboxBtn = element.querySelector('.lightbox-trigger');
        if (lightboxBtn && title) {
            lightboxBtn.setAttribute(
                'aria-label',
                `Open ${title.textContent} image in full size lightbox`
            );
            lightboxBtn.setAttribute('aria-describedby', descId);
        }
    }
}
```

## Keyboard Navigation

### Keyboard Navigation Patterns
```javascript
class VirtualGalleryKeyboardNavigation {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.currentFocusIndex = 0;
        this.gridColumns = 3; // Dynamic based on layout
        
        this.setupKeyboardHandlers();
        this.setupFocusManagement();
    }
    
    setupKeyboardHandlers() {
        const viewport = this.gallery.viewport;
        
        viewport.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        // Handle year navigation
        const yearNav = this.gallery.container.querySelector('.year-navigation');
        if (yearNav) {
            yearNav.addEventListener('keydown', (e) => {
                this.handleYearNavKeyDown(e);
            });
        }
    }
    
    handleKeyDown(e) {
        const visibleItems = this.gallery.getVisibleItems();
        if (visibleItems.length === 0) return;
        
        let handled = true;
        
        switch (e.key) {
            case 'ArrowRight':
                this.moveFocus(1);
                break;
                
            case 'ArrowLeft':
                this.moveFocus(-1);
                break;
                
            case 'ArrowDown':
                this.moveFocus(this.gridColumns);
                break;
                
            case 'ArrowUp':
                this.moveFocus(-this.gridColumns);
                break;
                
            case 'Home':
                this.moveFocusToIndex(0);
                break;
                
            case 'End':
                this.moveFocusToIndex(this.gallery.totalItems - 1);
                break;
                
            case 'PageDown':
                this.moveFocus(this.gridColumns * 3); // 3 rows
                break;
                
            case 'PageUp':
                this.moveFocus(-this.gridColumns * 3); // 3 rows
                break;
                
            case 'Enter':
            case ' ':
                this.activateCurrentItem();
                break;
                
            default:
                handled = false;
        }
        
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
        }
    }
    
    handleYearNavKeyDown(e) {
        const yearButtons = Array.from(
            e.currentTarget.querySelectorAll('.year-nav-btn')
        );
        const currentIndex = yearButtons.findIndex(btn => btn.tabIndex === 0);
        
        let newIndex = currentIndex;
        
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                newIndex = Math.min(currentIndex + 1, yearButtons.length - 1);
                break;
                
            case 'ArrowLeft':
            case 'ArrowUp':
                newIndex = Math.max(currentIndex - 1, 0);
                break;
                
            case 'Home':
                newIndex = 0;
                break;
                
            case 'End':
                newIndex = yearButtons.length - 1;
                break;
                
            case 'Enter':
            case ' ':
                yearButtons[currentIndex].click();
                return;
        }
        
        if (newIndex !== currentIndex) {
            // Update tabindex for roving tabindex pattern
            yearButtons[currentIndex].tabIndex = -1;
            yearButtons[currentIndex].setAttribute('aria-selected', 'false');
            
            yearButtons[newIndex].tabIndex = 0;
            yearButtons[newIndex].setAttribute('aria-selected', 'true');
            yearButtons[newIndex].focus();
            
            e.preventDefault();
        }
    }
    
    moveFocus(delta) {
        const newIndex = this.clampIndex(this.currentFocusIndex + delta);
        this.moveFocusToIndex(newIndex);
    }
    
    moveFocusToIndex(index) {
        const clampedIndex = this.clampIndex(index);
        
        // Ensure the item is rendered
        this.gallery.ensureItemVisible(clampedIndex);
        
        // Update focus
        this.updateFocus(clampedIndex);
        
        // Announce position change
        this.announcePosition(clampedIndex);
    }
    
    updateFocus(index) {
        // Clear previous focus
        const previousItem = document.getElementById(`photo-item-${this.currentFocusIndex}`);
        if (previousItem) {
            previousItem.tabIndex = -1;
        }
        
        // Set new focus
        const newItem = document.getElementById(`photo-item-${index}`);
        if (newItem) {
            newItem.tabIndex = -1; // Will be set to 0 when focused
            newItem.focus();
            
            // Update aria-activedescendant
            this.gallery.viewport.setAttribute('aria-activedescendant', `photo-item-${index}`);
        }
        
        this.currentFocusIndex = index;
    }
    
    activateCurrentItem() {
        const currentItem = document.getElementById(`photo-item-${this.currentFocusIndex}`);
        if (currentItem) {
            const lightboxBtn = currentItem.querySelector('.lightbox-trigger');
            if (lightboxBtn) {
                lightboxBtn.click();
            }
        }
    }
    
    clampIndex(index) {
        return Math.max(0, Math.min(index, this.gallery.totalItems - 1));
    }
    
    announcePosition(index) {
        const totalItems = this.gallery.totalItems;
        const position = index + 1;
        
        // Calculate row and column
        const row = Math.floor(index / this.gridColumns) + 1;
        const col = (index % this.gridColumns) + 1;
        
        this.gallery.a11yManager.announce(
            `Photo ${position} of ${totalItems}. Row ${row}, column ${col}.`,
            'polite'
        );
    }
    
    // Update grid columns when layout changes
    updateGridColumns(columns) {
        this.gridColumns = columns;
    }
}
```

### Focus Management CSS
```css
/* Focus indicators for virtual gallery */
.virtual-gallery-viewport:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
}

.virtual-item {
    /* Base state - not focusable */
    tabindex: -1;
    border-radius: 8px;
    transition: all 0.2s ease;
    
    /* Focus state */
    &:focus {
        outline: 3px solid var(--color-blue);
        outline-offset: 2px;
        box-shadow: 0 0 0 5px rgba(91, 107, 181, 0.3);
        z-index: 10;
        
        /* Ensure focused item is fully visible */
        scroll-margin: 20px;
    }
    
    /* High contrast focus indicator */
    @media (prefers-contrast: high) {
        &:focus {
            outline-width: 4px;
            outline-offset: 4px;
        }
    }
    
    /* Mobile focus adjustments */
    @media (max-width: 767px) {
        &:focus {
            outline-width: 4px;
            outline-offset: 3px;
        }
    }
}

/* Year navigation focus */
.year-nav-btn {
    &:focus {
        outline: 2px solid var(--color-blue);
        outline-offset: 2px;
        box-shadow: 0 0 0 4px rgba(91, 107, 181, 0.2);
    }
}

/* Skip links for keyboard users */
.skip-to-gallery {
    position: absolute;
    top: -40px;
    left: 6px;
    background: var(--color-white);
    color: var(--color-black);
    border: 2px solid var(--color-blue);
    padding: 8px 16px;
    text-decoration: none;
    border-radius: 4px;
    font-weight: 600;
    z-index: 1000;
    
    &:focus {
        top: 6px;
    }
}

/* Screen reader only content */
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
```

## Touch and Mobile Accessibility

### Touch Target Optimization
```css
/* Enhanced touch targets for mobile accessibility */
@media (max-width: 767px) {
    .virtual-item,
    .year-nav-btn,
    .lightbox-trigger,
    .gallery-control-btn {
        /* WCAG AAA minimum touch target: 44x44px */
        min-height: 44px;
        min-width: 44px;
        padding: var(--space-md);
    }
    
    /* Increased spacing between touch targets */
    .year-navigation {
        gap: var(--space-md);
    }
    
    .gallery-controls {
        gap: var(--space-lg);
    }
}

/* Touch interaction feedback */
.virtual-item {
    /* Subtle touch feedback */
    @media (hover: none) and (pointer: coarse) {
        -webkit-tap-highlight-color: rgba(91, 107, 181, 0.3);
        
        &:active {
            transform: scale(0.98);
            background: rgba(91, 107, 181, 0.1);
        }
    }
}
```

### Voice Control Support
```javascript
class VirtualGalleryVoiceSupport {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.setupVoiceCommands();
    }
    
    setupVoiceCommands() {
        // Add landmark regions for voice navigation
        this.addLandmarkRegions();
        
        // Add voice-friendly labels
        this.addVoiceLabels();
    }
    
    addLandmarkRegions() {
        const container = this.gallery.container;
        
        // Main gallery region
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Photo gallery');
        
        // Navigation landmark
        const header = container.querySelector('.gallery-header');
        if (header) {
            header.setAttribute('role', 'navigation');
            header.setAttribute('aria-label', 'Gallery controls');
        }
        
        // Main content area
        const viewport = container.querySelector('.virtual-gallery-viewport');
        if (viewport) {
            viewport.setAttribute('role', 'main');
            viewport.setAttribute('aria-label', 'Photo grid');
        }
    }
    
    addVoiceLabels() {
        // Add voice-friendly names to interactive elements
        const yearButtons = this.gallery.container.querySelectorAll('.year-nav-btn');
        yearButtons.forEach((btn, index) => {
            const year = btn.textContent.trim();
            btn.setAttribute('aria-label', `Switch to ${year} gallery`);
            btn.setAttribute('data-voice-command', `year ${year}`);
        });
        
        // Add contextual help
        this.addVoiceHelp();
    }
    
    addVoiceHelp() {
        const helpText = document.createElement('div');
        helpText.className = 'voice-help sr-only';
        helpText.setAttribute('aria-label', 'Voice commands help');
        helpText.innerHTML = `
            <p>Voice commands available:</p>
            <ul>
                <li>Say "year 2025" to switch to 2025 gallery</li>
                <li>Say "next photo" to move to next image</li>
                <li>Say "previous photo" to move to previous image</li>
                <li>Say "open lightbox" to view current image full size</li>
            </ul>
        `;
        
        this.gallery.container.appendChild(helpText);
    }
}
```

## Reduced Motion and Performance Accessibility

### Motion Sensitivity Support
```css
/* Comprehensive reduced motion support */
@media (prefers-reduced-motion: reduce) {
    /* Disable all virtual scrolling animations */
    .virtual-item {
        animation: none !important;
        transition: none !important;
        transform: none !important;
    }
    
    /* Disable loading animations */
    .loading-spinner,
    .loading-skeleton {
        animation: none !important;
    }
    
    /* Simplify hover effects */
    .virtual-item:hover {
        transform: none !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
    }
    
    /* Keep essential state changes but make them instant */
    .year-nav-btn.active {
        transition: none !important;
    }
    
    /* Disable scroll-based animations */
    .virtual-gallery-viewport {
        scroll-behavior: auto !important;
    }
}

/* High performance mode for assistive technologies */
.assistive-technology-mode {
    /* Disable complex CSS effects */
    .virtual-item {
        backdrop-filter: none !important;
        filter: none !important;
        transform: none !important;
        transition: none !important;
    }
    
    /* Simplify layout */
    .virtual-gallery-content {
        display: block !important;
    }
    
    .virtual-item {
        display: block !important;
        margin-bottom: var(--space-md) !important;
        width: 100% !important;
    }
}
```

### Performance Accessibility Manager
```javascript
class VirtualGalleryPerformanceA11y {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.isAssistiveTechActive = this.detectAssistiveTechnology();
        this.setupPerformanceOptimizations();
    }
    
    detectAssistiveTechnology() {
        // Detect screen readers and other assistive technology
        return window.navigator.userAgent.includes('NVDA') ||
               window.navigator.userAgent.includes('JAWS') ||
               window.speechSynthesis ||
               window.navigator.userAgent.includes('VoiceOver') ||
               matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    
    setupPerformanceOptimizations() {
        if (this.isAssistiveTechActive) {
            this.enableAssistiveTechMode();
        }
        
        // Monitor performance for accessibility
        this.monitorPerformanceForA11y();
    }
    
    enableAssistiveTechMode() {
        // Add class to trigger simplified styling
        this.gallery.container.classList.add('assistive-technology-mode');
        
        // Reduce virtual scrolling complexity
        this.gallery.updateConfig({
            itemsPerRow: 1,
            overscan: 2,
            animations: false,
            lazyLoading: false // Load all content for screen readers
        });
        
        // Announce mode change
        this.gallery.a11yManager.announce(
            'Gallery optimized for assistive technology. All content loaded.',
            'polite'
        );
    }
    
    monitorPerformanceForA11y() {
        let frameCount = 0;
        let lastTime = performance.now();
        
        const checkPerformance = (currentTime) => {
            frameCount++;
            
            if (currentTime - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                
                // If performance is poor, switch to high performance mode
                if (fps < 30 && !this.gallery.container.classList.contains('assistive-technology-mode')) {
                    this.enableAssistiveTechMode();
                    
                    this.gallery.a11yManager.announce(
                        'Gallery switched to high performance mode for better accessibility.',
                        'polite'
                    );
                }
                
                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(checkPerformance);
        };
        
        requestAnimationFrame(checkPerformance);
    }
}
```

## Error Handling and Recovery

### Accessible Error States
```html
<!-- Error state with accessibility features -->
<div class="gallery-error-state" role="alert" aria-live="assertive">
    <div class="error-icon" aria-hidden="true">
        <svg class="icon-error"><!-- Error icon --></svg>
    </div>
    
    <div class="error-content">
        <h3 class="error-title">Gallery Loading Failed</h3>
        <p class="error-message" id="error-description">
            Unable to load gallery images. This may be due to a network connection issue.
        </p>
        
        <div class="error-actions">
            <button 
                class="retry-button primary"
                aria-describedby="error-description">
                Retry Loading
            </button>
            <button 
                class="fallback-button secondary"
                aria-describedby="error-description">
                View Alternative Gallery
            </button>
        </div>
        
        <details class="error-details">
            <summary>Technical Details</summary>
            <p class="error-technical">
                Error Code: GALLERY_LOAD_FAILED<br>
                Time: <span id="error-timestamp"></span><br>
                User Agent: <span id="error-useragent"></span>
            </p>
        </details>
    </div>
</div>
```

### Recovery Mechanisms
```javascript
class VirtualGalleryA11yRecovery {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.setupErrorRecovery();
    }
    
    setupErrorRecovery() {
        this.gallery.on('error', (error) => {
            this.handleAccessibleError(error);
        });
    }
    
    handleAccessibleError(error) {
        // Announce error to screen readers
        this.gallery.a11yManager.announce(
            `Gallery error: ${error.message}. Retry options available.`,
            'assertive'
        );
        
        // Provide alternative navigation
        this.showAlternativeNavigation();
        
        // Focus management during error
        this.manageFocusDuringError();
        
        // Auto-retry with user consent
        this.offerAutoRetry(error);
    }
    
    showAlternativeNavigation() {
        // Create simplified navigation for error state
        const altNav = document.createElement('nav');
        altNav.className = 'gallery-alt-navigation';
        altNav.setAttribute('aria-label', 'Alternative gallery navigation');
        
        altNav.innerHTML = `
            <h3>Alternative Options</h3>
            <ul>
                <li><a href="/gallery.html">View gallery in standard mode</a></li>
                <li><a href="/gallery-2025.html">Browse 2025 photos individually</a></li>
                <li><button onclick="location.reload()">Refresh page</button></li>
            </ul>
        `;
        
        this.gallery.container.appendChild(altNav);
        
        // Focus first alternative option
        const firstLink = altNav.querySelector('a, button');
        if (firstLink) {
            firstLink.focus();
        }
    }
    
    manageFocusDuringError() {
        // Ensure focus doesn't get lost during error state
        const errorElement = this.gallery.container.querySelector('[role="alert"]');
        if (errorElement) {
            errorElement.tabIndex = -1;
            errorElement.focus();
        }
    }
    
    offerAutoRetry(error) {
        // Only offer auto-retry for network errors
        if (error.type === 'network') {
            const retryDialog = this.createRetryDialog();
            document.body.appendChild(retryDialog);
            
            // Focus on retry option
            const retryBtn = retryDialog.querySelector('.auto-retry-yes');
            if (retryBtn) {
                retryBtn.focus();
            }
        }
    }
    
    createRetryDialog() {
        const dialog = document.createElement('div');
        dialog.className = 'retry-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-labelledby', 'retry-title');
        dialog.setAttribute('aria-describedby', 'retry-description');
        dialog.setAttribute('aria-modal', 'true');
        
        dialog.innerHTML = `
            <div class="dialog-content">
                <h2 id="retry-title">Network Error Detected</h2>
                <p id="retry-description">
                    Would you like to automatically retry loading the gallery 
                    in 5 seconds, or retry now?
                </p>
                
                <div class="dialog-actions">
                    <button class="auto-retry-yes primary">
                        Retry Now
                    </button>
                    <button class="auto-retry-no secondary">
                        Cancel Auto-retry
                    </button>
                </div>
            </div>
        `;
        
        return dialog;
    }
}
```

## Testing and Validation

### Accessibility Testing Checklist
```javascript
class VirtualGalleryA11yTester {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.testResults = [];
    }
    
    runA11yTests() {
        console.log('Running Virtual Gallery Accessibility Tests...');
        
        this.testKeyboardNavigation();
        this.testScreenReaderSupport();
        this.testFocusManagement();
        this.testARIAImplementation();
        this.testColorContrast();
        this.testReducedMotion();
        this.testTouchTargets();
        
        return this.generateReport();
    }
    
    testKeyboardNavigation() {
        const tests = [
            () => this.canTabToGallery(),
            () => this.canNavigateWithArrows(),
            () => this.canActivateWithEnter(),
            () => this.canUseHomeEnd(),
            () => this.canUsePageUpDown()
        ];
        
        tests.forEach((test, index) => {
            try {
                const result = test();
                this.testResults.push({
                    category: 'Keyboard Navigation',
                    test: `Test ${index + 1}`,
                    passed: result,
                    message: result ? 'Pass' : 'Fail'
                });
            } catch (error) {
                this.testResults.push({
                    category: 'Keyboard Navigation',
                    test: `Test ${index + 1}`,
                    passed: false,
                    message: error.message
                });
            }
        });
    }
    
    testScreenReaderSupport() {
        const requiredARIA = [
            'aria-label',
            'aria-describedby',
            'role',
            'aria-live',
            'aria-posinset',
            'aria-setsize'
        ];
        
        requiredARIA.forEach(attr => {
            const hasAttribute = this.gallery.container.querySelector(`[${attr}]`);
            this.testResults.push({
                category: 'Screen Reader Support',
                test: `Has ${attr}`,
                passed: !!hasAttribute,
                message: hasAttribute ? 'Present' : 'Missing'
            });
        });
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            totalTests: this.testResults.length,
            passed: this.testResults.filter(r => r.passed).length,
            failed: this.testResults.filter(r => !r.passed).length,
            results: this.testResults
        };
        
        console.table(this.testResults);
        return report;
    }
}
```

This comprehensive accessibility specification ensures that the virtual gallery components are fully accessible to users with disabilities and compliant with WCAG 2.1 AA standards while maintaining high performance and usability.