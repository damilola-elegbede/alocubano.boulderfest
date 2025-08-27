# E2E Test Flows - Phase 2 Gallery and Admin Panel Testing

This directory contains comprehensive end-to-end test flows for the A Lo Cubano Boulder Fest website, focusing on Phase 2 Gallery functionality and Admin Panel operations.

## 📋 Test Flow Overview

### Phase 2 Gallery Testing (`gallery-browsing.test.js`)

Comprehensive testing of the gallery system with Google Drive integration, performance optimization, and user experience validation.

#### Test Coverage Areas

**🖼️ Gallery Loading and API Integration**
- Gallery loads successfully from Google Drive API with proper error handling
- Gallery metadata and categories load correctly with filtering support
- API integration handles failures gracefully with fallback mechanisms
- Response time validation and API contract compliance

**⚡ Lazy Loading Functionality** 
- Images load lazily to prevent performance degradation with large datasets
- Lazy loading works with virtual scrolling for 1000+ images
- Progressive loading prevents browser memory issues
- Intersection Observer implementation validation

**🎨 Image Optimization and Format Selection**
- Images serve appropriate formats based on browser support (AVIF → WebP → JPEG)
- Image optimization handles different viewport sizes and device pixel ratios
- Progressive image loading with responsive srcset implementation
- Cross-browser format compatibility testing

**🚀 Virtual Scrolling Performance**
- Virtual scrolling handles 1000+ images without memory issues
- DOM node count remains manageable during extensive browsing
- Performance metrics monitoring (LCP, CLS, FID)
- Memory leak detection and garbage collection effectiveness

**🔍 Photo Metadata and Filtering**
- Photo metadata displays accurately with search and filtering
- Category filtering functionality works across different photo sets
- Search functionality works with photo titles, descriptions, and metadata
- Filter state persistence across page navigation

**📱 Responsive Image Behavior**
- Gallery adapts layout for mobile and desktop viewports
- Images maintain aspect ratio across different screen sizes
- Touch-friendly interactions on mobile devices
- Responsive breakpoint validation (320px to 1920px)

**♿ Accessibility and Performance**
- Gallery meets WCAG AA accessibility standards
- Keyboard navigation support for all gallery functions
- Screen reader compatibility with proper ARIA labels
- Core Web Vitals compliance (LCP <2.5s, CLS <0.1, FID <100ms)

### Phase 2 Admin Panel Testing (`admin-dashboard.test.js`)

Complete testing suite for admin authentication, dashboard operations, and security features.

#### Authentication and Security Testing

**🔐 Admin Authentication**
- Admin login with valid credentials succeeds with proper redirection
- Invalid credentials fail with appropriate error messages and rate limiting
- JWT token generation and validation with proper expiration handling
- Session management with secure cookie handling and CSRF protection

**🛡️ Security Features**
- Rate limiting protection against brute force attacks (5 attempts → lockout)
- Session security validation (expiration, token invalidation, concurrent sessions)
- Multi-factor authentication flow testing (if enabled)
- XSS prevention in error messages and user input fields

**📊 Dashboard Data and Operations**
- Dashboard data retrieval displays accurate statistics and recent activities
- Ticket validation and QR code scanning functionality
- Registration management with search, filter, and bulk operations
- Real-time data updates and synchronization

#### Admin Operations Testing

**🎫 Ticket Management**
- QR code validation with support for valid, expired, and invalid tickets
- Bulk operations: check-in, email notifications, status updates
- Ticket search and filtering by type, status, date, and attendee information
- Export functionality for registration data and reports

**📈 Analytics and Reporting**
- Dashboard statistics accuracy (total tickets, revenue, check-in rates)
- Ticket breakdown charts and geographic distribution data
- Date range filtering for reports and analytics
- Performance metrics and trend analysis

**⚙️ System Configuration**
- Admin configuration changes for event settings and ticket policies
- Security settings management (session timeout, login attempts)
- Configuration validation and error handling
- Settings persistence and rollback capabilities

**📋 Audit and Compliance**
- Comprehensive audit logging of all admin actions
- Audit log search, filtering, and export functionality
- Real-time audit entry creation and display
- Data integrity verification and compliance reporting

#### Bulk Operations Testing

**📦 Large-Scale Operations**
- Bulk ticket selection and deselection (50+ tickets)
- Batch check-in processing with error handling
- Bulk email notifications with delivery tracking
- Mass status updates with validation and confirmation

**🔧 Performance and Scalability**
- UI responsiveness during bulk operations
- Memory usage monitoring during large dataset processing
- Database performance validation for bulk queries
- Error recovery and partial operation handling

## 🚀 Usage Examples

### Running Individual Test Flows

```bash
# Run gallery browsing tests only
npx playwright test tests/e2e/flows/gallery-browsing.test.js

# Run admin dashboard tests only  
npx playwright test tests/e2e/flows/admin-dashboard.test.js

# Run with specific browser
npx playwright test tests/e2e/flows/gallery-browsing.test.js --browser=firefox

# Run with UI for debugging
npx playwright test tests/e2e/flows/admin-dashboard.test.js --ui
```

### Running Test Suites by Category

```bash
# Run all Phase 2 gallery tests
npx playwright test tests/e2e/flows/gallery-browsing.test.js --grep "Gallery"

# Run all admin authentication tests
npx playwright test tests/e2e/flows/admin-dashboard.test.js --grep "Authentication"

# Run performance-specific tests
npx playwright test --grep "Performance|performance"

# Run mobile-specific tests
npx playwright test --grep "Mobile|mobile|responsive"
```

### Development and Debugging

```bash
# Interactive test development
npm run test:e2e:ui

# Run tests with detailed logging
DEBUG=pw:browser,pw:api npx playwright test tests/e2e/flows/

# Generate test report
npx playwright test tests/e2e/flows/ --reporter=html

# Run specific test with screenshots
npx playwright test tests/e2e/flows/gallery-browsing.test.js --screenshot=on
```

## 🔧 Configuration and Setup

### Test Environment Requirements

- **Node.js**: 18.x or higher
- **Database**: E2E test database with `E2E_TEST_MODE=true`
- **Server**: Local development server running on port 3000
- **Browser**: Chrome, Firefox, Safari, or Edge

### E2E Test Database Setup

```bash
# Initialize E2E database
npm run db:e2e:setup

# Validate database schema
npm run db:e2e:validate

# Check E2E database health
curl -f http://localhost:3000/api/health/e2e-database | jq '.'
```

### Environment Variables

```bash
# Required for E2E testing
E2E_TEST_MODE=true
ENVIRONMENT=e2e-test

# Optional admin testing
TEST_ADMIN_PASSWORD=your-test-password
ADMIN_SECRET=your-admin-secret-key-32-chars-min
```

## 📊 Performance Benchmarks

### Gallery Performance Targets

- **Initial Load Time**: <2 seconds for gallery container
- **Image Load Time**: <1.5 seconds average per image
- **Cache Hit Ratio**: >80% for repeat visits
- **Memory Usage**: <150% increase during extended browsing
- **Virtual Scrolling**: 60fps during rapid scrolling

### Admin Dashboard Performance

- **Login Response**: <500ms for authentication
- **Dashboard Load**: <1 second for complete dashboard
- **Bulk Operations**: <3 seconds for 50+ ticket operations
- **Database Queries**: <100ms for admin queries
- **Export Operations**: <5 seconds for CSV generation

## 🐛 Troubleshooting

### Common Issues

**Gallery Tests Failing**
```bash
# Check Google Drive API mock setup
npx playwright test tests/e2e/flows/gallery-browsing.test.js --debug

# Verify image loading performance
npm run test:e2e -- --grep "Image loading performance"
```

**Admin Authentication Issues**
```bash
# Verify admin credentials
echo $TEST_ADMIN_PASSWORD
echo $ADMIN_SECRET

# Check E2E database connectivity
npm run db:e2e:validate
```

**Performance Test Failures**
```bash
# Check browser memory limits
npx playwright test --browser=chromium --args="--memory-pressure-off"

# Monitor resource usage
htop # or Activity Monitor on macOS
```

### Test Data Cleanup

```bash
# Clean test data after failed runs
npm run db:e2e:clean

# Full E2E environment reset
npm run db:e2e:reset
```

## 📈 Test Reporting

### HTML Reports

```bash
# Generate comprehensive HTML report
npx playwright test tests/e2e/flows/ --reporter=html

# Open report in browser
npx playwright show-report
```

### Performance Reports

Gallery performance tests generate detailed metrics including:
- **Load Time Analysis**: Initial load, image loading, cache performance
- **Memory Usage Tracking**: Peak memory, memory leaks, garbage collection
- **Network Performance**: Request timing, cache hit ratios, bandwidth usage
- **Visual Metrics**: LCP, CLS, FID measurements and Core Web Vitals compliance

Admin security tests provide:
- **Authentication Metrics**: Login success rates, failed attempt handling
- **Security Validation**: Rate limiting effectiveness, session security
- **Performance Tracking**: Dashboard load times, bulk operation performance
- **Audit Trail**: Complete logging of all admin operations and security events

## 🔄 Continuous Integration

### GitHub Actions Integration

The E2E tests integrate with CI/CD pipelines:

```yaml
# Example CI workflow
- name: Run E2E Gallery Tests
  run: npm run test:e2e -- tests/e2e/flows/gallery-browsing.test.js

- name: Run E2E Admin Tests
  run: npm run test:e2e -- tests/e2e/flows/admin-dashboard.test.js

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: playwright-report
    path: playwright-report/
```

### Quality Gates

E2E tests serve as quality gates preventing deployment of:
- Performance regressions in gallery loading
- Authentication security vulnerabilities  
- Admin dashboard functionality breaks
- Mobile responsiveness issues
- Accessibility compliance violations

This comprehensive E2E test suite ensures the A Lo Cubano Boulder Fest website maintains high quality, performance, and security standards across all Phase 2 gallery and admin panel features.