# A Lo Cubano Boulder Fest - Claude Configuration

## Project Overview

**A Lo Cubano Boulder Fest** is a Cuban salsa festival website featuring a **typographic-forward design** that treats text as art. The site celebrates authentic Cuban culture through workshops, social dancing, and community connection in Boulder, Colorado.

### Key Details
- **Festival Dates**: May 15-17, 2026 (Friday-Sunday)
- **Location**: Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO
- **Contact**: alocubanoboulderfest@gmail.com
- **Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)
- **Founded**: 2023 by Marcela Lay
- **Growth**: From 500 attendees (2023) to expected 5,000+ (2026)

## Architecture & File Structure

```
alocubano.boulderfest/
├── index.html                    # Auto-redirect landing page with loading animation
├── server.py                     # Python development server with MIME types
├── scripts/
│   └── start.sh                 # Quick launcher script
│
├── css/                          # Design System
│   ├── base.css                  # Core design tokens and CSS variables
│   ├── components.css            # Reusable UI components
│   ├── typography.css            # Typographic design system (main stylesheet)
│   └── style.css                 # Legacy styles (minimal)
│
├── js/                           # JavaScript Functionality
│   ├── main.js                   # Core functionality and classes
│   ├── navigation.js             # Navigation and menu handling
│   └── typography.js             # Typography effects and animations
│
├── pages/                        # Main site pages
│   ├── about.html                # Festival story and board
│       ├── artists.html          # 2026 instructor lineup
│       ├── schedule.html         # 3-day event schedule
│       ├── gallery.html          # Text-based moments
│       └── tickets.html          # Pricing and registration
│
├── images/                       # Visual Assets
│   ├── logo.png                  # Main festival logo
│   ├── favicon-circle.svg        # Primary favicon (circular)
│   ├── favicon.ico               # Standard favicon
│   ├── instagram-type.svg        # Custom Instagram icon
│   ├── whatsapp-icon.svg         # WhatsApp contact icon
│   └── favicons/                 # Multiple favicon sizes
│
└── assets/                       # Additional Resources
    ├── fonts/                    # Font files (if any)
    └── images/                   # Alternative image location
```

## Design Philosophy Update (IMPORTANT)

### No Hero Titles Policy
As of the latest design iteration, **ALL hero titles have been removed** from the site. This includes:
- `hero-typographic` sections
- `hero-title-massive` headings
- `hero-text-sculpture` containers
- `hero-title-word` spans
- `hero-subtitle` elements

**Rationale**: The design has evolved to focus on content-first presentation, allowing the festival information to speak for itself without oversized typographic elements that can overwhelm the user experience.

**Implementation**: All pages should start directly with their main content sections. The typographic artistry is now expressed through the content layout and smaller design elements rather than massive hero titles.

## Design System

### Brand Colors
```css
--color-black: #000000        # Primary text, headers
--color-white: #FFFFFF        # Backgrounds, contrast text
--color-blue: #5B6BB5         # Accent, links, highlights
--color-red: #CC2936          # Call-to-action, emphasis
```

### Typography Hierarchy
```css
/* Primary Fonts */
--font-display: 'Bebas Neue', sans-serif     # Headers, massive text
--font-accent: 'Playfair Display', serif     # Artistic elements
--font-code: 'Space Mono', monospace         # Technical, navigation
--font-sans: System fonts                    # Body text, readability

/* Font Sizes */
--font-size-xs: 0.75rem       # Small details
--font-size-base: 1rem        # Body text
--font-size-xl: 1.25rem       # Subheadings
--font-size-3xl: 1.875rem     # Section headers
--font-size-6xl: 3.75rem      # Large headers
--font-size-9xl: 8rem         # Massive display text
```

### Spacing Scale
```css
--space-xs: 0.25rem           # Micro spacing
--space-sm: 0.5rem            # Small gaps
--space-md: 1rem              # Standard spacing
--space-lg: 1.5rem            # Section padding
--space-xl: 2rem              # Large spacing
--space-3xl: 4rem             # Section separation
--space-5xl: 8rem             # Hero spacing
```

## Content Guidelines

### Festival Information

#### Board of Directors
- **President**: Marcela Lay (Founder)
- **Vice President & Treasurer**: Damilola Elegbede
- **Secretary**: Analis Ledesma
- **Board Members**: Donal Solick, Yolanda Meiler

#### Ticket Pricing Structure
- **Full Festival Pass**: $100 (early bird) / $125 (regular)
- **Day Passes**: Friday $50 | Saturday $85 | Sunday $50
- **Single Workshop**: $30
- **Single Social**: $20

#### Festival Growth Timeline
- **2023**: Inaugural year, 500 attendees
- **2024**: Growth year
- **2025**: Expansion
- **2026**: Premier festival, 5,000+ expected attendees

### Content Tone & Voice
- **Authentic**: Celebrate genuine Cuban culture
- **Welcoming**: Inclusive community atmosphere
- **Energetic**: Vibrant, dance-focused language
- **Professional**: Quality instruction and organization
- **Artistic**: Typography-forward, creative expression

## Development Setup

### Requirements
- Python 3.x (for development server)
- Modern web browser (Chrome, Firefox, Safari, Edge)
- No build tools required (pure HTML/CSS/JS)

### Local Development
```bash
# Quick start
./scripts/start.sh

# Alternative method
python3 server.py

# Open browser
http://localhost:8000
```

### Server Features
- **Custom MIME types**: Proper content-type headers
- **CORS headers**: Local development support
- **Route handling**: Clean URLs without extensions
- **Static file serving**: All assets properly served

## File Locations Guide

### Critical Files
- **Main entry**: `/index.html` (home page - no redirect needed)
- **Primary site**: Direct access via clean URLs (/about, /artists, etc.)
- **Design system**: `/css/base.css` (CSS variables and tokens)
- **Typography**: `/css/typography.css` (main design implementation)
- **Core JS**: `/js/main.js` (all functionality classes)

### Asset Organization
- **Logo**: `/images/logo.png` (78px height in headers)
- **Favicons**: `/images/favicons/` (multiple sizes)
- **Icons**: `/images/` (Instagram, WhatsApp, etc.)
- **Fonts**: Loaded via Google Fonts CDN

### Page Structure
All pages follow consistent structure:
1. **Head**: Favicons, meta tags, CSS imports
2. **Header**: Logo, navigation, mobile menu
3. **Main**: Page-specific content (NO HERO TITLES)
4. **Footer**: Credits, social links, contact
5. **Scripts**: Navigation and typography JS

**IMPORTANT**: Do not include hero titles or hero sections in pages. The design philosophy has evolved to eliminate large typographic hero titles (hero-title-massive, hero-text-sculpture) from all pages to create a cleaner, more focused experience.

## Coding Standards

### CSS Architecture
- **Design tokens**: All values in CSS custom properties
- **BEM methodology**: Block-Element-Modifier naming
- **Mobile-first**: Responsive design approach
- **Performance**: Minimal, efficient styles

### HTML Standards
- **Semantic markup**: Proper heading hierarchy
- **Accessibility**: ARIA labels, alt text, focus management
- **SEO**: Meta descriptions, proper titles
- **Performance**: Optimized images, efficient loading

### JavaScript Patterns
- **ES6 Classes**: Modular, reusable code
- **No frameworks**: Pure vanilla JavaScript
- **Performance**: Intersection Observer, lazy loading
- **Error handling**: Graceful degradation

### Typography-Specific Rules
- **Text as art**: Typography is the primary design element
- **Experimental layouts**: Creative text arrangements
- **Animation**: Smooth, purposeful text effects
- **Accessibility**: Readable contrast, scalable text

## Technical Implementation

### Typography System
```css
/* DEPRECATED: Hero titles are no longer used in the design */
/* .hero-title-massive - NO LONGER USED */
/* All pages should start directly with content, no hero sections */

/* Creative text layouts */
.text-composition {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--space-xl);
  align-items: start;
}

/* Vertical text blocks */
.text-block-vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}
```

### Navigation System
- **Fixed header**: Persistent navigation
- **Typography-based**: Text-focused design
- **Mobile menu**: Full-screen overlay
- **Hover effects**: Animated text transitions

### Animation Framework
```css
/* Letter animations */
@keyframes letterDance {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-10px) rotate(-5deg); }
}

/* Typewriter effect */
@keyframes typewriter {
  to { max-width: 100%; }
}

/* Glitch effects */
@keyframes glitch-1 {
  /* Complex clip-path animations */
}
```

## Festival-Specific Information

### 2026 Lineup & Schedule
- **Friday**: Opening workshops and welcome social
- **Saturday**: Main workshop day with intensive classes
- **Sunday**: Advanced workshops and closing celebration

### Workshop Categories
- **Beginner**: Introduction to Cuban salsa
- **Intermediate**: Technique refinement
- **Advanced**: Complex patterns and styling
- **Specialty**: Afro-Cuban, son, rumba

### Venue Information
- **Avalon Ballroom**: Historic Boulder venue
- **Address**: 6185 Arapahoe Rd, Boulder, CO
- **Capacity**: Accommodates 5,000+ attendees
- **Accessibility**: Full ADA compliance

## Branding Guidelines

### Logo Usage
- **Primary**: `/images/logo.png` at 78px height
- **Favicon**: Circular version in `/images/favicon-circle.svg`
- **Context**: Always pair with "A Lo Cubano Boulder Fest" text

### Color Applications
- **Primary**: Black text on white backgrounds
- **Accent**: Blue for interactive elements
- **Emphasis**: Red for calls-to-action
- **Contrast**: Maintain WCAG AA standards

### Typography Rules
- **Headers**: Bebas Neue for impact
- **Body**: System fonts for readability
- **Accents**: Playfair Display for elegance
- **Code**: Space Mono for technical elements

## Performance & Accessibility

### Performance Optimizations
- **No build tools**: Direct file serving
- **Lazy loading**: Images load on scroll
- **Efficient CSS**: Minimal, optimized styles
- **Caching**: Proper HTTP headers

### Accessibility Features
- **Semantic HTML**: Proper heading structure
- **ARIA labels**: Screen reader support
- **Keyboard navigation**: Full keyboard access
- **Focus management**: Visible focus indicators
- **Reduced motion**: Respects user preferences

### Browser Support
- **Chrome/Edge**: 90+
- **Firefox**: 88+
- **Safari**: 14+
- **Mobile**: iOS Safari, Chrome Mobile

## Development Workflow

### Making Changes
1. **Design tokens**: Update CSS variables in `base.css`
2. **Typography**: Modify `typography.css` for design changes
3. **Content**: Edit HTML files in `pages/typographic/`
4. **Functionality**: Update JavaScript in `js/main.js`
5. **Testing**: Use local server for development

### Adding New Pages
1. Create HTML file in `pages/typographic/`
2. Follow existing header/footer structure
3. Add navigation link to all pages
4. Update sitemap and internal links
5. Test responsive design and accessibility

### Deployment Considerations
- **Static hosting**: Site is fully static
- **HTTPS**: Required for modern browsers
- **CDN**: Consider for font loading
- **Monitoring**: Track performance metrics

## AI Assistant Guidelines

### When Working on This Project
1. **Respect typography**: Maintain text-as-art philosophy (but NO hero titles)
2. **NO HERO SECTIONS**: Do not add hero-title-massive or hero-text-sculpture sections
3. **Preserve design tokens**: Use CSS custom properties
4. **Follow naming conventions**: BEM methodology
5. **Maintain accessibility**: WCAG compliance
6. **Test responsively**: Mobile-first approach
7. **Start with content**: Pages should begin directly with meaningful content, not large hero titles

### Common Tasks
- **Content updates**: Modify HTML in `pages/typographic/`
- **Style changes**: Update CSS in `css/typography.css`
- **New features**: Add to `js/main.js`
- **Performance**: Optimize without breaking design

### Cultural Sensitivity
- **Cuban culture**: Respect authentic traditions
- **Community**: Inclusive, welcoming language
- **Accuracy**: Verify cultural references
- **Representation**: Diverse, respectful imagery

---

This CLAUDE.md file provides comprehensive guidance for any Claude instance working on the A Lo Cubano Boulder Fest website. The project emphasizes typography-forward design, Cuban cultural authenticity, and community celebration through innovative web design.