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
├── index.html                    # Landing page with redirect to /home
├── vercel.json                   # Deployment configuration with clean URL routing
├── package.json                  # Node.js dependencies and scripts
├── README.md                     # Project documentation
├── CLAUDE.md                     # This file - AI assistant context
├── LICENSE                       # MIT License
│
├── config/                       # Centralized configuration
│   ├── eslint.config.js          # ESLint configuration
│   ├── jest.unit.config.cjs      # Jest test configuration
│   ├── jest-puppeteer.config.js  # Puppeteer configuration
│   └── .htmlhintrc               # HTML linting configuration
│
├── css/                          # Stylesheets (modular architecture)
│   ├── base.css                  # Core design tokens and CSS variables
│   ├── components.css            # Reusable UI components
│   ├── typography.css            # Typography-forward design styles
│   ├── navigation.css            # Navigation and header styles
│   ├── forms.css                 # Form and input styles
│   └── mobile-overrides.css      # Mobile responsive overrides
│
├── js/                           # JavaScript modules (ES6+)
│   ├── main.js                   # Core functionality and initialization
│   ├── navigation.js             # Navigation and menu handling
│   ├── typography.js             # Typography animations and effects
│   ├── gallery-detail.js         # Gallery page functionality
│   ├── gallery-hero.js           # Gallery hero section handler
│   ├── cache-warmer.js           # Cache warming utilities
│   ├── image-cache-manager.js    # Image caching logic
│   ├── performance-monitor.js    # Performance monitoring
│   ├── prefetch-manager.js       # Resource prefetching
│   ├── progressive-loader.js     # Progressive image loading
│   ├── sw.js                     # Service worker
│   └── components/               # Reusable components
│       ├── lightbox.js           # Lightbox gallery viewer
│       └── lazy-loading.js       # Intersection Observer lazy loading
│
├── pages/                        # HTML pages (clean URLs)
│   ├── home.html                 # Main landing page
│   ├── about.html                # About the festival
│   ├── artists.html              # 2026 instructor lineup
│   ├── schedule.html             # Event schedule
│   ├── gallery.html              # Photo gallery hub
│   ├── gallery-2025.html         # 2025 festival photos
│   ├── gallery-test-minimal.html # Gallery test page
│   ├── tickets.html              # Ticket information
│   ├── donations.html            # Support the festival
│   └── 404.html                  # Custom error page
│
├── api/                          # Vercel serverless functions
│   ├── gallery.js                # Gallery API with Google Drive integration
│   ├── featured-photos.js        # Featured photos endpoint
│   ├── cache-warm.js             # Cache warming endpoint
│   ├── debug.js                  # Debug utilities
│   └── image-proxy/              
│       └── [fileId].js           # Google Drive image proxy
│
├── images/                       # Static assets
│   ├── logo.png                  # Festival logo
│   ├── favicon.ico               # Browser favicon
│   ├── favicon-circle.svg        # SVG favicon
│   ├── hero-default.jpg          # Default hero image
│   ├── instagram-icon.svg        # Social media icons
│   ├── instagram-type.svg        
│   ├── instagram.svg             
│   ├── whatsapp-icon.svg         
│   ├── favicons/                 # Multiple favicon formats
│   │   └── [various sizes]       
│   └── gallery/                  # Gallery placeholder images
│       └── placeholder-[1-4].svg 
│
├── scripts/                      # Build and utility scripts
│   ├── generate-gallery-cache.js # Generates gallery data cache
│   ├── generate-featured-photos.js # Generates featured photos cache
│   ├── verify-structure.js       # Validates project structure
│   ├── deployment-check.js       # Pre-deployment validation
│   ├── metrics-monitor.js         # Performance monitoring
│   ├── test-maintenance.js        # Test health monitoring
│   ├── test-runner.js             # Advanced test execution
│   ├── start.sh                   # Quick start script
│   └── debug/                    
│       └── debug_gallery_photos.py # Gallery debugging tool
│
├── tests/                        # Comprehensive test suite
│   ├── unit/                     # Unit tests (197 tests)
│   │   ├── api-logic.test.js     
│   │   ├── build-scripts.test.js 
│   │   ├── gallery*.test.js      # Gallery-related tests
│   │   ├── lightbox*.test.js     # Lightbox tests
│   │   ├── lazy-loading*.test.js # Lazy loading tests
│   │   ├── serverless-patterns.test.js
│   │   ├── ui-integration.test.js
│   │   └── link-validation/      # Python link validation tests
│   │       ├── test_link_validation.py
│   │       └── test_link_validator.py
│   ├── integration/              # Integration tests
│   │   └── example_test_integration.py
│   ├── manual/                   # Manual test utilities
│   │   └── [various test files]  
│   ├── utils/                    # Test utilities
│   │   ├── gallery-test-helpers.js
│   │   └── test-reporter.js
│   ├── scripts/                  # Test scripts
│   │   └── test-site.sh          
│   ├── run-link-tests.js         # JavaScript link validator
│   ├── run-all-tests.sh          # Master test runner
│   ├── link-check.sh             # Shell link checker
│   ├── link-checker.js           # Node.js link checker
│   ├── ci-link-check.js          # CI-specific link checking
│   ├── demo-reports.js           # Report generation
│   ├── setup.js                  # Test setup
│   └── unit-setup.cjs            # Unit test configuration
│
├── tools/                        # Development tools
│   └── link-validation/          # Python link validation suite
│       ├── __init__.py           
│       ├── html_link_parser.py   # HTML parsing and link extraction
│       ├── link_analyzer.py      # CLI interface for analysis
│       ├── link_validation_utils.py # Validation utilities
│       ├── link_validator.py     # Core validation logic
│       ├── run_link_tests.py     # Test runner
│       └── link_validation_config.json # Configuration
│
├── docs/                         # Project documentation
│   ├── api/                      
│   │   ├── API_DOCUMENTATION.md  # API reference
│   │   └── GOOGLE_DRIVE_SETUP.md # Google Drive integration
│   ├── deployment/               
│   │   ├── DEPLOYMENT.md         # Deployment guide
│   │   ├── CI_CD_SETUP.md        # CI/CD configuration
│   │   └── MERGE_READY.md        # Merge checklist
│   ├── development/              
│   │   ├── PERFORMANCE_OPTIMIZATIONS.md
│   │   ├── SECURITY_FIXES_SUMMARY.md
│   │   └── MOBILE-IMPLEMENTATION-SUMMARY.md
│   ├── setup/                    
│   │   └── SETUP_COMPLETE.md     # Setup instructions
│   ├── tools/                    # Tool documentation
│   │   ├── HTML_LINK_PARSER_README.md
│   │   ├── LINK_TESTING.md
│   │   └── LINK_VALIDATION_README.md
│   └── lightbox-counter.md       # Component documentation
│
├── spec/                         # Design specifications
│   ├── design-system/            # Design system docs
│   ├── typography/               # Typography specifications
│   ├── components/               # Component specs
│   ├── animations/               # Animation guidelines
│   ├── layouts/                  # Layout patterns
│   └── content/                  # Content guidelines
│
├── public/                       # Generated public assets (NOT in Git)
│   ├── featured-photos.json      # Generated cache file
│   └── gallery-data/             # Generated gallery data
│       └── 2025.json             
│
└── [other generated files]       # NOT tracked in Git:
    ├── node_modules/             # NPM dependencies
    ├── coverage/                 # Test coverage reports
    ├── .tmp/                     # Temporary files
    ├── link_analysis.csv         # Link analysis reports
    ├── link_validation_report.txt # Validation results
    └── performance-audit.html    # Lighthouse reports
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
- **Configuration centralized**: All config files are in `/config/` directory  
- **Comprehensive testing**: 197+ unit tests with Jest, link validation, performance monitoring
- **CI/CD ready**: GitHub Actions workflow with pre-commit and pre-push hooks
- **Clean root directory**: Only essential files at root level (package.json, vercel.json, etc.)
- **Organized structure**: Tests in `/tests/`, tools in `/tools/`, docs in `/docs/`

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

#### Enhanced Image Processing (Phase 1)
- **Responsive Images**: Automatic sizing based on device capabilities
- **Modern Formats**: WebP delivery with JPEG fallback
- **Query Parameters**: 
  - `w` (width): Target width in pixels
  - `format`: Target format (webp, jpeg)
  - `q` (quality): Quality level (1-100)
- **Format Auto-Detection**: Serves optimal format based on browser capabilities
- **Performance**: 25-40% bandwidth reduction through WebP compression

## Development Workflow

### Local Development
```bash
# Quick start (Vercel development server with full API support)
npm start

# Alternative commands
npm run start-vercel-dev    # Same as npm start
./scripts/start.sh          # Legacy script wrapper
npm run serve:simple        # Simple HTTP server (no API functions)
```

### Testing
- **Unit tests**: `npm test` or `npm run test:unit` (197 tests)
- **Coverage**: `npm run test:coverage` (with HTML reports)
- **Link validation (JS)**: `npm run test:links` (498 links tested)
- **Link validation (Python)**: `python3 tools/link-validation/run_link_tests.py`
- **All tests**: `npm run test:all`
- **Linting**: `npm run lint` (ESLint + HTMLHint)
- **Pre-commit hooks**: Automatically run linting and unit tests on commit

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
- `public/gallery-data/` - Gallery data cache directory
- `coverage/` - Test coverage reports
- `node_modules/` - NPM dependencies
- `venv/` - Python virtual environment
- `__pycache__/` - Python cache files
- `.tmp/` - Temporary files
- `link_analysis.csv` - Link analysis reports
- `link_validation_report.txt` - Link validation results
- `performance-audit.html` - Lighthouse audit results
- `.githooks/` - Git hooks directory (use .git/hooks instead)

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

## Recent Project Updates (July 2025)

### Repository Reorganization
A comprehensive cleanup was completed to improve project structure:
- **Moved test files**: All test files now properly organized in `/tests/` subdirectories
- **Centralized tools**: Link validation tools moved to `/tools/link-validation/`
- **Documentation structure**: Tool docs moved to `/docs/tools/`
- **Clean root**: Removed clutter from root directory
- **Updated imports**: All Python and JavaScript imports updated for new paths
- **Git hygiene**: Removed generated files from tracking, updated .gitignore

### Current State
- **All tests passing**: 197 unit tests, link validation working
- **Clean architecture**: Organized file structure with clear separation of concerns
- **Performance optimized**: Caching, lazy loading, and progressive enhancement
- **Mobile responsive**: Fully responsive design with mobile-first approach
- **Accessible**: WCAG compliant with semantic HTML
- **Mobile navigation**: Fixed JavaScript class alignment issue (July 2025) - now uses `is-open` class consistently

## AI Assistant Guidelines

### When Working on This Project
1. **Repository cleanliness**: Never commit generated files - they're in .gitignore
2. **Use existing structure**: Follow the established directory organization
3. **Testing is mandatory**: Run `npm run test:all` before any commits
4. **Design consistency**: Maintain typography-forward design philosophy
5. **Modern JavaScript**: Use ES6+ features, modules, and components
6. **Performance first**: Consider caching, lazy loading, and optimization
7. **Mobile responsive**: Test all changes on mobile devices
8. **Accessibility**: Maintain WCAG compliance and semantic HTML
9. **Documentation**: Update relevant docs when making architectural changes
10. **Git hooks**: Pre-commit hooks will run automatically - ensure tests pass

### Common Tasks
- **Content updates**: Modify HTML files in `/pages/`
- **Style changes**: Update relevant CSS files in `/css/`
- **JavaScript features**: Add modules to `/js/` or components to `/js/components/`
- **API changes**: Modify serverless functions in `/api/`
- **Configuration**: Update config files in `/config/`
- **Testing**: Add tests to `/tests/unit/` and run full test suite
- **Link validation**: Use either JS (`npm run test:links`) or Python tools
- **Performance**: Use performance monitoring and optimization tools

### Critical Development Notes

#### JavaScript/CSS Class Alignment
⚠️ **CRITICAL**: When working with mobile navigation, ensure JavaScript class targeting exactly matches CSS selectors:

- **CSS**: `.nav-list.is-open { display: flex; }`
- **JavaScript**: `navList.classList.add('is-open')`

**Historical Issue (July 2025)**: Mobile navigation was completely broken due to JavaScript using `mobile-menu` class while CSS expected `is-open` class. This caused the hamburger button to be non-functional.

**Prevention**: Always verify class names match between JavaScript event handlers and CSS selectors before implementing interactive features.

### Development Workflow
1. **Start development**: `npm start` (Vercel dev server with full API support)
2. **Make changes**: Follow the file structure and conventions
3. **Test changes**: `npm test` for unit tests, `npm run test:links` for links
4. **Lint code**: `npm run lint` (also runs automatically on commit)
5. **Commit**: Git hooks will validate your changes
6. **Deploy**: Push to Vercel for automatic deployment

### Important File Paths
- **Python link validation**: `tools/link-validation/`
- **Test files**: `tests/unit/`, `tests/integration/`
- **Documentation**: `docs/` with subdirectories for different topics
- **Generated files**: `public/` (not tracked in Git)

### Cultural Sensitivity
- **Cuban culture**: Respect authentic traditions
- **Community**: Inclusive, welcoming language
- **Accuracy**: Verify cultural references
- **Representation**: Diverse, respectful imagery

---

This CLAUDE.md file provides comprehensive guidance for any Claude instance working on the A Lo Cubano Boulder Fest website. The project emphasizes clean architecture, comprehensive testing, performance optimization, and authentic Cuban cultural celebration.