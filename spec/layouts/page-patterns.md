# Page Layout Patterns

## Overview

This document defines the standard page layout patterns based on the Artists and Schedule pages, which represent the ideal balance of simplicity and visual interest for the A Lo Cubano Boulder Fest website.

## Reference Standards

### Artists Page - Creative Typography Pattern

The Artists page demonstrates how to use typography creatively while maintaining simplicity.

#### Structure

```
1. Hero Section
   - Massive typographic title
   - Subtitle with event details

2. Text Composition Section
   - Mixed typography blocks
   - Display + Serif + Mono combination
   - "Code comment" style annotations

3. Grid Content Section
   - Consistent card structure
   - Clear visual hierarchy
   - Generous spacing

4. Special Section (DJs)
   - Variant styling for emphasis
   - Maintains overall consistency
```

#### Key Elements

- **Hero Title**:
  - Font: Bebas Neue
  - Size: var(--font-size-massive)
  - Effects: Optional text-outline, text-mask, or glitch
- **Content Cards**:
  - Number/ID (small, muted)
  - Title (display font, large)
  - Meta info (monospace, small)
  - Description (serif, readable)
  - Tags/Labels (split color treatment)

### Schedule Page - Clean Information Pattern

The Schedule page exemplifies minimal, functional design focused on readability.

#### Structure

```
1. Hero Section
   - Clear page title
   - Essential info only

2. Day Sections
   - Day header
   - Venue information
   - Time-based grid

3. Schedule Items
   - Two-column grid
   - Time | Details
   - Consistent formatting
```

#### Key Elements

- **Day Headers**:
  - Font: Display (Bebas Neue)
  - Size: var(--font-size-4xl)
  - Margin: var(--space-xl) bottom

- **Schedule Grid**:
  - Time column: 140px fixed width
  - Monospace font for times
  - Clear borders between items
  - No hover effects or animations

## General Page Patterns

### Hero Sections

All pages should have a hero section with:

- Massive typographic title (2-3 words max)
- Optional subtitle with key information
- Minimal or no background imagery
- Text effects used sparingly

### Content Sections

- Use consistent spacing: var(--space-4xl) between major sections
- Alternate between full-width and contained content
- Group related items with consistent patterns
- Avoid more than 3 different layout patterns per page

### Typography Hierarchy

1. **Page Title**: Massive display font
2. **Section Headers**: Large display font with optional effects
3. **Item Titles**: Medium display font
4. **Meta Information**: Small monospace
5. **Body Text**: Readable serif or sans-serif
6. **Annotations**: Monospace "code comment" style

### Grid Systems

- **Cards**: Auto-fit grid with minmax(300px, 1fr)
- **Info Lists**: Fixed time/label column + flexible content
- **Two Column**: 1fr 1fr with gap var(--space-2xl)

### Spacing Rules

- Section padding: var(--space-3xl) to var(--space-5xl)
- Item spacing: var(--space-lg) to var(--space-2xl)
- Text block spacing: var(--space-md) to var(--space-xl)
- Inline spacing: var(--space-xs) to var(--space-sm)

## What to Avoid

- Complex animations or transitions
- Heavy background images or textures
- More than 3 font styles per section
- Inconsistent spacing or alignment
- Overlapping or layered elements
- Dense information without visual breaks

## Implementation Examples

### Artist Card Template

```html
<div class="artist-card">
  <span class="artist-number">01</span>
  <h3 class="artist-name">ARTIST NAME</h3>
  <p class="artist-meta">Specialties here</p>
  <p class="artist-description">Brief description...</p>
  <div class="artist-code">// Technical details // Location info</div>
  <div class="artist-tags"><span>TAG</span> & <span>TAG</span></div>
</div>
```

### Schedule Item Template

```html
<div class="schedule-item">
  <div class="schedule-grid">
    <div class="time">4:00 - 5:00 PM</div>
    <div class="details">
      <h3 class="event-title">EVENT NAME</h3>
      <p class="event-location">Optional location</p>
      <p class="event-info">Additional details</p>
    </div>
  </div>
</div>
```

## Responsive Considerations

- Maintain patterns on mobile but stack elements
- Preserve typography hierarchy at all breakpoints
- Adjust spacing proportionally
- Never sacrifice readability for design
