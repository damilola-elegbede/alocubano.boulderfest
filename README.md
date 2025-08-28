# A Lo Cubano Boulder Fest 2026

## 🎵 Experience Cuban Culture in the Heart of the Rockies

The official website for **A Lo Cubano Boulder Fest**, Boulder's premier Cuban salsa festival featuring world-class instructors, authentic music, and vibrant dance workshops.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- SQLite 3.9.0+ (for database migrations with JSON support)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/alocubano.boulderfest.git
   cd alocubano.boulderfest
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   ```bash
   # Copy environment template
   cp .env.example .env.local
   
   # Edit .env.local with your configuration
   # See INSTALLATION.md for detailed setup instructions
   ```

4. **Start the development server**
   ```bash
   # Full development server with API support (recommended)
   npm start
   
   # Alternative: local development without ngrok
   npm run start:local
   
   # Simple HTTP server (no API functions)
   npm run serve:simple
   ```

5. **Open in browser**: http://localhost:3000

## 📅 Festival Information

**Dates**: May 15-17, 2026 (Friday-Sunday)  
**Location**: Avalon Ballroom, 6185 Arapahoe Rd, Boulder, CO  
**Contact**: alocubanoboulderfest@gmail.com  
**Instagram**: [@alocubano.boulderfest](https://www.instagram.com/alocubano.boulderfest/)

## 🎨 Design Philosophy

The website features a **typographic-forward design** that treats text as art:

- Multiple font families (Bebas Neue, Playfair Display, Space Mono)
- Creative text animations and effects
- Experimental typography layouts
- Text-driven visual hierarchy

## 📁 Project Structure

```
alocubano.boulderfest/
├── index.html (Main home page)
├── vercel.json (Deployment configuration)
├── scripts/
│   ├── start.sh (Quick launcher)
│   ├── deployment-check.js (Pre-deployment validation)
│   ├── generate-featured-photos.js (Featured photos cache)
│   ├── generate-gallery-cache.js (Gallery data generation)
│   ├── metrics-monitor.js (Performance monitoring)
│   ├── test-maintenance.js (Test health monitoring)
│   ├── test-runner.js (Advanced test execution)
│   ├── verify-structure.js (Project structure validation)
│   ├── setup-e2e-database.js (E2E database automation)
│   └── debug/ (Debug utilities)
├── css/
│   ├── base.css (Design system)
│   ├── components.css (Reusable components)
│   └── typography.css (Typographic design)
├── js/
│   ├── navigation.js (Menu & transitions)
│   ├── main.js (Core functionality)
│   ├── typography.js (Typography effects)
│   └── gallery.js (Google Drive media integration)
├── pages/ (All website pages)
│   ├── about.html
│   ├── artists.html
│   ├── schedule.html
│   ├── gallery.html
│   ├── tickets.html
│   └── donations.html
├── api/
│   └── gallery.js (Serverless function for Google Drive API)
├── tests/e2e/flows/ (E2E Test Flows)
│   ├── gallery-browsing.test.js (Gallery performance & functionality)
│   ├── admin-dashboard.test.js (Admin panel & authentication)
│   ├── mobile-registration-experience.test.js (Mobile registration flow)
│   └── newsletter-simple.test.js (Newsletter subscription testing)
├── tests/e2e/helpers/ (E2E Test Utilities)
│   ├── performance-gallery.js (Gallery performance testing utilities)
│   ├── admin-auth.js (Admin authentication helpers)
│   ├── google-drive-mock.js (Gallery API mocking utilities)
│   └── mobile-test-scenarios.js (Mobile testing scenarios)
└── images/
    ├── logo.png (Main logo)
    ├── social/ (Social media icons folder)
    ├── instagram-type.svg (Custom IG icon)
    └── favicons/ (Multiple favicon sizes)
```

## 🎯 Key Features

### Content

- **Home**: Festival overview with dates and highlights
- **About**: Festival story, board of directors, and growth timeline
- **Artists**: 2026 instructor lineup and workshops
- **Schedule**: 3-day workshop and social schedule
- **Gallery**: Dynamic media gallery with Google Drive integration, festival photos/videos
- **Tickets**: Pricing tiers and registration with floating cart system
- **Donations**: Support the festival with floating cart integration

### Technical

- ✅ Typographic design system
- ✅ Mobile-responsive layouts with slide-in navigation
- ✅ Touch-optimized interactions and 44px minimum touch targets
- ✅ Mobile-first CSS architecture with desktop protection
- ✅ Hamburger menu with smooth X transformation animation
- ✅ Circular favicon branding
- ✅ Custom Instagram icon
- ✅ Smooth animations and transitions
- ✅ Fast Node.js development server
- ✅ Google Drive API integration for dynamic gallery
- ✅ Lightbox viewer for photos and videos
- ✅ Serverless functions on Vercel
- ✅ Floating cart system with intelligent page-specific visibility
- ✅ Stripe Checkout Sessions for secure, streamlined payments
- ✅ PCI-compliant payment processing with built-in fraud protection

## 👥 Board of Directors

- **President**: Marcela Lay (Founder)
- **Vice President & Treasurer**: Damilola Elegbede
- **Secretary**: Analis Ledesma
- **Board Members**: Donal Solick, Yolanda Meiler

## 🎟️ Ticket Information

- **Full Festival Pass**: $100 (early bird) / $125 (regular)
- **Day Passes**: Friday $50 | Saturday $85 | Sunday $50
- **Single Workshop**: $30
- **Single Social**: $20

## 🛠️ Development

### Available Scripts

- `npm start` - Start Vercel development server with full API support (port 3000)
- `npm run start:local` - Local development without ngrok tunnel
- `npm run serve:simple` - Simple HTTP server without API functions (port 8000)
- `npm test` - Run streamlined test suite
- `npm run test:all` - Run all tests including E2E validation
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run test:e2e:ui` - Interactive E2E test development mode
- `npm run lint` - Run ESLint and HTMLHint
- `npm run build` - Build for production
- `npm run prebuild` - Generate cache files for gallery

## 🔄 CI/CD Pipeline

### GitHub Actions Integration

Our CI/CD pipeline provides comprehensive automation for testing, quality assurance, and deployment:

#### Workflow Features

- **Multi-browser E2E Testing**: Chrome, Firefox, Safari, and Edge compatibility testing
- **Performance Optimization**: Gallery performance testing and Core Web Vitals monitoring
- **Security Testing**: Admin panel security validation and authentication flow testing
- **Quality Gates**: Automated linting, unit testing, and E2E testing before deployment
- **PR Status Reporting**: Real-time status updates and quality gate validation

#### Available CI Commands

```bash
# CI Environment Setup
npm run ci:setup              # Initialize CI environment with database and server
npm run ci:cleanup            # Clean up resources and generate reports
npm run ci:test               # Complete CI test pipeline
npm run ci:pipeline           # Full CI/CD pipeline with quality gates

# Performance Optimization
npm run ci:performance:optimize    # Optimize CI performance settings
npm run ci:performance:analyze     # Analyze CI performance metrics
npm run ci:performance:monitor     # Monitor CI resource usage
npm run ci:performance:report      # Generate performance reports

# Quality Assurance
npm run quality:gates         # Run quality gate validation
npm run quality:check         # Complete quality assessment
npm run pr:status-report      # Generate PR status report
npm run pr:status-summary     # PR quality gate summary

# Branch Protection
npm run branch:validate       # Validate branch protection rules
npm run branch:apply-protection    # Apply branch protection settings

# Flaky Test Management
npm run flaky:detect          # Detect flaky tests
npm run flaky:report          # Generate flaky test reports
npm run flaky:quarantine      # Quarantine unreliable tests
```

#### CI/CD Environment Variables

Required for full CI/CD functionality:

```bash
# Core CI Settings
CI=true
NODE_ENV=test
E2E_TEST_MODE=true

# Database Configuration
TURSO_DATABASE_URL=           # Production database URL
TURSO_AUTH_TOKEN=            # Database authentication token
E2E_TURSO_DATABASE_URL=      # E2E testing database URL
E2E_TURSO_AUTH_TOKEN=        # E2E database authentication

# Service Credentials (for integration testing)
STRIPE_SECRET_KEY=           # Payment processing tests
BREVO_API_KEY=              # Email service tests
ADMIN_PASSWORD=             # Admin panel tests
```

#### Performance Benchmarks

- **Setup Time**: < 60 seconds for complete environment initialization
- **Unit Tests**: < 10 seconds for 26 essential tests
- **E2E Tests**: 2-5 minutes for comprehensive browser testing
- **Quality Gates**: < 30 seconds for linting and validation
- **Resource Cleanup**: < 30 seconds with detailed reporting

#### Quality Gates

- **Code Quality**: ESLint + HTMLHint validation
- **Security**: Input validation and XSS protection testing
- **Performance**: Gallery performance and Core Web Vitals compliance
- **Accessibility**: WCAG compliance validation
- **Browser Compatibility**: Multi-browser E2E testing

See [CI/CD Documentation](docs/ci-cd/README.md) for detailed setup and configuration.

## Testing

### Streamlined Test Philosophy

We've achieved a **96% complexity reduction** by eliminating complex test infrastructure in favor of radical simplicity:

- **419 total lines** vs 11,411 lines previously (96% reduction)
- **Essential tests** covering critical API contracts
- **Fast execution** for complete test suite
- **Zero abstractions** - every test readable by any JavaScript developer

### Quick Start

```bash
# Run all tests
npm test                    # Run 26 essential unit tests

# Development mode
npm run test:simple:watch   # Watch mode

# With coverage
npm run test:coverage       # Coverage report

# E2E testing
npm run test:e2e           # Playwright end-to-end tests
npm run test:e2e:ui        # Interactive UI mode
```

### Test Structure

#### Unit Test Suite (26 Tests)

- **api-contracts.test.js** (7 tests) - API contract validation
- **basic-validation.test.js** (8 tests) - Input validation and security
- **smoke-tests.test.js** (3 tests) - Basic functionality verification
- **registration-api.test.js** (5 tests) - Registration API unit tests
- **registration-flow.test.js** (3 tests) - Registration flow tests

#### E2E Test Suite (Playwright) - Phase 2 Coverage

**Phase 2 Gallery Testing** (`tests/e2e/flows/gallery-browsing.test.js`):
- **Google Drive API Integration**: Gallery loading, error handling, metadata display
- **Lazy Loading Performance**: Virtual scrolling with 1000+ images, progressive loading
- **Image Optimization**: AVIF/WebP/JPEG format selection, responsive images
- **Virtual Scrolling**: Memory management, DOM optimization, performance monitoring
- **Cache Effectiveness**: Cache hit ratios, invalidation testing, performance metrics
- **Network Conditions**: Progressive loading under slow-3g, fast-3g, and 4g
- **Accessibility**: WCAG compliance, keyboard navigation, screen reader compatibility
- **Core Web Vitals**: LCP, CLS, FID measurement and validation

**Phase 2 Admin Panel Testing** (`tests/e2e/flows/admin-dashboard.test.js`):
- **Authentication Security**: JWT validation, session management, MFA support
- **Rate Limiting**: Brute force protection, failed login handling
- **Dashboard Operations**: Ticket validation, QR code scanning, bulk operations
- **Data Management**: Registration management, search/filter functionality
- **Analytics & Reporting**: Performance metrics, export functionality, data accuracy
- **Audit Logging**: Activity tracking, security monitoring, compliance features
- **Configuration Management**: System settings, security parameters, validation
- **Session Security**: Timeout handling, concurrent sessions, token management

**Multi-Browser & Device Coverage**:
- **Browser Matrix**: Chrome, Firefox, Safari (WebKit), Edge
- **Device Testing**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Viewport Adaptation**: Responsive design validation, touch target testing
- **Performance Validation**: Cross-browser performance benchmarks

### Phase 2 Performance Testing

#### Gallery Performance Utilities (`tests/e2e/helpers/performance-gallery.js`)

- **Comprehensive Performance Monitoring**: Memory usage, scroll performance, image loading metrics
- **Cache Effectiveness Testing**: Cache hit ratios, invalidation strategies, performance impact
- **Network Simulation**: Testing under various network conditions (slow-3g to 4g)
- **Memory Leak Detection**: Long-term browsing sessions, garbage collection effectiveness
- **Performance Regression Detection**: Baseline comparison, automated alerts
- **Core Web Vitals Monitoring**: LCP, CLS, FID measurement and reporting

#### Admin Security Testing (`tests/e2e/helpers/admin-auth.js`)

- **Authentication Flow Testing**: Login, logout, session management
- **JWT Security Validation**: Token verification, expiration handling, signature validation
- **Security Attack Simulation**: Rate limiting, brute force protection, CSRF prevention
- **MFA Testing**: Multi-factor authentication flow validation
- **Session Management**: Persistence, timeout, concurrent session handling

### Quality Gates

- **Simple execution**: Single command `npm test` 
- **Fast feedback**: Complete unit test suite runs quickly
- **Real API testing**: Direct interaction with actual endpoints
- **No mocking complexity**: Tests use real services and databases
- **Comprehensive E2E Coverage**: Full user workflows with performance validation

### Test Philosophy

Focus on **user-visible behavior** with **minimal complexity**:
- Test real API endpoints, not implementation details
- Keep each test under 20 lines
- Use direct HTTP requests, not elaborate abstractions
- Clean up test data explicitly in each test
- Validate performance alongside functionality

## Quality Gates & Monitoring

### Overview

Phase 3 introduces comprehensive quality gates and monitoring systems to ensure code quality, detect flaky tests, track coverage, and optimize CI/CD performance. The system provides automated quality assurance with detailed reporting and intelligent failure detection.

### Quality Gate Commands

```bash
# Local Development
npm run quality:gates         # Run complete quality gate validation
npm run quality:check         # Quick quality assessment
npm run quality:enforce       # Strict quality enforcement with zero tolerance

# CI/CD Integration  
npm run quality:gates:ci      # CI-optimized quality gate enforcement
npm run quality:gates:report  # Generate comprehensive quality report
npm run quality:gates:dashboard # Interactive quality dashboard
```

### Monitoring Systems

#### Test Flakiness Detection
- **Threshold**: <5% flaky test rate maintained
- **Detection**: Automated identification of unstable tests
- **Quarantine**: Automatic isolation of problematic tests
- **Reporting**: Detailed flakiness trends and patterns

#### Coverage Tracking
- **Critical Paths**: 100% coverage for essential user flows
- **API Contracts**: Complete endpoint validation coverage
- **Performance**: Core Web Vitals and performance metrics monitoring
- **Security**: Input validation and authentication flow coverage

#### Performance Optimization
- **Execution Time**: <5 minutes target for complete test suite
- **Resource Usage**: Memory and CPU optimization monitoring
- **Parallel Execution**: Optimal test distribution and batching
- **CI Performance**: Build time reduction and resource efficiency

#### Incident Correlation
- **Failure Analysis**: 80% reduction in debugging time through intelligent correlation
- **Root Cause Detection**: Automated identification of failure patterns
- **Historical Trends**: Performance regression detection and alerting
- **Predictive Analysis**: Early warning system for potential issues

### Report Generation

Quality gate reports are automatically generated in `.tmp/quality-gates/` directory:

- **quality-report.json**: Comprehensive metrics and analysis
- **flaky-tests.json**: Test stability tracking and trends
- **coverage-analysis.json**: Detailed coverage breakdown
- **performance-metrics.json**: Execution time and resource usage
- **incident-correlation.json**: Failure pattern analysis

### Integration

The quality gates system integrates seamlessly with:
- **GitHub Actions**: Automatic PR quality validation
- **Local Development**: Pre-commit quality checks
- **CI/CD Pipeline**: Deployment quality assurance
- **Monitoring Dashboard**: Real-time quality metrics visualization

See [Quality Gates Documentation](docs/quality-gates/README.md) for detailed configuration and usage.

## Database Management

### Development Database

```bash
# Migrations
npm run migrate:up           # Run pending migrations
npm run migrate:status       # Check migration status
npm run migrate:verify       # Verify integrity

# Database access
npm run db:shell            # SQLite shell
npm run health:database     # Health check
```

### E2E Test Database

For comprehensive end-to-end testing, separate database commands are available:

```bash
# E2E Database Setup
npm run db:e2e:setup        # Create tables and insert test data
npm run db:e2e:validate     # Validate existing database schema
npm run db:e2e:clean        # Remove test data only
npm run db:e2e:reset        # Full reset - drop and recreate everything

# E2E Database Migration Management  
npm run migrate:e2e:up      # Run E2E database migrations
npm run migrate:e2e:status  # Check E2E migration status
npm run migrate:e2e:validate # Validate E2E schema integrity
npm run migrate:e2e:reset   # Reset E2E migrations completely

# E2E Database Health Monitoring
curl -f http://localhost:3000/api/health/e2e-database | jq '.'
```

**Safety Features:**
- All E2E database operations require `E2E_TEST_MODE=true` or `ENVIRONMENT=e2e-test`
- Database URLs are validated to contain "test" or "staging" keywords
- Automatic test data cleanup prevents contamination
- Separate migration tracking for E2E vs development environments

## 📱 Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome)

### Mobile Navigation Features

- **Slide-in menu**: Right-side navigation panel with backdrop blur
- **Touch optimization**: 44px minimum touch targets for accessibility
- **Gesture support**: Tap outside or ESC key to close menu
- **Smooth animations**: Hardware-accelerated transitions (0.3s ease-out)
- **Body scroll lock**: Prevents background scrolling when menu is open
- **Responsive breakpoint**: Activates at 768px and below

### Floating Cart System

- **Intelligent visibility**: Appears on all pages except 404 and index redirect
- **Purchase pages**: Always visible on tickets and donations pages
- **Content pages**: Visible only when cart contains items (about, artists, schedule, gallery)
- **Persistent state**: Cart contents maintained across page navigation
- **Touch-optimized**: Mobile-friendly design with smooth animations
- **Quick checkout**: Direct access to ticket purchasing flow

## 📚 Documentation

### API Documentation
- [Main API Documentation](/docs/api/API_DOCUMENTATION.md) - Gallery, performance, and core APIs
- [Registration API](/docs/api/REGISTRATION_API.md) - Ticket registration system endpoints
- [Async Initialization Guide](/docs/ASYNC_INITIALIZATION_GUIDE.md) - Database service patterns
- [Testing Strategy](/docs/testing/TESTING_STRATEGY.md) - Streamlined testing approach

### CI/CD Documentation
- [CI/CD Overview](docs/ci-cd/README.md) - Complete CI/CD pipeline documentation
- [GitHub Actions Setup](docs/ci-cd/README.md#github-actions-setup) - Workflow configuration and secrets
- [Performance Optimization](docs/ci-cd/README.md#performance-optimization) - CI performance tuning
- [Quality Gates](docs/ci-cd/README.md#quality-gates) - Automated quality assurance

### Testing Documentation
- [E2E Test Flows](/tests/e2e/flows/README.md) - Phase 2 gallery and admin panel test flows
- [Advanced E2E Testing](/tests/e2e/advanced/README.md) - Phase 4 network, security, accessibility testing
- [Performance Testing Guide](/tests/e2e/helpers/performance-gallery.js) - Gallery performance utilities
- [Admin Authentication Testing](/tests/e2e/helpers/admin-auth.js) - Security and authentication helpers
- [Security Testing](/tests/e2e/helpers/security-testing.js) - OWASP Top 10 vulnerability testing
- [Accessibility Testing](/tests/e2e/helpers/accessibility-utilities.js) - WCAG 2.1 compliance utilities

### Setup Documentation
- [Installation Guide](INSTALLATION.md) - Complete setup instructions
- [Security Policy](SECURITY.md) - Security practices and vulnerability reporting
- [Changelog](CHANGELOG.md) - Version history and release notes

### Key Features Documentation
- **Registration System**: JWT-based ticket registration with 72-hour window
- **Email Integration**: Brevo/SendinBlue for transactional emails
- **Payment Processing**: Stripe Checkout with webhook handling
- **Wallet Passes**: Apple Wallet and Google Wallet integration
- **Gallery System**: Google Drive integration with AVIF/WebP optimization
- **E2E Testing**: Comprehensive browser automation with performance validation
- **Admin Panel**: Complete administration dashboard with security features

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets

- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners.