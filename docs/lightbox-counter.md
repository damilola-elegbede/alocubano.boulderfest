# Lightbox Counter Documentation

## Overview

The lightbox counter displays the current position of an image within its category (workshops or socials) rather than the global position across all images. This provides a more intuitive user experience.

## Implementation Details

### Display Format

- **Workshops**: "Workshop X/Y" where X is the current position and Y is the total workshops
- **Socials**: "Social X/Y" where X is the current position and Y is the total socials

### Technical Implementation

#### 1. Category Index Tracking (gallery-detail.js)

Each item in the `displayOrder` array now includes:

```javascript
{
    id: "image_id",
    name: "image_name.jpg",
    category: "workshops",      // or "socials"
    displayIndex: 45,           // Global index across all images
    categoryIndex: 12           // Position within category (0-based)
}
```

The state also tracks category counts:

```javascript
state.categoryItemCounts = {
  workshops: 53,
  socials: 93,
};
```

#### 2. Progressive Insertion

When items are added to the gallery:

- The `insertItemsProgressively` function assigns a `categoryIndex` to each item
- Category counters are maintained and incremented as items are added
- Both fresh loads and restored states handle indexing correctly

#### 3. Lightbox Display (lightbox.js)

The lightbox uses the pre-calculated `categoryIndex`:

```javascript
// In updateAdvancedContent method
const categoryIndex =
  currentItem.categoryIndex !== undefined
    ? currentItem.categoryIndex
    : calculatedFallback;

const displayNumber = categoryIndex + 1; // Convert to 1-based
const totalInCategory = this.categoryCounts[category];
```

### State Persistence

The following data is persisted to sessionStorage:

- `displayOrder` array with `categoryIndex` for each item
- `categoryItemCounts` object with totals per category
- All indices are maintained across page reloads

### Testing

Run `test-lightbox-counter.js` in the browser console to verify:

1. Category indices are sequential (0, 1, 2, ...)
2. Counter displays match expected values
3. State persistence maintains correct indices

## Usage Example

When a user clicks on the 45th workshop image:

- Previously: Might show "93/53" (incorrect - global index with category total)
- Now: Shows "Workshop 45/53" (correct - category position)

When navigating from the last workshop to the first social:

- Workshop 53/53 → Social 1/93

## Troubleshooting

### Issue: Counter shows incorrect values

1. Clear sessionStorage: `galleryDebug.clearSavedState()`
2. Reload the page to rebuild indices
3. Run test script to verify indexing

### Issue: categoryIndex is undefined

- This happens for items loaded before the update
- The system falls back to calculating the index
- Clear cache and reload to get fresh indices
