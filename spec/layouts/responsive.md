# Responsive Layout Specifications

## Overview

The A Lo Cubano Boulder Fest website uses a **hybrid approach** that combines mobile-first design principles with desktop-first protection to ensure optimal performance across all devices. The responsive system is typography-forward, emphasizing readability and user experience at every breakpoint.

## Breakpoint System

### Primary Breakpoints

| Breakpoint | Width | Target Device | Implementation File |
|------------|-------|---------------|-------------------|
| **Mobile** | ≤ 480px | Small phones | `/css/mobile-overrides.css` (line 334) |
| **Mobile Large** | ≤ 768px | Phones, small tablets | `/css/mobile-overrides.css` (line 36) |
| **Tablet** | 640px - 768px | Tablets | `/css/base.css` (line 176) |
| **Desktop Small** | 769px - 1024px | Small desktops, laptops | `/css/base.css` (line 182) |
| **Desktop Large** | ≥ 1024px | Large desktops | `/css/base.css` (line 188) |

### Desktop Protection Breakpoint

```css
/* Desktop-first protection - /css/mobile-overrides.css line 11 */
@media (min-width: 769px) {
  /* Ensures desktop navigation always works */
}
```

## Mobile-First Implementation Strategy

### Core Philosophy
The website implements a **desktop-first protection model** where:
- All styles are desktop-optimized by default
- Mobile overrides are applied as enhancements
- Desktop functionality is never broken by mobile styles
- Performance is optimized for mobile devices

### Implementation Files Structure

```
/css/
├── base.css              # Desktop-first core system
├── mobile-overrides.css  # Mobile-only enhancements  
├── components.css        # Component responsive patterns
├── typography.css        # Typography responsive scaling
├── navigation.css        # Navigation responsive behavior
└── forms.css            # Form responsive optimization
```

## Responsive Component Patterns

### 1. Navigation System

#### Desktop Navigation (`/css/navigation.css` lines 125-141)
```css
.nav-list {
  display: flex;
  gap: var(--space-2xl);
  align-items: baseline;
}
```

#### Mobile Navigation (`/css/mobile-overrides.css` lines 68-101)
```css
@media (max-width: 768px) {
  .nav-list.is-open {
    display: flex;
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    max-width: 300px;
    height: 100vh;
    flex-direction: column;
    gap: var(--space-lg);
  }
}
```

**Key Behaviors:**
- Desktop: Horizontal navigation with hover effects
- Mobile: Full-screen overlay menu with slide-in animation
- Touch-optimized targets (44px minimum)
- Backdrop blur effects for visual hierarchy

### 2. Typography Scaling

#### Responsive Typography Scale (`/css/mobile-overrides.css` lines 107-145)

| Element | Desktop Size | Mobile Size | Implementation |
|---------|-------------|-------------|----------------|
| **Hero Title** | `var(--font-size-6xl)` | `clamp(var(--font-size-4xl), 12vw, var(--font-size-6xl))` | Line 110 |
| **Display Text** | `var(--font-size-3xl)` | `clamp(var(--font-size-xl), 6vw, var(--font-size-3xl))` | Line 122 |
| **Gallery Titles** | `var(--font-size-2xl)` | `var(--font-size-xl)` | Line 132 |

**Responsive Typography Features:**
- Fluid typography using `clamp()` for optimal scaling
- Viewport-based sizing (vw units) for dynamic scaling
- Line-height optimization for mobile readability
- Letter-spacing adjustments for smaller screens

### 3. Grid Layout Transformations

#### Desktop Grid Patterns (`/css/typography.css` lines 71-76)
```css
.text-composition {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-xl);
}
```

#### Mobile Grid Stacking (`/css/mobile-overrides.css` lines 168-193)
```css
@media (max-width: 768px) {
  .text-composition {
    grid-template-columns: 1fr !important;
    gap: var(--space-lg) !important;
  }
  
  .pricing-grid {
    grid-template-columns: 1fr !important;
  }
  
  .gallery-typographic {
    grid-template-columns: 1fr !important;
  }
}
```

### 4. Container and Spacing System

#### Responsive Container Sizing (`/css/base.css` lines 176-192)
```css
.container {
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-xl); /* Desktop default */
}

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

#### Mobile Container Adjustments (`/css/mobile-overrides.css` lines 152-166)
```css
@media (max-width: 768px) {
  .container {
    padding: 0 var(--space-lg);
    max-width: 100%;
  }
}

@media (max-width: 480px) {
  .container {
    padding: 0 var(--space-md);
  }
}
```

## Form Responsive Behavior

### Desktop Form Layout (`/css/forms.css` lines 64-68)
```css
.form-grid-type {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}
```

### Mobile Form Optimization (`/css/mobile-overrides.css` lines 200-244)

**Key Mobile Form Features:**
- Single-column layout for all form grids
- Increased touch targets (min 44px)
- 16px font size to prevent zoom on iOS
- Enhanced visual feedback for touch interactions
- Full-width buttons with improved accessibility

```css
@media (max-width: 768px) {
  .form-input-type {
    font-size: 16px !important; /* Prevents iOS zoom */
    min-height: 44px;
    touch-action: manipulation;
  }
  
  .form-button-type {
    width: 100% !important;
    min-height: 48px;
  }
}
```

## Gallery Responsive System

### Desktop Gallery Grid (`/css/components.css` lines 338-342)
```css
.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: var(--space-md);
}
```

### Mobile Gallery Adaptation (`/css/components.css` lines 594-598)
```css
@media (max-width: 768px) {
  .gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-sm);
  }
}
```

**Gallery Responsive Features:**
- Aspect ratio preservation across breakpoints
- Lazy loading optimization for mobile performance
- Touch-optimized interaction patterns
- Hero image scaling with viewport optimization

## Performance Optimizations

### Mobile-Specific Performance (`/css/mobile-overrides.css` lines 250-271)

**Animation Reduction:**
```css
@media (max-width: 768px) {
  .text-glitch,
  .typewriter,
  .letter-dance {
    animation: none !important;
  }
  
  * {
    background-attachment: scroll !important;
  }
}
```

**Touch Interaction Optimization:**
```css
@media (max-width: 768px) {
  .menu-toggle:active,
  .form-button-type:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
  }
}
```

## Accessibility Features

### Touch Target Compliance (`/css/mobile-overrides.css` lines 277-308)
```css
@media (max-width: 768px) {
  .nav-link,
  .social-link-type,
  .menu-toggle,
  .form-button-type {
    min-height: 44px;
    min-width: 44px;
  }
}
```

### Focus Management
```css
@media (max-width: 768px) {
  input:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }
}
```

### Text Scaling Prevention
```css
@media (max-width: 768px) {
  body {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
}
```

## Advanced Responsive Features

### Reduced Motion Support (`/css/typography.css` lines 836-854)
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### High Contrast Mode (`/css/typography.css` lines 857-872)
```css
@media (prefers-contrast: high) {
  .text-mask {
    -webkit-text-fill-color: currentColor;
  }
  
  .form-input-type {
    border-bottom-width: 3px;
  }
}
```

### Print Styles (`/css/typography.css` lines 806-833)
```css
@media print {
  body {
    font-size: 12pt;
    line-height: 1.5;
    color: black;
    background: white;
  }
}
```

## Implementation Guidelines

### 1. Mobile-First Approach
- Start with mobile styles as base
- Use `min-width` media queries for progressive enhancement
- Ensure touch targets meet WCAG guidelines (44px minimum)

### 2. Performance Considerations
- Reduce animations on mobile devices
- Optimize image loading with lazy loading
- Use `content-visibility: auto` for off-screen content

### 3. Typography Hierarchy
- Use `clamp()` for fluid typography scaling
- Maintain readability across all breakpoints
- Adjust line-height and letter-spacing for mobile

### 4. Layout Patterns
- Transform complex grids to single-column on mobile
- Stack components vertically on smaller screens
- Maintain visual hierarchy through spacing adjustments

## Testing Requirements

### Browser Testing
- Chrome Mobile (Android)
- Safari Mobile (iOS)
- Desktop Chrome, Firefox, Safari
- Edge on Windows

### Device Testing
- iPhone SE (375px width)
- Standard mobile (414px width)
- Tablet portrait (768px width)
- Desktop (1024px+ width)

### Performance Metrics
- First Contentful Paint < 2.5s on mobile
- Largest Contentful Paint < 4s on mobile
- Cumulative Layout Shift < 0.1
- Touch target accessibility compliance

## Common Responsive Patterns Used

1. **Grid Stacking**: Multi-column grids become single-column
2. **Navigation Transformation**: Horizontal nav becomes overlay menu
3. **Typography Scaling**: Fluid sizing with clamp() function
4. **Container Adjustment**: Responsive padding and max-width
5. **Form Optimization**: Single-column forms with enhanced touch targets
6. **Image Optimization**: Responsive images with lazy loading
7. **Performance Enhancement**: Reduced animations and optimized rendering

This responsive system ensures the A Lo Cubano Boulder Fest website delivers an optimal experience across all devices while maintaining the typography-forward design philosophy and Cuban cultural authenticity.