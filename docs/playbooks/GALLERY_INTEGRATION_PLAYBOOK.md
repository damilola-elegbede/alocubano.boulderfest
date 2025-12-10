# Gallery Integration Playbook

This playbook documents how to enable photo galleries for A Lo Cubano events. It covers the complete process from Google Drive setup to frontend integration.

## Overview

The gallery system uses Google Drive as the image storage backend with a multi-tier caching strategy:
- **Build-time cache**: Pre-generated JSON files for fast initial loads
- **Runtime cache**: Server-side in-memory cache with 30-minute TTL
- **Browser cache**: HTTP caching with ETag support

## Prerequisites

Before starting, ensure you have:
1. Access to the A Lo Cubano Google Drive
2. The event folder created in Google Drive under the root Gallery folder
3. Images uploaded to appropriate category subfolders

## Step 1: Google Drive Folder Structure

Create the event folder with this exact naming convention:

```
[ROOT_GALLERY_FOLDER]/
└── {event-name}/              # e.g., weekender-2025-11, boulder-fest-2025
    ├── Workshops/             # → maps to "workshops" category
    ├── Socials/               # → maps to "socials" category
    ├── Performances/          # → maps to "performances" category
    └── Other/                 # → maps to "other" category (fallback)
```

**Important Notes:**
- The event folder name **must match exactly** the event ID used in code
- Category folder names are **case-insensitive** (Workshops = workshops = WORKSHOPS)
- Empty categories are handled gracefully (hidden in UI)

### Category Mapping Rules

The system automatically maps folder names to categories based on keywords:

| Folder Name Contains | Maps To |
|---------------------|---------|
| workshop, class, lesson | workshops |
| social, party, dance | socials |
| performance, show, stage | performances |
| (anything else) | other |

## Step 2: Add Event to Build Configuration

**File:** `/scripts/build/generate-gallery-cache.mjs`

Add the event name to the `EVENT_GALLERY_CONFIG` array:

```javascript
const EVENT_GALLERY_CONFIG = [
  "boulder-fest-2025",
  "weekender-2025-11",  // Add new event here
  "boulder-fest-2026",
  "weekender-2026-09",
];
```

**No folder ID required!** The build script automatically searches for folders by name within the root Gallery folder.

## Step 3: Update Frontend Event Detection

**File:** `/js/gallery-detail.js`

Add URL path detection in the `getEventFromPage()` function:

```javascript
// Check for specific event patterns in URL
if (pathname.includes('weekender-2025-11')) {
    return 'weekender-2025-11';
}
```

Add this **before** the default fallback patterns.

## Step 4: Create/Update Gallery Page HTML

**File:** `/pages/events/{event-name}/gallery.html`

### 4a. Add Data Attributes to Gallery Section

```html
<section
  class="section-typographic gallery-detail-section"
  id="traditional-gallery"
  data-gallery-event="{event-name}"
  data-gallery-year="{year}"
>
```

### 4b. Add Gallery Container Structure

```html
<div class="container">
  <!-- Loading State -->
  <div class="gallery-loading" id="gallery-detail-loading">
    <div class="gallery-loading-spinner"></div>
    <p class="font-mono">Loading event memories...</p>
  </div>

  <!-- Gallery Content (populated by gallery-detail.js) -->
  <div id="gallery-detail-content" style="display: none;">
    <div class="gallery-section" id="workshops-section" style="display: none;">
      <h2 class="text-display gallery-category-title">WORKSHOPS</h2>
      <div class="gallery-grid gallery-detail-grid" id="workshops-gallery"></div>
    </div>
    <div class="gallery-section" id="socials-section" style="display: none;">
      <h2 class="text-display gallery-category-title">SOCIALS</h2>
      <div class="gallery-grid gallery-detail-grid" id="socials-gallery"></div>
    </div>
    <div class="gallery-section" id="performances-section" style="display: none;">
      <h2 class="text-display gallery-category-title">PERFORMANCES</h2>
      <div class="gallery-grid gallery-detail-grid" id="performances-gallery"></div>
    </div>
    <div class="gallery-section" id="other-section" style="display: none;">
      <h2 class="text-display gallery-category-title">OTHER</h2>
      <div class="gallery-grid gallery-detail-grid" id="other-gallery"></div>
    </div>
  </div>

  <!-- Static fallback -->
  <div class="gallery-grid-static" id="gallery-detail-static" style="display: none;">
    <div class="gallery-static-content">
      <h2 class="text-display gallery-static-title">{EVENT TITLE} GALLERY</h2>
      <p class="font-serif gallery-static-description">
        Photos from this event will be available soon.
      </p>
    </div>
  </div>
</div>
```

### 4c. Add Required Scripts (before `</body>`)

```html
<!-- Lightbox and Lazy Loading -->
<script src="/js/components/lightbox.js"></script>
<script src="/js/components/lazy-loading.js"></script>

<!-- Performance Optimization Modules -->
<script src="/js/prefetch-manager.js"></script>
<script src="/js/progressive-loader.js"></script>
<script src="/js/cache-warmer.js"></script>

<!-- Gallery Detail Script -->
<script defer src="/js/gallery-detail.js"></script>
```

### 4d. Add Preconnect Hints (in `<head>`)

```html
<link rel="preconnect" href="https://mikya8vluytqhmff.public.blob.vercel-storage.com" crossorigin />
<link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
<link rel="dns-prefetch" href="https://drive.google.com" />
```

## Step 5: Testing

### Build Verification

```bash
npm run build
```

Expected output:
```
Fetching gallery data for {event-name}...
📁 Found folder for {event-name}: {folder-id}
Found {N} items for {event-name}.
✅ Gallery data for {event-name} saved to public/gallery-data/{event-name}.json
```

### Local Testing

```bash
npm start
# Visit http://localhost:3000/{event-name}/gallery
```

### API Verification

```bash
curl "http://localhost:3000/api/gallery?event={event-name}"
```

Expected response:
```json
{
  "eventId": "{event-name}",
  "totalCount": 42,
  "categories": {
    "workshops": [...],
    "socials": [],
    "performances": [],
    "other": []
  }
}
```

### Deployment Verification

After deploying, verify:
1. Gallery page loads and shows spinner
2. Images appear in correct categories
3. Lightbox opens on image click
4. Lazy loading works (images load as you scroll)
5. Empty categories are hidden

## Handling Special Cases

### Events with Limited Categories

If an event only has one category (e.g., workshops only), the system handles this automatically:
- Empty category sections remain hidden (`style="display: none;"`)
- Only populated categories are shown
- No code changes needed

### Adding Photos After Initial Deployment

1. Upload new photos to Google Drive
2. Wait for cache to expire (30 minutes) OR
3. Clear cache manually: `POST /api/cache?action=clear&type=google-drive`
4. Rebuild to update build-time cache: `npm run build`

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "No folder found" error | Verify folder name matches exactly, check root folder ID |
| Empty gallery | Verify images are in category subfolders, not root |
| Wrong category | Check folder naming matches category patterns |
| Images not loading | Check Google Drive sharing permissions |
| Slow loading | Run build to generate cache, check preconnect hints |

## Environment Variables

Required in Vercel Dashboard:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Service account email
- `GOOGLE_PRIVATE_KEY`: Service account private key
- `GOOGLE_DRIVE_GALLERY_FOLDER_ID`: Root gallery folder ID

## Related Files

| File | Purpose |
|------|---------|
| `/scripts/build/generate-gallery-cache.mjs` | Build-time cache generation |
| `/lib/google-drive-service.js` | Runtime Google Drive API client |
| `/lib/gallery-service.js` | Gallery data service with caching |
| `/api/gallery.js` | Gallery API endpoint |
| `/js/gallery-detail.js` | Frontend gallery rendering |
| `/css/virtual-gallery.css` | Gallery styling |

## Quick Reference

```bash
# Add new event gallery (summary)
1. Create Google Drive folder: {event-name}/Workshops/
2. Add to EVENT_GALLERY_CONFIG in generate-gallery-cache.mjs
3. Add URL detection in gallery-detail.js
4. Update gallery.html with gallery container structure
5. Build and deploy: npm run build && vercel --prod
```
