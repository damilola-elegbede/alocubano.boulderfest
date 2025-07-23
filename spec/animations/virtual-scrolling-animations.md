# Virtual Scrolling Animation Specifications

## Overview
Animation specifications for virtual scrolling components, focusing on smooth performance, visual continuity, and user feedback. These animations enhance the virtual scrolling experience while maintaining 60fps performance.

## Core Animation Principles

### Performance-First Approach
- All animations use `transform` and `opacity` for GPU acceleration
- Animations are bounded by 16ms budget per frame (60fps)
- `will-change` property is used strategically and cleaned up after animations
- Reduced motion preferences are respected throughout

### Visual Continuity
- Smooth transitions between virtual and real DOM elements
- Consistent easing functions across all virtual scrolling interactions
- Seamless item recycling without visual artifacts
- Progressive disclosure of content during loading states

## Animation Categories

### 1. Item Appearance Animations
Animations for when virtual items come into view or are recycled.

#### Fade In Animation
```css
@keyframes virtualItemFadeIn {
    from {
        opacity: 0;
        transform: translateY(20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.virtual-item.entering {
    animation: virtualItemFadeIn 0.4s var(--ease-out-expo) forwards;
    animation-delay: calc(var(--item-index) * 0.05s);
}

/* Staggered entrance for multiple items */
.virtual-gallery-content.batch-loading .virtual-item {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
    animation: virtualItemFadeIn 0.4s var(--ease-out-expo) forwards;
    animation-delay: calc(var(--item-index) * 0.03s);
}
```

#### Slide In Animation
```css
@keyframes virtualItemSlideIn {
    from {
        opacity: 0;
        transform: translateX(-30px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.virtual-item.slide-entering {
    animation: virtualItemSlideIn 0.3s var(--ease-out-expo) forwards;
}

/* Direction-aware slide animations */
.virtual-item.slide-entering.from-top {
    animation-name: virtualItemSlideInFromTop;
}

.virtual-item.slide-entering.from-bottom {
    animation-name: virtualItemSlideInFromBottom;
}

@keyframes virtualItemSlideInFromTop {
    from {
        opacity: 0;
        transform: translateY(-30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes virtualItemSlideInFromBottom {
    from {
        opacity: 0;
        transform: translateY(30px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

#### Scale Reveal Animation
```css
@keyframes virtualItemScaleReveal {
    from {
        opacity: 0;
        transform: scale(0.8) rotate(-2deg);
    }
    50% {
        opacity: 0.7;
        transform: scale(1.05) rotate(1deg);
    }
    to {
        opacity: 1;
        transform: scale(1) rotate(0deg);
    }
}

.virtual-item.scale-revealing {
    animation: virtualItemScaleReveal 0.5s var(--ease-out-expo) forwards;
    transform-origin: center center;
}
```

### 2. Scroll-Responsive Animations
Animations that respond to scroll velocity and direction.

#### Momentum-Based Scaling
```css
.virtual-gallery-viewport {
    /* Custom property updated by JavaScript */
    --scroll-velocity: 0;
    --scroll-direction: 1; /* 1 for down, -1 for up */
}

.virtual-item {
    /* Subtle scale based on scroll velocity */
    transform: scale(calc(1 - var(--scroll-velocity) * 0.02));
    transition: transform 0.1s ease-out;
    
    /* Prevent excessive scaling */
    transform: scale(max(0.95, min(1, calc(1 - var(--scroll-velocity) * 0.02))));
}

/* More pronounced effect for fast scrolling */
.virtual-gallery-viewport.fast-scrolling .virtual-item {
    transform: scale(calc(1 - var(--scroll-velocity) * 0.05)) 
               rotateX(calc(var(--scroll-direction) * var(--scroll-velocity) * 2deg));
    filter: blur(calc(var(--scroll-velocity) * 0.5px));
}
```

#### Parallax Effect for Items
```css
.virtual-item {
    /* Parallax offset based on scroll position */
    transform: translateY(calc(var(--parallax-offset, 0) * 0.2px));
    transition: transform 0.05s linear;
}

.virtual-item .gallery-image {
    /* Reverse parallax for content */
    transform: translateY(calc(var(--parallax-offset, 0) * -0.1px));
    transition: transform 0.05s linear;
}

/* JavaScript updates --parallax-offset based on item position */
```

#### Scroll Direction Indicators
```css
@keyframes scrollIndicatorPulse {
    0%, 100% {
        opacity: 0.3;
        transform: scale(1);
    }
    50% {
        opacity: 0.8;
        transform: scale(1.1);
    }
}

.scroll-indicator {
    position: fixed;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 60px;
    background: var(--color-blue);
    border-radius: 2px;
    opacity: 0;
    transition: opacity 0.3s ease;
    
    &.scrolling-down {
        opacity: 1;
        animation: scrollIndicatorPulse 1s infinite;
    }
    
    &.scrolling-up {
        opacity: 1;
        animation: scrollIndicatorPulse 1s infinite reverse;
    }
}
```

### 3. Loading State Animations
Animations for various loading states in virtual scrolling.

#### Progressive Loading Skeleton
```css
@keyframes skeletonPulse {
    0% {
        background-position: -200% 0;
    }
    100% {
        background-position: 200% 0;
    }
}

.virtual-item-skeleton {
    background: 
        linear-gradient(
            90deg,
            var(--color-gray-200) 25%,
            var(--color-gray-100) 50%,
            var(--color-gray-200) 75%
        );
    background-size: 200% 100%;
    animation: skeletonPulse 2s infinite;
    
    /* Skeleton shape */
    aspect-ratio: 4/3;
    border-radius: 8px;
    
    /* Staggered loading */
    animation-delay: calc(var(--item-index) * 0.1s);
}

/* Content skeleton elements */
.virtual-item-skeleton::after {
    content: '';
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    height: 40px;
    background: 
        linear-gradient(
            90deg,
            transparent 0%,
            var(--color-gray-300) 25%,
            var(--color-gray-200) 50%,
            var(--color-gray-300) 75%,
            transparent 100%
        );
    background-size: 200% 100%;
    animation: skeletonPulse 2s infinite;
    animation-delay: calc(var(--item-index) * 0.1s + 0.5s);
    border-radius: 4px;
}
```

#### Loading Progress Indicators
```css
@keyframes loadingSpinner {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@keyframes loadingDots {
    0%, 80%, 100% {
        transform: scale(0.8);
        opacity: 0.5;
    }
    40% {
        transform: scale(1);
        opacity: 1;
    }
}

.virtual-loading-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
    
    .loading-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--color-gray-200);
        border-top: 3px solid var(--color-blue);
        border-radius: 50%;
        animation: loadingSpinner 1s linear infinite;
    }
    
    .loading-dots {
        display: flex;
        gap: var(--space-xs);
        
        .dot {
            width: 8px;
            height: 8px;
            background: var(--color-blue);
            border-radius: 50%;
            animation: loadingDots 1.4s infinite;
            
            &:nth-child(1) { animation-delay: 0s; }
            &:nth-child(2) { animation-delay: 0.2s; }
            &:nth-child(3) { animation-delay: 0.4s; }
        }
    }
}
```

### 4. Transition Animations
Smooth transitions between different virtual scrolling states.

#### Year Switch Animation
```css
@keyframes yearSwitchSlideOut {
    from {
        opacity: 1;
        transform: translateX(0) scale(1);
        filter: blur(0px);
    }
    to {
        opacity: 0;
        transform: translateX(-100px) scale(0.95);
        filter: blur(2px);
    }
}

@keyframes yearSwitchSlideIn {
    from {
        opacity: 0;
        transform: translateX(100px) scale(0.95);
        filter: blur(2px);
    }
    to {
        opacity: 1;
        transform: translateX(0) scale(1);
        filter: blur(0px);
    }
}

.virtual-gallery-container.year-switching-out {
    animation: yearSwitchSlideOut 0.4s var(--ease-in-expo) forwards;
}

.virtual-gallery-container.year-switching-in {
    animation: yearSwitchSlideIn 0.4s var(--ease-out-expo) forwards;
    animation-delay: 0.2s;
}

/* Staggered item transitions during year switch */
.virtual-gallery-container.year-switching .virtual-item {
    animation: yearSwitchItemFade 0.3s var(--ease-in-out) forwards;
    animation-delay: calc(var(--item-index) * 0.02s);
}

@keyframes yearSwitchItemFade {
    0% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0;
        transform: scale(0.9);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}
```

#### Smooth Scroll Animation
```css
.virtual-gallery-viewport.smooth-scrolling {
    scroll-behavior: smooth;
    
    /* Enhanced smooth scrolling for supported browsers */
    @supports (scroll-timeline: view()) {
        scroll-timeline: --scroll-timeline block;
        
        .virtual-item {
            animation: itemScrollReveal linear;
            animation-timeline: --scroll-timeline;
            animation-range: entry 0% cover 20%;
        }
    }
}

@keyframes itemScrollReveal {
    from {
        opacity: 0.3;
        transform: translateY(20px) scale(0.95);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* Fallback for browsers without scroll-timeline */
@supports not (scroll-timeline: view()) {
    .virtual-item.in-viewport {
        animation: itemScrollReveal 0.4s var(--ease-out-expo) forwards;
    }
}
```

### 5. Interaction Animations
Animations triggered by user interactions with virtual items.

#### Hover Effects
```css
.virtual-item {
    transition: 
        transform 0.3s var(--ease-out-expo),
        box-shadow 0.3s var(--ease-out-expo),
        filter 0.3s var(--ease-out-expo);
    
    &:hover {
        transform: translateY(-8px) scale(1.02);
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
        filter: brightness(1.05);
        z-index: 10;
        
        .gallery-image {
            transform: scale(1.05);
        }
        
        .gallery-overlay {
            opacity: 1;
            transform: translateY(0);
        }
    }
    
    /* Mobile hover alternative */
    @media (hover: none) and (pointer: coarse) {
        &:active {
            transform: scale(0.98);
            transition-duration: 0.1s;
        }
    }
}

.gallery-image {
    transition: transform 0.4s var(--ease-out-expo);
    transform-origin: center center;
}

.gallery-overlay {
    opacity: 0;
    transform: translateY(100%);
    transition: all 0.3s var(--ease-out-expo);
}
```

#### Click/Tap Ripple Effect
```css
@keyframes rippleExpand {
    from {
        transform: scale(0);
        opacity: 1;
    }
    to {
        transform: scale(4);
        opacity: 0;
    }
}

.virtual-item {
    position: relative;
    overflow: hidden;
}

.ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.6);
    pointer-events: none;
    animation: rippleExpand 0.6s ease-out forwards;
    
    /* Size and position set by JavaScript */
}

/* JavaScript creates ripple on click */
.virtual-item.clicked .ripple-effect {
    animation-play-state: running;
}
```

### 6. Error State Animations
Animations for error states and retry mechanisms.

#### Error Shake Animation
```css
@keyframes errorShake {
    0%, 100% {
        transform: translateX(0);
    }
    10%, 30%, 50%, 70%, 90% {
        transform: translateX(-5px);
    }
    20%, 40%, 60%, 80% {
        transform: translateX(5px);
    }
}

@keyframes errorPulse {
    0%, 100% {
        border-color: var(--color-red);
        box-shadow: 0 0 0 0 rgba(204, 41, 54, 0.4);
    }
    50% {
        border-color: #dc2626;
        box-shadow: 0 0 0 8px rgba(204, 41, 54, 0);
    }
}

.virtual-item.error {
    animation: 
        errorShake 0.5s ease-in-out,
        errorPulse 2s infinite;
    border: 2px solid var(--color-red);
    background: rgba(204, 41, 54, 0.05);
}

.virtual-item.retrying {
    animation: errorPulse 1s infinite;
    
    &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        border: 2px solid var(--color-gray-300);
        border-top: 2px solid var(--color-blue);
        border-radius: 50%;
        animation: loadingSpinner 1s linear infinite;
    }
}
```

## JavaScript Animation Controllers

### 1. Scroll Animation Manager
```javascript
class VirtualScrollAnimationManager {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.animationFrame = null;
        this.lastScrollTop = 0;
        this.scrollVelocity = 0;
        this.scrollDirection = 1;
        
        this.setupScrollAnimations();
    }
    
    setupScrollAnimations() {
        const viewport = this.gallery.viewport;
        
        viewport.addEventListener('scroll', () => {
            if (this.animationFrame) return;
            
            this.animationFrame = requestAnimationFrame(() => {
                this.updateScrollAnimations();
                this.animationFrame = null;
            });
        });
    }
    
    updateScrollAnimations() {
        const viewport = this.gallery.viewport;
        const currentScrollTop = viewport.scrollTop;
        
        // Calculate velocity and direction
        const deltaScroll = currentScrollTop - this.lastScrollTop;
        this.scrollVelocity = Math.abs(deltaScroll);
        this.scrollDirection = deltaScroll > 0 ? 1 : -1;
        
        // Update CSS custom properties
        viewport.style.setProperty('--scroll-velocity', this.scrollVelocity);
        viewport.style.setProperty('--scroll-direction', this.scrollDirection);
        
        // Apply scroll-based classes
        this.updateScrollClasses();
        
        // Update parallax offsets
        this.updateParallaxOffsets();
        
        this.lastScrollTop = currentScrollTop;
    }
    
    updateScrollClasses() {
        const viewport = this.gallery.viewport;
        
        // Fast scrolling detection
        if (this.scrollVelocity > 10) {
            viewport.classList.add('fast-scrolling');
        } else {
            viewport.classList.remove('fast-scrolling');
        }
        
        // Scroll direction classes
        viewport.classList.toggle('scrolling-down', this.scrollDirection > 0);
        viewport.classList.toggle('scrolling-up', this.scrollDirection < 0);
    }
    
    updateParallaxOffsets() {
        const visibleItems = this.gallery.getVisibleItems();
        
        visibleItems.forEach(item => {
            const rect = item.element.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            
            // Calculate parallax offset based on position in viewport
            const parallaxOffset = (rect.top - viewportHeight / 2) / viewportHeight * 100;
            
            item.element.style.setProperty('--parallax-offset', parallaxOffset);
        });
    }
    
    animateItemEntrance(item, direction = 'fade') {
        const element = item.element;
        const index = item.index;
        
        // Set animation delay based on index
        element.style.setProperty('--item-index', index % 10);
        
        // Apply entrance animation class
        element.classList.add('entering', direction);
        
        // Remove class after animation
        setTimeout(() => {
            element.classList.remove('entering', direction);
        }, 600);
    }
    
    animateYearSwitch(oldItems, newItems) {
        // Animate out old items
        oldItems.forEach((item, index) => {
            item.element.style.setProperty('--item-index', index);
            item.element.classList.add('year-switching-out');
        });
        
        // Animate in new items after delay
        setTimeout(() => {
            newItems.forEach((item, index) => {
                item.element.style.setProperty('--item-index', index);
                item.element.classList.add('year-switching-in');
            });
        }, 200);
        
        // Cleanup after animations
        setTimeout(() => {
            [...oldItems, ...newItems].forEach(item => {
                item.element.classList.remove(
                    'year-switching-out', 
                    'year-switching-in'
                );
            });
        }, 800);
    }
}
```

### 2. Interactive Animation Controller
```javascript
class VirtualItemInteractionAnimator {
    constructor(virtualGallery) {
        this.gallery = virtualGallery;
        this.setupInteractionAnimations();
    }
    
    setupInteractionAnimations() {
        // Delegate click events for ripple effect
        this.gallery.container.addEventListener('click', (e) => {
            const item = e.target.closest('.virtual-item');
            if (item) {
                this.createRippleEffect(item, e);
            }
        });
        
        // Setup hover effects with intersection observer
        this.setupHoverAnimations();
    }
    
    createRippleEffect(element, event) {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        const ripple = document.createElement('div');
        ripple.className = 'ripple-effect';
        
        // Calculate ripple size
        const size = Math.max(rect.width, rect.height) * 0.8;
        
        // Position ripple
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${x - size / 2}px`;
        ripple.style.top = `${y - size / 2}px`;
        
        element.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }
    
    setupHoverAnimations() {
        // Use intersection observer for performance
        const hoverObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.enableHoverEffects(entry.target);
                    } else {
                        this.disableHoverEffects(entry.target);
                    }
                });
            },
            { rootMargin: '50px' }
        );
        
        // Observe virtual items
        this.gallery.on('item-created', (item) => {
            hoverObserver.observe(item.element);
        });
        
        this.gallery.on('item-recycled', (item) => {
            hoverObserver.unobserve(item.element);
        });
    }
    
    enableHoverEffects(element) {
        element.classList.add('hover-enabled');
    }
    
    disableHoverEffects(element) {
        element.classList.remove('hover-enabled');
    }
}
```

## Performance Guidelines

### Animation Budget Management
```javascript
class AnimationBudgetManager {
    constructor(maxConcurrentAnimations = 10) {
        this.maxConcurrent = maxConcurrentAnimations;
        this.activeAnimations = new Set();
        this.queuedAnimations = [];
    }
    
    requestAnimation(element, animationConfig) {
        if (this.activeAnimations.size < this.maxConcurrent) {
            this.startAnimation(element, animationConfig);
        } else {
            this.queuedAnimations.push({ element, animationConfig });
        }
    }
    
    startAnimation(element, config) {
        this.activeAnimations.add(element);
        
        // Apply animation
        element.classList.add(config.className);
        
        // Track completion
        const cleanup = () => {
            this.activeAnimations.delete(element);
            element.classList.remove(config.className);
            
            // Start queued animation
            if (this.queuedAnimations.length > 0) {
                const next = this.queuedAnimations.shift();
                this.startAnimation(next.element, next.animationConfig);
            }
        };
        
        // Use animation events or timeout
        if (config.duration) {
            setTimeout(cleanup, config.duration);
        } else {
            element.addEventListener('animationend', cleanup, { once: true });
        }
    }
}
```

### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
    /* Disable all virtual scrolling animations */
    .virtual-item.entering,
    .virtual-item.slide-entering,
    .virtual-item.scale-revealing {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
    }
    
    /* Simplify transitions */
    .virtual-item {
        transition: none !important;
    }
    
    /* Keep essential feedback animations but make them instant */
    .virtual-item.error {
        animation: none !important;
        border: 2px solid var(--color-red) !important;
    }
    
    /* Disable loading animations */
    .virtual-item-skeleton {
        animation: none !important;
        background: var(--color-gray-200) !important;
    }
    
    .loading-spinner {
        animation: none !important;
        border-color: var(--color-blue) !important;
    }
}
```

This comprehensive animation specification provides smooth, performant animations for virtual scrolling components while maintaining accessibility and performance standards.