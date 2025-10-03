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
   # Link to Vercel project (one-time setup)
   vercel link

   # Pull environment variables from Vercel Dashboard
   vercel env pull

   # This creates .env.local with all configured variables
   # See INSTALLATION.md for detailed setup instructions
   ```

4. **Start the development server**

   ```bash
   # Development server with full API support
   npm run vercel:dev
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
- **Donations**: Support the festival with preset/custom amounts, cart integration, and admin tracking

### Technical Features

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
- ✅ Donations system with preset/custom amounts and admin analytics
- ✅ Stripe Checkout Sessions for secure, streamlined payments (tickets + donations)
- ✅ PCI-compliant payment processing with built-in fraud protection

## 🆕 New Ticket Payment Features (2024)

### QR Code System

- ✅ **Secure QR Generation**: JWT-based QR code endpoint (`/api/qr/generate`)
- ✅ **PNG Image Format**: 300x300px optimized for email compatibility
- ✅ **Dual Cache Architecture**: 24-hour HTTP cache (server) + 7-day localStorage cache (client)
- ✅ **Progressive Loading**: Skeleton UI with retry logic and exponential backoff
- ✅ **Email Integration**: Direct QR code embedding in confirmation emails

**Note**: QR codes use dual-layer caching for optimal performance. Server-side HTTP cache (24h) is independent of client-side localStorage/Service Worker cache (7d). See [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) for details.

### Order Number System

- ✅ **Sequential Order IDs**: Format `ALO-YYYY-NNNN` for production
- ✅ **Test Order Support**: Format `TEST-YYYY-NNNN` starting at 9000
- ✅ **Thread-Safe Generation**: Database-backed atomic sequence increments
- ✅ **Year-Based Sequences**: Independent order numbering per year
- ✅ **Fallback Mechanism**: Timestamp-based IDs when database unavailable

### Mobile Wallet Integration

- ✅ **Apple Wallet Passes**: `.pkpass` files with certificate signing
- ✅ **Google Wallet Support**: Web-based pass URLs with JWT authentication
- ✅ **Dynamic Pass Generation**: Real-time ticket details in wallet passes
- ✅ **Branding Integration**: Festival colors, logos, and visual identity
- ✅ **QR Code Integration**: Seamless scanning for event entry

### Enhanced Ticket Display

- ✅ **My Ticket Page**: Comprehensive ticket viewing with QR codes
- ✅ **Wallet Download Buttons**: One-click wallet pass generation
- ✅ **Dark Mode Support**: Theme-aware ticket display
- ✅ **Print & Share Options**: Multiple ticket sharing methods
- ✅ **Lazy Loading**: Performance-optimized wallet button loading

### Email Service Updates

- ✅ **QR Code Emails**: Direct QR image embedding in transactional emails
- ✅ **Confirmation Summaries**: Enhanced email templates with order details
- ✅ **Registration Reminders**: Automated follow-up email sequences
- ✅ **Wallet Pass Links**: Direct links to add tickets to mobile wallets

### Performance Optimizations

- ✅ **Service Worker**: Background caching for offline QR code access
- ✅ **Intersection Observer**: Lazy loading for wallet components
- ✅ **Performance Dashboard**: Real-time monitoring of QR and wallet metrics
- ✅ **Cache Management**: Intelligent cache expiration and cleanup
- ✅ **Dual Cache Strategy**: Server HTTP cache (24h) + client localStorage/SW cache (7d)
- ✅ **Error Tracking**: Comprehensive error monitoring and recovery

**Cache Architecture**: The system implements two independent cache layers:

- **Server Cache**: 24-hour HTTP browser cache (controlled by API responses)
- **Client Cache**: 7-day localStorage + Service Worker cache (client-side management)

This dual approach provides optimal performance with fast server responses and extended offline capability.

### Enhanced Security

- ✅ **JWT Validation**: Enhanced ticket validation with JWT tokens
- ✅ **Wallet Authentication**: Secure pass generation with JWT signing
- ✅ **Token Expiration**: Configurable TTL for security tokens
- ✅ **Scan Prevention**: `validateOnly` flag to prevent accidental scans

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

The project uses essential commands for all development needs:

```bash
# Core Development
npm run vercel:dev             # Development server with ngrok tunnel
npm run build                  # Production build
npm run vercel:preview         # Vercel preview deployment

# Testing (Streamlined)
npm test                       # Unit tests (fast execution)
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests with Vercel Preview Deployments
npm run test:coverage          # Coverage reports

# Quality & Build Verification
npm run lint                   # Code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure       # Verify project structure (via build)

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status

# Utilities
npm start                      # Alias for npm run vercel:dev
```

## 🧪 Testing Strategy

### Streamlined Testing Achievement

We've achieved a **dramatic simplification** by focusing on essential testing:

- **Streamlined execution**: Single commands for all test types
- **Fast feedback**: Complete test suite runs quickly
- **Zero abstractions**: Every test readable by any JavaScript developer
- **Real API testing**: Direct integration with Vercel Preview Deployments

### Testing Commands

```bash
# Unit Testing
npm test                       # Run all unit tests
npm run test:coverage          # Generate coverage reports

# Integration Testing
npm run test:integration       # Integration test suite

# E2E Testing (Vercel Preview Deployments)
npm run test:e2e               # Full E2E test suite
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
npm run vercel:preview         # Preview deployment
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

- [Main API Documentation](/docs/api/README.md) - Complete API reference with new endpoints
- [QR Code Generation](/docs/api/QR_ENDPOINT.md) - QR code API specification
- [Registration API](/docs/api/REGISTRATION_API.md) - Ticket registration system endpoints

### New Features Documentation

- [Order Number System](/docs/ORDER_NUMBERS.md) - Order ID format and generation
- [Wallet Pass Setup](/docs/WALLET_SETUP.md) - Mobile wallet configuration guide
- [Performance Optimization](/docs/PERFORMANCE_OPTIMIZATION.md) - Caching and optimization features

### Setup Documentation

- [Installation Guide](INSTALLATION.md) - Complete setup instructions
- [Security Policy](SECURITY.md) - Security practices and vulnerability reporting
- [Changelog](CHANGELOG.md) - Version history and release notes

### Key Features Documentation

- **QR Code System**: JWT-based QR generation with dual cache architecture (24h HTTP + 7d client)
- **Order Number System**: Sequential order tracking with ALO-YYYY-NNNN format
- **Mobile Wallet Passes**: Apple Wallet and Google Wallet integration
- **Performance Optimization**: Advanced caching, lazy loading, and monitoring
- **Registration System**: JWT-based ticket registration with 72-hour window
- **Email Integration**: Brevo/SendinBlue for transactional emails with QR codes
- **Payment Processing**: Stripe Checkout with webhook handling and order numbers
- **Gallery System**: Google Drive integration with AVIF/WebP optimization
- **E2E Testing**: Comprehensive browser automation with Vercel Preview Deployments
- **Admin Panel**: Complete administration dashboard with donations tracking, registrations, and analytics

## Environment Variables

All environment variables are managed through the **Vercel Dashboard**. To configure:

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project
3. Navigate to **Settings → Environment Variables**
4. Add required variables (see INSTALLATION.md for complete list)
5. Pull variables locally: `vercel env pull`

### Key Required Variables

- `TURSO_DATABASE_URL` - Production database URL
- `TURSO_AUTH_TOKEN` - Database authentication
- `ADMIN_PASSWORD` - Admin panel access (bcrypt hashed)
- `ADMIN_SECRET` - Session secret (minimum 32 characters, 256-bit random recommended)
- `REGISTRATION_SECRET` - JWT signing for tickets (minimum 32 characters, 256-bit random recommended)
- `WALLET_AUTH_SECRET` - JWT signing for wallet passes (minimum 32 characters, 256-bit random recommended)

**Security Best Practices for JWT Secrets:**

Generate cryptographically secure random secrets with sufficient entropy:

```bash
# Generate 256-bit (32-byte) random secret (recommended)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or using OpenSSL
openssl rand -base64 32
```

**Minimum Requirements:**

- **Length**: At least 32 characters (256 bits recommended for production)
- **Entropy**: Use cryptographically secure random generation (not simple passwords)
- **Uniqueness**: Use different secrets for `REGISTRATION_SECRET`, `WALLET_AUTH_SECRET`, and `ADMIN_SECRET`
- **Storage**: Never commit secrets to version control; manage via Vercel Dashboard only

**Why 256-bit secrets?**

- Provides sufficient entropy to resist brute-force attacks
- Meets NIST SP 800-131A recommendations for key strength
- Compatible with HS256 JWT signing algorithm
- Industry standard for production JWT applications

### Optional Service Variables

- **Email**: `BREVO_API_KEY`, `BREVO_NEWSLETTER_LIST_ID`
- **Payments**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`
- **Gallery**: `GOOGLE_DRIVE_FOLDER_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- **Wallet Passes**: `APPLE_PASS_TYPE_ID`, `GOOGLE_WALLET_ISSUER_ID`

See [INSTALLATION.md](INSTALLATION.md) for complete environment variable documentation.

## Streamlined Development Experience

### Current Essential Scripts

The project focuses on the commands you actually need:

```bash
# Core Development
npm run vercel:dev             # Development server with ngrok tunnel
npm start                      # Alias for npm run vercel:dev
npm run build                  # Production build
npm run vercel:preview         # Vercel preview deployment

# Testing Suite
npm test                       # Unit tests (fast execution)
npm run test:integration       # Integration tests
npm run test:e2e               # E2E tests with Vercel Preview Deployments
npm run test:coverage          # Coverage reports

# Quality & Build Verification
npm run lint                   # Complete code quality (ESLint + HTMLHint + Markdown)
npm run verify-structure       # Verify project structure (via build)

# Database Management
npm run migrate:up             # Run database migrations
npm run migrate:status         # Check migration status
```

**Benefits:**

- **Clear purpose**: Each script has a single, well-defined responsibility
- **Simplified workflow**: Focus on Vercel Preview Deployments for E2E testing
- **Predictable naming**: Standard command naming conventions
- **Essential only**: Only the commands needed for development

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets

- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners.