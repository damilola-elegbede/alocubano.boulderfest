# A Lo Cubano Boulder Fest 2026

## 🎵 Experience Cuban Culture in the Heart of the Rockies

The official website for **A Lo Cubano Boulder Fest**, Boulder's premier Cuban salsa festival featuring world-class instructors, authentic music, and vibrant dance workshops.

## 🚀 Quick Start

### Prerequisites
1. Copy `.env.example` to `.env.local` and add your Google Drive credentials
2. Install Node.js dependencies: `npm install`

### Start the server
```bash
# Full development server with API support
npm start

# Alternative commands
npm run start-vercel-dev    # Same as npm start
./scripts/start.sh          # Legacy script wrapper
npm run serve:simple        # Simple HTTP server (no API functions)
```

Then open: **http://localhost:3000**

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
    ├── favicon-circle.svg (Circular favicon)
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
- **Tickets**: Pricing tiers and registration

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

### Requirements
- Node.js 18+ and npm
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Running Locally
1. Clone the repository
2. Navigate to project directory
3. Run `npm install` to install dependencies
4. Run `npm start` (recommended) or `./scripts/start.sh`
5. Open http://localhost:3000 in your browser

### Available Scripts
- `npm start` - Start Vercel development server with full API support (port 3000)
- `npm run start-vercel-dev` - Same as npm start
- `npm run serve:simple` - Simple HTTP server without API functions (port 8000)
- `npm test` - Run unit tests (197 tests)
- `npm run test:all` - Run all tests including link validation
- `npm run test:coverage` - Run tests with coverage report
- `npm run lint` - Run ESLint and HTMLHint
- `npm run build` - Build for production
- `npm run prebuild` - Generate cache files for gallery

## Testing

### Quick Start
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run integration tests
npm run test:integration
```

### Test Categories
- **Unit Tests**: 80%+ coverage of core functionality
- **Integration Tests**: Component interaction validation
- **Performance Tests**: Load time and memory usage validation
- **Accessibility Tests**: WCAG AA compliance validation

### Quality Gates
- **Pre-commit**: Linting + fast unit tests
- **Pre-push**: Full test suite + integration tests
- **CI/CD**: Multi-environment validation + performance benchmarks

### Documentation
- [Testing Strategy](docs/testing/TESTING_STRATEGY.md)
- [Troubleshooting Guide](docs/testing/TROUBLESHOOTING.md)

### Maintenance
```bash
# Check test health
node scripts/test-maintenance.js health

# Detect flaky tests
node scripts/test-maintenance.js flaky
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

## 🎪 About the Festival

Founded by Marcela Lay in 2023, A Lo Cubano Boulder Fest has grown from a single-day event with 500 attendees to a premier 3-day festival expecting over 5,000 participants in 2026. Nestled in the Rockies of Boulder, Colorado, the festival celebrates authentic Cuban salsa culture through workshops, social dancing, and community connection.

## License

This project is licensed under the **Apache License 2.0**. See the `LICENSE` file for details.

### Third-Party Assets
- The Instagram SVG icon is from [SVGRepo](https://www.svgrepo.com/svg/349410/instagram) and is used under the terms provided by SVGRepo. Please review their terms if you plan to redistribute or modify the icon.
- All other images and assets are property of their respective owners. 