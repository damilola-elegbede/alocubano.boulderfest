# Hover States Specification

## Overview

This document provides a comprehensive specification of all hover and interactive state patterns implemented across the A Lo Cubano Boulder Fest website. The design emphasizes typography-forward interactions with smooth transitions and accessibility considerations.

## Design Philosophy

The hover states follow a consistent philosophy of:
- **Subtle motion**: Small transforms that enhance without overwhelming
- **Typography focus**: Text-based interactions with creative effects
- **Accessibility first**: Respectful of motion preferences and touch devices
- **Performance optimized**: Efficient animations using CSS transforms
- **Mobile adaptive**: Touch-friendly alternatives to hover states

## Global Transition System

### Base Transition Variables
```css
/* From /css/base.css lines 80-82 */
--transition-fast: 150ms ease;
--transition-base: 250ms ease;
--transition-slow: 350ms ease;
```

### Focus States
```css
/* From /css/base.css lines 209-221 */
:focus {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}

:focus:not(:focus-visible) {
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}
```

## Navigation Hover States

### Typographic Navigation (Primary Pattern)

**Logo Hover Effects**
```css
/* From /css/navigation.css lines 42-47 */
.typographic .logo-link {
  transition: transform 0.2s ease-in-out;
}

.typographic .logo-link:hover {
  transform: translateY(-1px);
}
```

**Logo Component Color Changes**
```css
/* From /css/navigation.css lines 86-97 */
.typographic .logo-link:hover .logo-main {
  color: var(--color-blue);
}

.typographic .logo-link:hover .logo-separator {
  color: var(--color-blue);
  transform: scale(1.1);
}

.typographic .logo-link:hover .logo-sub {
  color: var(--color-red);
}
```

**Navigation Link Animation**
```css
/* From /css/navigation.css lines 155-174 */
.typographic .nav-link::before {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  color: var(--color-black);
  font-weight: 700;
  transform: translateY(-100%);
  opacity: 0;
  transition: all var(--transition-base);
}

.typographic .nav-link:hover {
  color: transparent;
}

.typographic .nav-link:hover::before {
  transform: translateY(0);
  opacity: 1;
}
```

### Component Navigation (Alternative Pattern)

**Underline Animation**
```css
/* From /css/navigation.css lines 202-220 */
.nav-link::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 0;
  height: 2px;
  background-color: var(--color-red);
  transition: width var(--transition-base);
}

.nav-link:hover::after,
.nav-link.is-active::after {
  width: 100%;
}

.nav-link:hover {
  color: var(--color-red);
}
```

**Mobile Menu Toggle**
```css
/* From /css/navigation.css lines 248-251 */
.typographic .menu-toggle:hover {
  color: var(--color-red);
  transform: scale(1.1);
}
```

## Button Hover States

### Primary Button Pattern
```css
/* From /css/components.css lines 278-287 */
.btn-primary {
  background-color: var(--color-black);
  color: var(--color-white);
  border-color: var(--color-black);
  transition: all var(--transition-base);
}

.btn-primary:hover {
  background-color: transparent;
  color: var(--color-black);
}
```

### Secondary Button Pattern
```css
/* From /css/components.css lines 289-298 */
.btn-secondary {
  background-color: transparent;
  color: var(--color-black);
  border-color: var(--color-black);
}

.btn-secondary:hover {
  background-color: var(--color-black);
  color: var(--color-white);
}
```

### Accent Button Pattern
```css
/* From /css/components.css lines 300-309 */
.btn-accent {
  background-color: var(--color-red);
  color: var(--color-white);
  border-color: var(--color-red);
}

.btn-accent:hover {
  background-color: transparent;
  color: var(--color-red);
}
```

### Typographic Form Button
```css
/* From /css/typography.css lines 255-276 */
.form-button-type {
  position: relative;
  overflow: hidden;
  transition: all var(--transition-slow);
}

.form-button-type::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: var(--color-blue);
  transition: all var(--transition-slow);
  z-index: -1;
}

.form-button-type:hover {
  color: var(--color-white);
  border-color: var(--color-blue);
  transform: translateY(-2px);
}

.form-button-type:hover::before {
  left: 0;
}
```

## Card and Component Hover States

### Gallery Items
```css
/* From /css/components.css lines 88-92 */
.gallery-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
```

**Gallery Image Scale Effect**
```css
/* From /css/components.css lines 395-400 */
.gallery-image {
  transition: transform var(--transition-slow);
}

.gallery-item:hover .gallery-image {
  transform: scale(1.05);
}
```

### Generic Card Component
```css
/* From /css/components.css lines 312-322 */
.card {
  transition: all var(--transition-base);
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}
```

### Gallery Back Navigation
```css
/* From /css/components.css lines 372-378 */
.gallery-back-nav .back-link {
  transition: all var(--transition-base);
}

.gallery-back-nav .back-link:hover {
  transform: translateX(-5px);
  color: var(--color-blue);
}
```

## Festival Year Cards (Complex Hover Pattern)

### Card Transform and Gradient
```css
/* From /css/components.css lines 629-651 */
.festival-year-card {
  transition: all var(--transition-slow);
  overflow: hidden;
}

.festival-year-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(45deg, var(--color-blue), var(--color-red));
  transition: all var(--transition-slow);
  z-index: 0;
  opacity: 0;
}

.festival-year-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-xl);
  border-color: var(--color-blue);
}

.festival-year-card:hover::before {
  left: 0;
  opacity: 0.05;
}
```

**Hover Content Reveal**
```css
/* From /css/components.css lines 687-700 */
.year-card-hover {
  position: absolute;
  bottom: var(--space-lg);
  left: 50%;
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
  transition: all var(--transition-base);
  z-index: 2;
}

.festival-year-card:hover .year-card-hover {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
}
```

## Typography Effects

### Text Split Animation
```css
/* From /css/typography.css lines 279-307 */
.text-split span {
  display: inline-block;
  transition: all var(--transition-fast);
}

.text-split:hover span {
  animation: letterDance 0.5s ease-in-out;
}

@keyframes letterDance {
  0%, 100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(-5deg);
  }
}
```

### Variable Font Hover
```css
/* From /css/typography.css lines 387-398 */
.text-variable {
  font-family: var(--font-accent);
  transition: all var(--transition-slow);
}

.text-variable:hover {
  font-variation-settings: 'wght' 900;
  letter-spacing: var(--letter-spacing-tight);
  color: var(--color-blue);
}
```

### Social Link Animations
```css
/* From /css/typography.css lines 479-491 */
.social-link-type {
  transition: all var(--transition-base);
}

.social-link-type:hover {
  color: var(--color-primary);
  transform: translateY(-2px);
}
```

## Form Element Hover States

### Form Input Focus States
```css
/* From /css/forms.css lines 28-34 */
.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-blue);
  box-shadow: 0 0 0 3px rgba(91, 107, 181, 0.1);
}
```

### Typographic Form Inputs
```css
/* From /css/typography.css lines 208-229 */
.form-input-type {
  border-bottom: 2px solid var(--color-gray-300);
  transition: all var(--transition-base);
}

.form-input-type:focus {
  outline: none;
  border-bottom-color: var(--color-blue);
}

.form-input-type:focus + .form-label-type {
  color: var(--color-blue);
}
```

### Custom Checkbox Hover
```css
/* From /css/forms.css lines 281-283 */
.custom-checkbox:hover input ~ .checkmark {
  border-color: var(--color-blue);
}
```

### Ticket Form Elements
```css
/* From /css/typography.css lines 606-622 */
.ticket-option-type,
.addon-checkbox-type {
  transition: all var(--transition-base);
  cursor: pointer;
}

.ticket-option-type:hover,
.addon-checkbox-type:hover {
  background-color: var(--color-gray-100);
  transform: translateX(2px);
  border-color: var(--color-blue);
}
```

## Lightbox Controls

### Lightbox Navigation Buttons
```css
/* From /css/components.css lines 432-451 */
.lightbox-close,
.lightbox-prev,
.lightbox-next {
  color: var(--color-white);
  cursor: pointer;
  transition: opacity var(--transition-base);
}

.lightbox-close:hover,
.lightbox-prev:hover,
.lightbox-next:hover {
  opacity: 0.7;
}
```

## Mobile Touch Adaptations

### Hover State Removal on Mobile
```css
/* From /css/mobile-overrides.css lines 258-266 */
@media (max-width: 768px) {
  /* Remove hover transforms for performance */
  .gallery-item-type:hover {
    transform: none;
  }

  .nav-link:hover::after {
    animation: none;
  }
  
  /* Alternative approach: Disable hover on touch devices */
  @media (hover: none) {
    .gallery-item-type:hover,
    .nav-link:hover::after {
      /* Reset to non-hover state */
      transform: initial;
      animation: initial;
    }
  }
}
```

**⚠️ Best Practice**: Instead of using `!important`, prefer:
1. **Specificity**: Use more specific selectors
2. **Media queries**: `@media (hover: hover)` for hover-capable devices
3. **CSS resets**: Set properties to `initial` or `unset`
4. **Structured overrides**: Organize CSS to avoid specificity conflicts

### Touch Feedback (Active States)
```css
/* From /css/mobile-overrides.css lines 315-327 */
@media (max-width: 768px) {
  .menu-toggle:active,
  .form-button-type:active,
  .nav-link:active {
    transform: scale(0.98);
    transition: transform var(--duration-fast) var(--easing-ease);
  }

  .gallery-item-type:active {
    transform: scale(0.98);
    transition: transform var(--duration-fast) var(--easing-ease);
  }
}

/* Better approach: Use CSS custom properties for consistency */
@media (max-width: 768px) {
  .touch-feedback:active {
    transform: scale(var(--touch-scale, 0.98));
    transition: transform var(--duration-fast) var(--easing-ease);
  }
  
  /* Apply to all interactive elements */
  .menu-toggle,
  .form-button-type,
  .nav-link,
  .gallery-item-type {
    @extend .touch-feedback; /* or add the class directly */
  }
}
```

### Touch Target Sizing
```css
/* From /css/mobile-overrides.css lines 278-285 */
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

## Accessibility Considerations

### Reduced Motion Support
```css
/* From /css/typography.css lines 836-854 */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    transition-duration: 0.01ms;
  }
}

/* Better approach: Respect user preferences without !important */
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: none;
    transition: none;
  }
  
  /* For elements that need some transition for UX */
  .minimal-transition {
    transition-duration: var(--duration-fast);
    animation-duration: var(--duration-fast);
  }
}
```

**Accessibility Best Practices:**
1. **Avoid `!important`**: Use specific selectors instead
2. **Granular control**: Target specific animated elements rather than universal selector
3. **Preserve essential motion**: Keep transitions that aid usability (focus indicators)
4. **Test thoroughly**: Verify animations work correctly with reduced motion enabled

### High Contrast Mode Support
```css
/* From /css/typography.css lines 857-872 */
@media (prefers-contrast: high) {
  .form-input-type {
    border-bottom-width: 3px;
  }
  
  .gallery-item-type {
    border-width: 2px;
    border-color: var(--color-black);
  }
}
```

### Focus Indicators for Mobile
```css
/* From /css/mobile-overrides.css lines 288-293 */
@media (max-width: 768px) {
  .nav-link:focus,
  .form-button-type:focus,
  input:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
  }
}
```

## Performance Optimizations

### Hardware Acceleration
- All transforms use `transform` property for GPU acceleration
- `will-change` property used strategically on animated elements
- Transitions avoid layout-triggering properties

### Efficient Selectors
- Hover states use single-level selectors where possible
- Pseudo-elements efficiently handle overlay effects
- Transform-based animations over position changes

## Implementation Guidelines

### Adding New Hover States

1. **Use design system variables**:
   ```css
   transition: all var(--transition-base);
   ```

2. **Follow transform patterns**:
   ```css
   transform: translateY(-2px); /* Preferred over changing margin/padding */
   ```

3. **Include mobile adaptations**:
   ```css
   @media (max-width: 768px) {
     .your-element:hover {
       transform: none; /* Remove hover for touch devices */
     }
   }
   ```

4. **Consider accessibility**:
   ```css
   @media (prefers-reduced-motion: reduce) {
     .your-element {
       transition: none;
     }
   }
   ```

### Testing Checklist

- [ ] Hover states work on desktop browsers
- [ ] Touch states work on mobile devices
- [ ] Transitions respect reduced motion preferences
- [ ] Focus states are visible and accessible
- [ ] Performance is smooth at 60fps
- [ ] High contrast mode support is maintained

## File References

| Pattern | File | Lines |
|---------|------|-------|
| Base transitions | `/css/base.css` | 80-82 |
| Focus states | `/css/base.css` | 209-221 |
| Navigation hovers | `/css/navigation.css` | 42-220 |
| Button hovers | `/css/components.css` | 278-309 |
| Form hovers | `/css/forms.css` | 28-34, 281-283 |
| Typography effects | `/css/typography.css` | 255-398 |
| Mobile adaptations | `/css/mobile-overrides.css` | 258-327 |
| Gallery interactions | `/css/components.css` | 88-400 |
| Festival cards | `/css/components.css` | 629-700 |
| Lightbox controls | `/css/components.css` | 432-451 |

This specification provides complete coverage of all hover and interactive states implemented across the A Lo Cubano Boulder Fest website, with emphasis on accessibility, performance, and mobile adaptations.