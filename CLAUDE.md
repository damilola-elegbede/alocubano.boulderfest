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
│   ├── virtual-gallery-manager.js # Virtual scrolling system (Phase 3)
│   ├── multi-year-gallery-manager.js # Multi-year gallery coordination (Phase 3)
│   ├── advanced-performance-monitor.js # Enhanced performance tracking (Phase 3)
│   ├── sw.js                     # Service worker
│   └── components/               # Reusable components
│       ├── lightbox.js           # Lightbox gallery viewer
│       ├── lazy-loading.js       # Intersection Observer lazy loading
│       └── virtual-scroller.js   # Virtual scrolling component (Phase 3)
│
├── pages/                        # HTML pages (clean URLs)
│   ├── home.html                 # Main landing page
│   ├── about.html                # About the festival
│   ├── artists.html              # 2026 instructor lineup
│   ├── schedule.html             # Event schedule
│   ├── gallery.html              # Photo gallery hub
│   ├── gallery-2025.html         # 2025 festival photos
│   ├── gallery-test-minimal.html # Gallery test page
│   ├── gallery-virtual.html      # Virtual scrolling gallery demo (Phase 3)
│   ├── tickets.html              # Ticket information
│   ├── donations.html            # Support the festival
│   └── 404.html                  # Custom error page
│
├── api/                          # Vercel serverless functions
│   ├── gallery.js                # Gallery API with Google Drive integration
│   ├── featured-photos.js        # Featured photos endpoint
│   ├── cache-warm.js             # Cache warming endpoint
│   ├── debug.js                  # Debug utilities
│   ├── virtual-gallery.js        # Virtual gallery data endpoint (Phase 3)
│   ├── performance-metrics.js    # Advanced performance metrics API (Phase 3)
│   └── image-proxy/              
│       └── [fileId].js           # Google Drive image proxy with AVIF support (Phase 3)
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
│   │   ├── virtual-scrolling*.test.js # Virtual scrolling tests (Phase 3)
│   │   ├── multi-year-gallery*.test.js # Multi-year gallery tests (Phase 3)
│   │   ├── advanced-performance*.test.js # Performance monitoring tests (Phase 3)
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

#### Advanced Caching Architecture (Phase 2)

##### Service Worker Implementation
- **Multi-level Caching**: Static, Image, API, and Gallery-specific caches
- **Intelligent Strategies**: Cache-first for images, network-first for API data
- **Background Updates**: Stale-while-revalidate for gallery content
- **Offline Support**: Graceful degradation when network unavailable

##### Preloading System
- **Critical Path**: Hero images and gallery data preloaded in HTML head
- **Intelligent Prefetching**: Based on user interaction patterns
- **Resource Budgeting**: Adaptive to connection speed and device capabilities
- **Priority Queue**: High/medium/low priority prefetch management

##### Cache Warming
- **Progressive Strategy**: Critical → Essential → Predictive resources
- **Connection-Aware**: Adapts warming strategy to network conditions
- **Analytics Integration**: Monitors cache efficiency and bandwidth usage

#### Virtual Scrolling & Advanced Monitoring (Phase 3)

##### Virtual Gallery System
- **High-Performance Rendering**: Only renders visible gallery items in viewport
- **Memory Optimization**: Manages large photo collections (1000+ images) efficiently
- **Smooth Scrolling**: 60fps performance with hardware acceleration
- **Dynamic Item Heights**: Handles variable photo aspect ratios and captions
- **Buffer Zones**: Pre-renders items above/below viewport for seamless experience

##### AVIF Format Support
- **Next-Generation Compression**: AVIF format support with WebP/JPEG fallbacks
- **Automated Format Selection**: Browser capability detection and optimal format delivery
- **50% Smaller File Sizes**: Compared to WebP, 70% smaller than JPEG
- **Quality Preservation**: Maintains visual quality at dramatically reduced sizes
- **Progressive Enhancement**: Graceful fallback chain: AVIF → WebP → JPEG

##### Multi-Year Gallery Architecture
- **Unified Interface**: Single component manages multiple festival years
- **Lazy Year Loading**: Gallery years loaded on-demand as user navigates
- **Cross-Year Navigation**: Seamless transitions between 2023, 2024, 2025+ galleries
- **Memory Management**: Unloads distant gallery years to prevent memory bloat
- **Shared Caching**: Common infrastructure across all gallery years

##### Advanced Performance Monitoring
- **Real-Time Metrics**: FPS, memory usage, load times, cache hit rates
- **User Experience Analytics**: Scroll performance, interaction delays, error rates
- **Network Adaptation**: Monitors connection speed and adjusts quality/prefetching
- **Performance Budgets**: Warns when memory or performance thresholds exceeded
- **Heat Maps**: Visual representation of performance bottlenecks and user patterns

##### Technical Specifications

###### Virtual Scrolling Implementation
```javascript
// Core virtual scrolling configuration
const VIRTUAL_CONFIG = {
  itemHeight: 250,        // Base item height (dynamic sizing supported)
  bufferSize: 5,          // Items to render outside viewport
  recycleThreshold: 50,   // Items before recycling DOM nodes
  scrollThrottle: 16,     // ~60fps scroll event handling
  preloadDistance: 1000   // Pixels to preload ahead of scroll
};
```

###### AVIF Integration
```javascript
// Format selection with AVIF priority
const FORMAT_PRIORITY = ['avif', 'webp', 'jpeg'];
const QUALITY_SETTINGS = {
  avif: { high: 85, medium: 75, low: 65 },
  webp: { high: 90, medium: 80, low: 70 },
  jpeg: { high: 95, medium: 85, low: 75 }
};
```

###### Performance Budgets
```javascript
// Performance thresholds and limits
const PERFORMANCE_BUDGETS = {
  maxMemoryMB: 100,       // Maximum memory usage
  targetFPS: 60,          // Target frame rate
  maxLoadTime: 2000,      // Maximum load time (ms)
  cacheHitRate: 0.85      // Minimum cache efficiency
};
```

##### Performance Benefits
- **90% Memory Reduction**: Virtual scrolling handles 1000+ images in <100MB
- **Consistent 60fps**: Hardware-accelerated smooth scrolling
- **50% Faster Load Times**: AVIF format and intelligent preloading
- **95% Cache Hit Rate**: Advanced caching with predictive loading
- **Universal Compatibility**: Progressive enhancement ensures broad device support

##### Integration Patterns

###### Virtual Gallery Manager Usage
```javascript
import { VirtualGalleryManager } from './virtual-gallery-manager.js';

const galleryManager = new VirtualGalleryManager({
  container: document.getElementById('gallery-container'),
  dataSource: '/api/virtual-gallery',
  virtualScrolling: true,
  multiYear: true,
  performance: {
    enableAVIF: true,
    preloadStrategy: 'predictive',
    memoryLimit: 100 // MB
  }
});
```

###### Multi-Year Coordination
```javascript
import { MultiYearGalleryManager } from './multi-year-gallery-manager.js';

const multiYearManager = new MultiYearGalleryManager({
  years: ['2023', '2024', '2025'],
  activeYear: '2025',
  lazyLoading: true,
  crossYearNavigation: true,
  sharedCache: true
});
```

###### Performance Monitoring
```javascript
import { AdvancedPerformanceMonitor } from './advanced-performance-monitor.js';

const perfMonitor = new AdvancedPerformanceMonitor({
  metrics: ['fps', 'memory', 'network', 'cache'],
  reporting: {
    interval: 5000,
    endpoint: '/api/performance-metrics',
    realTime: true
  },
  budgets: PERFORMANCE_BUDGETS
});
```
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
- **Unit tests**: `npm test` or `npm run test:unit` (197+ tests)
- **Coverage**: `npm run test:coverage` (with HTML reports)
- **Link validation (JS)**: `npm run test:links` (498 links tested)
- **Link validation (Python)**: `python3 tools/link-validation/run_link_tests.py`
- **Virtual scrolling tests**: `npm run test:virtual` (Phase 3)
- **Performance benchmarks**: `npm run test:performance` (Phase 3)
- **Multi-year gallery tests**: `npm run test:multi-year` (Phase 3)
- **All tests**: `npm run test:all`
- **Linting**: `npm run lint` (ESLint + HTMLHint)
- **Pre-commit hooks**: Automatically run linting and unit tests on commit

### Making Changes
1. **Design tokens**: Update CSS variables in `/css/base.css`
2. **Styles**: Modify relevant CSS files in `/css/`
3. **Content**: Edit HTML files in `/pages/`
4. **Functionality**: Update JavaScript modules in `/js/`
5. **API**: Modify serverless functions in `/api/`
6. **Virtual Scrolling**: Update virtual gallery components in `/js/components/virtual-scroller.js`
7. **Performance**: Modify advanced monitoring in `/js/advanced-performance-monitor.js`
8. **Multi-Year Galleries**: Update multi-year coordination in `/js/multi-year-gallery-manager.js`

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

### Phase 3 Development (Advanced Optimization)
Major architectural enhancements for high-performance gallery experience:
- **Virtual Scrolling**: Implemented virtual gallery system for 1000+ images
- **AVIF Support**: Added next-generation image format with 50% size reduction
- **Multi-Year Galleries**: Unified system for managing multiple festival years
- **Advanced Monitoring**: Real-time performance metrics and optimization
- **Memory Optimization**: 90% reduction in memory usage for large galleries
- **Cross-Year Navigation**: Seamless transitions between different festival years

### Current State
- **All tests passing**: 197+ unit tests, including virtual scrolling and performance tests
- **Clean architecture**: Organized file structure with clear separation of concerns
- **Performance optimized**: Virtual scrolling, AVIF support, advanced caching
- **Mobile responsive**: Fully responsive design with mobile-first approach
- **Accessible**: WCAG compliant with semantic HTML
- **Mobile navigation**: Fixed JavaScript class alignment issue (July 2025) - now uses `is-open` class consistently
- **High Performance**: 60fps scrolling, <100MB memory usage, 95% cache hit rate

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
- **Virtual Scrolling**: Modify virtual gallery components and test performance
- **AVIF Integration**: Update image processing with AVIF format support
- **Multi-Year Galleries**: Add new festival years or modify cross-year navigation
- **Advanced Monitoring**: Configure performance budgets and real-time metrics

### Critical Development Notes

#### JavaScript/CSS Class Alignment
⚠️ **CRITICAL**: When working with mobile navigation, ensure JavaScript class targeting exactly matches CSS selectors:

- **CSS**: `.nav-list.is-open { display: flex; }`
- **JavaScript**: `navList.classList.add('is-open')`

**Historical Issue (July 2025)**: Mobile navigation was completely broken due to JavaScript using `mobile-menu` class while CSS expected `is-open` class. This caused the hamburger button to be non-functional.

**Prevention**: Always verify class names match between JavaScript event handlers and CSS selectors before implementing interactive features.

#### Phase 3 Development Guidelines

##### Virtual Scrolling Best Practices
⚠️ **CRITICAL**: Virtual scrolling requires careful memory management:

- **Item Recycling**: Always recycle DOM nodes to prevent memory leaks
- **Event Cleanup**: Remove event listeners when items are recycled
- **Buffer Management**: Maintain optimal buffer size (5-10 items) for smooth scrolling
- **Performance Monitoring**: Track FPS and memory usage during development

```javascript
// Good: Proper item recycling
const recycleItem = (item, newData) => {
  // Clean up old event listeners
  item.removeEventListener('click', oldHandler);
  // Update content
  item.textContent = newData.title;
  // Add new event listeners
  item.addEventListener('click', newHandler);
};
```

##### AVIF Implementation Guidelines
⚠️ **CRITICAL**: AVIF support requires progressive enhancement:

- **Feature Detection**: Always check browser support before serving AVIF
- **Fallback Chain**: Implement AVIF → WebP → JPEG fallback sequence
- **Quality Settings**: Use appropriate quality settings for each format
- **Caching Strategy**: Cache different formats separately

```javascript
// Good: Progressive AVIF enhancement
const getOptimalFormat = () => {
  if (supportsAVIF()) return 'avif';
  if (supportsWebP()) return 'webp';
  return 'jpeg';
};
```

##### Multi-Year Gallery Coordination
⚠️ **CRITICAL**: Multi-year galleries require careful state management:

- **Memory Boundaries**: Unload distant gallery years to prevent bloat
- **State Synchronization**: Keep gallery states consistent across years
- **Loading States**: Show appropriate loading indicators for year transitions
- **Error Handling**: Gracefully handle missing or failed gallery years

```javascript
// Good: Proper year management
class MultiYearGalleryManager {
  loadYear(year) {
    // Unload distant years first
    this.unloadDistantYears(year);
    // Load requested year
    return this.loadGalleryYear(year);
  }
  
  unloadDistantYears(currentYear) {
    const maxDistance = 2;
    Object.keys(this.loadedYears).forEach(year => {
      if (Math.abs(currentYear - year) > maxDistance) {
        this.unloadGalleryYear(year);
      }
    });
  }
}
```

##### Performance Monitoring Integration
⚠️ **CRITICAL**: Performance monitoring must not impact performance:

- **Throttled Reporting**: Limit metrics reporting frequency
- **Async Processing**: Process performance data asynchronously
- **Error Boundaries**: Don't let monitoring failures break functionality
- **Budget Thresholds**: Set realistic performance budgets

```javascript
// Good: Non-blocking performance monitoring
class AdvancedPerformanceMonitor {
  reportMetrics() {
    // Use requestIdleCallback for non-critical reporting
    requestIdleCallback(() => {
      this.sendMetricsAsync();
    });
  }
}
```

### Development Workflow
1. **Start development**: `npm start` (Vercel dev server with full API support)
2. **Make changes**: Follow the file structure and conventions
3. **Test changes**: `npm test` for unit tests, `npm run test:links` for links
4. **Performance testing**: `npm run test:performance` for Phase 3 features
5. **Virtual scrolling tests**: `npm run test:virtual` for gallery components
6. **Lint code**: `npm run lint` (also runs automatically on commit)
7. **Commit**: Git hooks will validate your changes
8. **Deploy**: Push to Vercel for automatic deployment

#### Phase 3 Development Workflow
1. **Performance baseline**: Establish baseline metrics before making changes
2. **Memory profiling**: Monitor memory usage during virtual scrolling development
3. **AVIF testing**: Test AVIF support across different browsers and devices
4. **Multi-year coordination**: Verify seamless transitions between gallery years
5. **Performance validation**: Ensure 60fps performance and <100MB memory usage

### Important File Paths
- **Python link validation**: `tools/link-validation/`
- **Test files**: `tests/unit/`, `tests/integration/`
- **Documentation**: `docs/` with subdirectories for different topics
- **Generated files**: `public/` (not tracked in Git)
- **Virtual scrolling**: `js/virtual-gallery-manager.js`, `js/components/virtual-scroller.js`
- **Multi-year galleries**: `js/multi-year-gallery-manager.js`
- **Advanced monitoring**: `js/advanced-performance-monitor.js`
- **Phase 3 APIs**: `api/virtual-gallery.js`, `api/performance-metrics.js`
- **Phase 3 pages**: `pages/gallery-virtual.html`

### Cultural Sensitivity
- **Cuban culture**: Respect authentic traditions
- **Community**: Inclusive, welcoming language
- **Accuracy**: Verify cultural references
- **Representation**: Diverse, respectful imagery

---

This CLAUDE.md file provides comprehensive guidance for any Claude instance working on the A Lo Cubano Boulder Fest website. The project emphasizes clean architecture, comprehensive testing, performance optimization, and authentic Cuban cultural celebration.