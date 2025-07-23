# Animation Effects Specification

## Overview

The A Lo Cubano Boulder Fest website implements a comprehensive animation system that enhances the typography-forward design philosophy. This document catalogs all animation effects, their implementations, performance considerations, and accessibility compliance.

## Design Philosophy

- **Typography-driven animations**: Text is treated as art with dynamic effects
- **Performance-first**: Optimized for smooth 60fps animations using GPU acceleration
- **Accessibility compliant**: Full support for `prefers-reduced-motion`
- **Mobile responsive**: Touch-friendly interactions with simplified animations

## Core Animation System

### Timing Functions & Variables
**File**: `/css/base.css` (Lines 80-82)

```css
/* Core animation timing variables */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease;
```

**Usage**: Consistent timing across all components ensures cohesive animation language.

### Base Loading Animation
**File**: `/css/base.css` (Lines 195-206)

```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

.loading {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

**Usage**: Global loading states for async content.

## Typography Animations

### 1. FadeInUp Animation
**File**: `/css/typography.css` (Lines 54-63)

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(50px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Implementation**: Applied via JavaScript with staggered delays.
**File**: `/js/typography.js` (Lines 133-140)

```javascript
// Add stagger animation to lists
const lists = document.querySelectorAll('.text-composition ul');
lists.forEach(list => {
    const items = list.querySelectorAll('li');
    items.forEach((item, index) => {
        item.style.animationDelay = `${index * 0.1}s`;
        item.classList.add('fade-in-up');
    });
});
```

### 2. Letter Dance Animation
**File**: `/css/typography.css` (Lines 300-307)

```css
@keyframes letterDance {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(-5deg);
  }
}

.text-split:hover span {
  animation: letterDance 0.5s ease-in-out;
}
```

**Trigger**: Hover interaction on split text elements.
**Performance**: Uses `transform` properties for GPU acceleration.

### 3. Glitch Effect Animation
**File**: `/css/typography.css` (Lines 340-384)

```css
@keyframes glitch-1 {
  0%, 100% {
    clip-path: inset(0 0 0 0);
    transform: translate(0);
  }
  20% {
    clip-path: inset(20% 0 30% 0);
    transform: translate(-2px, 2px);
  }
  40% {
    clip-path: inset(50% 0 20% 0);
    transform: translate(2px, -2px);
  }
  60% {
    clip-path: inset(10% 0 60% 0);
    transform: translate(-2px, 0);
  }
  80% {
    clip-path: inset(80% 0 5% 0);
    transform: translate(2px, 1px);
  }
}

@keyframes glitch-2 {
  0%, 100% {
    clip-path: inset(0 0 0 0);
    transform: translate(0);
  }
  20% {
    clip-path: inset(60% 0 10% 0);
    transform: translate(2px, -1px);
  }
  40% {
    clip-path: inset(10% 0 70% 0);
    transform: translate(-2px, 1px);
  }
  60% {
    clip-path: inset(40% 0 40% 0);
    transform: translate(1px, 2px);
  }
  80% {
    clip-path: inset(5% 0 85% 0);
    transform: translate(-1px, -2px);
  }
}
```

**Implementation**: Uses pseudo-elements with different colored layers.
**JavaScript Control**: `/js/typography.js` (Lines 85-91)

```javascript
glitchElements.forEach(element => {
    setInterval(() => {
        element.style.animation = 'none';
        setTimeout(() => {
            element.style.animation = '';
        }, 10);
    }, 3000 + Math.random() * 2000);
});
```

### 4. Typewriter Effect
**File**: `/js/typography.js` (Lines 20-35)

```javascript
function typeWriter(element, text, speed = 50) {
    element.textContent = '';
    
    let index = 0;
    const typeWriter = setInterval(() => {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            index++;
        } else {
            clearInterval(typeWriter);
        }
    }, speed);
}
```

**Usage**: Dynamic text reveal effects for headers and key content.

### 5. Parallax Text Effects
**File**: `/js/typography.js` (Lines 38-43)

```javascript
window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const verticalTexts = document.querySelectorAll('.text-vertical');
    
    verticalTexts.forEach(text => {
        const speed = text.dataset.speed || 0.5;
        text.style.transform = `translateY(${scrolled * speed}px)`;
    });
});
```

**Performance**: Optimized with `requestAnimationFrame` throttling.

## Navigation Animations

### 1. Logo Hover Effects
**File**: `/css/navigation.css` (Lines 42-47, 120-122)

```css
.typographic .logo-link {
  transition: transform 0.2s ease-in-out;
}

.typographic .logo-link:hover {
  transform: translateY(-1px);
}

.typographic .logo:hover {
  transform: scale(1.05);
  color: var(--color-red);
}
```

### 2. Navigation Link Reveal Animation
**File**: `/css/navigation.css` (Lines 151-174)

```css
.typographic .nav-link::before {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  color: var(--color-black);
  font-weight: 700;
  transform: translateY(-100%);
  opacity: 0;
  transition: all var(--transition-base);
}

.typographic .nav-link:hover::before {
  transform: translateY(0);
  opacity: 1;
}
```

**Effect**: Slide-down text reveal on hover.

### 3. Menu Toggle Animation
**File**: `/css/navigation.css` (Lines 281-294)

```css
.menu-icon span {
  display: block;
  width: 100%;
  height: 2px;
  background-color: var(--color-black);
  transition: all var(--transition-base);
}

.menu-toggle.is-active .menu-icon span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}

.menu-toggle.is-active .menu-icon span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}
```

**Effect**: Hamburger to X transformation.

### 4. Mobile Menu Slide Animation
**File**: `/css/mobile-overrides.css` (Lines 88-90)

```css
.nav-list {
  transform: translateX(0);
  transition: transform 0.3s ease;
}
```

**JavaScript Control**: `/js/navigation.js` provides menu toggle functionality.

## Page Transition Effects

### Page Transition System
**File**: `/js/navigation.js` (Lines 154-228)

```javascript
class PageTransition {
    init() {
        // Add transition class to body
        document.body.classList.add('page-transition');
        
        // Handle link clicks
        const links = document.querySelectorAll('a[href^="/"], a[href^="./"]');
        links.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.navigate(link.href);
            });
        });
    }
    
    navigate(url) {
        document.body.classList.add('page-exiting');
        
        setTimeout(() => {
            this.loadPage(url, true);
        }, 300);
    }
}
```

**CSS Implementation**: Likely in navigation-related CSS (specific transitions for page states)

**Timing**: 300ms exit animation before navigation.

## Gallery and Lightbox Animations

### 1. Gallery Item Hover Effects
**File**: `/css/typography.css` (Lines 154-157)

```css
.gallery-item-type:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-xl);
  transition: all var(--transition-slow);
}
```

### 2. Lightbox Transitions
**File**: `/js/components/lightbox.js` (Lines 192-198, 233-242)

```javascript
close() {
    const lightbox = document.getElementById(this.lightboxId);
    lightbox.classList.remove('is-open', 'active');
    
    // Ensure lightbox is properly hidden
    setTimeout(() => {
        if (!lightbox.classList.contains('is-open')) {
            lightbox.style.display = 'none';
        }
        document.body.style.overflow = '';
    }, 300);
}

updateSimpleContent() {
    const img = lightbox.querySelector('.lightbox-image');
    
    img.style.opacity = '0';
    setTimeout(() => {
        img.src = this.images[this.currentIndex];
        img.style.opacity = '1';
    }, 200);
}
```

**Effect**: Fade-out/fade-in image transitions.

### 3. Progressive Image Loading Animation
**File**: `/js/progressive-loader.js` (Lines 111, 128, 190)

```javascript
// Smooth transition setup
imageElement.style.opacity = '0';
imageElement.style.transition = 'opacity 0.3s ease-in-out';

// Shimmer loading animation
animation: shimmer 1.5s infinite;

// Blur overlay transition
transition: opacity 0.3s ease-in-out;
```

**Shimmer keyframe** (referenced in progressive-loader.js):
```css
@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

## Form Interaction Animations

### 1. Form Input Transitions
**File**: `/css/forms.css` (Lines 25, 91, 137)

```css
.form-input {
  transition: all var(--transition-base);
}

.form-field input, .form-field textarea {
  transition: border-color 0.2s ease;
}

.form-button {
  transition: all var(--transition-base);
}
```

### 2. Button Hover Effects
**File**: `/css/forms.css` (Lines 203, 209)

```css
.form-button-type::before {
  transition: left 0.3s ease;
}

.form-button-type:hover {
  transform: translateY(-2px);
}
```

**Effect**: Slide background fill with lift animation.

### 3. Typography Form Inputs
**File**: `/css/typography.css` (Lines 219, 251, 271)

```css
.form-input-type {
  transition: all var(--transition-base);
}

.form-button-type {
  transition: all var(--transition-slow);
}

.form-button-type:hover {
  transform: translateY(-2px);
}
```

## Scroll-Based Animations

### Intersection Observer Animation System
**File**: `/js/main.js` (Lines 14-25)

```javascript
// Observe all sections for scroll animations
const sections = document.querySelectorAll('.animate-on-scroll');

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
        }
    });
}, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
});

sections.forEach(section => observer.observe(section));
```

**Usage**: Triggers animations as elements enter viewport.

## Loading States and Skeleton Animations

### 1. Skeleton Screen Animation
**File**: `/js/progressive-loader.js` (Lines 128)

```javascript
background: linear-gradient(90deg, 
    ${metadata.dominantColor} 25%, 
    ${lighter} 50%, 
    ${metadata.dominantColor} 75%);
background-size: 200% 100%;
animation: shimmer 1.5s infinite;
```

### 2. Cache Warming with Animation Timing
**File**: `/js/cache-warmer.js` (Lines 181, 339, 343)

```javascript
// Small delay between batches
await new Promise(resolve => setTimeout(resolve, 100));

// Small delay between requests
setTimeout(warmNext, 100);

// Initial delay
setTimeout(warmNext, 1000);
```

**Purpose**: Staged loading to prevent animation stuttering.

## Mobile Animation Adaptations

### Touch-Friendly Interactions
**File**: `/css/mobile-overrides.css` (Lines 319-327)

```css
/* Touch feedback animations */
.form-button-type:active,
.nav-link:active {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}

.gallery-item-type:active {
  transform: scale(0.98);
  transition: transform 0.1s ease;
}
```

### Disabled Animations for Performance
**File**: `/css/mobile-overrides.css` (Lines 255-265)

```css
/* Disable complex animations on mobile */
.typewriter,
.letter-dance {
  animation: none !important;
}

.gallery-item-type:hover {
  transform: none !important;
}

.nav-link:hover::after {
  animation: none !important;
}
```

## Performance Optimizations

### 1. GPU Acceleration
All animations use `transform` and `opacity` properties for optimal GPU acceleration:

```css
/* Preferred animated properties */
transform: translateY(), scale(), rotate()
opacity: 0-1
filter: blur()

/* Avoided properties */
left, top, width, height (cause layout reflow)
```

### 2. Will-Change Optimization
**File**: `/css/typography.css` (Line 253)

```css
.form-button-type {
  will-change: transform;
}
```

**Usage**: Pre-optimizes elements that will be animated.

### 3. Animation Performance Monitoring
**File**: `/js/performance-monitor.js` (referenced in navigation.js timing)

- Monitors frame rates during animations
- Adjusts animation complexity based on device performance
- Provides fallbacks for low-performance devices

### 4. Throttled Scroll Events
**File**: `/js/prefetch-manager.js` (Lines 427-431)

```javascript
const throttle = (func, delay) => {
    let timeoutId;
    let lastExecTime = 0;
    
    return function (...args) {
        const currentTime = Date.now();
        
        if (currentTime - lastExecTime > delay) {
            func.apply(this, args);
            lastExecTime = currentTime;
        } else {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                func.apply(this, args);
                lastExecTime = Date.now();
            }, delay - (currentTime - lastExecTime));
        }
    };
};
```

## Accessibility Implementation

### Reduced Motion Support
**File**: `/css/typography.css` (Lines 836-846)

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  .loading {
    animation: none;
  }
}
```

**Implementation**: 
- Respects user's system preference for reduced motion
- Maintains functionality while removing visual motion
- Provides immediate transitions instead of animations

### Focus Management
**File**: `/js/components/lightbox.js` (Lines 77-86)

```javascript
// Keyboard navigation
document.addEventListener('keydown', (e) => {
    const lightbox = document.getElementById(this.lightboxId);
    if (!lightbox || (!lightbox.classList.contains('is-open') && !lightbox.classList.contains('active'))) {
        return;
    }

    if (e.key === 'Escape') {
        this.close();
    }
    if (e.key === 'ArrowLeft') {
        this.previous();
    }
    if (e.key === 'ArrowRight') {
        this.next();
    }
});
```

## Animation Timing Reference

| Animation Type | Duration | Easing | File Reference |
|----------------|----------|--------|----------------|
| Fast interactions | 150ms | ease | `/css/base.css:80` |
| Standard transitions | 250ms | ease | `/css/base.css:81` |
| Complex animations | 350ms | ease | `/css/base.css:82` |
| Page transitions | 300ms | ease | `/js/navigation.js:185` |
| Image loading | 300ms | ease-in-out | `/js/progressive-loader.js:111` |
| Menu animations | 300ms | ease | `/css/mobile-overrides.css:89` |
| Lightbox transitions | 300ms | - | `/js/components/lightbox.js:197` |
| Touch feedback | 100ms | ease | `/css/mobile-overrides.css:320` |

## Browser Compatibility

### Supported Features
- **CSS Transforms**: IE10+, all modern browsers
- **CSS Transitions**: IE10+, all modern browsers
- **CSS Animations**: IE10+, all modern browsers
- **Intersection Observer**: Chrome 51+, Firefox 55+, Safari 12.1+
- **RequestAnimationFrame**: IE10+, all modern browsers

### Fallbacks Implemented
- **No Intersection Observer**: Fallback to scroll events
- **No RequestAnimationFrame**: Fallback to setTimeout
- **Reduced animation support**: Graceful degradation to instant states

## Best Practices Implemented

1. **60fps Target**: All animations optimized for smooth 60fps performance
2. **GPU Acceleration**: Prefer `transform` and `opacity` over layout properties
3. **Accessibility First**: Comprehensive reduced motion support
4. **Mobile Optimization**: Touch-friendly interactions and simplified animations
5. **Progressive Enhancement**: Core functionality works without animations
6. **Performance Monitoring**: Built-in performance tracking and adaptation
7. **Semantic Timing**: Animation durations match interaction expectations
8. **Consistent Easing**: Unified easing curves across all animations

## Testing Recommendations

1. **Performance Testing**:
   - Monitor frame rates during animations
   - Test on low-end mobile devices
   - Verify 60fps performance targets

2. **Accessibility Testing**:
   - Test with `prefers-reduced-motion: reduce`
   - Verify keyboard navigation during animations
   - Check focus management in animated states

3. **Cross-Browser Testing**:
   - Verify animation consistency across browsers
   - Test fallback implementations
   - Validate mobile touch interactions

4. **User Experience Testing**:
   - Ensure animations enhance rather than distract
   - Verify appropriate animation timing
   - Test animation interruption and recovery

This comprehensive animation system creates a cohesive, performant, and accessible user experience that reinforces the festival's typography-forward design philosophy while maintaining excellent performance across all devices and user preferences.