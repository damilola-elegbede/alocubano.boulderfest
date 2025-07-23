# Grid System Specifications

## Overview

The A Lo Cubano Boulder Fest website employs a flexible grid system using both **CSS Grid** and **Flexbox** for different layout scenarios. The system prioritizes typography-forward design while maintaining responsive behavior across all devices.

## Grid Implementation Philosophy

### CSS Grid vs Flexbox Usage

- **CSS Grid**: Used for complex, two-dimensional layouts (rows and columns)
- **Flexbox**: Used for one-dimensional layouts, alignment, and navigation components
- **Hybrid Approach**: Many components combine both for optimal layout control

## Core Grid Patterns

### 1. Gallery Grid System

#### Primary Gallery Grid
**File**: `/css/components.css` (Lines 338-343)
```css
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--space-md);
}
```

**Mobile Override**: `/css/mobile-overrides.css` (Lines 594-598)
```css
@media (max-width: 768px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-sm);
  }
}
```

#### Gallery Detail Grid
**File**: `/css/components.css` (Lines 345-350)
```css
.gallery-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--space-lg);
  margin-bottom: var(--space-2xl);
}
```

**Usage**: Gallery detail pages (`/pages/gallery-2025.html` Lines 74, 82)

#### Gallery Item Structure
**File**: `/css/components.css` (Lines 381-389)
```css
.gallery-item {
  position: relative;
  overflow: hidden;
  aspect-ratio: 4/3; /* Natural photo ratio instead of square */
  cursor: pointer;
  pointer-events: auto;
  z-index: 1;
  transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
}
```

**Behavior**: 4:3 aspect ratio maintains consistent grid appearance while accommodating various image dimensions.

### 2. Festival Years Grid (Navigation Cards)

**File**: `/css/components.css` (Lines 604-609)
```css
.festival-years-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-2xl);
  margin: var(--space-3xl) 0;
}
```

**Mobile Responsive**: Lines 737-742
```css
@media (max-width: 768px) {
  .festival-years-grid {
    grid-template-columns: 1fr;
    gap: var(--space-xl);
    margin: var(--space-2xl) 0;
  }
}
```

**Usage**: Gallery navigation (`/pages/gallery.html` Line 66)

### 3. Typography-Based Grids

#### Text Composition Grid
**File**: `/css/typography.css` (Lines 71-76)
```css
.text-composition {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-xl);
  align-items: start;
}
```

**Column Spans**:
- `.text-block-large`: `grid-column: span 8` (Lines 78-80)
- `.text-block-vertical`: `grid-column: span 2` (Lines 92-94)
- `.text-block-small`: `grid-column: span 4` (Lines 105-107)
- `.text-block-mono`: `grid-column: span 6` (Lines 113-115)

**Mobile Override**: Lines 700-716
```css
@media (max-width: 768px) {
  .text-composition {
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }
  
  .text-block-large,
  .text-block-vertical,
  .text-block-small,
  .text-block-mono {
    grid-column: span 1;
  }
}
```

#### Typographic Gallery Grid
**File**: `/css/typography.css` (Lines 125-130)
```css
.gallery-typographic {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-2xl);
  padding: var(--space-3xl) 0;
}
```

**Mobile Override**: Lines 735-738
```css
@media (max-width: 480px) {
  .gallery-typographic {
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }
}
```

### 4. Navigation Grid System

#### Header Grid
**File**: `/css/navigation.css` (Lines 22-27)
```css
.typographic .grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-lg);
}
```

**Purpose**: Creates three-column layout for logo, spacer, and navigation menu.

#### Navigation Flexbox
**File**: `/css/navigation.css` (Lines 133-140)
```css
.typographic .nav-list,
.nav-list {
  display: flex;
  gap: var(--space-2xl);
  align-items: baseline;
  list-style: none;
  margin: 0;
  padding: 0;
}
```

**Mobile Override**: Mobile menu becomes full-screen overlay (Lines 303-320)

### 5. Form Grid Layouts

#### Form Grid Type
**File**: `/css/forms.css` (Lines 64-69) and `/css/typography.css` (Lines 661-664)
```css
.form-grid-type {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: var(--space-lg);
}
```

**Usage Examples**:
- Donation forms (`/pages/donations.html` Line 121)
- Volunteer forms (`/pages/about.html` Line 340)
- Ticket purchasing forms

**Mobile Override**: `/css/forms.css` (Lines 227-230)
```css
@media (max-width: 768px) {
  .form-grid-type {
    grid-template-columns: 1fr;
  }
}
```

### 6. Pricing and Content Grids

#### Pricing Grids
Multiple pricing grid implementations based on context:

**Pricing Typographic** (`/css/typography.css` Lines 625-630):
```css
.pricing-typographic {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-2xl);
  margin: var(--space-3xl) 0;
}
```

**Inline Pricing Grids** (from HTML analysis):
- Two-column pricing: `grid-template-columns: 1fr 1fr`
- Day passes: `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`

#### Schedule Grid Pattern
**Usage**: `/pages/schedule.html` (multiple instances)
```css
/* Inline style pattern found in schedule.html */
display: grid;
grid-template-columns: 140px 1fr;
gap: var(--space-xl);
```

**Purpose**: Creates time-column and content-column layout for schedule entries.

## Grid Behavior Patterns

### Desktop (>768px)
- **Multi-column layouts**: Complex grids with 2-12 columns
- **Gallery grids**: 3-5 items per row depending on viewport
- **Typography grids**: Full 12-column text composition system
- **Navigation**: Horizontal flexbox layout

### Tablet (769px-1024px)
- **Auto-fit grids**: Responsive columns based on minimum widths
- **Gallery grids**: 2-4 items per row
- **Form grids**: 2-column layouts

### Mobile (≤768px)
- **Single-column stacking**: Most grids collapse to 1 column
- **Gallery grids**: 2 columns maximum with smaller minimum widths
- **Navigation**: Fullscreen overlay menu
- **Typography**: Linear text flow

## Performance Optimizations

### Content Visibility
**File**: `/css/components.css` (Lines 103-106)
```css
.gallery-grid {
  content-visibility: auto;
  contain-intrinsic-size: 300px;
}
```

**Purpose**: Improves rendering performance for large gallery grids.

### Aspect Ratio Control
**File**: `/css/components.css` (Line 384)
```css
.gallery-item {
  aspect-ratio: 4/3;
}
```

**Benefit**: Prevents layout shift during image loading.

## Responsive Breakpoints

The grid system uses consistent breakpoints defined in design tokens:

- **Mobile**: `max-width: 768px`
- **Small mobile**: `max-width: 480px`
- **Desktop protection**: `min-width: 769px`

### Container System
**File**: `/css/base.css` (Lines 156-192)
```css
.container {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-xl);
}

/* Responsive container padding */
@media (min-width: 640px) {
  .container { padding: 0 var(--space-lg); }
}

@media (min-width: 768px) {
  .container { padding: 0 var(--space-xl); }
}

@media (min-width: 1024px) {
  .container { padding: 0 var(--space-2xl); }
}
```

## Flexbox Usage Patterns

### Navigation Components
- **Header layout**: `justify-content: flex-end; align-items: baseline`
- **Logo components**: `align-items: center; gap: var(--space-md)`
- **Mobile menu**: `flex-direction: column; justify-content: center`

### Button and Form Elements
- **Button alignment**: `display: inline-flex; align-items: center; justify-content: center`
- **Form groups**: `display: flex; flex-wrap: wrap; gap: var(--space-md)`

### Footer Components
**File**: `/css/typography.css` (Lines 471-476)
```css
.footer-social {
  display: flex;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-sm);
  margin-bottom: var(--space-md);
}
```

## Grid Implementation Guidelines

### 1. Grid Selection Criteria
- **Use CSS Grid when**: Layout needs both rows and columns, complex positioning required
- **Use Flexbox when**: Single-direction layout, content alignment, navigation components
- **Use Hybrid when**: Grid for structure, flexbox for component internals

### 2. Responsive Strategy
- **Mobile-first**: Start with single-column layouts
- **Progressive enhancement**: Add complexity for larger screens
- **Content-aware**: Grid adapts to content rather than forcing content into grid

### 3. Performance Considerations
- **Avoid deeply nested grids**: Keep grid nesting to 2-3 levels maximum
- **Use `auto-fit` for responsive grids**: Reduces need for media queries
- **Implement `content-visibility`**: For large dynamic grids

### 4. Accessibility
- **Maintain reading order**: Grid visual order matches DOM order
- **Focus management**: Ensure tab order remains logical
- **Responsive text**: Typography scales appropriately within grid constraints

## File Reference Summary

| Grid Type | Primary File | Lines | Mobile Override File | Lines |
|-----------|-------------|--------|---------------------|--------|
| Gallery Grid | `/css/components.css` | 338-343 | `/css/mobile-overrides.css` | 594-598 |
| Festival Years | `/css/components.css` | 604-609 | `/css/components.css` | 737-742 |
| Typography Composition | `/css/typography.css` | 71-76 | `/css/typography.css` | 700-716 |
| Navigation Grid | `/css/navigation.css` | 22-27 | `/css/mobile-overrides.css` | 36-101 |
| Form Grids | `/css/forms.css` | 64-69 | `/css/forms.css` | 227-230 |
| Pricing Grids | `/css/typography.css` | 625-630 | `/css/typography.css` | 779-793 |

This grid system provides the foundation for A Lo Cubano Boulder Fest's typography-forward design, ensuring consistent, responsive, and performant layouts across all pages and components.