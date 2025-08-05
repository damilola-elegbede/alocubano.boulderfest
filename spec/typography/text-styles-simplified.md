# Text Styles Guidelines - Simplified

## Overview

Based on the Artists and Schedule page patterns, text styles should be simple, functional, and create visual interest through typography alone. This document supersedes the previous text-styles.md with a focus on simplicity.

## Core Text Patterns

### Hero Titles

```css
.hero-title {
  font-family: var(--font-display); /* Bebas Neue */
  font-size: var(--font-size-massive);
  line-height: 0.9;
  text-transform: uppercase;
  letter-spacing: -0.02em;
}
```

### Section Headers

```css
.section-header {
  font-family: var(--font-display);
  font-size: var(--font-size-4xl);
  margin-bottom: var(--space-xl);
}
```

### Content Titles (Cards, Items)

```css
.content-title {
  font-family: var(--font-display);
  font-size: var(--font-size-2xl);
  margin-bottom: var(--space-sm);
}
```

### Meta Information

```css
.meta-text {
  font-family: var(--font-mono); /* Space Mono */
  font-size: var(--font-size-sm);
  color: var(--color-gray-600);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
```

### Body Text

```css
.body-text {
  font-family: var(--font-serif); /* Playfair Display */
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--color-gray-800);
}
```

### Code Comment Style

```css
.code-comment {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-gray-600);
  line-height: 1.4;
}
.code-comment::before {
  content: "// ";
}
```

## Minimal Text Effects (Use Sparingly)

### Text Outline (Hero Only)

```css
.text-outline {
  -webkit-text-stroke: 2px var(--color-black);
  -webkit-text-fill-color: transparent;
}
```

### Color Accents

```css
.text-blue {
  color: var(--color-blue);
}
.text-red {
  color: var(--color-red);
}
```

## Typography Hierarchy

1. **Page Title**: Massive, uppercase, display font
2. **Section Title**: Extra large, display font
3. **Card Title**: Large, display font
4. **Metadata**: Small, monospace, muted
5. **Body**: Base size, serif or sans
6. **Annotations**: Small, monospace with // prefix

## Best Practices

### Readability First

- Maintain appropriate line height (1.4-1.6 for body)
- Use sufficient contrast (WCAG AA minimum)
- Avoid text over images
- Keep line lengths reasonable (65-75 characters)

### Consistency

- Use the same text style for similar content types
- Maintain hierarchy throughout the site
- Don't mix more than 3 font families per section
- Apply effects only to hero/major headings

### Mobile Considerations

- Scale fonts proportionally using clamp()
- Maintain hierarchy relationships
- Ensure tap targets are 44px minimum
- Test readability at all viewport sizes

## Simplified Approach

### What We Keep

- Basic font families (Display, Serif, Mono, Sans)
- Clear size hierarchy
- Simple color accents (red, blue, grays)
- Consistent spacing

### What We Remove

- Gradient text effects
- Complex animations
- Glitch effects
- Hover text animations
- Text masks and patterns
- Shadow effects

## Implementation Examples

### Artist Card Text

```html
<div class="artist-card">
  <span class="meta-text">01</span>
  <h3 class="content-title">JUAN CARLOS</h3>
  <p class="meta-text">SALSA • TIMBA • SON</p>
  <p class="body-text">Master instructor from Havana...</p>
  <div class="code-comment">
    Direct from Cuba<br />
    20+ years experience
  </div>
</div>
```

### Schedule Item Text

```html
<div class="schedule-item">
  <span class="meta-text">4:00 - 5:00 PM</span>
  <h3 class="content-title">SALSA WORKSHOP</h3>
  <p class="body-text">Intermediate level</p>
</div>
```

## Reference Implementation

- **Artists page**: Shows creative use within constraints
- **Schedule page**: Demonstrates pure functional typography

## Summary

Good typography doesn't need effects. Focus on:

- Clear hierarchy
- Consistent patterns
- Readable content
- Purposeful font choices
