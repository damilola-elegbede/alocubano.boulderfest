# A Lo Cubano Boulder Fest - Asset Management Specifications

## Overview

This document defines the complete asset management system for the A Lo Cubano Boulder Fest website, including image organization, optimization strategies, favicon implementation, loading mechanisms, and performance considerations.

## Asset Directory Structure

```
/images/                          # Static assets root
├── logo.png                      # Primary brand logo (78px height)
├── hero-default.jpg             # Default hero image fallback
├── favicon.ico                  # Legacy favicon format
├── favicon-circle.svg           # SVG favicon (primary)
├── favicon-circle-sizes.html    # Favicon generation tool
├── favicons/                    # Multi-format favicon system
│   ├── favicon-16x16.png        # Small browser tab
│   ├── favicon-32x32.png        # Standard browser tab
│   ├── favicon-192x192.png      # Android/PWA icon
│   ├── favicon.icns             # macOS icon format
│   └── favicon.ico              # Legacy fallback
├── gallery/                     # Gallery placeholder system
│   ├── placeholder-1.svg        # Opening Night placeholder
│   ├── placeholder-2.svg        # Workshops placeholder
│   ├── placeholder-3.svg        # Social Dancing placeholder
│   └── placeholder-4.svg        # Community placeholder
├── instagram-icon.svg           # Social media icon
├── instagram-type.svg           # Instagram wordmark
├── instagram.svg                # Combined Instagram branding
└── whatsapp-icon.svg           # WhatsApp contact icon

/api/image-proxy/                # Dynamic image serving
└── [fileId].js                  # Google Drive image proxy

/public/                         # Generated cache files (not in Git)
├── featured-photos.json         # Featured photos cache
└── gallery-data/               # Gallery data cache
    └── 2025.json               # Event-specific gallery data
```

## Favicon System Implementation

### Multi-Format Favicon Support

The site implements a comprehensive favicon system supporting modern and legacy browsers:

```html
<!-- Modern SVG favicon (preferred) -->
<link rel="icon" type="image/svg+xml" href="/images/favicon-circle.svg">

<!-- Legacy ICO fallback -->
<link rel="icon" type="image/x-icon" href="/images/favicon.ico">

<!-- PNG variants for different contexts -->
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicons/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicons/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="192x192" href="/images/favicons/favicon-192x192.png">

<!-- Apple Touch Icon for iOS -->
<link rel="apple-touch-icon" sizes="192x192" href="/images/favicons/favicon-192x192.png">
```

### Favicon Design Specifications

**File:** `/images/favicon-circle.svg`

- **Dimensions:** 512x512px viewBox
- **Format:** SVG with embedded Cuban flag elements
- **Colors:** 
  - Primary: `#000000` (black border and text)
  - Background: `#FFFFFF` (white)
  - Flag blue: `#5B6BB5` (brand blue)
  - Flag red: `#CC2936` (brand red)
- **Elements:**
  - Circular design with no square edges
  - Cuban flag pattern with clipping
  - Curved text: "A LO CUBANO" (top arc), "BOULDER FEST" (bottom arc)
  - EST 2023 markers
  - Star element in flag triangle

### Favicon Generation Tool

**File:** `/images/favicon-circle-sizes.html`

Interactive HTML tool for generating multiple favicon sizes:
- Generates: 16x16, 32x32, 192x192, 512x512 PNG variants
- Uses HTML5 Canvas for SVG rasterization
- Includes download functionality for batch generation
- Maintains aspect ratio and quality across sizes

## Logo and Branding Assets

### Primary Logo

**File:** `/images/logo.png`

- **Usage:** Main brand logo across all pages
- **Implementation:** `<img src="/images/logo.png" alt="A Lo Cubano Boulder Fest Logo" style="height: 78px;">`
- **Specifications:**
  - Fixed height: 78px
  - Maintains aspect ratio
  - Used in header navigation
  - Alt text: "A Lo Cubano Boulder Fest Logo"

### Social Media Icons

**Instagram System:**
- `instagram-icon.svg` - Icon only
- `instagram-type.svg` - Wordmark only  
- `instagram.svg` - Combined icon and wordmark

**WhatsApp:**
- `whatsapp-icon.svg` - Contact icon

**Specifications:**
- SVG format for scalability
- Consistent styling with brand colors
- Accessible with proper alt text

## Gallery Asset Management

### Placeholder System

**Location:** `/images/gallery/`

Four themed SVG placeholders for gallery loading states:

1. **placeholder-1.svg** - "OPENING NIGHT"
2. **placeholder-2.svg** - "WORKSHOPS" 
3. **placeholder-3.svg** - "SOCIAL DANCING"
4. **placeholder-4.svg** - "COMMUNITY"

**Specifications:**
- Dimensions: 800x600px
- Grid pattern background (`#f5f5f5` with `#e0e0e0` grid)
- Typography: Bebas Neue for headers, Arial for details
- Consistent visual hierarchy and branding

### Dynamic Gallery Images

**Proxy System:** `/api/image-proxy/[fileId].js`

Features:
- Google Drive API integration with service account auth
- Secure file ID-based routing
- MIME type validation (images only)
- Aggressive caching headers
- ETag support for conditional requests
- Development placeholder fallback
- Error handling with retry logic

**Caching Strategy:**
```javascript
// Production caching
'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable'

// Development caching  
'Cache-Control': 'public, max-age=3600'
```

## Image Loading and Optimization

### Lazy Loading System

**Implementation:** `/js/components/lazy-loading.js`

**Features:**
- Intersection Observer API for modern browsers
- Fallback for legacy browser support
- Dual loading modes: simple images and advanced items
- Retry mechanism with exponential backoff
- Manual retry on failure
- Error state handling

**Configuration Options:**
```javascript
{
  rootMargin: '50px 0px',        // Load 50px before visible
  threshold: 0.1,                // 10% visibility trigger
  maxRetries: 3,                 // Maximum retry attempts
  selector: 'img[data-src]',     // Simple image selector
  advancedSelector: '.lazy-item[data-loaded="false"]', // Advanced items
  loadedClass: 'loaded'          // CSS class for loaded state
}
```

### Progressive Loading

**Implementation:** `/js/progressive-loader.js`

**Features:**
- Blur-up technique for smooth loading
- Color placeholder extraction
- Skeleton screen animations
- Offscreen canvas for image processing
- Performance monitoring integration

**Loading Sequence:**
1. Show placeholder/skeleton
2. Load low-quality thumbnail with blur
3. Fade in full-resolution image
4. Apply loaded state classes

### Image Cache Management

**Implementation:** `/js/image-cache-manager.js`

**Features:**
- Session-scoped caching in localStorage
- 24-hour cache expiration
- API rate limiting (2-second minimum intervals)
- Page-specific image assignments
- Cache warming for critical images
- Fallback to default hero image

**Cache Structure:**
```javascript
{
  cacheKey: 'alocubano_image_cache_v2',
  imageCacheKey: 'alocubano_image_data_cache',
  defaultImageUrl: '/images/hero-default.jpg'
}
```

## Performance Optimization Strategies

### Preloading Critical Assets

**Service Worker Integration:** `/js/sw.js`

Critical assets cached on install:
```javascript
[
  '/images/logo.png',
  '/images/favicon-circle.svg'
]
```

**Prefetch Manager:** `/js/prefetch-manager.js`

High-priority assets:
```javascript
[
  '/images/hero-default.jpg',
  '/images/logo.png'
]
```

### Asset Loading Strategies

1. **Critical Path Assets:**
   - Logo and favicon: Immediate load
   - Hero images: Preload with high priority
   - Navigation icons: Cache in service worker

2. **Above-the-Fold Images:**
   - Lazy load with minimal rootMargin
   - Progressive enhancement with blur-up
   - Placeholder during loading

3. **Gallery Images:**
   - Intersection Observer with 200px rootMargin
   - Dynamic loading from Google Drive API
   - Comprehensive error handling and retry logic

4. **Below-the-Fold Assets:**
   - Lazy load with larger rootMargin
   - Lower priority loading
   - Skeleton screens for better UX

### Compression and Formats

**Static Images:**
- PNG: Logo, favicons, icons (lossless required)
- JPG: Hero images, photography (compressed)
- SVG: Icons, graphics, favicon (scalable)

**Dynamic Images:**
- Google Drive serves optimized formats
- MIME type validation ensures image formats
- Proxy handles format conversion if needed

### Caching Headers

**Static Assets:**
```
Cache-Control: public, max-age=86400, s-maxage=604800, immutable
```

**Dynamic Images:**
```
Cache-Control: public, max-age=86400, s-maxage=604800, immutable
ETag: "fileId-size"
```

**Development:**
```
Cache-Control: public, max-age=3600
```

## Responsive Asset Delivery

### Favicon Responsive Behavior

- **16x16px:** Small browser tabs, bookmarks
- **32x32px:** Standard browser tabs, Windows taskbar
- **192x192px:** Android app icons, PWA icons
- **SVG:** Scalable for high-DPI displays

### Logo Responsive Implementation

```css
.logo-link img {
  height: 78px;        /* Fixed height for consistency */
  width: auto;         /* Maintains aspect ratio */
  max-width: 100%;     /* Responsive on small screens */
}
```

### Gallery Image Responsive Strategy

1. **Mobile First:** Smaller placeholder sizes
2. **Progressive Enhancement:** Larger images on desktop
3. **Bandwidth Consideration:** Quality adjustment based on connection
4. **Viewport Adaptation:** Different layouts for different screen sizes

## Error Handling and Fallbacks

### Image Loading Failures

**Retry Strategy:**
1. Automatic retry with exponential backoff
2. Maximum 3 retry attempts
3. Manual retry option on failure
4. Graceful degradation to placeholders

**Fallback Chain:**
1. Primary Google Drive image
2. Cached version from localStorage
3. Default hero image (`/images/hero-default.jpg`)
4. SVG placeholder with error indication

### Offline Support

**Service Worker Caching:**
- Critical images cached for offline access
- Fallback images available without network
- Cache-first strategy for static assets

### Development Environment

**Local Development Support:**
- Placeholder images when Google Drive credentials unavailable
- SVG-based development placeholders
- Clear error messaging for missing assets
- Bypass authentication for local testing

## Asset Validation and Quality Control

### Build Process Integration

**File Verification:** `/scripts/verify-structure.js`

Validates presence of critical assets:
```javascript
[
  'images/logo.png',
  'images/favicon-circle.svg'
]
```

**Cache Generation:** `/scripts/generate-featured-photos.js`

Validates and caches gallery assets:
- Checks image accessibility
- Generates optimized cache files
- Validates image dimensions and formats

### Performance Monitoring

**Asset Loading Metrics:**
- Load time tracking for critical images
- Error rate monitoring for gallery images
- Cache hit/miss ratios
- User experience impact measurement

### Quality Standards

**Image Requirements:**
- Maximum file size: 10MB (API limit)
- Supported formats: JPG, PNG, GIF, WebP, SVG
- Minimum dimensions: 400x300 for gallery images
- Alt text required for all images
- Proper MIME type validation

## Security Considerations

### Content Security Policy

**Image Sources:**
```
img-src 'self' data: https://drive.google.com https://lh3.googleusercontent.com;
```

### API Security

**Google Drive Proxy:**
- Service account authentication
- Read-only permissions
- File ID validation
- MIME type restrictions
- Rate limiting implementation

### Client-Side Security

**Cache Security:**
- No sensitive data in localStorage
- Cache expiration limits
- Clean up on page unload
- Sanitized file IDs only

## Implementation Guidelines

### Adding New Assets

1. **Static Images:**
   - Place in appropriate `/images/` subdirectory
   - Add to build verification scripts
   - Update documentation and alt text
   - Test across devices and browsers

2. **Dynamic Images:**
   - Upload to Google Drive gallery folder
   - Generate cache using build scripts
   - Test proxy API endpoint
   - Verify lazy loading behavior

3. **Icons and Graphics:**
   - Use SVG format when possible
   - Maintain consistent styling
   - Include proper semantic markup
   - Test in high-contrast modes

### Performance Best Practices

1. **Optimize Before Upload:**
   - Compress images appropriately
   - Use correct format for content type
   - Consider multiple resolutions
   - Test loading performance

2. **Implement Progressive Enhancement:**
   - Start with placeholders
   - Load critical images first
   - Use intersection observers
   - Handle loading states gracefully

3. **Monitor and Measure:**
   - Track Core Web Vitals impact
   - Monitor error rates
   - Measure cache effectiveness
   - Optimize based on real user data

## File References and Dependencies

### Critical Files

- `/images/logo.png` - Primary brand logo
- `/images/favicon-circle.svg` - Modern favicon
- `/images/hero-default.jpg` - Default hero fallback
- `/js/components/lazy-loading.js` - Core lazy loading
- `/js/image-cache-manager.js` - Cache management
- `/api/image-proxy/[fileId].js` - Dynamic image serving

### Supporting Files

- `/js/progressive-loader.js` - Progressive loading
- `/js/prefetch-manager.js` - Asset prefetching  
- `/js/sw.js` - Service worker caching
- `/css/base.css` - Asset-related CSS variables
- `/scripts/generate-featured-photos.js` - Cache generation

### Generated Files (Not in Git)

- `/public/featured-photos.json` - Featured photos cache
- `/public/gallery-data/2025.json` - Gallery data cache
- All files in `/public/` directory are build-generated

This comprehensive asset management system ensures optimal performance, accessibility, and user experience across the A Lo Cubano Boulder Fest website while maintaining the typography-forward design philosophy and Cuban cultural authenticity.