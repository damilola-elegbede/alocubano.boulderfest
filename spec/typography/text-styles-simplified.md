# Text Styles Specification - Simplified & Definitive

## Overview
This is the **definitive typography specification** for A Lo Cubano Boulder Fest, superseding any complex versions (text-styles.md). Based on actual implementation patterns across all pages, this documents the typography-forward design system that treats text as art.

**Key Principle**: Typography creates visual interest through font combinations, hierarchy, and strategic effects - not complex animations.

## Typography System Foundation

### Font Stack (from `/css/base.css` and `/css/typography.css`)
```css
/* Core Fonts */
--font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-serif: Georgia, Cambria, 'Times New Roman', Times, serif;
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;

/* Creative Display Fonts */
--font-display: 'Bebas Neue', var(--font-sans);     /* Headers, impact */
--font-accent: 'Playfair Display', var(--font-serif); /* Artistic elements */
--font-code: 'Space Mono', monospace;                /* Technical, metadata */
```

### Font Size Scale (14 levels)
```css
--font-size-xs: 0.75rem;     /* 12px - Small metadata */
--font-size-sm: 0.875rem;    /* 14px - Code comments */
--font-size-base: 1rem;      /* 16px - Body text */
--font-size-lg: 1.125rem;    /* 18px - Large body */
--font-size-xl: 1.25rem;     /* 20px - Subheadings */
--font-size-2xl: 1.5rem;     /* 24px - Card titles */
--font-size-3xl: 1.875rem;   /* 30px - Section headers */
--font-size-4xl: 2.25rem;    /* 36px - Page headers */
--font-size-5xl: 3rem;       /* 48px - Hero text */
--font-size-6xl: 3.75rem;    /* 60px - Large hero */
--font-size-7xl: 4.5rem;     /* 72px - Massive display */
--font-size-8xl: 6rem;       /* 96px - Background elements */
--font-size-9xl: 8rem;       /* 128px - Decorative */
```

## Implemented Typography Patterns

### 1. Display Text (.text-display)
**Usage**: Page headers, pricing, major titles
**Files**: Used in tickets.html, schedule.html, gallery.html
```css
.text-display {
    font-family: var(--font-display); /* Bebas Neue */
    font-weight: 700;
    letter-spacing: var(--letter-spacing-wide); /* 0.025em */
    text-transform: uppercase;
}
/* Responsive scaling in mobile-overrides.css */
@media (max-width: 768px) {
  .text-display {
    font-size: clamp(var(--font-size-xl), 6vw, var(--font-size-3xl)) !important;
  }
}
```

### 2. Glitch Effect (.text-glitch)
**Usage**: Section headers with data-text attribute
**Files**: artists.html, about.html, home.html
```css
.text-glitch {
    position: relative;
    font-family: var(--font-display);
    font-size: var(--font-size-5xl);
    letter-spacing: var(--letter-spacing-wide);
    text-transform: uppercase;
    color: var(--color-black);
}
/* Pseudo-elements create layered effect */
.text-glitch::before { color: var(--color-blue); }
.text-glitch::after { color: var(--color-red); }
```

### 3. Text Mask (.text-mask)
**Usage**: Gradient-filled text effects
**Files**: artists.html, about.html, donations.html
```css
.text-mask {
    font-family: var(--font-display);
    font-size: var(--font-size-6xl);
    background: linear-gradient(45deg, var(--color-blue), var(--color-red));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
```

### 4. Text Composition Layouts (.text-composition)
**Usage**: Complex typographic layouts
**Files**: home.html, about.html, artists.html
```css
.text-composition {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: var(--space-xl);
    align-items: start;
}

/* Text blocks within compositions */
.text-block-large {
    grid-column: span 8;
    font-family: var(--font-accent); /* Playfair Display */
    font-size: var(--font-size-4xl);
    line-height: var(--line-height-tight); /* 1.25 */
    font-weight: 900;
}

.text-block-vertical {
    grid-column: span 2;
    writing-mode: vertical-rl;
    font-family: var(--font-display);
    font-size: var(--font-size-2xl);
    text-transform: uppercase;
    color: var(--color-red);
}

.text-block-mono {
    grid-column: span 6;
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    letter-spacing: var(--letter-spacing-wide);
    background: var(--color-gray-100);
    padding: var(--space-xl);
    border-left: 4px solid var(--color-blue);
}

.text-block-small {
    grid-column: span 4;
    font-family: var(--font-sans);
    font-size: var(--font-size-base);
    line-height: var(--line-height-relaxed); /* 1.625 */
    color: var(--color-gray-700);
}
```

### 5. Code Comment Pattern
**Usage**: Technical annotations with // prefix
**Files**: home.html, artists.html, about.html
```css
.text-block-mono {
    font-family: var(--font-code);
    font-size: var(--font-size-sm);
    color: var(--color-gray-600);
    line-height: var(--line-height-loose); /* 2 */
}
/* Content includes manual // prefixes in HTML */
```

### 6. Split Text Effects (.text-split)
**Usage**: Animated text with individual character control
**Files**: artists.html
```css
.text-split {
    display: inline-block;
}
.text-split span {
    display: inline-block;
    transition: all var(--transition-fast);
}
/* Hover creates letter dance animation */
```

### 7. Gradient Text (.text-gradient)
**Usage**: Colored text effects
**Files**: donations.html, about.html
```css
.text-gradient {
    background: linear-gradient(45deg, var(--color-blue), var(--color-red));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
```

### 8. Outline Text (.text-outline)
**Usage**: Hollow text effects
**Files**: typography.css
```css
.text-outline {
    color: transparent;
    -webkit-text-stroke: 2px var(--color-black);
    text-stroke: 2px var(--color-black);
}
/* Mobile optimization reduces stroke width */
@media (max-width: 480px) {
  .text-outline {
    -webkit-text-stroke: 1px var(--color-black);
  }
}
```

## Typography Hierarchy & Usage

### Hierarchy Levels (Order of Visual Importance)
1. **Hero Massive**: `.hero-title-massive` - Landing page impact
2. **Glitch Headers**: `.text-glitch` - Section headers with effect
3. **Display Text**: `.text-display` - Page headers, pricing
4. **Mask Effects**: `.text-mask` - Artistic gradient fills
5. **Gallery Titles**: `.gallery-type-title` - Card/item headers
6. **Block Large**: `.text-block-large` - Composition elements
7. **Body Text**: Standard paragraph text
8. **Code Comments**: `.text-block-mono` - Technical annotations
9. **Meta Text**: `.gallery-type-meta` - Small labels

### Font Family Usage Patterns

**Bebas Neue (Display)**:
- Page headers and section titles
- Pricing displays
- Navigation elements
- Impact text requiring uppercase

**Playfair Display (Accent)**:
- Large composition text blocks
- Artistic elements requiring elegance
- Italic emphasis within compositions

**Space Mono (Code)**:
- Code-style comments with // prefix
- Technical metadata
- Timestamps and labels
- Navigation elements

**System Sans**:
- Body text and descriptions
- Form labels and inputs
- General readable content

## Responsive Typography Implementation

### Hero Text Scaling
```css
/* Defined in mobile-overrides.css */
.hero-title-massive {
    font-size: clamp(var(--font-size-4xl), 12vw, var(--font-size-6xl));
    line-height: 0.9;
    letter-spacing: -0.02em;
}

@media (max-width: 480px) {
  .hero-title-massive {
    font-size: clamp(var(--font-size-3xl), 10vw, var(--font-size-5xl));
  }
}
```

### Mobile Grid Stacking
```css
/* Text compositions stack on mobile */
@media (max-width: 768px) {
  .text-composition {
    grid-template-columns: 1fr !important;
    gap: var(--space-lg) !important;
  }
  
  .text-block-vertical {
    writing-mode: horizontal-tb;
    text-align: left;
  }
}
```

## Special Effects (Used Strategically)

### 1. Animation Effects
**Glitch Animation**: Distortion effect for emphasis
**Letter Dance**: Hover animation on split text
**Typewriter**: Controlled revealing animation

**Performance Note**: Mobile reduces/removes animations
```css
@media (max-width: 768px) {
  .text-glitch,
  .typewriter,
  .letter-dance {
    animation: none !important;
  }
}
```

### 2. Color Effects
```css
/* Strategic color accents */
.text-blue { color: var(--color-blue); }
.text-red { color: var(--color-red); }

/* Used in span elements within compositions */
.text-block-large span { color: var(--color-blue); }
```

## Accessibility Features

### High Contrast Support
```css
@media (prefers-contrast: high) {
  .text-mask {
    background: none;
    -webkit-text-fill-color: currentColor;
  }
}
```

### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

### Print Optimization
```css
@media print {
  body {
    font-size: 12pt;
    line-height: 1.5;
    color: black;
  }
  
  .text-mask {
    -webkit-text-fill-color: black;
  }
}
```

## Implementation Guidelines

### CSS File Organization
- **`/css/base.css`**: Design tokens and variables
- **`/css/typography.css`**: Typography effects and compositions
- **`/css/components.css`**: Gallery and card typography
- **`/css/mobile-overrides.css`**: Mobile-specific typography rules

### Best Practices

**Readability**:
- Maintain line height 1.4-1.6 for body text
- Use sufficient contrast (WCAG AA)
- Test readability at all viewport sizes
- Avoid text over complex backgrounds

**Performance**:
- Limit complex effects on mobile
- Use `content-visibility: auto` for large sections
- Optimize font loading with `font-display: swap`

**Consistency**:
- Use established patterns across pages
- Maintain font hierarchy relationships
- Limit to 3-4 font families per page
- Apply effects purposefully, not decoratively

### Common Combinations

**Hero Section Pattern**:
```html
<h1 class="text-glitch" data-text="TITLE">TITLE</h1>
<div class="text-composition">
    <div class="text-block-large">Impact statement</div>
    <div class="text-block-mono">// Technical details</div>
</div>
```

**Gallery Card Pattern**:
```html
<article class="gallery-item-type">
    <h3 class="gallery-type-title">TITLE</h3>
    <p class="gallery-type-meta">CATEGORY • TYPE</p>
    <p class="gallery-type-description">Description text</p>
</article>
```

**Pricing Pattern**:
```html
<div class="pricing-card-type">
    <p class="text-display" style="font-size: var(--font-size-4xl)">$100</p>
    <h3 class="text-display">FULL PASS</h3>
</div>
```

## Superseded Documentation

This specification replaces:
- `/spec/typography/text-styles.md` (complex version with excessive effects)
- Any inline documentation about typography patterns
- Outdated animation-heavy approaches

**Migration Note**: The complex version emphasized effects over readability. This simplified approach maintains visual impact while prioritizing usability and performance.

## Reference Files

**CSS Implementation**:
- `/css/base.css` - Design tokens
- `/css/typography.css` - Main typography effects
- `/css/mobile-overrides.css` - Responsive behavior

**HTML Examples**:
- `/pages/artists.html` - Complex compositions
- `/pages/home.html` - Hero patterns
- `/pages/tickets.html` - Display text usage
- `/pages/schedule.html` - Functional typography

## Summary

This typography system creates visual interest through:
- **Strategic font combinations** (4 font families)
- **Clear hierarchy** (9 levels)
- **Purposeful effects** (glitch, mask, gradient)
- **Responsive scaling** (clamp functions)
- **Accessibility compliance** (contrast, motion, print)

The system treats typography as art while maintaining readability and performance across all devices.