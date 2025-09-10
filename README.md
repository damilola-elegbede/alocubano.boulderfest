# A Lo Cubano Boulder Fest 2026

## 🎵 Experience Cuban Culture in the Heart of the Rockies

The official website for **A Lo Cubano Boulder Fest**, Boulder's premier Cuban salsa festival featuring world-class instructors, authentic music, and vibrant dance workshops.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- **Vercel CLI** (for E2E testing): `npm i -g vercel`
- SQLite 3.9.0+ (for database migrations with JSON support)
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/damilola/alocubano.boulderfest.git
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
   # Development server with full API support
   npm run dev
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

```text
alocubano.boulderfest/
├── index.html (Main home page)
├── vercel.json (Deployment configuration)
├── scripts/
│   ├── start-with-ngrok.js (Development server with ngrok)
│   ├── migrate.js (Database migration system)
│   └── verify-structure.js (Project structure validation)
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
├── tests/ (Streamlined Testing)
│   ├── unit/ (Unit tests)
│   ├── integration/ (Integration tests)
│   └── e2e/ (Playwright E2E tests)
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

### Streamlined npm Scripts

The project has been optimized from 199 complex scripts to **15 essential commands**:

```bash
# Core Development
npm run dev                    # Development server with ngrok tunnel
npm run build                  # Production build
npm run preview                # Vercel preview deployment

# Testing (Streamlined)
npm test                       # Unit tests (fast execution)
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests with Vercel Preview Deployments
npm run test:watch             # Watch mode for development
npm run test:coverage          # Coverage reports

# Quality & Deployment
npm run lint                   # Code quality (ESLint + HTMLHint + Markdown)
npm run deploy                 # Production deployment
npm run health                 # Health checks

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status
npm run db:shell               # SQLite shell access

# Utilities
npm start                      # Alias for npm run dev
```

## 🧪 Testing Strategy

### Radical Simplification Achievement

We've achieved a **dramatic simplification** by eliminating complex test infrastructure:

- **Streamlined execution**: Single commands for all test types
- **Fast feedback**: Complete test suite runs quickly
- **Zero abstractions**: Every test readable by any JavaScript developer
- **Real API testing**: Direct integration with Vercel Preview Deployments

### Testing Commands

```bash
# Unit Testing
npm test                       # Run all unit tests
npm run test:watch             # Watch mode for development
npm run test:coverage          # Generate coverage reports

# Integration Testing
npm run test:integration       # Integration test suite

# E2E Testing (Vercel Preview Deployments)
npm run test:e2e               # Full E2E test suite
npm run health                 # API health verification
```

### Database Strategy

- **Unit Tests**: Use SQLite development database
- **E2E Tests**: Use Vercel Preview Deployments with production database environment

### Test Philosophy

Focus on **user-visible behavior** with **minimal complexity**:

- Test real API endpoints via Vercel Preview Deployments
- Keep each test focused and readable
- Use direct HTTP requests, not elaborate abstractions
- Clean up test data explicitly in each test
- Separate unit tests (SQLite) from E2E tests (production environment)

## 🔄 CI/CD Pipeline

### GitHub Actions Integration

Our CI/CD pipeline provides comprehensive automation with streamlined execution:

#### Workflow Features

- **Unit Testing**: Fast execution with SQLite
- **E2E Testing**: Production validation with Vercel Preview Deployments
- **Quality Gates**: Automated linting and validation
- **Multi-browser Support**: Chrome, Firefox, Safari E2E testing

#### CI/CD Commands

```bash
# Quality Assurance
npm run lint                   # Complete code quality check
npm test                       # Unit test validation
npm run test:integration       # Integration test validation
npm run test:e2e               # E2E test validation

# Deployment Pipeline
npm run build                  # Production build
npm run deploy                 # Production deployment
npm run preview                # Preview deployment
```

#### Performance Benchmarks

- **Unit Tests**: < 30 seconds for complete suite
- **Integration Tests**: < 60 seconds
- **E2E Tests**: 2-3 minutes via Vercel Preview Deployments
- **Quality Gates**: < 30 seconds for linting and validation

## Database Management

### Development Database

```bash
# Migrations
npm run migrate:up             # Run pending migrations
npm run migrate:status         # Check migration status

# Database access
npm run db:shell               # SQLite shell
npm run health                 # Health check
```

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

- [Main API Documentation](/docs/api/README.md) - Gallery, performance, and core APIs
- [Registration API](/docs/api/REGISTRATION_API.md) - Ticket registration system endpoints
- [Async Initialization Guide](/docs/ASYNC_INITIALIZATION_GUIDE.md) - Database service patterns

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
- **E2E Testing**: Comprehensive browser automation with Vercel Preview Deployments
- **Admin Panel**: Complete administration dashboard with security features

## Migration Notes

### Breaking Changes - Script Simplification

**What Changed:**

- **Reduced complexity**: From 199 scripts to 15 essential commands
- **Standardized naming**: Clear, consistent command naming conventions
- **Simplified testing**: Single commands for each test type
- **Modern E2E approach**: All E2E testing uses Vercel Preview Deployments

**Migration Required:**

1. **Update development workflows**: Use `npm run dev` for development
2. **Update testing commands**: Use `npm test` for unit tests
3. **Update E2E testing**: Use `npm run test:e2e` (Vercel Preview Deployments)
4. **Update CI/CD pipelines**: Ensure workflows use current script names

**Benefits:**

- **Simplified development**: Clear purpose for each command
- **Faster onboarding**: Predictable script names following standard conventions
- **Reduced confusion**: No duplicate commands or conflicting approaches
- **Better maintenance**: Fewer scripts to maintain and update

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets

- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners.