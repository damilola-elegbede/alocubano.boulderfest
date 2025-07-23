# Spacing System

## Overview
The A Lo Cubano Boulder Fest spacing system is based on a consistent scale that promotes visual harmony and rhythm throughout the design. All spacing values are implemented as CSS custom properties in `/css/base.css`.

## Base Unit
The spacing system is based on an 8px grid (0.5rem) with carefully chosen multipliers for consistency and scalability.

## Spacing Scale

### Production Implementation
These are the actual spacing variables defined in `/css/base.css`:

```css
--space-xs: 0.25rem;    /* 4px  - Micro spacing */
--space-sm: 0.5rem;     /* 8px  - Small gaps */
--space-md: 1rem;       /* 16px - Standard spacing */
--space-lg: 1.5rem;     /* 24px - Section padding */
--space-xl: 2rem;       /* 32px - Large spacing */
--space-2xl: 3rem;      /* 48px - Section separation */
--space-3xl: 4rem;      /* 64px - Large section breaks */
--space-4xl: 6rem;      /* 96px - Dramatic spacing */
--space-5xl: 8rem;      /* 128px - Maximum vertical spacing */
```

### Scale Progression
- **Micro Scale**: `xs` (4px) for tight relationships
- **Base Scale**: `sm` (8px) → `md` (16px) → `lg` (24px) for general spacing
- **Extended Scale**: `xl` (32px) → `2xl` (48px) → `3xl` (64px) for larger separations
- **Hero Scale**: `4xl` (96px) → `5xl` (128px) for dramatic impact

## Usage Patterns

### Typography & Content Spacing
```css
/* Heading margins */
.hero-title { margin-bottom: var(--space-2xl); }
.section-title { margin-bottom: var(--space-xl); }
.subtitle { margin-bottom: var(--space-lg); }

/* Paragraph spacing */
p { margin-bottom: var(--space-md); }
.lead-text { margin-bottom: var(--space-lg); }

/* List spacing */
.nav-list { gap: var(--space-md); }
.social-links { gap: var(--space-sm); }
```

### Component Internal Spacing
```css
/* Card components */
.card { padding: var(--space-xl); }
.card-content { gap: var(--space-md); }

/* Button spacing */
.btn-primary { padding: var(--space-sm) var(--space-lg); }
.btn-secondary { padding: var(--space-md) var(--space-xl); }

/* Form elements */
.form-group { margin-bottom: var(--space-lg); }
.form-input { padding: var(--space-sm) var(--space-md); }
```

### Layout & Section Spacing
```css
/* Section padding */
.hero-section { padding: var(--space-4xl) 0; }
.content-section { padding: var(--space-3xl) 0; }
.compact-section { padding: var(--space-2xl) 0; }

/* Container spacing */
.container { padding: 0 var(--space-xl); }

/* Grid layouts */
.grid-layout { gap: var(--space-xl); }
.flex-layout { gap: var(--space-lg); }
```

### Navigation Spacing
```css
/* Header navigation */
.header { padding: var(--space-lg) 0; }
.nav-container { gap: var(--space-lg); }
.nav-links { gap: var(--space-md); }
.nav-item { padding: var(--space-xs) 0; }

/* Footer navigation */
.footer-nav { gap: var(--space-2xl); }
```

### Gallery & Media Spacing
```css
/* Gallery components */
.gallery-grid { gap: var(--space-md); }
.lightbox-container { padding: var(--space-xl); }
.image-caption { margin: var(--space-xs) 0; }
```

## Responsive Container Padding

The container component uses responsive padding that scales with screen size:

```css
.container {
  padding: 0 var(--space-xl);    /* Base: 32px */
}

/* Responsive adjustments */
@media (min-width: 640px) {
  .container { padding: 0 var(--space-lg); }    /* 24px */
}

@media (min-width: 768px) {
  .container { padding: 0 var(--space-xl); }    /* 32px */
}

@media (min-width: 1024px) {
  .container { padding: 0 var(--space-2xl); }   /* 48px */
}
```

## Mobile Responsive Patterns

Common mobile spacing adjustments found in `/css/mobile-overrides.css`:

```css
@media (max-width: 768px) {
  /* Reduced spacing for mobile */
  .hero-section { padding: var(--space-4xl) var(--space-xl) var(--space-xl); }
  .section-spacing { gap: var(--space-lg) !important; }
  .card-spacing { gap: var(--space-md) !important; }
  
  /* Tighter mobile layouts */
  .mobile-compact { gap: var(--space-xs) !important; }
  .mobile-padding { padding: var(--space-lg) !important; }
}
```

## Implementation Guidelines

### Choosing the Right Scale
1. **Micro spacing** (`xs`): Related elements, fine adjustments
2. **Small spacing** (`sm`): List items, form labels, tight relationships
3. **Medium spacing** (`md`): Paragraph margins, component internals
4. **Large spacing** (`lg`): Section margins, loose relationships
5. **Extra large** (`xl-2xl`): Section separation, major content blocks
6. **Hero scale** (`3xl-5xl`): Dramatic breaks, hero sections

### Consistency Rules
- Use spacing variables consistently - avoid arbitrary values
- Maintain vertical rhythm with consistent spacing patterns
- Consider mobile scaling when choosing larger spacing values
- Test spacing at different screen sizes for optimal readability

### Performance Considerations
- All spacing values are defined as CSS custom properties for consistency
- No runtime calculations required - all values are static
- Efficient cascade with minimal CSS specificity conflicts

## File References

### Primary Implementation
- **Variables Definition**: `/css/base.css` (lines 61-69)
- **Container Utilities**: `/css/base.css` (lines 156-192)

### Usage Examples
- **Typography**: `/css/typography.css` (extensive spacing usage)
- **Components**: `/css/components.css` (component-specific spacing)
- **Navigation**: `/css/navigation.css` (nav-specific spacing)
- **Forms**: `/css/forms.css` (form-specific spacing)
- **Mobile Overrides**: `/css/mobile-overrides.css` (responsive adjustments)

### Grid System Integration
- **Max Container Width**: `1440px`
- **Base Grid Unit**: `8px` (0.5rem)
- **Gutter System**: Based on `--space-xl` (32px)
- **Responsive Breakpoints**: 640px, 768px, 1024px

## Visual Rhythm & Design Theory

The spacing system creates visual rhythm through:

1. **Consistent Proportions**: Each level doubles or uses 1.5x multiplier
2. **Semantic Grouping**: Related elements use smaller spacing
3. **Hierarchical Separation**: Important breaks use larger spacing
4. **Responsive Scaling**: Proportional reduction on smaller screens

This system supports the typography-forward design philosophy by providing breathing room that lets the Cuban-inspired typography shine while maintaining clean, organized layouts.