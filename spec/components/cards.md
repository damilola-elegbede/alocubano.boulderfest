# Card Components

## Overview

Card components are the primary way to display grouped information. Based on the Artists page pattern, cards should be simple, typography-focused, and consistent.

## Artist Card Pattern (Reference Standard)

### Structure

```html
<div class="gallery-item-type" data-number="01">
  <h3 class="gallery-type-title">NAME/TITLE</h3>
  <p class="gallery-type-meta">Meta information</p>
  <p class="gallery-type-description">Main description text</p>
  <div class="gallery-type-code">
    // Additional details in code style // Location or technical info
  </div>
  <div class="gallery-type-tags">
    <span class="tag-blue">TAG1</span> & <span class="tag-red">TAG2</span>
  </div>
</div>
```

### Visual Hierarchy

1. **Number/ID**: Small, positioned absolutely or as first element
2. **Title**: Largest text, display font
3. **Meta**: Small monospace, muted color
4. **Description**: Readable serif or sans-serif
5. **Code Block**: Monospace with "//" prefix
6. **Tags**: Small with color coding

## Card Variations

### Information Card

- Similar to artist card but without tags
- Used for: Schedule items, venue info, general content

### Statistic Card

- Number prominently displayed
- Short label below
- Used for: Festival stats, counts, metrics

### Quote Card

- Larger serif font for quote
- Attribution in small monospace
- Left border accent

## Styling Guidelines

### Spacing

- Card padding: var(--space-2xl)
- Element spacing: var(--space-md) to var(--space-lg)
- Grid gap: var(--space-2xl)

### Typography

- Title: var(--font-size-2xl) to var(--font-size-3xl)
- Meta: var(--font-size-sm)
- Body: var(--font-size-base)
- Code: var(--font-size-sm)

### Colors

- Background: transparent or var(--color-white)
- Borders: 1px solid var(--color-gray-200) if needed
- Accent colors: Use sparingly for tags or highlights

### Grid Layout

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-2xl);
}
```

## Best Practices

1. Keep cards scannable - user should understand content at a glance
2. Maintain consistent height through CSS Grid or min-height
3. Avoid hover effects or animations
4. Use typography and spacing for visual interest, not borders or shadows
5. Ensure all text remains readable on mobile

## What to Avoid

- Card shadows or 3D effects
- Background images
- Complex hover states
- Overlapping elements
- More than 5 distinct pieces of information per card
