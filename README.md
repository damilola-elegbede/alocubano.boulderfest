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
- `npm test` - Run streamlined test suite (17 tests, ~395ms)
- `npm run test:all` - Run all tests including E2E validation
- `npm run test:e2e` - Run Playwright end-to-end tests
- `npm run lint` - Run ESLint and HTMLHint
- `npm run build` - Build for production
- `npm run prebuild` - Generate cache files for gallery

## Testing

### Streamlined Test Philosophy

We've achieved a **96% complexity reduction** by eliminating complex test infrastructure in favor of radical simplicity:

- **419 total lines** vs 11,411 lines previously (96% reduction)
- **17 essential tests** covering critical API contracts
- **395ms execution time** for complete test suite
- **Zero abstractions** - every test readable by any JavaScript developer

### Quick Start

```bash
# Run all tests
npm test                    # 17 tests, ~395ms

# Development mode
npm run test:simple:watch   # Watch mode

# With coverage
npm run test:coverage       # Coverage report

# E2E testing
npm run test:e2e           # Playwright end-to-end tests
npm run test:e2e:ui        # Interactive UI mode
```

### Test Structure

- **api-contracts.test.js** (6 tests) - API contract validation
- **basic-validation.test.js** (8 tests) - Input validation and security
- **smoke-tests.test.js** (3 tests) - Basic functionality verification

### Quality Gates

- **Simple execution**: Single command `npm test` 
- **Fast feedback**: Complete suite runs in under 1 second
- **Real API testing**: Direct interaction with actual endpoints
- **No mocking complexity**: Tests use real services and databases

### Test Philosophy

Focus on **user-visible behavior** with **minimal complexity**:
- Test real API endpoints, not implementation details
- Keep each test under 20 lines
- Use direct HTTP requests, not elaborate abstractions
- Clean up test data explicitly in each test

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

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets

- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners.