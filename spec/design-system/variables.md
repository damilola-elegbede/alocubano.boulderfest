# Design System Variables Specification

## Overview

This document provides a comprehensive specification of all CSS custom properties (variables) defined in the A Lo Cubano Boulder Fest design system. All variables are defined in `/css/base.css` lines 3-99 within the `:root` selector.

**Source File**: `/css/base.css`  
**Last Updated**: July 2025  
**Total Variables**: 74 custom properties

## Color Variables

### Brand Colors
*Source: Lines 4-8*

Primary brand colors extracted from the festival logo and brand identity.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--color-primary-900` | `#000000` | Primary text, headers, high contrast elements | Core brand color (replaces --color-black) |
| `--color-primary-50` | `#FFFFFF` | Backgrounds, contrast text, cards | Primary background (replaces --color-white) |
| `--color-accent-600` | `#5B6BB5` | Accent color, links, focus states, highlights | Brand accent (replaces --color-blue) |
| `--color-secondary-600` | `#CC2936` | Call-to-action buttons, emphasis, alerts | Action color (replaces --color-red) |

**⚠️ MIGRATION NOTE**: The following variable names should be updated for consistency:
- `--color-black` → `--color-primary-900`
- `--color-white` → `--color-primary-50`
- `--color-blue` → `--color-accent-600`
- `--color-red` → `--color-secondary-600`

**Usage Examples:**
```css
/* Headers and primary text */
h1 { color: var(--color-primary-900); }

/* Focus states and interactive elements */
:focus { outline-color: var(--color-accent-600); }

/* Action buttons and CTAs */
.btn-primary { background: var(--color-secondary-600); }

/* Legacy support (to be migrated) */
h1 { color: var(--color-black); /* Use --color-primary-900 instead */ }
:focus { outline-color: var(--color-blue); /* Use --color-accent-600 instead */ }
.btn-primary { background: var(--color-red); /* Use --color-secondary-600 instead */ }
```

### Gray Scale
*Source: Lines 10-19*

Nine-step gray scale for subtle variations and interface elements.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--color-gray-900` | `#111111` | Near-black text, high contrast | Darkest gray |
| `--color-gray-800` | `#333333` | Dark text, secondary headers | |
| `--color-gray-700` | `#555555` | Medium-dark text | |
| `--color-gray-600` | `#666666` | Body text, subdued content | |
| `--color-gray-500` | `#888888` | Muted text, placeholders | |
| `--color-gray-400` | `#999999` | Disabled text, subtle elements | |
| `--color-gray-300` | `#BBBBBB` | Borders, separators | |
| `--color-gray-200` | `#DDDDDD` | Light borders, subtle backgrounds | |
| `--color-gray-100` | `#F5F5F5` | Light backgrounds, cards | Lightest gray |

## Typography Variables

### Font Sizes
*Source: Lines 21-34*

Comprehensive typography scale from extra small to extra large display sizes.

| Variable | Value | Pixel Equivalent | Usage | Notes |
|----------|-------|------------------|-------|-------|
| `--font-size-xs` | `0.75rem` | 12px | Fine print, captions | Smallest size |
| `--font-size-sm` | `0.875rem` | 14px | Small text, labels | |
| `--font-size-base` | `1rem` | 16px | Body text, default | Base size |
| `--font-size-lg` | `1.125rem` | 18px | Large body text | |
| `--font-size-xl` | `1.25rem` | 20px | Subheadings | |
| `--font-size-2xl` | `1.5rem` | 24px | Section headers | |
| `--font-size-3xl` | `1.875rem` | 30px | Page headers | |
| `--font-size-4xl` | `2.25rem` | 36px | Large headers | |
| `--font-size-5xl` | `3rem` | 48px | Display headers | |
| `--font-size-6xl` | `3.75rem` | 60px | Large display | |
| `--font-size-7xl` | `4.5rem` | 72px | Extra large display | |
| `--font-size-8xl` | `6rem` | 96px | Hero text | |
| `--font-size-9xl` | `8rem` | 128px | Massive display | Largest size |

### Font Families
*Source: Lines 36-42*

Typography system with fallback stacks for different use cases.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` | Body text, general UI | System font stack |
| `--font-serif` | `Georgia, Cambria, 'Times New Roman', Times, serif` | Traditional text | Classic serif stack |
| `--font-mono` | `'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace` | Code, technical text | Monospace stack |
| `--font-display` | `'Bebas Neue', var(--font-sans)` | Headers, display text | Brand display font |
| `--font-accent` | `'Playfair Display', var(--font-serif)` | Artistic elements | Elegant accent font |
| `--font-code` | `var(--font-mono)` | Code blocks | References mono stack |

**Typography Usage in Base Styles:**
```css
/* Body text uses system fonts - Line 119 */
body { font-family: var(--font-sans); }
```

### Line Heights
*Source: Lines 44-50*

Six-step line height scale for optimal readability.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--line-height-none` | `1` | Tight spacing, large headers | No extra space |
| `--line-height-tight` | `1.25` | Headers, condensed text | Minimal space |
| `--line-height-snug` | `1.375` | Subheadings | Slight space |
| `--line-height-normal` | `1.5` | Body text, default | Standard readability |
| `--line-height-relaxed` | `1.625` | Comfortable reading | Extra space |
| `--line-height-loose` | `2` | Airy text, special cases | Maximum space |

### Letter Spacing
*Source: Lines 52-58*

Letter spacing scale for typography fine-tuning.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--letter-spacing-tighter` | `-0.05em` | Condensed headers | Tightest spacing |
| `--letter-spacing-tight` | `-0.025em` | Large text | Slight condensing |
| `--letter-spacing-normal` | `0` | Body text, default | No adjustment |
| `--letter-spacing-wide` | `0.025em` | Spaced text | Slight expansion |
| `--letter-spacing-wider` | `0.05em` | Open text | More expansion |
| `--letter-spacing-widest` | `0.1em` | Very spaced text | Maximum spacing |

## Spacing Variables

### Spacing Scale
*Source: Lines 60-69*

Nine-step spacing scale for consistent layout rhythm.

| Variable | Value | Pixel Equivalent | Usage | Notes |
|----------|-------|------------------|-------|-------|
| `--space-xs` | `0.25rem` | 4px | Micro spacing, fine adjustments | Smallest unit |
| `--space-sm` | `0.5rem` | 8px | Small gaps, tight padding | |
| `--space-md` | `1rem` | 16px | Standard spacing, paragraph gaps | Base unit |
| `--space-lg` | `1.5rem` | 24px | Section padding, medium gaps | |
| `--space-xl` | `2rem` | 32px | Large spacing, component gaps | |
| `--space-2xl` | `3rem` | 48px | Section separation | |
| `--space-3xl` | `4rem` | 64px | Large section gaps | |
| `--space-4xl` | `6rem` | 96px | Major section separation | |
| `--space-5xl` | `8rem` | 128px | Page-level spacing | Largest unit |

**Spacing Usage in Base Styles:**
```css
/* Container padding uses responsive spacing - Lines 160, 178, 184, 190 */
.container { padding: 0 var(--space-xl); }
```

## Visual Effect Variables

### Border Radius
*Source: Lines 71-77*

Border radius scale from sharp to fully rounded.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--radius-none` | `0` | Sharp corners, geometric design | No rounding |
| `--radius-sm` | `0.125rem` | Subtle rounding | Minimal curve |
| `--radius-md` | `0.25rem` | Standard buttons, cards | Default rounding |
| `--radius-lg` | `0.5rem` | Prominent elements | Noticeable curve |
| `--radius-xl` | `1rem` | Large components | Strong rounding |
| `--radius-full` | `9999px` | Circular elements, pills | Complete circle |

### Transitions
*Source: Lines 79-82*

Flexible transition system with separate duration and easing tokens for maximum customization.

#### Duration Tokens
| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--duration-fast` | `150ms` | Quick interactions, hovers | Snappy response |
| `--duration-base` | `250ms` | Standard animations | Default timing |
| `--duration-slow` | `350ms` | Smooth, deliberate motion | Relaxed timing |
| `--duration-slower` | `500ms` | Complex animations | Extended timing |

#### Easing Tokens
| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--easing-ease` | `ease` | General purpose | Default easing |
| `--easing-ease-in` | `ease-in` | Starting motion | Accelerating |
| `--easing-ease-out` | `ease-out` | Ending motion | Decelerating |
| `--easing-ease-in-out` | `ease-in-out` | Complete motion | Smooth start/end |
| `--easing-cubic-bezier` | `cubic-bezier(0.4, 0, 0.2, 1)` | Material Design | Custom curve |

#### Composite Transitions (Legacy)
| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--transition-fast` | `var(--duration-fast) var(--easing-ease)` | Quick interactions | Backward compatibility |
| `--transition-base` | `var(--duration-base) var(--easing-ease)` | Standard animations | Backward compatibility |
| `--transition-slow` | `var(--duration-slow) var(--easing-ease)` | Smooth motion | Backward compatibility |

**Usage Examples:**
```css
/* Flexible approach - mix and match */
.element {
  transition: transform var(--duration-base) var(--easing-ease-out),
              opacity var(--duration-fast) var(--easing-ease);
}

/* Legacy approach - still supported */
.legacy-element {
  transition: all var(--transition-base);
}

/* Complex animation with different timings */
.complex-element {
  transition: 
    transform var(--duration-slow) var(--easing-cubic-bezier),
    background-color var(--duration-fast) var(--easing-ease),
    box-shadow var(--duration-base) var(--easing-ease-out);
}
```

### Shadows
*Source: Lines 84-88*

Four-level shadow system for depth and elevation.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.05)` | Subtle depth, cards | Minimal shadow |
| `--shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.1)` | Standard elevation | Default shadow |
| `--shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.1)` | Prominent elements | Strong shadow |
| `--shadow-xl` | `0 20px 25px -5px rgba(0, 0, 0, 0.1)` | Floating elements | Maximum shadow |

## Layout Variables

### Z-Index Scale
*Source: Lines 90-98*

Layering system for consistent stacking context.

| Variable | Value | Usage | Notes |
|----------|-------|-------|-------|
| `--z-base` | `0` | Base layer, default content | Ground level |
| `--z-dropdown` | `1000` | Dropdown menus | Above content |
| `--z-sticky` | `1020` | Sticky elements | Above dropdowns |
| `--z-fixed` | `1030` | Fixed positioned elements | Above sticky |
| `--z-modal-backdrop` | `1040` | Modal backgrounds | Overlay layer |
| `--z-modal` | `1050` | Modal content | Above backdrop |
| `--z-popover` | `1060` | Popovers, tooltips | Above modals |
| `--z-tooltip` | `1070` | Tooltips | Highest UI layer |

**Z-Index Usage in Base Styles:**
```css
/* Focus outline uses blue color - Lines 210, 219 */
:focus { outline: 2px solid var(--color-primary-600); }
```

## Variable Usage Patterns

### Container System
The container utility class demonstrates responsive spacing usage:
```css
.container {
  padding: 0 var(--space-xl);     /* Default: 32px */
}

@media (min-width: 640px) {
  .container {
    padding: 0 var(--space-lg);   /* Tablet: 24px */
  }
}

@media (min-width: 1024px) {
  .container {
    padding: 0 var(--space-2xl);  /* Desktop: 48px */
  }
}
```

### Typography Defaults
Base typography uses the variable system:
```css
body {
  font-family: var(--font-sans);      /* System font stack */
  font-size: var(--font-size-base);   /* 16px base size */
  color: var(--color-gray-900);       /* Primary text color */
  background-color: var(--color-white); /* Primary background */
}
```

### Accessibility Features
Focus states use the brand blue:
```css
:focus, :focus-visible {
  outline: 2px solid var(--color-primary-600);
  outline-offset: 2px;
}
```

## Implementation Notes

### Variable Naming Convention
- **Color**: `--color-{semantic}-{intensity}` (e.g., `--color-primary-900`, `--color-accent-600`)
  - Semantic names: `primary`, `secondary`, `accent`, `neutral`, `success`, `warning`, `error`
  - Intensity scale: 50 (lightest) to 900 (darkest)
- **Typography**: `--font-{property}-{size/name}` (e.g., `--font-size-base`, `--font-family-display`)
- **Spacing**: `--space-{size}` (e.g., `--space-md`, `--space-xl`)
- **Effects**: `--{property}-{size}` (e.g., `--radius-md`, `--shadow-lg`)
- **Layout**: `--z-{context}` (e.g., `--z-modal`, `--z-dropdown`)

**Best Practices:**
- Use semantic naming over literal colors (primary vs black)
- Follow intensity scale for consistent gradations
- Maintain backward compatibility during migrations
- Document breaking changes clearly

### Browser Support
All variables use standard CSS custom property syntax with full modern browser support. No fallbacks are provided, indicating the design system targets modern browsers exclusively.

### Responsive Strategy
The design system uses a mobile-first approach with breakpoints at:
- `640px` (tablet)
- `768px` (desktop)
- `1024px` (large desktop)

### File Organization
Variables are centralized in `/css/base.css` for single source of truth, with the complete variable definition spanning lines 3-99 of the file.

## Related Files

- **Source**: `/css/base.css` - Complete variable definitions
- **Typography**: `/css/typography.css` - Typography implementations
- **Components**: `/css/components.css` - Component-specific usage
- **Navigation**: `/css/navigation.css` - Navigation styling
- **Forms**: `/css/forms.css` - Form element styling
- **Mobile**: `/css/mobile-overrides.css` - Responsive overrides