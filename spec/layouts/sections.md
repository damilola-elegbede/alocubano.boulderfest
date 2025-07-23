# Section Layout Specifications

## Overview

This document defines the reusable section patterns used across the A Lo Cubano Boulder Fest website. These patterns provide consistent layout structures while supporting the typography-forward design philosophy.

## Architecture

### CSS File Structure
- **Base Patterns**: `/css/base.css` (lines 156-226) - Container and utilities
- **Typography Sections**: `/css/typography.css` (lines 66-148) - Core section types
- **Components**: `/css/components.css` (lines 147-400) - Gallery and specialized sections
- **Mobile Overrides**: `/css/mobile-overrides.css` (lines 151-194) - Responsive adaptations

---

## 1. Hero Splash Section Pattern

### Description
Full-width image hero section with dynamic content loading, used on every main page.

### CSS Implementation
```css
/* File: /css/components.css, lines 202-240 */
.gallery-hero-splash {
  position: relative;
  width: 100%;
  height: 60vh;
  min-height: 400px;
  overflow: hidden;
  margin-bottom: var(--space-3xl);
}

.hero-image-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.hero-splash-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  transition: opacity 0.5s ease-in-out;
}
```

### HTML Pattern
```html
<section class="gallery-hero-splash">
    <div class="hero-image-container">
        <img id="hero-splash-image" 
             src="" 
             alt="Dynamic hero image description" 
             class="hero-splash-img" 
             style="object-position: top center !important;">
    </div>
</section>
```

### Usage Examples
- **Home**: `/pages/home.html` (lines 61-65)
- **About**: `/pages/about.html` (lines 54-58)
- **Artists**: `/pages/artists.html` (lines 54-58)
- **Gallery**: `/pages/gallery.html` (lines 54-58)

### Mobile Behavior
```css
/* File: /css/components.css, lines 235-240 */
@media (max-width: 768px) {
  .gallery-hero-splash {
    height: 50vh;
    min-height: 300px;
  }
}
```

### Content Guidelines
- **Alt text**: Descriptive, page-specific content
- **Object position**: Always `top center`
- **Dynamic loading**: Handled by `/js/gallery-hero.js`

---

## 2. Typographic Content Section Pattern

### Description
The core content section for typography-forward design, supporting flexible text layouts.

### CSS Implementation
```css
/* File: /css/typography.css, lines 66-122 */
.section-typographic {
  padding: var(--space-4xl) 0;
  position: relative;
}

.text-composition {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-xl);
  align-items: start;
}

.text-block-large {
  grid-column: span 8;
  font-family: var(--font-accent);
  font-size: var(--font-size-4xl);
  line-height: var(--line-height-tight);
  font-weight: 900;
  color: var(--color-black);
}

.text-block-small {
  grid-column: span 4;
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-gray-700);
}

.text-block-mono {
  grid-column: span 6;
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wide);
  line-height: var(--line-height-loose);
  background: var(--color-gray-100);
  padding: var(--space-xl);
  border-left: 4px solid var(--color-blue);
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <div class="text-composition">
            <div class="text-block-large">
                Experience <span>3 Days</span> of pure Cuban rhythm
            </div>
            <div class="text-block-mono">
                // MAY 15-17, 2026<br>
                // BOULDER, COLORADO<br>
                // 20+ WORLD-CLASS ARTISTS
            </div>
            <div class="text-block-small">
                <p>Most of our artists hailing from Cuba...</p>
            </div>
        </div>
    </div>
</section>
```

### Usage Examples
- **Home**: `/pages/home.html` (lines 67-86, 88-115, 117-148)
- **About**: `/pages/about.html` (lines 61-75, 77-116, 119-135)
- **Artists**: `/pages/artists.html` (lines 61-83)

### Mobile Behavior
```css
/* File: /css/typography.css, lines 687-722 */
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

### Content Guidelines
- **Blue spans**: Use for emphasis words
- **Mono blocks**: Technical/metadata content with `//` prefixes
- **Large blocks**: Primary messaging, serif font preferred

---

## 3. Gallery Grid Section Pattern

### Description
Flexible grid layout for showcasing items with typography-based metadata.

### CSS Implementation
```css
/* File: /css/typography.css, lines 124-184 */
.gallery-typographic {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-2xl);
  padding: var(--space-3xl) 0;
}

.gallery-item-type {
  position: relative;
  padding: var(--space-2xl);
  background: var(--color-white);
  border: 1px solid var(--color-gray-200);
  transition: all var(--transition-base);
  overflow: hidden;
}

.gallery-item-type::before {
  content: attr(data-number);
  position: absolute;
  top: -20px;
  right: -20px;
  font-family: var(--font-display);
  font-size: var(--font-size-8xl);
  line-height: 1;
  color: var(--color-gray-100);
  z-index: 0;
}

.gallery-type-title {
  font-family: var(--font-accent);
  font-size: var(--font-size-2xl);
  font-weight: 900;
  margin-bottom: var(--space-md);
  position: relative;
  z-index: 1;
}

.gallery-type-meta {
  font-family: var(--font-code);
  font-size: var(--font-size-xs);
  letter-spacing: var(--letter-spacing-wider);
  text-transform: uppercase;
  color: var(--color-red);
  margin-bottom: var(--space-lg);
}

.gallery-type-description {
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  line-height: var(--line-height-relaxed);
  color: var(--color-gray-700);
  position: relative;
  z-index: 1;
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <div class="gallery-typographic">
            <div class="gallery-item-type" data-number="01">
                <h3 class="gallery-type-title">SALSA</h3>
                <p class="gallery-type-meta">The heartbeat of Cuban music</p>
                <p class="gallery-type-description">Fast rhythms • Partner dancing • Social energy</p>
            </div>
            <!-- More items... -->
        </div>
    </div>
</section>
```

### Usage Examples
- **Home**: `/pages/home.html` (lines 92-113, 121-146)
- **About**: `/pages/about.html` (lines 88-115, 145-178, 192-238)
- **Artists**: `/pages/artists.html` (lines 87-179, 195-220, 227-244)

### Mobile Behavior
```css
/* File: /css/typography.css, lines 734-738 */
@media (max-width: 480px) {
  .gallery-typographic {
    grid-template-columns: 1fr;
    gap: var(--space-lg);
  }
}
```

### Content Guidelines
- **data-number**: Sequential numbering or meaningful codes
- **Title**: Display font, all caps preferred
- **Meta**: Mono font, red color, uppercase
- **Description**: Bullet points with `•` separator

---

## 4. Form Section Pattern

### Description
Typography-focused form layouts with enhanced input styling.

### CSS Implementation
```css
/* File: /css/typography.css, lines 187-276 */
.form-typographic {
  max-width: 600px;
  margin: 0 auto;
}

.form-group-type {
  margin-bottom: var(--space-2xl);
  position: relative;
}

.form-label-type {
  display: block;
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wider);
  text-transform: uppercase;
  color: var(--color-gray-600);
  margin-bottom: var(--space-sm);
  transition: all var(--transition-fast);
}

.form-input-type {
  width: 100%;
  padding: var(--space-md) 0;
  font-family: var(--font-accent);
  font-size: var(--font-size-xl);
  font-weight: 400;
  line-height: var(--line-height-normal);
  color: var(--color-black);
  background: transparent;
  border: none;
  border-bottom: 2px solid var(--color-gray-300);
  transition: all var(--transition-base);
}

.form-button-type {
  display: inline-block;
  padding: var(--space-lg) var(--space-3xl);
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  letter-spacing: var(--letter-spacing-wider);
  text-transform: uppercase;
  color: var(--color-white);
  background: var(--color-black);
  border: 2px solid var(--color-black);
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: all var(--transition-slow);
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <form class="form-typographic">
            <div class="form-group-type">
                <label class="form-label-type font-mono">FIRST NAME</label>
                <input type="text" class="form-input-type" required>
            </div>
            <div class="form-actions-type">
                <button type="submit" class="form-button-type">
                    SUBMIT APPLICATION
                </button>
            </div>
        </form>
    </div>
</section>
```

### Usage Examples
- **About**: `/pages/about.html` (lines 337-422) - Volunteer form
- **Donations**: `/pages/donations.html` (lines 71-154) - Donation form
- **Tickets**: `/pages/tickets.html` (lines 132-209) - Ticket form

### Mobile Behavior
```css
/* File: /css/mobile-overrides.css, lines 200-244 */
@media (max-width: 768px) {
  .form-button-type {
    width: 100% !important;
    padding: var(--space-lg) !important;
    font-size: var(--font-size-base) !important;
    min-height: 48px;
    touch-action: manipulation;
  }
}
```

### Form Validation
- **Required fields**: Use `required` attribute
- **Touch targets**: Minimum 44px height on mobile
- **Focus states**: Blue outline at 2px offset

---

## 5. Pricing/Stats Section Pattern

### Description
Grid-based layout for displaying pricing, statistics, or numerical information.

### CSS Implementation
```css
/* File: /css/typography.css, lines 624-657 */
.pricing-typographic {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-2xl);
  margin: var(--space-3xl) 0;
}

.pricing-card-type {
  transition: all var(--transition-slow);
  padding: var(--space-xl);
  border: 1px solid var(--color-gray-200);
  border-radius: var(--radius-md);
  background: var(--color-white);
}

.pricing-card-type:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: var(--color-blue);
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <div class="pricing-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xl);">
            <div class="price-item" style="padding: var(--space-xl); border: 2px solid var(--color-black);">
                <h3 class="font-display">EARLY BIRD</h3>
                <p class="text-display">$100</p>
                <p class="font-mono">Before April 1st</p>
            </div>
        </div>
    </div>
</section>
```

### Usage Examples
- **Tickets**: `/pages/tickets.html` (lines 64-86, 88-108, 110-125)
- **About**: `/pages/about.html` (lines 246-259) - Impact statistics

### Mobile Behavior
```css
/* File: /css/mobile-overrides.css, lines 179-194 */
@media (max-width: 768px) {
  .pricing-grid {
    grid-template-columns: 1fr !important;
    gap: var(--space-lg) !important;
  }
}
```

### Content Guidelines
- **Numbers**: Large display font
- **Labels**: Mono font, uppercase
- **Hover effects**: Subtle lift and border color change

---

## 6. Schedule/Timeline Section Pattern

### Description
Structured layout for time-based information with clear hierarchy.

### CSS Implementation
```css
/* Custom inline styles in schedule.html */
.schedule-item {
  padding: var(--space-lg) 0;
  border-bottom: 1px solid var(--color-gray-200);
}

.schedule-item [style*="grid-template-columns: 140px 1fr"] {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: var(--space-xl);
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <div class="schedule-day">
            <h2 class="text-display">FRIDAY, MAY 16</h2>
            <div class="schedule-items">
                <div class="schedule-item">
                    <div style="display: grid; grid-template-columns: 140px 1fr; gap: var(--space-xl);">
                        <div class="time font-mono">4:00 - 5:00 PM</div>
                        <div class="details">
                            <h3 class="font-display">LAROYE ~ ORISHAS</h3>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>
```

### Usage Examples
- **Schedule**: `/pages/schedule.html` (lines 61-231)

### Mobile Behavior
Schedule items stack vertically on mobile with simplified spacing.

---

## 7. Navigation/Year Cards Section Pattern

### Description
Card-based navigation for year-based content with hover effects.

### CSS Implementation
```css
/* File: /css/components.css, lines 604-760 */
.festival-years-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-2xl);
  margin: var(--space-3xl) 0;
}

.festival-year-card {
  position: relative;
  background: var(--color-white);
  border: 2px solid var(--color-gray-200);
  border-radius: var(--radius-lg);
  padding: var(--space-3xl) var(--space-2xl);
  text-decoration: none;
  color: inherit;
  transition: all var(--transition-slow);
  overflow: hidden;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.festival-year-card:hover {
  transform: translateY(-8px);
  box-shadow: var(--shadow-xl);
  border-color: var(--color-blue);
}
```

### HTML Pattern
```html
<section class="section-typographic">
    <div class="container">
        <div class="festival-years-grid">
            <a href="/gallery-2025" class="festival-year-card" data-year="2025">
                <div class="year-card-content">
                    <span class="year-number font-display">2025</span>
                    <span class="year-subtitle font-serif">Third Edition</span>
                    <span class="year-highlight font-mono">500+ Attendees</span>
                </div>
            </a>
        </div>
    </div>
</section>
```

### Usage Examples
- **Gallery**: `/pages/gallery.html` (lines 61-95)

### Mobile Behavior
```css
/* File: /css/components.css, lines 737-760 */
@media (max-width: 768px) {
  .festival-years-grid {
    grid-template-columns: 1fr;
    gap: var(--space-xl);
  }
}
```

---

## 8. Footer Section Pattern

### Description
Consistent footer layout with typography-based social links.

### CSS Implementation
```css
/* File: /css/typography.css, lines 442-526 */
.footer-typographic {
  padding: var(--space-lg) 0 var(--space-md);
  text-align: center;
  border-top: 1px solid var(--color-gray-200);
}

.footer-credits {
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-gray-600);
  margin-bottom: var(--space-md);
}

.footer-social {
  display: flex;
  justify-content: center;
  gap: var(--space-lg);
  margin-top: var(--space-sm);
}
```

### HTML Pattern
```html
<footer class="footer-typographic">
    <div class="container">
        <p class="footer-credits">MAY 15-17, 2026 • BOULDER, COLORADO • 
            <a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a>
        </p>
        <div class="footer-social">
            <a href="https://instagram.com/alocubanoboulder" class="social-link-type">
                <svg><!-- Instagram icon --></svg>
            </a>
        </div>
    </div>
</footer>
```

### Usage
Consistent across all pages with identical structure.

---

## Common Spacing Patterns

### Section Spacing
```css
.section-typographic {
  padding: var(--space-4xl) 0; /* 6rem top/bottom */
}
```

### Mobile Section Spacing
```css
@media (max-width: 768px) {
  .section-typographic {
    padding: var(--space-2xl) 0; /* 3rem top/bottom */
  }
}
```

### Container Behavior
```css
.container {
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: 0 var(--space-xl); /* 2rem horizontal */
}
```

---

## Grid System Patterns

### 12-Column Base
Most typography sections use a 12-column grid system:
- **Large content**: `span 8` columns
- **Small content**: `span 4` columns  
- **Code blocks**: `span 6` columns
- **Vertical text**: `span 2` columns

### Auto-Fit Grids
For item collections:
```css
grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
```

### Responsive Collapse
All grids collapse to single column on mobile.

---

## Accessibility Patterns

### Focus States
```css
:focus-visible {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}
```

### Touch Targets
```css
/* Minimum 44px for interactive elements */
.nav-link,
.form-button-type {
  min-height: 44px;
  min-width: 44px;
}
```

### Motion Preferences
```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Content Guidelines

### Typography Hierarchy
1. **Display text**: `.text-display` - Bebas Neue font
2. **Large blocks**: `.text-block-large` - Playfair Display serif
3. **Code/meta**: `.font-mono` - Space Mono
4. **Body text**: Default sans-serif system fonts

### Color Usage
- **Emphasis**: `var(--color-blue)` for highlights
- **Meta information**: `var(--color-red)` for labels
- **Body text**: `var(--color-gray-700)` for descriptions
- **Borders**: `var(--color-gray-200)` for subtle divisions

### Spacing Scale
- **Section gaps**: `var(--space-4xl)` (6rem)
- **Element gaps**: `var(--space-xl)` (2rem)
- **Component gaps**: `var(--space-lg)` (1.5rem)
- **Text gaps**: `var(--space-md)` (1rem)

---

## Performance Considerations

### Content Visibility
```css
.gallery-grid {
  content-visibility: auto;
  contain-intrinsic-size: 300px;
}
```

### Lazy Loading
Hero images and gallery items use progressive loading strategies.

### Mobile Optimizations
- Reduced animations on mobile
- Optimized touch interactions
- Simplified hover states