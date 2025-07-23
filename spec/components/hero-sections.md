# Hero Sections Specification

## Overview

Hero sections in A Lo Cubano Boulder Fest serve as dramatic visual entry points that immediately establish context and atmosphere for each page. The design employs a consistent architecture while allowing for semantic variations based on page purpose and content strategy.

## Architecture

### Core Hero Structure

All hero sections follow a consistent architectural pattern:

```html
<section class="gallery-hero-splash">
    <div class="hero-image-container">
        <img id="hero-splash-image" 
             src="" 
             alt="[Semantic alt text describing the specific context]" 
             class="hero-splash-img hero-splash-img--top-center">
    </div>
</section>
```

**CSS Classes:**
```css
/* Base hero image styling */
.hero-splash-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center; /* Default positioning */
  transition: opacity var(--duration-slow) var(--easing-ease-out);
}

/* Object position variants */
.hero-splash-img--top-center {
  object-position: top center;
}

.hero-splash-img--center-center {
  object-position: center center;
}

.hero-splash-img--bottom-center {
  object-position: bottom center;
}

.hero-splash-img--top-left {
  object-position: top left;
}

.hero-splash-img--top-right {
  object-position: top right;
}
```

### Implementation Files

- **HTML Structure**: All pages in `/pages/` directory
- **CSS Styling**: `/css/components.css` (lines 202-241)
- **JavaScript Functionality**: `/js/gallery-hero.js`
- **Cache Management**: `/js/image-cache-manager.js`

## Hero Variants by Page

### 1. Home Page Hero (`/pages/home.html`)

**Context**: Primary landing page establishing festival identity and energy

```html
<section class="gallery-hero-splash">
    <div class="hero-image-container">
        <img id="hero-splash-image" 
             src="" 
             alt="Dynamic festival photo showcasing A Lo Cubano Boulder Fest celebration with dancers, musicians, and Cuban culture" 
             class="hero-splash-img hero-splash-img--top-center">
    </div>
</section>
```

**Semantic Purpose**: Captures the full festival experience - community, culture, and celebration

### 2. Gallery Page Hero (`/pages/gallery.html`)

**Context**: Photo gallery hub for exploring past festivals

```html
<img id="hero-splash-image" 
     src="" 
     alt="Memorable gallery photos from past A Lo Cubano Boulder Fest events showcasing dancers, performances, and community moments" 
     class="hero-splash-img hero-splash-img--top-center">
```

**Semantic Purpose**: Previews the visual storytelling within the gallery sections

### 3. About Page Hero (`/pages/about.html`)

**Context**: Story and mission-focused page

```html
<img id="hero-splash-image" 
     src="" 
     alt="Behind-the-scenes moments from A Lo Cubano Boulder Fest, showcasing our community, organizers, and festival atmosphere" 
     class="hero-splash-img hero-splash-img--top-center">
```

**Semantic Purpose**: Emphasizes human stories and organizational culture

### 4. Artists Page Hero (`/pages/artists.html`)

**Context**: Instructor and performer showcase

```html
<img id="hero-splash-image" 
     src="" 
     alt="Featured Cuban salsa instructors and artists performing at A Lo Cubano Boulder Fest, showcasing authentic dance techniques" 
     class="hero-splash-img hero-splash-img--top-center">
```

**Semantic Purpose**: Highlights talent, skill, and authentic Cuban artistry

### 5. Schedule Page Hero (`/pages/schedule.html`)

**Context**: Event programming and logistics

```html
<img id="hero-splash-image" 
     src="" 
     alt="Workshop sessions and dance classes in action at A Lo Cubano Boulder Fest, showing the vibrant learning environment" 
     class="hero-splash-img hero-splash-img--top-center">
```

**Semantic Purpose**: Focuses on educational activities and learning experiences

### 6. Tickets Page Hero (`/pages/tickets.html`)

**Context**: Purchase experience and attendee benefits

```html
<img id="hero-splash-image" 
     src="" 
     alt="Excited festival attendees enjoying A Lo Cubano Boulder Fest events, highlighting the experience visitors can expect" 
     class="hero-splash-img hero-splash-img--top-center">
```

**Semantic Purpose**: Emphasizes attendee experience and value proposition

## CSS Implementation

### Base Hero Styles (`/css/components.css`)

```css
/* Hero Image Transitions */
.gallery-hero-splash {
  position: relative;
  width: 100%;
  height: 60vh;
  min-height: 400px;
  overflow: hidden;
  margin-bottom: var(--space-3xl);
}

.hero-image-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.hero-splash-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center center; /* Default positioning */
  transition: opacity var(--duration-slow) var(--easing-ease-out);
}

/* Object position variants - replaces inline styles */
.hero-splash-img--top-center {
  object-position: top center;
}

.hero-splash-img--center-center {
  object-position: center center;
}

.hero-splash-img--bottom-center {
  object-position: bottom center;
}

.hero-splash-img--top-left {
  object-position: top left;
}

.hero-splash-img--top-right {
  object-position: top right;
}
```

**Migration from Inline Styles:**
```html
<!-- ❌ Avoid: Inline styles with !important -->
<img class="hero-splash-img" style="object-position: top center !important;">

<!-- ✅ Preferred: CSS classes -->
<img class="hero-splash-img hero-splash-img--top-center">
```

### Loading States

```css
.hero-splash-img.loading {
  opacity: 0.8;
}

.hero-splash-img.loaded {
  opacity: 1;
}
```

### Mobile Optimization (`/css/mobile-overrides.css`)

```css
@media (max-width: 768px) {
  .gallery-hero-splash {
    height: 50vh;
    min-height: 300px;
  }
}
```

## Typography Integration

Hero sections work in harmony with the typography-forward design system by providing visual context that complements the text-heavy content sections that follow. The hero image serves as a visual "title" that the typography builds upon.

### Design System Integration

- **Spacing**: Heroes use `margin-bottom: var(--space-3xl)` to create proper separation from typography sections
- **Height Scale**: Responsive heights that maintain proportions across devices
- **Visual Hierarchy**: Heroes establish primary visual impact, allowing typography to provide semantic meaning

## JavaScript Functionality

### Dynamic Image Loading (`/js/gallery-hero.js`)

The hero system implements sophisticated image management:

```javascript
// Configuration for fallback images
const STATIC_HERO_FALLBACKS = {
    'home': '/images/heroes/home-hero.jpg',
    'about': '/images/heroes/about-hero.jpg',
    'artists': '/images/heroes/artists-hero.jpg',
    'schedule': '/images/heroes/schedule-hero.jpg',
    'gallery': '/images/heroes/gallery-hero.jpg',
    'tickets': '/images/heroes/tickets-hero.jpg',
    'donations': '/images/heroes/donations-hero.jpg',
    'default': '/images/hero-default.jpg'
};
```

### Loading Process

1. **Initialization**: Detects page context and DOM readiness
2. **Image Assignment**: Uses ImageCacheManager to select appropriate hero image
3. **Progressive Loading**: Shows fallback while loading, then upgrades to assigned image
4. **Error Handling**: Graceful fallback to static images when dynamic loading fails

### Key Functions

```javascript
// Load hero image asynchronously
async function loadHeroImage(heroElement) {
    const pageId = window.ImageCacheManager?.getCurrentPageId() || 'unknown';
    
    try {
        const imageData = await window.ImageCacheManager.getImageForPage();
        if (imageData && imageData.url) {
            heroElement.src = imageData.url;
            heroElement.classList.remove('loading');
            heroElement.classList.add('loaded');
        }
    } catch (error) {
        heroElement.src = '/images/hero-default.jpg';
    }
}
```

## Background Image Handling

### Google Drive Integration

Heroes leverage the Google Drive API for dynamic content:

- **Production**: Uses Vercel serverless functions at `/api/image-proxy/[fileId]`
- **Development**: Falls back to static fallback images
- **Caching**: Implements intelligent cache-first strategy with background refresh

### Performance Optimization

- **Lazy Loading**: Not implemented for heroes (above-the-fold content)
- **Progressive Enhancement**: Starts with default, upgrades to dynamic
- **Responsive Images**: CSS handles sizing, JavaScript handles source selection

## Content Layering

Heroes support overlay content when needed:

### Loading Overlay System

```css
.hero-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
  opacity: 1;
  transition: opacity 0.5s ease-in-out;
}

.hero-loading-overlay.fade-out {
  opacity: 0;
  pointer-events: none;
}
```

## Responsive Behavior

### Viewport Adaptations

- **Desktop**: `height: 60vh; min-height: 400px`
- **Mobile**: `height: 50vh; min-height: 300px`
- **Object Position**: Always `top center` to maintain focus on subjects

### Breakpoint Strategy

The hero system uses a mobile-first approach with desktop protection:

```css
/* Base mobile styles */
.gallery-hero-splash {
  height: 50vh;
  min-height: 300px;
}

/* Desktop enhancement */
@media (min-width: 769px) {
  .gallery-hero-splash {
    height: 60vh;
    min-height: 400px;
  }
}
```

## Interactive Elements

Heroes are primarily visual containers but support interaction through:

### Error State Debugging

In development mode, heroes display error messages for troubleshooting:

```javascript
function showHeroError(message) {
    if (CONFIG.DEBUG) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'position: absolute; top: 10px; left: 10px; background: rgba(255,0,0,0.9); color: white; padding: 10px; z-index: 9999; font-size: 12px;';
        errorDiv.textContent = `Hero Error: ${message}`;
        document.body.appendChild(errorDiv);
        setTimeout(() => errorDiv.remove(), 5000);
    }
}
```

## Performance Considerations

### Critical Performance Metrics

1. **Time to First Paint**: Heroes should render immediately with fallback
2. **Largest Contentful Paint**: Heroes often represent LCP element
3. **Layout Shift**: Fixed dimensions prevent CLS during image loading

### Optimization Strategies

- **Immediate Fallback**: Default image loads instantly
- **Background Upgrade**: Dynamic images load without blocking render
- **Transition Smoothing**: Opacity transitions prevent jarring swaps
- **Cache Management**: Intelligent caching reduces repeat requests

### Image Optimization

```javascript
// Create new image element to preload
const tempImg = new Image();
tempImg.onload = function() {
    // Smooth transition to assigned image
    heroImg.style.opacity = '0.7';
    setTimeout(() => {
        heroImg.src = newImageUrl;
        heroImg.style.opacity = '1';
    }, 200);
};
```

## Accessibility Features

### Screen Reader Support

- **Semantic Alt Text**: Each page has contextually appropriate alt text
- **Skip Links**: Allow keyboard navigation past large hero images
- **Focus Management**: Heroes don't trap keyboard focus

### Alt Text Strategy

Alt text is crafted to be descriptive and contextual:

- **Home**: "Dynamic festival photo showcasing A Lo Cubano Boulder Fest celebration..."
- **Gallery**: "Memorable gallery photos from past A Lo Cubano Boulder Fest events..."
- **About**: "Behind-the-scenes moments from A Lo Cubano Boulder Fest..."

## Browser Compatibility

### Supported Features

- **CSS Grid**: Used for hero container layout
- **CSS Custom Properties**: All styling uses design tokens
- **ES6 Modules**: JavaScript uses modern module system
- **Intersection Observer**: Used in related lazy loading systems

### Fallback Strategy

- **Static Images**: Always available as ultimate fallback
- **Graceful Degradation**: Works without JavaScript
- **Progressive Enhancement**: Adds dynamic features when available

## Future Enhancements

### Potential Improvements

1. **Video Heroes**: Support for background video content
2. **Parallax Effects**: Subtle scroll-based animations
3. **Content Overlays**: Text or call-to-action overlays on heroes
4. **A/B Testing**: Dynamic hero selection based on user segments
5. **WebP Support**: Modern image format optimization

### Implementation Considerations

Any future enhancements should maintain:

- **Performance**: Heroes should never block page render
- **Accessibility**: All interactive elements must be keyboard accessible
- **Mobile Optimization**: Touch-friendly and performant on mobile devices
- **Typography Integration**: Heroes should complement, not compete with typography

## Testing Requirements

### Manual Testing

- **Page Context**: Verify appropriate hero image loads for each page
- **Error Handling**: Test with network failures and invalid images
- **Responsive Design**: Verify proper scaling across all viewport sizes
- **Loading States**: Confirm smooth transitions between loading and loaded states

### Automated Testing

```javascript
// Example test cases from existing test suite
describe('Hero Image Loading', () => {
  test('should load appropriate hero image for page context', async () => {
    // Test implementation
  });
  
  test('should handle image loading errors gracefully', async () => {
    // Test implementation
  });
  
  test('should provide appropriate fallback images', async () => {
    // Test implementation
  });
});
```

---

## Summary

The hero section system provides a robust, performant, and accessible foundation for visual storytelling across all pages of A Lo Cubano Boulder Fest. The architecture balances visual impact with technical performance, ensuring fast load times while delivering engaging, contextually appropriate imagery that supports the site's typography-forward design philosophy.

The system's strength lies in its consistency of implementation combined with semantic flexibility, allowing each page to express its unique purpose while maintaining a cohesive brand experience. The sophisticated JavaScript layer adds dynamic capabilities while ensuring graceful degradation for all users.