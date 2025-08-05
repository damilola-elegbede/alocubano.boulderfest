# Hero Images Specification

## Overview

The festival website uses a **static hero image system** for page headers, designed for simplicity, performance, and reliability.

## Architecture

### Static Image System

- **Location**: `/images/hero/` directory
- **Mapping**: Direct 1:1 mapping from page ID to image filename
- **Format**: JPEG format for optimal balance of quality and file size
- **Loading**: Direct HTML `<img>` element, no JavaScript required

### File Structure

```
/images/hero/
├── home.jpg                     # Home page hero
├── about.jpg                    # About page hero
├── boulder-fest-2025-hero.jpg   # Boulder Fest 2025 event hero (repurposed from schedule.jpg)
├── boulder-fest-2026-hero.jpg   # Boulder Fest 2026 event hero (repurposed from artists.jpg)
├── weekender-2026-09-hero.jpg   # September 2026 Weekender hero (repurposed from gallery.jpg)
├── future-event-hero1.jpg       # Future event hero 1 (repurposed from temp.jpg)
├── gallery-2025.jpg             # 2025 gallery hero (kept as-is)
├── tickets.jpg                  # Tickets page hero
├── donations.jpg                # Donations page hero
├── contact.jpg                  # Contact page hero
└── hero-default.jpg             # Fallback hero image
```

## Implementation

### Page ID to Image Mapping

```javascript
// Top-level pages (keep existing mapping)
const HERO_IMAGES = {
  home: "/images/hero/home.jpg",
  about: "/images/hero/about.jpg",
  tickets: "/images/hero/tickets.jpg",
  donations: "/images/hero/donations.jpg",
  contact: "/images/hero/contact.jpg",
  "gallery-2025": "/images/hero/gallery-2025.jpg",
};

// Event hero mapping according to the simplified strategy
const EVENT_HERO_MAPPING = {
  "boulder-fest-2025": "/images/hero/boulder-fest-2025-hero.jpg",
  "boulder-fest-2026": "/images/hero/boulder-fest-2026-hero.jpg",
  "weekender-2026-09": "/images/hero/weekender-2026-09-hero.jpg",
  "future-event-1": "/images/hero/future-event-hero1.jpg",
  // Add more future events as needed...
};

// Current page mappings (redirect to event heroes)
const CURRENT_PAGE_MAPPING = {
  artists: "/images/hero/boulder-fest-2026-hero.jpg", // Boulder Fest 2026
  schedule: "/images/hero/boulder-fest-2025-hero.jpg", // Boulder Fest 2025
  gallery: "/images/hero/weekender-2026-09-hero.jpg", // September 2026 Weekender
};
```

### Fallback Strategy

```javascript
const getHeroImagePath = (pageId) => {
  return HERO_IMAGES[pageId] || "/images/hero/hero-default.jpg";
};
```

## Visual Design

### CSS Styling

```css
.hero-image {
  width: 100%;
  height: 60vh;
  object-fit: cover;
  object-position: top center !important;
  display: block;
}
```

### Key Properties

- **object-fit: cover**: Maintains aspect ratio while filling container
- **object-position: top center**: Consistent framing across all hero images
- **height: 60vh**: Responsive height based on viewport
- **top center positioning**: Ensures important visual elements remain visible

## Performance Characteristics

### Loading Strategy

- **Preload Critical**: Current page hero image preloaded in HTML head
- **No JavaScript Required**: Images load via standard HTML `<img>` elements
- **Browser Caching**: Standard HTTP cache headers for optimal performance
- **No API Calls**: Eliminates network requests for hero image assignment

### Benefits Over Dynamic System

- **Faster Load Times**: No API calls or JavaScript processing required
- **Reduced Complexity**: Simple file serving, no cache management
- **Better Reliability**: No dependencies on external APIs or session storage
- **Easier Maintenance**: Direct file replacement for content updates

## Content Guidelines

### Image Requirements

- **Aspect Ratio**: 16:9 or similar landscape orientation
- **Resolution**: Minimum 1920x1080, optimized for web delivery
- **File Size**: Target <500KB for optimal loading performance
- **Format**: JPEG with 85% quality setting
- **Subject Matter**: Festival-related imagery that represents the page content

### Visual Consistency

- **Color Harmony**: Images should complement the festival brand colors
- **Cultural Authenticity**: Images should authentically represent Cuban salsa culture
- **Professional Quality**: High-resolution, well-composed photographs
- **Text Overlay Safe**: Images should have areas suitable for text overlay

## Implementation Examples

### HTML Structure

```html
<div class="hero-section">
  <img
    id="hero-splash-image"
    class="hero-image"
    src="/images/hero/home.jpg"
    alt="A Lo Cubano Boulder Fest hero image"
    loading="eager"
  />
  <div class="hero-content">
    <h1>Festival Content</h1>
  </div>
</div>
```

### Preload Implementation

```html
<head>
  <link rel="preload" as="image" href="/images/hero/home.jpg" />
</head>
```

### JavaScript Loading (Optional)

```javascript
// Optional JavaScript for dynamic page loading
function loadHeroImage(pageId) {
  const heroImage = document.getElementById("hero-splash-image");
  if (!heroImage) return;

  const imagePath = getHeroImagePath(pageId);
  heroImage.src = imagePath;
  heroImage.alt = `Hero image for ${pageId} page`;
}
```

## Error Handling

### Image Loading Errors

```javascript
heroImage.addEventListener("error", (e) => {
  if (e.target.src !== "/images/hero/hero-default.jpg") {
    e.target.src = "/images/hero/hero-default.jpg";
  }
});
```

### Graceful Degradation

- **Missing Images**: Automatic fallback to `hero-default.jpg`
- **Loading Failures**: Error event listeners provide secondary fallback
- **Network Issues**: Browser caching ensures availability during connectivity problems

## Migration from Dynamic System

### Deprecated Components

- ~~ImageCacheManager~~ - No longer needed
- ~~`/api/hero-image` endpoint~~ - Removed completely
- ~~Session storage management~~ - Not applicable to static system
- ~~Google Drive API integration~~ - Only used for gallery images now

### Breaking Changes

- Hero images no longer rotate or change dynamically
- No query parameters for image manipulation (width, format, quality)
- No responsive image generation via API
- No session-based image assignment

### Advantages of New System

- **Eliminated 306 lines** of complex JavaScript logic
- **Removed API endpoint** reducing server load
- **Faster page loads** with direct file serving
- **Simpler deployment** with static asset optimization
- **Better SEO** with consistent, indexable image URLs

## Testing

### Unit Tests

- Static image path mapping validation
- Fallback behavior verification
- Error handling coverage
- Performance characteristics validation

### Manual Testing

- Visual consistency across all pages
- Loading performance on various network conditions
- Error scenarios (missing images, network failures)
- Mobile and desktop responsive behavior

## Maintenance

### Adding New Pages

1. Create hero image following content guidelines
2. Name file using page ID (e.g., `new-page.jpg`)
3. Place in `/images/hero/` directory
4. Update `HERO_IMAGES` mapping if using JavaScript loader
5. Test loading and fallback behavior

### Updating Existing Images

1. Replace existing file in `/images/hero/` directory
2. Maintain same filename for cache consistency
3. Clear browser cache for testing
4. Verify visual consistency with page content

---

This specification ensures the hero image system remains simple, performant, and maintainable while providing a consistent visual experience across all festival pages.
