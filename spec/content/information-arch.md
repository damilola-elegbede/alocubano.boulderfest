# Information Architecture Specification
## A Lo Cubano Boulder Fest Website

### Overview
This document defines the complete information architecture, navigation structure, and content organization patterns for the A Lo Cubano Boulder Fest website. The site follows a **typography-forward design philosophy** that treats text as art while maintaining clear user experience pathways.

---

## Site Structure & Navigation Hierarchy

### Primary Navigation Architecture

```text
A Lo Cubano Boulder Fest
├── Home (/)                    → /pages/home.html
├── About (/about)             → /pages/about.html
├── Artists (/artists)         → /pages/artists.html
├── Schedule (/schedule)       → /pages/schedule.html
├── Gallery (/gallery)         → /pages/gallery.html
│   └── 2025 Gallery (/gallery-2025) → /pages/gallery-2025.html
├── Tickets (/tickets)         → /pages/tickets.html
└── Donate (/donations)        → /pages/donations.html
```

### URL Routing Structure
All pages use **clean URLs** implemented through Vercel configuration:
- **Root redirect**: `/` → `/home` (immediate JavaScript redirect)
- **Page mapping**: `/page-name` → `/pages/page-name.html`
- **Static assets**: Direct mapping for `/css/`, `/js/`, `/images/`, `/api/`
- **Error handling**: Custom 404 page at `/pages/404.html`

---

## Navigation Implementation Patterns

### 1. Header Navigation Structure

#### Consistent Header Layout (All Pages)
```html
<header class="header">
  <div class="container">
    <div class="grid">
      <!-- Logo Section -->
      <div class="header-left">
        <a href="/home" class="logo-link" aria-label="Go to home page">
          <img src="/images/logo.png" alt="A Lo Cubano Boulder Fest Logo">
          <div class="logo-text">
            <span class="logo-main">A LO CUBANO</span>
            <span class="logo-separator">|</span>
            <span class="logo-sub">Boulder Fest</span>
          </div>
        </a>
      </div>
      
      <!-- Main Navigation -->
      <nav class="main-nav">
        <button class="menu-toggle" aria-label="Toggle menu">
          <span></span>
        </button>
        <ul class="nav-list">
          <li><a href="/home" class="nav-link" data-text="Home">Home</a></li>
          <li><a href="/about" class="nav-link" data-text="About">About</a></li>
          <li><a href="/artists" class="nav-link" data-text="Artists">Artists</a></li>
          <li><a href="/schedule" class="nav-link" data-text="Schedule">Schedule</a></li>
          <li><a href="/gallery" class="nav-link" data-text="Gallery">Gallery</a></li>
          <li><a href="/tickets" class="nav-link" data-text="Tickets">Tickets</a></li>
          <li><a href="/donations" class="nav-link" data-text="Donate">Donate</a></li>
        </ul>
      </nav>
    </div>
  </div>
</header>
```

#### Navigation Characteristics
- **Fixed positioning**: Header stays visible during scroll
- **Active state indication**: `.is-active` class on current page
- **Typography-forward styling**: Monospace font with animated hover effects
- **Logo interaction**: Multi-color hover animations
- **Consistent across all pages**: Identical structure and behavior

### 2. Sub-Navigation Patterns

#### Gallery Sub-Navigation
```html
<!-- Back Navigation (Gallery Detail Pages) -->
<section class="gallery-back-nav">
  <div class="container">
    <a href="/gallery" class="back-link">
      <span class="back-arrow">←</span>
      <span class="back-text font-mono">BACK TO GALLERIES</span>
    </a>
  </div>
</section>
```

**Characteristics:**
- **Contextual navigation**: Only appears on gallery detail pages
- **Clear hierarchy**: Shows relationship between gallery hub and detail pages
- **Typographic styling**: Monospace font consistent with design system

---

## Mobile Navigation Architecture

### Mobile Menu Behavior
The mobile navigation transforms the horizontal desktop menu into a slide-out panel on screens ≤768px.

#### Mobile Menu States
```javascript
// Navigation States
mobileMenuOpen: false  // Default closed state

// State Transitions
toggleMobileMenu() {
  this.mobileMenuOpen = !this.mobileMenuOpen;
  // Updates DOM classes and prevents body scroll
}
```

#### Mobile Navigation Structure
- **Trigger**: Hamburger menu button (`.menu-toggle`)
- **Panel**: Right-sliding overlay (`.nav-list.is-open`)
- **Background**: Semi-transparent backdrop with blur
- **Interactions**: Touch-optimized with proper tap targets (44px minimum)
- **Close behaviors**: Outside click, escape key, navigation selection

### Mobile-Specific Features
```css
@media (max-width: 768px) {
  .nav-list.is-open {
    position: fixed;
    top: 0; right: 0;
    width: 100%; max-width: 300px;
    height: 100vh;
    background: var(--color-white);
    box-shadow: -2px 0 20px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(20px);
    z-index: 1000;
  }
}
```

---

## Content Organization Principles

### 1. Information Hierarchy

#### Page Structure Pattern (All Pages)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <!-- Meta information -->
  <!-- Favicons -->
  <!-- Stylesheets -->
</head>
<body class="typographic">
  <!-- Skip Links (Home page only) -->
  <header class="header">
    <!-- Navigation -->
  </header>
  
  <main>
    <!-- Hero Section -->
    <section class="gallery-hero-splash">
      <!-- Dynamic hero image -->
    </section>
    
    <!-- Content Sections -->
    <section class="section-typographic">
      <!-- Page-specific content -->
    </section>
  </main>
  
  <!-- Footer with social links -->
  <footer>
    <!-- Social media links -->
  </footer>
  
  <!-- JavaScript modules -->
</body>
</html>
```

### 2. Content Categorization

#### Primary Content Categories
1. **Festival Information** (Home, About)
   - Event details, dates, location
   - Mission and values
   - Board of directors
   - Festival history and growth

2. **Program Content** (Artists, Schedule)
   - Instructor profiles and backgrounds
   - Workshop schedules and descriptions
   - Performance details
   - Skill level categorizations

3. **Visual Content** (Gallery)
   - Categorized by year (2025, future years)
   - Event type sections (Workshops, Socials, Performances)
   - Lazy-loaded image grids
   - Lightbox interactions

4. **Transactional Content** (Tickets, Donations)
   - Pricing structures
   - Package options
   - Form interfaces
   - Call-to-action elements

5. **Utility Content** (404)
   - Error states and redirects
   - Fallback navigation

### 3. Content Semantic Structure

#### Typography Hierarchy
```css
/* Content hierarchy through typography */
.text-display          /* Main headings (Bebas Neue) */
.text-composition       /* Content blocks */
.text-block-large       /* Emphasis text */
.text-block-mono        /* Technical/metadata (Space Mono) */
.text-accent           /* Artistic elements (Playfair Display) */
```

#### Section Organization
- **Hero sections**: Dynamic imagery with contextual alt text
- **Content sections**: `.section-typographic` wrapper
- **Typography blocks**: Structured text compositions
- **Interactive elements**: Forms, buttons, navigation

---

## User Journey Paths

### 1. Primary User Flows

#### Discovery to Registration Flow
```text
Entry Point (/) → Home → About/Artists → Schedule → Tickets → Registration
                     ↓
                   Gallery (Social proof)
```

#### Content Exploration Flow
```text
Home → Gallery Hub → Yearly Galleries (2025, etc.) → Lightbox View
  ↓
About → Festival History → Board Information
  ↓
Artists → Instructor Profiles → Schedule → Specific Workshops
```

#### Support Flow
```text
Any Page → Donations → Support Form → Confirmation
       ↓
     Social Media Links (Instagram, WhatsApp)
```

### 2. Navigation Flow Patterns

#### Horizontal Navigation (Desktop)
- **Linear progression**: Left-to-right menu order follows user journey
- **Active state clarity**: Bold red indicators for current page
- **Hover interactions**: Typography animations and color changes

#### Vertical Navigation (Mobile)
- **Panel-based**: Right-sliding overlay maintains spatial relationships
- **Touch-optimized**: Large tap targets and gesture support
- **Context preservation**: Current page remains highlighted in mobile menu

---

## Page Relationships & Taxonomy

### 1. Content Relationships

#### Parent-Child Relationships
```text
Gallery (Hub) → Gallery-2025 (Detail)
Home (Overview) → About/Artists/Schedule (Details)
Artists (Profiles) ↔ Schedule (Sessions) [Cross-referenced]
```

#### Peer Relationships
```text
About ↔ Artists ↔ Schedule [Program Information Triad]
Tickets ↔ Donations [Action-oriented pages]
```

### 2. Content Taxonomy

#### Festival Content Classification
- **Temporal**: Past events (2025), current planning (2026), future
- **Content Type**: Information, Media, Transactional, Social
- **User Intent**: Discovery, Learning, Registration, Support
- **Interaction Level**: Static, Interactive, Form-based

#### Navigation Classification
- **Primary Navigation**: Main site sections (7 items)
- **Secondary Navigation**: Sub-sections (Gallery years, back links)
- **Utility Navigation**: Social links, skip links, accessibility
- **Contextual Navigation**: Year selections, form steps

---

## Accessibility in Navigation & Content

### 1. Navigation Accessibility Features

#### Semantic Navigation Structure
```html
<!-- Skip links for screen readers -->
<a href="#main-content" class="skip-link">Skip to main content</a>
<a href="#navigation" class="skip-link">Skip to navigation</a>

<!-- Semantic navigation landmark -->
<nav class="main-nav">
  <button class="menu-toggle" aria-label="Toggle menu">
    <!-- Accessible hamburger menu -->
  </button>
  <ul class="nav-list">
    <!-- Navigation items with proper labeling -->
  </ul>
</nav>
```

#### ARIA Implementation
- **aria-label**: Descriptive labels for interactive elements
- **aria-labelledby**: Form section headers
- **aria-describedby**: Error messages and help text
- **role attributes**: Form roles and navigation landmarks

### 2. Content Accessibility

#### Image Accessibility
- **Contextual alt text**: Descriptive, context-specific descriptions
- **Decorative images**: Proper alt="" for decorative elements
- **Logo accessibility**: Consistent alt text across pages

#### Form Accessibility
```html
<form role="form" aria-labelledby="form-title">
  <input type="text" id="field" aria-describedby="field-error">
  <div id="field-error" role="alert">Error message</div>
</form>
```

### 3. Keyboard Navigation
- **Tab order**: Logical progression through interactive elements
- **Focus indicators**: Visible focus states for keyboard users
- **Escape functionality**: Mobile menu closes with Escape key
- **Skip links**: Direct access to main content and navigation

### 4. Screen Reader Support
- **Semantic HTML**: Proper heading hierarchy (h1-h6)
- **Landmark regions**: header, nav, main, footer
- **Link context**: Descriptive link text and aria-labels
- **State communication**: Active page indicators for screen readers

---

## Technical Implementation Notes

### 1. Navigation JavaScript Architecture

#### Class Structure
```javascript
class Navigation {
  constructor() {
    this.mobileMenuOpen = false;
    this.init();
  }
  
  // Methods for menu control, page highlighting, event handling
}

class PageTransition {
  // Smooth page transitions with navigation preservation
}
```

### 2. CSS Architecture for Navigation

#### Modular Stylesheets
- **base.css**: Design tokens and variables
- **navigation.css**: All navigation-specific styles
- **mobile-overrides.css**: Mobile-specific navigation behavior
- **typography.css**: Text-based navigation effects

### 3. Responsive Navigation Strategy

#### Breakpoint Strategy
- **Desktop**: ≥769px (horizontal navigation)
- **Mobile**: ≤768px (panel-based navigation)
- **Protection**: Desktop styles explicitly protected from mobile overrides

---

## Performance & Optimization

### 1. Navigation Performance
- **Critical CSS**: Navigation styles loaded first
- **JavaScript modules**: Lazy-loaded where appropriate
- **Image optimization**: Logo and icon optimization
- **Caching strategy**: Navigation assets cached with appropriate headers

### 2. Content Loading Strategy
- **Progressive enhancement**: Core content loads first
- **Hero images**: Dynamic loading with performance optimization
- **Gallery content**: Lazy loading with intersection observer
- **Form enhancements**: Progressive JavaScript enhancement

---

## Future Information Architecture Considerations

### 1. Scalability
- **Year-based content**: Easily expandable gallery structure
- **Artist profiles**: Scalable instructor database structure
- **Event categories**: Flexible taxonomy for new event types

### 2. Internationalization Preparation
- **URL structure**: Language-agnostic routing
- **Content structure**: Separable text content
- **Navigation labels**: Externalized for translation

### 3. Content Management
- **Static generation**: Pre-built content for performance
- **API integration**: Google Drive integration for dynamic content
- **Cache management**: Intelligent cache warming and invalidation

---

This information architecture specification provides the complete blueprint for understanding and maintaining the navigation structure and content organization of the A Lo Cubano Boulder Fest website, ensuring consistency, accessibility, and optimal user experience across all touchpoints.