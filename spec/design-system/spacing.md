# Spacing System

## Base Unit
The spacing system is based on an 8px grid with carefully chosen multipliers for consistency.

## Spacing Scale
```css
--space-xs: 0.25rem;    /* 4px */
--space-sm: 0.5rem;     /* 8px */
--space-md: 1rem;       /* 16px */
--space-lg: 1.5rem;     /* 24px */
--space-xl: 2rem;       /* 32px */
--space-2xl: 3rem;      /* 48px */
--space-3xl: 4rem;      /* 64px */
--space-4xl: 6rem;      /* 96px */
--space-5xl: 8rem;      /* 128px */
--space-6xl: 12rem;     /* 192px */
```

## Usage Patterns

### Component Spacing
- **Button Padding**: `var(--space-md) var(--space-xl)`
- **Card Padding**: `var(--space-xl)`
- **Section Padding**: `var(--space-4xl) 0` (vertical)
- **Nav Item Gap**: `var(--space-lg)`

### Layout Spacing
- **Container Padding**: `0 var(--space-xl)` (horizontal)
- **Grid Gap**: `var(--space-xl)`
- **Header Height**: `120px` (fixed + scroll)
- **Footer Padding**: `var(--space-3xl) 0`

### Typography Spacing
- **Paragraph Margin**: `var(--space-lg) 0`
- **Heading Margin**: `var(--space-2xl) 0 var(--space-xl)`
- **List Item Gap**: `var(--space-sm)`

## Responsive Adjustments
```css
/* Mobile adjustments */
@media (max-width: 768px) {
  :root {
    --space-4xl: 4rem;    /* Reduced from 6rem */
    --space-5xl: 6rem;    /* Reduced from 8rem */
    --space-6xl: 8rem;    /* Reduced from 12rem */
  }
}
```

## Grid System
- **Max Width**: `1440px`
- **Column Count**: 12 (desktop), 4 (mobile)
- **Gutter**: `var(--space-xl)`
- **Margin**: `auto` (centered)

## Visual Rhythm
The spacing system creates a consistent visual rhythm:
1. Tight spacing (`xs-sm`) for related elements
2. Medium spacing (`md-lg`) for component internals
3. Large spacing (`xl-3xl`) for section separation
4. Extra large (`4xl-6xl`) for dramatic breaks