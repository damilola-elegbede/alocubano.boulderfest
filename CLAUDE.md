# A Lo Cubano Boulder Fest - Claude Configuration

## Project Overview

**A Lo Cubano Boulder Fest** is a Cuban salsa festival website featuring a **typography-forward design** that treats text as art. The site celebrates authentic Cuban culture through workshops, social dancing, and community connection in Boulder, Colorado.

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
├── index.html                    # Landing page
├── server.py                     # Python development server
├── vercel.json                   # Deployment configuration
│
├── config/                       # Configuration files
│   ├── eslint.config.js          # ESLint configuration
│   ├── jest.unit.config.cjs      # Jest test configuration
│   └── jest-puppeteer.config.js  # Puppeteer configuration
│
├── css/                          # Stylesheets
│   ├── base.css                  # Core design tokens and CSS variables
│   ├── components.css            # Reusable UI components
│   ├── typography.css            # Main typographic styles
│   ├── navigation.css            # Navigation styles
│   ├── forms.css                 # Form styles
│   └── mobile-overrides.css      # Mobile responsive styles
│
├── js/                           # JavaScript modules
│   ├── main.js                   # Core functionality
│   ├── navigation.js             # Navigation handling
│   ├── typography.js             # Typography effects
│   ├── gallery-detail.js         # Gallery page functionality
│   ├── gallery-hero.js           # Gallery hero section
│   ├── components/               # Reusable components
│   │   ├── lightbox.js           # Lightbox component
│   │   └── lazy-loading.js       # Lazy loading component
│   └── [other utility modules]   # Performance, cache management, etc.
│
├── pages/                        # Site pages
│   ├── home.html                 # Home page
│   ├── about.html                # About the festival
│   ├── artists.html              # 2026 instructor lineup
│   ├── schedule.html             # Event schedule
│   ├── gallery.html              # Photo gallery
│   ├── gallery-2025.html         # 2025 gallery
│   ├── tickets.html              # Ticket information
│   ├── donations.html            # Donation page
│   └── 404.html                  # Error page
│
├── api/                          # Serverless functions
│   ├── gallery.js                # Gallery API endpoint
│   ├── featured-photos.js        # Featured photos API
│   ├── cache-warm.js             # Cache warming
│   ├── debug.js                  # Debug utilities
│   └── image-proxy/              # Image proxy functions
│
├── images/                       # Static images
│   ├── logo.png                  # Festival logo
│   ├── favicon-circle.svg        # Primary favicon
│   ├── favicons/                 # Multiple favicon sizes
│   ├── gallery/                  # Gallery placeholders
│   └── [social icons]            # Instagram, WhatsApp icons
│
├── scripts/                      # Build and utility scripts
│   ├── generate-gallery-cache.js  # Gallery data generation
│   ├── generate-featured-photos.js # Featured photos generation
│   ├── verify-structure.js       # Structure validation
│   ├── start.sh                  # Development server launcher
│   └── [other scripts]           # Testing, debugging utilities
│
├── tests/                        # Test suite
│   ├── unit/                     # Unit tests (Jest)
│   ├── manual/                   # Manual test files
│   ├── run-link-tests.js         # Link validation
│   └── [test utilities]          # Test helpers and setup
│
├── docs/                         # Documentation
│   ├── api/                      # API documentation
│   ├── deployment/               # Deployment guides
│   ├── development/              # Development notes
│   └── setup/                    # Setup documentation
│
└── [generated files]             # These are NOT tracked in Git:
    ├── public/featured-photos.json     # Generated cache
    ├── public/gallery-data/            # Generated gallery data
    ├── gallery-data/                   # Root gallery cache
    ├── featured-photos.json            # Root featured photos
    ├── coverage/                       # Test coverage reports
    ├── node_modules/                   # Dependencies
    └── [analysis reports]              # Link validation reports
```

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
--font-display: 'Bebas Neue', sans-serif     # Headers, display text
--font-accent: 'Playfair Display', serif     # Artistic elements
--font-code: 'Space Mono', monospace         # Technical, navigation
--font-sans: System fonts                    # Body text, readability

/* Font Sizes */
--font-size-xs: 0.75rem       # Small details
--font-size-base: 1rem        # Body text
--font-size-xl: 1.25rem       # Subheadings
--font-size-3xl: 1.875rem     # Section headers
--font-size-6xl: 3.75rem      # Large headers
```

### Spacing Scale
```css
--space-xs: 0.25rem           # Micro spacing
--space-sm: 0.5rem            # Small gaps
--space-md: 1rem              # Standard spacing
--space-lg: 1.5rem            # Section padding
--space-xl: 2rem              # Large spacing
--space-3xl: 4rem             # Section separation
```

## Technical Standards

### Repository Management
- **Generated files are NOT tracked**: Cache files, reports, and build outputs are in .gitignore
- **Configuration centralized**: All config files moved to `/config/` directory
- **Comprehensive testing**: 197+ unit tests with Jest, link validation, performance monitoring
- **CI/CD ready**: GitHub Actions workflow with pre-commit and pre-push hooks

### CSS Architecture
- **Design tokens**: All values in CSS custom properties in `/css/base.css`
- **Modular stylesheets**: Separate files for components, typography, navigation, forms, mobile
- **BEM methodology**: Block-Element-Modifier naming conventions
- **Mobile-first**: Responsive design with mobile overrides

### JavaScript Architecture
- **ES6 Modules**: Modular, reusable components
- **Component-based**: Lightbox, lazy loading, and other reusable modules in `/js/components/`
- **No frameworks**: Pure vanilla JavaScript with modern features
- **Performance-focused**: Intersection Observer, lazy loading, caching strategies
- **Error handling**: Comprehensive error handling and graceful degradation

### API Design
- **Serverless functions**: Vercel-compatible functions in `/api/`
- **Caching strategy**: Intelligent cache-first approach with fallbacks
- **Performance optimization**: Cache warming, request deduplication
- **Security**: Input sanitization, rate limiting, CORS headers

## Development Workflow

### Local Development
```bash
# Quick start
./scripts/start.sh
# or
python3 server.py
# or
npm run serve
```

### Testing
- **Unit tests**: `npm test` or `npm run test:unit` (197 tests)
- **Coverage**: `npm run test:coverage` (with HTML reports)
- **Link validation**: `npm run test:links` (498 links tested)
- **All tests**: `npm run test:all`
- **Linting**: `npm run lint` (ESLint + HTMLHint)

### Making Changes
1. **Design tokens**: Update CSS variables in `/css/base.css`
2. **Styles**: Modify relevant CSS files in `/css/`
3. **Content**: Edit HTML files in `/pages/`
4. **Functionality**: Update JavaScript modules in `/js/`
5. **API**: Modify serverless functions in `/api/`

### Adding New Pages
1. Create HTML file in `/pages/`
2. Follow existing header/footer structure from other pages
3. Add navigation link to header in all pages
4. Update internal links and navigation
5. Test responsive design and accessibility
6. Run test suite to ensure no regressions

## Deployment (Vercel)
- **Serverless functions**: API routes automatically deployed
- **Static optimization**: Automatic asset optimization and CDN
- **Cache generation**: Build scripts generate required cache files
- **Environment variables**: Google Drive API credentials for gallery
- **Monitoring**: Performance tracking and error monitoring

## Generated Files (Not in Git)
The following files are generated by build scripts and are excluded from version control:
- `public/featured-photos.json` - Featured photos cache
- `public/gallery-data/` - Gallery data cache  
- `gallery-data/` - Root gallery cache
- `featured-photos.json` - Root featured photos cache
- `coverage/` - Test coverage reports
- `link_analysis.csv` - Link analysis reports
- `link_validation_report.txt` - Link validation results
- `performance-audit.html` - Lighthouse audit results

## Festival Information

### Board of Directors
- **President**: Marcela Lay (Founder)
- **Vice President & Treasurer**: Damilola Elegbede
- **Secretary**: Analis Ledesma
- **Board Members**: Donal Solick, Yolanda Meiler

### Ticket Pricing Structure
- **Full Festival Pass**: $100 (early bird) / $125 (regular)
- **Day Passes**: Friday $50 | Saturday $85 | Sunday $50
- **Single Workshop**: $30
- **Single Social**: $20

### Festival Growth Timeline
- **2023**: Inaugural year, 500 attendees
- **2024**: Growth year
- **2025**: Expansion
- **2026**: Premier festival, 5,000+ expected attendees

## AI Assistant Guidelines

### When Working on This Project
1. **Repository cleanliness**: Never commit generated files - they're in .gitignore for a reason
2. **Configuration centralization**: All config files should be in `/config/` directory
3. **Testing is mandatory**: Run `npm run test:all` before any commits
4. **Design consistency**: Maintain typography-forward design philosophy
5. **Modern JavaScript**: Use ES6+ features, modules, and components
6. **Performance first**: Consider caching, lazy loading, and optimization
7. **Mobile responsive**: Test all changes on mobile devices
8. **Accessibility**: Maintain WCAG compliance and semantic HTML
9. **Documentation**: Update relevant docs when making architectural changes

### Common Tasks
- **Content updates**: Modify HTML files in `/pages/`
- **Style changes**: Update relevant CSS files in `/css/`
- **JavaScript features**: Add modules to `/js/` or components to `/js/components/`
- **API changes**: Modify serverless functions in `/api/`
- **Configuration**: Update config files in `/config/`
- **Testing**: Add tests to `/tests/unit/` and run full test suite
- **Performance**: Use performance monitoring and optimization tools

### Cultural Sensitivity
- **Cuban culture**: Respect authentic traditions
- **Community**: Inclusive, welcoming language
- **Accuracy**: Verify cultural references
- **Representation**: Diverse, respectful imagery

---

This CLAUDE.md file provides comprehensive guidance for any Claude instance working on the A Lo Cubano Boulder Fest website. The project emphasizes clean architecture, comprehensive testing, performance optimization, and authentic Cuban cultural celebration.