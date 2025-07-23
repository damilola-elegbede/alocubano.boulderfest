# Card Components

## Overview
Card components are the foundation of information display across the A Lo Cubano Boulder Fest website. All cards follow a typography-forward design philosophy with consistent patterns, spacing, and typography hierarchy.

## Card Variants and Usage

### 1. Artist Card (Standard Pattern)
**Location**: `/pages/artists.html` (lines 89-177)  
**CSS Classes**: `.gallery-item-type`, `.gallery-type-title`, `.gallery-type-meta`, `.gallery-type-description`

```html
<article class="gallery-item-type" data-number="01">
    <h3 class="gallery-type-title font-display">LAROYE</h3>
    <p class="gallery-type-meta">ORISHAS • RUMBA • LADIES STYLING</p>
    <p class="gallery-type-description font-serif">"Master of Afro-Cuban traditions"</p>
    <div class="text-block-mono" style="margin-top: var(--space-md); font-size: var(--font-size-xs);">
        // Deep roots in Cuban culture<br>
        // Teaching Orishas dance<br>
        // Rumba fundamentals<br>
        // Empowering ladies' movement
    </div>
    <div style="margin-top: var(--space-lg);">
        <span class="text-split font-mono" style="color: var(--color-blue);">CULTURAL AMBASSADOR</span><br>
        <span class="text-split font-mono" style="color: var(--color-red);">TRADITION KEEPER</span>
    </div>
</article>
```

**Visual Hierarchy**:
1. **Data Number**: Positioned as `data-number` attribute
2. **Title**: `font-display`, large size (var(--font-size-2xl) to var(--font-size-3xl))
3. **Meta**: Small caps, monospace styling
4. **Description**: Serif font, quoted style
5. **Code Block**: Monospace with "//" prefix, smaller font
6. **Tags/Labels**: Color-coded spans (blue/red accent colors)

### 2. DJ Card (Simplified Artist)
**Location**: `/pages/artists.html` (lines 196-220)  
**Pattern**: Simplified artist card without meta sections

```html
<div class="gallery-item-type" data-number="DJ">
    <h3 class="gallery-type-title text-glitch" data-text="DJ BYRON">DJ BYRON</h3>
    <p class="gallery-type-description">
        Cuban rhythms specialist • 20 years experience<br>
        From Havana to Boulder<br>
        <span class="text-mask">The authentic sound master</span>
    </p>
</div>
```

### 3. Statistics Card (Numeric Focus)
**Location**: `/pages/artists.html` (lines 228-244), `/pages/about.html` (lines 247-259)  
**Pattern**: Large number display with descriptive text

```html
<div class="gallery-item-type" data-number="5+">
    <h3 class="gallery-type-title font-mono">WORLD-CLASS INSTRUCTORS</h3>
    <p class="gallery-type-description">Teaching authentic Cuban dance styles</p>
</div>
```

**Key Features**:
- Number/symbol as `data-number` (can be numeric, symbolic like "∞", or prefixed like "$250K+")
- Title in monospace font
- Simple description text
- Clean, minimal layout

### 4. Festival Year Cards (Navigation)
**Location**: `/pages/gallery.html` (lines 67-93)  
**CSS Classes**: `.festival-year-card`, `.year-card-content`, `.year-number`, `.year-subtitle`, `.year-highlight`  
**CSS Reference**: `/css/components.css` (lines 604-760)

```html
<a href="/gallery-2025" class="festival-year-card" data-year="2025">
    <div class="year-card-content">
        <span class="year-number font-display">2025</span>
        <span class="year-subtitle font-serif">Third Edition</span>
        <span class="year-highlight font-mono">500+ Attendees</span>
    </div>
    <div class="year-card-hover">
        <span class="view-gallery-text">VIEW GALLERY →</span>
    </div>
</a>
```

**Special Features**:
- Interactive hover states with transform effects
- Background gradient animation on hover
- Conditional "coming soon" styling for disabled cards with proper ARIA attributes
- Responsive grid layout (1fr on mobile, auto-fit on desktop)

**Accessibility Implementation**:
```html
<!-- Disabled/Coming Soon Card -->
<div class="festival-year-card disabled" 
     data-year="2026"
     aria-disabled="true"
     aria-label="2026 Festival - Coming Soon">
    <div class="year-card-content">
        <span class="year-number font-display">2026</span>
        <span class="year-subtitle font-serif">Coming Soon</span>
        <span class="year-highlight font-mono">Stay Tuned</span>
    </div>
    <div class="year-card-disabled-overlay">
        <span class="coming-soon-text">COMING SOON</span>
    </div>
</div>
```

### 5. Schedule Event Cards
**Location**: `/pages/schedule.html` (lines 73-101, 114-168, 181-227)  
**Pattern**: Time-based information layout

```html
<div class="schedule-item" style="padding: var(--space-lg) 0; border-bottom: 1px solid var(--color-gray-200);">
    <div style="display: grid; grid-template-columns: 140px 1fr; gap: var(--space-xl);">
        <div class="time font-mono">4:00 - 5:00 PM</div>
        <div class="details">
            <h3 class="font-display" style="font-size: var(--font-size-2xl);">LAROYE ~ ORISHAS</h3>
        </div>
    </div>
</div>
```

**Layout Pattern**:
- Two-column grid: fixed-width time column + flexible content
- Time in monospace font
- Event title in display font
- Optional venue and additional details

### 6. Pricing Cards
**Location**: `/pages/tickets.html` (lines 72-85, 93-107, 115-124)  
**Pattern**: Price-focused information display

```html
<div class="price-item" style="padding: var(--space-xl); border: 2px solid var(--color-black);">
    <h3 class="font-display" style="font-size: var(--font-size-2xl);">EARLY BIRD</h3>
    <p class="text-display" style="font-size: var(--font-size-4xl);">$100</p>
    <p class="font-mono" style="color: var(--color-gray-600);">Before April 1st</p>
    <p class="font-mono" style="color: var(--color-gray-600);">$10 per workshop</p>
</div>
```

**Visual Hierarchy**:
1. **Category**: Display font, medium size
2. **Price**: Large display font (var(--font-size-4xl))
3. **Details**: Small monospace, muted color
4. **Border**: Solid borders (2px for featured, 1px for standard)

### 7. Team/Biography Cards
**Location**: `/pages/about.html` (lines 193-237)  
**Pattern**: Person-focused information layout

```html
<div class="gallery-item-type" data-number="01">
    <h3 class="gallery-type-title font-display">MARCELA<br>LAY</h3>
    <p class="gallery-type-meta">PRESIDENT & FOUNDER</p>
    <p class="gallery-type-description">
        Visionary who brought Cuba to Boulder<br>
        Started the festival in 2023<br>
        The heart and soul of our mission
    </p>
</div>
```

### 8. Testimonial Cards
**Location**: `/pages/gallery.html` (lines 104-117), `/pages/about.html` (lines 289-301)  
**Pattern**: Quote-focused design with attribution

```html
<blockquote style="padding: var(--space-2xl); background: var(--color-white); border-left: 4px solid var(--color-red);">
    <p class="font-serif" style="font-size: var(--font-size-lg);">"This festival changed my life. I came alone and left with 50 new friends and a passion for salsa."</p>
    <cite class="font-mono" style="color: var(--color-gray-600);">— Sarah, Boulder</cite>
</blockquote>
```

**Key Features**:
- Left border accent (4px solid color)
- Serif font for quotes
- Monospace font for attribution
- White background on colored sections

### 9. Value/Benefit Cards
**Location**: `/pages/about.html` (lines 146-178)  
**Pattern**: Concept explanation with numbered structure

```html
<div class="gallery-item-type" data-number="01">
    <h3 class="gallery-type-title font-display">AUTHENTICITY</h3>
    <p class="gallery-type-description">
        We honor the true spirit of Cuban culture<br>
        Working directly with Cuban artists<br>
        Preserving traditional forms while embracing innovation
    </p>
</div>
```

### 10. Volunteer Benefit Cards
**Location**: `/pages/about.html` (lines 315-335)  
**Pattern**: Icon-based benefit display

```html
<div class="benefit-item">
    <span class="benefit-icon text-display">🎭</span>
    <h4 class="benefit-title font-mono">FREE FESTIVAL ACCESS</h4>
    <p class="benefit-desc">Enjoy performances when not on duty</p>
</div>
```

## Grid Layouts and Responsive Behavior

### Standard Grid (Artists, Statistics, Values)
```css
.gallery-typographic {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--space-2xl);
}
```

### Festival Year Cards Grid
```css
.festival-years-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: var(--space-2xl);
}

/* Mobile responsive */
@media (max-width: 768px) {
    .festival-years-grid {
        grid-template-columns: 1fr;
        gap: var(--space-xl);
    }
}
```

### Pricing Cards Grid
```css
.pricing-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-xl);
    max-width: 600px;
}

.day-passes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-xl);
    max-width: 800px;
}
```

### Schedule Cards Grid
```css
.schedule-item {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: var(--space-xl);
    padding: var(--space-lg) 0;
    border-bottom: 1px solid var(--color-gray-200);
}
```

## Typography Patterns in Cards

### Font Hierarchy
1. **Display Font** (`var(--font-display)` - Bebas Neue): Main titles, year numbers
2. **Serif Font** (`var(--font-accent)` - Playfair Display): Quotes, descriptions, subtitles
3. **Monospace Font** (`var(--font-code)` - Space Mono): Meta information, technical details, labels
4. **System Sans**: Body text for readability

### Size Scale
- **Extra Large**: `var(--font-size-6xl)` (60px) - Year numbers in festival cards
- **Large**: `var(--font-size-4xl)` (36px) - Prices, major numbers
- **Medium**: `var(--font-size-2xl)` to `var(--font-size-3xl)` - Card titles
- **Base**: `var(--font-size-base)` (16px) - Body text
- **Small**: `var(--font-size-sm)` to `var(--font-size-xs)` - Meta information

## Interactive States and Hover Effects

### Festival Year Cards (Complex Hover)
**CSS Reference**: `/css/components.css` (lines 642-651)
```css
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

### Gallery Items (Subtle Hover)
**CSS Reference**: `/css/components.css` (lines 89-92)
```css
.gallery-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
```

### General Card Hover (Standard)
**CSS Reference**: `/css/components.css` (lines 319-322)
```css
.card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
}
```

## Accessibility Considerations

### Semantic HTML
- Use `<article>` for independent content (artist cards)
- Use `<blockquote>` and `<cite>` for testimonials
- Use proper heading hierarchy (`<h2>`, `<h3>`, `<h4>`)
- Include `aria-label` for interactive cards
- Add `aria-disabled="true"` for disabled or "coming soon" cards

### ARIA States and Properties
- **Disabled Cards**: Use `aria-disabled="true"` for cards that are not interactive
- **Loading States**: Use `aria-busy="true"` for cards with loading content
- **Expanded States**: Use `aria-expanded` for cards with collapsible content
- **Labels**: Provide descriptive `aria-label` or `aria-labelledby` for complex cards

### Screen Reader Support
```html
<!-- Accessible Card Examples -->

<!-- Disabled Festival Year Card -->
<div class="festival-year-card disabled" 
     aria-disabled="true"
     aria-label="2026 Festival - Coming Soon, not yet available">
    <!-- card content -->
</div>

<!-- Interactive Artist Card -->
<article class="gallery-item-type" 
         aria-labelledby="artist-1-title"
         role="button"
         tabindex="0">
    <h3 id="artist-1-title" class="gallery-type-title">LAROYE</h3>
    <!-- card content -->
</article>

<!-- Loading Card State -->
<div class="gallery-item-type" 
     aria-busy="true"
     aria-label="Loading artist information">
    <!-- loading content -->
</div>
```

### Color and Contrast
- Maintain sufficient contrast ratios for all text
- Don't rely solely on color for meaning
- Use semantic color coding (blue for categories, red for emphasis)

### Keyboard Navigation
- All interactive cards are keyboard accessible with `tabindex="0"` when needed
- Proper focus states on hover-enabled cards with visible focus indicators
- Logical tab order through card grids using semantic HTML structure
- Enter and Space key activation for clickable cards

### Focus Management
```css
/* Visible focus indicators for all interactive cards */
.festival-year-card:focus,
.gallery-item-type:focus,
.nav-link:focus {
    outline: 2px solid var(--color-blue);
    outline-offset: 2px;
    box-shadow: 0 0 0 4px rgba(91, 107, 181, 0.2);
}

/* High contrast focus for better visibility */
@media (prefers-contrast: high) {
    .festival-year-card:focus,
    .gallery-item-type:focus {
        outline: 3px solid var(--color-black);
        outline-offset: 3px;
    }
}
```

### Motion and Animation Accessibility
```css
/* Respect user's motion preferences */
@media (prefers-reduced-motion: reduce) {
    .festival-year-card,
    .gallery-item,
    .card {
        transition: none !important;
        transform: none !important;
        animation: none !important;
    }
    
    .festival-year-card:hover,
    .gallery-item:hover,
    .card:hover {
        transform: none !important;
    }
}
```

## Mobile Optimization

### Responsive Typography
```css
@media (max-width: 768px) {
    .year-number {
        font-size: var(--font-size-5xl);
    }
    
    .year-subtitle {
        font-size: var(--font-size-lg);
    }
}
```

### Mobile Grid Adjustments
- Single column layout on mobile for most card types
- Reduced spacing and padding
- Optimized touch targets (minimum 44px)
- Simplified hover states (reduced transform effects)

## Best Practices

### Typography-Forward Design
1. **Hierarchy First**: Establish clear visual hierarchy through font size and weight
2. **Consistent Spacing**: Use design system spacing tokens consistently
3. **Readable Typography**: Maintain 1.4+ line height for body text
4. **Semantic Fonts**: Use appropriate font families for content type

### Content Strategy
1. **Scannable Content**: Users should understand card content at a glance
2. **Progressive Disclosure**: Most important information first
3. **Consistent Structure**: Similar card types follow identical patterns
4. **Actionable Information**: Clear next steps where appropriate

### Performance Considerations
1. **CSS Grid**: Use CSS Grid for efficient layouts
2. **Content Visibility**: Apply `content-visibility: auto` for large grids
3. **Minimize Reflows**: Avoid layout-triggering animations
4. **Efficient Selectors**: Use specific class selectors over complex combinators

## Implementation Files

### HTML Templates
- **Artist Cards**: `/pages/artists.html` (lines 88-247)
- **Gallery Year Cards**: `/pages/gallery.html` (lines 66-94)
- **Schedule Cards**: `/pages/schedule.html` (lines 72-228)
- **Pricing Cards**: `/pages/tickets.html` (lines 71-125)
- **Team Cards**: `/pages/about.html` (lines 192-238)

### CSS Implementations
- **Festival Year Cards**: `/css/components.css` (lines 604-760)
- **General Card Styles**: `/css/components.css` (lines 311-334)
- **Gallery Components**: `/css/components.css` (lines 337-401)
- **Interactive States**: `/css/components.css` (lines 89-92, 319-322, 642-651)

### Typography System
- **Base Typography**: `/css/base.css` (design tokens)
- **Typography Classes**: `/css/typography.css` (utility classes)
- **Component Typography**: Inline styles and utility classes

This comprehensive card system provides flexible, accessible, and visually consistent components that scale across all device sizes while maintaining the typography-forward design philosophy of A Lo Cubano Boulder Fest.