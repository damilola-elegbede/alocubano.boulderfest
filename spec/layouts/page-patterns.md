# Page Patterns Specification

## Overview
This document defines all page patterns implemented across the A Lo Cubano Boulder Fest website. Each page follows a typography-forward design philosophy while serving specific functional purposes. The patterns maintain consistency in structure while allowing for unique content organization based on page requirements.

## Common Structural Elements

### Universal Page Structure
All pages share these foundational elements:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <!-- Standard meta tags, favicons, and stylesheets -->
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Page Title] - A Lo Cubano Boulder Fest</title>
    <meta name="description" content="[Page specific description]">
    
    <!-- Favicon set -->
    <link rel="icon" type="image/svg+xml" href="/images/favicon-circle.svg">
    <link rel="icon" type="image/x-icon" href="/images/favicon.ico">
    <!-- Additional favicon sizes -->
    
    <!-- Core stylesheets -->
    <link rel="stylesheet" href="/css/base.css">
    <link rel="stylesheet" href="/css/components.css">
    <link rel="stylesheet" href="/css/typography.css">
    <link rel="stylesheet" href="/css/mobile-overrides.css">
</head>
<body class="typographic">
    <header class="header">
        <!-- Navigation structure -->
    </header>
    
    <main>
        <!-- Page-specific content -->
    </main>
    
    <footer class="footer-typographic">
        <!-- Footer content -->
    </footer>
    
    <!-- Standard JavaScript includes -->
</body>
</html>
```

### Header Pattern
Consistent across all pages:

```html
<header class="header">
    <div class="container">
        <div class="grid">
            <div class="header-left">
                <a href="/home" class="logo-link" aria-label="Go to home page">
                    <img src="/images/logo.png" alt="A Lo Cubano Boulder Fest Logo" style="height: 78px;">
                    <div class="logo-text">
                        <span class="logo-main">A LO CUBANO</span>
                        <span class="logo-separator">|</span>
                        <span class="logo-sub">Boulder Fest</span>
                    </div>
                </a>
            </div>
            <nav class="main-nav">
                <button class="menu-toggle" aria-label="Toggle menu">
                    <span></span>
                </button>
                <ul class="nav-list">
                    <li><a href="/home" class="nav-link [is-active]" data-text="Home">Home</a></li>
                    <li><a href="/about" class="nav-link [is-active]" data-text="About">About</a></li>
                    <li><a href="/artists" class="nav-link [is-active]" data-text="Artists">Artists</a></li>
                    <li><a href="/schedule" class="nav-link [is-active]" data-text="Schedule">Schedule</a></li>
                    <li><a href="/gallery" class="nav-link [is-active]" data-text="Gallery">Gallery</a></li>
                    <li><a href="/tickets" class="nav-link [is-active]" data-text="Tickets">Tickets</a></li>
                    <li><a href="/donations" class="nav-link [is-active]" data-text="Donate">Donate</a></li>
                </ul>
            </nav>
        </div>
    </div>
</header>
```

### Footer Pattern
Consistent across all pages:

```html
<footer class="footer-typographic">
    <div class="container">
        <p class="footer-credits">MAY 15-17, 2026 • BOULDER, COLORADO • <a href="mailto:alocubanoboulderfest@gmail.com?subject=A Lo Cubano Boulder Fest Inquiry" style="color: inherit; text-decoration: underline;">alocubanoboulderfest@gmail.com</a></p>
        <div class="footer-social">
            <a href="https://instagram.com/alocubanoboulder" target="_blank" rel="noopener noreferrer" class="social-link-type" aria-label="Follow us on Instagram">
                <!-- Instagram SVG -->
            </a>
            <a href="https://chat.whatsapp.com/KadIVdb24RWKdIKGtipnLH" target="_blank" rel="noopener noreferrer" class="social-link-type" aria-label="Join us on WhatsApp">
                <!-- WhatsApp SVG -->
            </a>
        </div>
    </div>
</footer>
```

### Standard JavaScript Includes
All pages include these scripts:

```html
<script src="/js/navigation.js"></script>
<script src="/js/components/lightbox.js"></script>
<script src="/js/components/lazy-loading.js"></script>
<script src="/js/main.js"></script>
<script src="/js/typography.js"></script>
<script src="/js/image-cache-manager.js?v=2025-07-20-DEBUG-TIMING"></script>
<script src="/js/gallery-hero.js"></script>
```

## Individual Page Patterns

### 1. Home Page Pattern (/pages/home.html)

**Purpose**: Landing page showcasing festival overview with dynamic hero image
**File**: `/pages/home.html`

#### Unique Features:
- Skip links for accessibility
- Dynamic hero splash image
- Typography-driven content sections
- Genre showcase with numbered items
- Call-to-action sections

#### Structure:
```html
<main id="main-content">
    <!-- Skip Links for Accessibility -->
    <a href="#main-content" class="skip-link">Skip to main content</a>
    <a href="#navigation" class="skip-link">Skip to navigation</a>
    
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <div class="hero-image-container">
            <img id="hero-splash-image" src="" alt="[Dynamic alt text]" class="hero-splash-img" style="object-position: top center !important;">
        </div>
    </section>

    <!-- Typographic Festival Info -->
    <section class="section-typographic">
        <div class="container">
            <div class="text-composition">
                <div class="text-block-large">Experience <span>3 Days</span> of pure Cuban rhythm</div>
                <div class="text-block-mono">// MAY 15-17, 2026<br>// BOULDER, COLORADO</div>
                <div class="text-block-small"><p>Descriptive text...</p></div>
            </div>
        </div>
    </section>
    
    <!-- Genre Typography Section -->
    <section class="section-typographic">
        <div class="container">
            <h2 class="text-glitch" data-text="GENRES">GENRES</h2>
            <div class="gallery-typographic">
                <div class="gallery-item-type" data-number="01">
                    <h3 class="gallery-type-title">SALSA</h3>
                    <p class="gallery-type-meta">The heartbeat of Cuban music</p>
                    <p class="gallery-type-description">Fast rhythms • Partner dancing • Social energy</p>
                </div>
                <!-- Additional genre items -->
            </div>
        </div>
    </section>
    
    <!-- Additional sections following similar patterns -->
</main>
```

#### CSS Classes Used:
- `.gallery-hero-splash`, `.hero-image-container`, `.hero-splash-img`
- `.section-typographic`, `.text-composition`, `.text-block-large`, `.text-block-mono`, `.text-block-small`
- `.gallery-typographic`, `.gallery-item-type`, `.gallery-type-title`, `.gallery-type-meta`, `.gallery-type-description`
- `.text-glitch`, `.text-mask`

### 2. About Page Pattern (/pages/about.html)

**Purpose**: Detailed information about festival mission, team, and impact
**File**: `/pages/about.html`

#### Unique Features:
- Story-driven narrative sections
- Board of directors showcase
- Impact metrics display
- Volunteer application form
- Testimonial quotes

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Story Opening Typography -->
    <section class="section-typographic">
        <div class="container">
            <div class="text-composition">
                <div class="text-block-large">It started with a <span>SINGLE VISION</span></div>
                <div class="text-block-small font-serif">Marcela Lay, had a vision...</div>
            </div>
        </div>
    </section>
    
    <!-- Timeline Section -->
    <section class="section-typographic">
        <div class="gallery-typographic">
            <div class="gallery-item-type" data-number="2023">
                <h3 class="gallery-type-title">THE BIRTH</h3>
                <p class="gallery-type-meta">Marcela Lay launches A Lo Cubano Boulder Fest</p>
                <p class="gallery-type-description">Details...</p>
            </div>
            <!-- Additional timeline items -->
        </div>
    </section>
    
    <!-- Team Section -->
    <section class="section-typographic">
        <h2 class="text-mask">THE TEAM</h2>
        <div class="gallery-typographic">
            <div class="gallery-item-type" data-number="01">
                <h3 class="gallery-type-title font-display">MARCELA<br>LAY</h3>
                <p class="gallery-type-meta">PRESIDENT & FOUNDER</p>
                <p class="gallery-type-description">Description...</p>
            </div>
            <!-- Additional team members -->
        </div>
    </section>
    
    <!-- Volunteer Section with Form -->
    <section class="section-typographic volunteer-section">
        <div class="container">
            <form class="volunteer-form-typographic" id="volunteer-form" onsubmit="handleVolunteerForm(event)">
                <!-- Form fields -->
            </form>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.volunteer-section`, `.volunteer-form-typographic`, `.volunteer-benefits-typographic`
- `.form-group-type`, `.form-input-type`, `.form-button-type`, `.checkbox-group-type`
- `.text-block-vertical` (for vertical text display)

### 3. Artists Page Pattern (/pages/artists.html)

**Purpose**: Showcase instructors and DJs with detailed information
**File**: `/pages/artists.html`

#### Unique Features:
- Artist profile cards with metadata
- DJ section with special styling
- Statistics grid
- Typography effects on names

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Instructors Typography -->
    <section class="section-typographic">
        <div class="container">
            <h2 class="text-glitch" data-text="INSTRUCTORS">INSTRUCTORS</h2>
            <div class="text-composition">
                <div class="text-block-large font-display">WORLD-CLASS <span>&</span> LOCAL TALENT</div>
                <div class="text-block-small font-mono">BRINGING AUTHENTIC CUBAN DANCE TO BOULDER</div>
            </div>
        </div>
    </section>

    <!-- Artists Grid Typography -->
    <section class="section-typographic">
        <div class="container">
            <div class="gallery-typographic">
                <article class="gallery-item-type" data-number="01">
                    <h3 class="gallery-type-title font-display">LAROYE</h3>
                    <p class="gallery-type-meta">ORISHAS • RUMBA • LADIES STYLING</p>
                    <p class="gallery-type-description font-serif">"Master of Afro-Cuban traditions"</p>
                    <div class="text-block-mono">// Additional details</div>
                    <div>
                        <span class="text-split font-mono">CULTURAL AMBASSADOR</span><br>
                        <span class="text-split font-mono">TRADITION KEEPER</span>
                    </div>
                </article>
                <!-- Additional artist profiles -->
            </div>
        </div>
    </section>

    <!-- DJ Typography Section -->
    <section class="section-typographic">
        <div class="container">
            <h2 class="text-mask">AFTER HOURS DJS</h2>
            <div class="gallery-typographic">
                <div class="gallery-item-type" data-number="DJ">
                    <h3 class="gallery-type-title text-glitch" data-text="DJ BYRON">DJ BYRON</h3>
                    <p class="gallery-type-description">Details...</p>
                </div>
                <!-- Additional DJs -->
            </div>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `article.gallery-item-type` (semantic HTML for artist profiles)
- `.text-split` (for colored tag elements)
- `.text-glitch` applied to DJ names

### 4. Gallery Page Pattern (/pages/gallery.html)

**Purpose**: Hub page for accessing different gallery years
**File**: `/pages/gallery.html`

#### Unique Features:
- Year-based navigation cards
- Testimonials grid
- Coming soon states
- Call-to-action section

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Festival Years Navigation -->
    <section class="section-typographic festival-years-nav">
        <div class="container">
            <h2 class="text-display">EXPLORE BY YEAR</h2>
            
            <div class="festival-years-grid">
                <a href="/gallery-2025" class="festival-year-card" data-year="2025">
                    <div class="year-card-content">
                        <span class="year-number font-display">2025</span>
                        <span class="year-subtitle font-serif">Third Edition</span>
                        <span class="year-highlight font-mono">500+ Attendees</span>
                    </div>
                    <div class="year-card-hover">
                        <span class="view-gallery-text">VIEW GALLERY →</span>
                    </div>
                </a>
                
                <div class="festival-year-card coming-soon" data-year="2024">
                    <div class="year-card-content">
                        <span class="year-number font-display">2024</span>
                        <span class="year-subtitle font-serif">Second Edition</span>
                        <span class="year-highlight font-mono">Coming Soon</span>
                    </div>
                </div>
                <!-- Additional years -->
            </div>
        </div>
    </section>

    <!-- Testimonials -->
    <section class="section-typographic">
        <div class="container">
            <h2 class="text-display">WHAT PEOPLE SAY</h2>
            <div class="testimonials-grid">
                <blockquote class="testimonial-card">
                    <p class="testimonial-quote font-serif">Quote text...</p>
                    <cite class="testimonial-author font-mono">— Name, Location</cite>
                </blockquote>
                <!-- Additional testimonials -->
            </div>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.festival-years-nav`, `.festival-years-grid`, `.festival-year-card`
- `.year-card-content`, `.year-card-hover`, `.view-gallery-text`
- `.coming-soon` (state modifier)
- `.testimonials-grid`, `.testimonial-card`, `.testimonial-quote`, `.testimonial-author`

**Recommended CSS:**
```css
.testimonial-card {
  padding: var(--space-2xl);
  background: var(--color-white);
  border-left: 4px solid var(--color-secondary-600);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-base) var(--easing-ease);
}

.testimonial-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.testimonial-quote {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
  margin-bottom: var(--space-lg);
  font-style: italic;
}

.testimonial-author {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  color: var(--color-gray-600);
  font-style: normal;
}
```

### 5. Gallery Detail Page Pattern (/pages/gallery-2025.html)

**Purpose**: Detailed gallery for specific festival year
**File**: `/pages/gallery-2025.html`

#### Unique Features:
- Back navigation
- Loading states
- Dynamic content sections
- Statistics grid
- Performance optimization scripts

#### Structure:
```html
<main>
    <!-- Back Navigation -->
    <section class="gallery-back-nav">
        <div class="container">
            <a href="/gallery" class="back-link">
                <span class="back-arrow">←</span>
                <span class="back-text font-mono">BACK TO GALLERIES</span>
            </a>
        </div>
    </section>

    <!-- Gallery Grid Section -->
    <section class="section-typographic gallery-detail-section" data-gallery-year="2025">
        <div class="container">
            <div class="gallery-loading" id="gallery-detail-loading">
                <p class="font-mono">Loading festival memories...</p>
            </div>
            
            <div id="gallery-detail-content" style="display: none;">
                <div class="gallery-section" id="workshops-section">
                    <h2 class="text-display">WORKSHOPS</h2>
                    <div class="gallery-grid gallery-detail-grid" id="workshops-gallery">
                        <!-- Dynamic content -->
                    </div>
                </div>
                
                <div class="gallery-section" id="socials-section">
                    <h2 class="text-display">SOCIALS</h2>
                    <div class="gallery-grid gallery-detail-grid" id="socials-gallery">
                        <!-- Dynamic content -->
                    </div>
                </div>
            </div>
            
            <!-- Fallback static gallery -->
            <div class="gallery-grid-static" id="gallery-detail-static">
                <!-- Static content -->
            </div>
        </div>
    </section>

    <!-- Gallery Stats -->
    <section class="section-typographic gallery-stats">
        <div class="container">
            <div class="stats-grid">
                <div class="stat-item">
                    <h3 class="font-display">500+</h3>
                    <p class="font-mono">ATTENDEES</p>
                </div>
                <!-- Additional stats -->
            </div>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.gallery-back-nav`, `.back-link`, `.back-arrow`, `.back-text`
- `.gallery-detail-section`, `.gallery-loading`, `.gallery-section`
- `.gallery-detail-grid`, `.gallery-grid-static`
- `.gallery-stats`, `.stats-grid`, `.stat-item`

### 6. Tickets Page Pattern (/pages/tickets.html)

**Purpose**: Ticket purchasing with pricing tiers and interactive form
**File**: `/pages/tickets.html`

#### Unique Features:
- Interactive pricing grid
- Dynamic total calculation
- Form validation
- JavaScript form handling

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Pricing Section -->
    <section class="section-typographic">
        <div class="container">
            <!-- Full Pass Section -->
            <div class="ticket-section">
                <h2 class="text-display">FULL FESTIVAL PASS</h2>
                <div class="pricing-grid">
                    <div class="price-item">
                        <h3 class="font-display">EARLY BIRD</h3>
                        <p class="text-display">$100</p>
                        <p class="font-mono">Before April 1st</p>
                    </div>
                    <!-- Additional pricing options -->
                </div>
            </div>

            <!-- Day Passes -->
            <div class="ticket-section">
                <h2 class="text-display">DAY PASSES</h2>
                <div class="day-passes">
                    <div class="price-item">
                        <h3 class="font-mono">FRIDAY</h3>
                        <p class="text-display">$50</p>
                    </div>
                    <!-- Additional day passes -->
                </div>
            </div>

            <!-- Purchase Form -->
            <div class="purchase-section">
                <h2 class="text-display">SELECT YOUR TICKETS</h2>
                <form id="ticket-form" onsubmit="handleTicketForm(event)">
                    <div class="ticket-group">
                        <h3 class="font-mono">FULL FESTIVAL PASS</h3>
                        <label>
                            <input type="checkbox" name="full-pass" value="100" data-price="100">
                            <span>Early Bird (before April 1st) - $100</span>
                        </label>
                        <!-- Additional options -->
                    </div>
                    
                    <!-- Total calculation -->
                    <div>
                        <span class="font-display">TOTAL:</span>
                        <span class="font-display" id="total-price">$0</span>
                    </div>
                    
                    <!-- Contact info fields -->
                    <div class="ticket-group">
                        <h3 class="font-mono">YOUR INFORMATION</h3>
                        <input type="text" name="first-name" placeholder="First Name" required>
                        <!-- Additional fields -->
                    </div>
                    
                    <button type="submit" class="form-button-type">COMPLETE PURCHASE</button>
                </form>
            </div>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.ticket-section`, `.pricing-grid`, `.price-item`
- `.day-passes`, `.individual-items`
- `.purchase-section`, `.ticket-group`
- Interactive JavaScript for form handling and price calculations

### 7. Donations Page Pattern (/pages/donations.html)

**Purpose**: Donation form with impact visualization
**File**: `/pages/donations.html`

#### Unique Features:
- Amount selection grid
- Custom amount input
- Impact visualization
- Form validation

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Donation Content -->
    <section class="section-typographic">
        <div class="container">
            <!-- Mission Text -->
            <div class="mission-text-center">
                <p class="mission-statement font-serif">Mission statement...</p>
            </div>

            <!-- Donation Form -->
            <div class="donation-form-wrapper">
                <h2 id="donation-form-title" class="text-display">MAKE A DONATION</h2>
                
                <form class="donation-form" id="donation-form" onsubmit="handleDonationForm(event)">
                    <!-- Donation Amount Options -->
                    <fieldset class="form-section">
                        <legend class="form-label-type font-mono">SELECT AMOUNT</legend>
                        
                        <div class="donation-amounts">
                            <label class="donation-option">
                                <input type="radio" name="amount" value="20">
                                <span class="amount-box">
                                    <span class="text-display">$20</span>
                                </span>
                            </label>
                            <!-- Additional amount options -->
                        </div>
                        
                        <!-- Other Amount Input -->
                        <div class="other-amount other-amount--hidden">
                            <label class="form-label-type font-mono">ENTER AMOUNT</label>
                            <input type="number" name="other-amount" class="form-input-type">
                        </div>
                    </fieldset>

                    <!-- Donor Information -->
                    <fieldset class="form-section">
                        <legend class="font-mono">YOUR INFORMATION</legend>
                        <!-- Form fields -->
                    </fieldset>

                    <button type="submit" class="form-button-type">DONATE NOW</button>
                </form>
            </div>

            <!-- Impact Section -->
            <div>
                <h2 class="text-display text-mask">YOUR IMPACT</h2>
                <div class="impact-grid">
                    <div class="impact-item">
                        <p class="text-display text-gradient">$20</p>
                        <p class="font-serif">Provides workshop materials for 5 students</p>
                    </div>
                    <!-- Additional impact items -->
                </div>
            </div>
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.donation-form-wrapper`, `.donation-form`, `.donation-amounts`, `.donation-option`
- `.amount-box`, `.other-amount`, `.other-amount--hidden`
- `.form-section`, `.form-grid-type`, `.form-group-type`
- `.impact-grid`, `.impact-item`
- `.mission-text-center`, `.mission-statement`

**Recommended CSS:**
```css
.mission-text-center {
  text-align: center;
  margin-bottom: var(--space-3xl);
}

.mission-statement {
  font-family: var(--font-serif);
  font-size: var(--font-size-lg);
  line-height: var(--line-height-relaxed);
  max-width: 600px;
  margin: 0 auto;
  color: var(--color-gray-700);
}

.other-amount--hidden {
  display: none;
}

.other-amount--visible {
  display: block;
  animation: fadeIn var(--duration-base) var(--easing-ease-out);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 8. Schedule Page Pattern (/pages/schedule.html)

**Purpose**: Detailed event schedule with time-based layout
**File**: `/pages/schedule.html`

#### Unique Features:
- Time-grid layout
- Venue information
- Day-based organization
- Clean information hierarchy

#### Structure:
```html
<main>
    <!-- Hero Splash Image -->
    <section class="gallery-hero-splash">
        <!-- Dynamic hero image -->
    </section>

    <!-- Schedule Content -->
    <section class="section-typographic">
        <div class="container">
            <!-- FRIDAY -->
            <div class="schedule-day">
                <h2 class="text-display">FRIDAY, MAY 16</h2>
                <div class="venue-info">
                    <p class="font-mono">AVALON BALLROOM</p>
                    <p class="font-serif">6185 Arapahoe Rd, Boulder 80302</p>
                </div>
                
                <div class="schedule-items">
                    <div class="schedule-item">
                        <div class="schedule-item-grid">
                            <div class="schedule-time font-mono">4:00 - 5:00 PM</div>
                            <div class="schedule-details">
                                <h3 class="font-display">LAROYE ~ ORISHAS</h3>
                            </div>
                        </div>
                    </div>
                    <!-- Additional schedule items -->
                </div>
            </div>
            
            <!-- Additional days follow same pattern -->
        </div>
    </section>
</main>
```

#### CSS Classes Used:
- `.schedule-day`, `.venue-info`, `.schedule-items`, `.schedule-item`
- `.schedule-item-grid`, `.schedule-time`, `.schedule-details`
- Grid-based layout with dedicated CSS classes

**Recommended CSS:**
```css
.schedule-item-grid {
  display: grid;
  grid-template-columns: var(--schedule-time-width, 140px) 1fr;
  gap: var(--space-xl);
  align-items: start;
}

.schedule-time {
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--color-gray-600);
}

.schedule-details {
  min-width: 0; /* Prevent grid overflow */
}

/* Responsive behavior */
@media (max-width: 768px) {
  .schedule-item-grid {
    grid-template-columns: 1fr;
    gap: var(--space-sm);
  }
  
  .schedule-time {
    padding-bottom: var(--space-xs);
    border-bottom: 1px solid var(--color-gray-200);
  }
}
```

### 9. 404 Error Page Pattern (/pages/404.html)

**Purpose**: Error handling with navigation options
**File**: `/pages/404.html`

#### Unique Features:
- Custom styling (no shared header/footer)
- Debug information
- Action buttons
- API endpoint testing

#### Structure:
```html
<body>
    <div class="error-container">
        <div class="logo-container">
            <img src="/images/logo.png" alt="A Lo Cubano Boulder Fest Logo">
        </div>
        
        <div class="error-code">404</div>
        <div class="error-message">Page Not Found</div>
        <div class="error-description">The page you're looking for doesn't exist...</div>
        
        <div class="action-buttons">
            <a href="/" class="btn">Go Home</a>
            <a href="/about" class="btn-secondary">About Festival</a>
            <a href="/tickets" class="btn-secondary">Get Tickets</a>
        </div>
        
        <div class="debug-info" id="debug-info">
            <strong>Debug Information:</strong><br>
            <span id="debug-details">Loading...</span>
        </div>
    </div>

    <script>
        // Debug logging and API testing
    </script>
</body>
```

#### CSS Classes Used:
- `.error-container`, `.logo-container`, `.error-code`, `.error-message`, `.error-description`
- `.action-buttons`, `.btn`, `.btn-secondary`, `.debug-info`
- Custom styles embedded in `<style>` tag

## Typography Patterns

### Text Composition System
```html
<div class="text-composition">
    <div class="text-block-large">Main heading with <span>EMPHASIS</span></div>
    <div class="text-block-mono">// Code-style comments<br>// Multiple lines</div>
    <div class="text-block-small">
        <p>Regular paragraph content with readable text.</p>
    </div>
</div>
```

### Gallery Typography Grid
```html
<div class="gallery-typographic">
    <div class="gallery-item-type" data-number="01">
        <h3 class="gallery-type-title">ITEM TITLE</h3>
        <p class="gallery-type-meta">Metadata or subtitle</p>
        <p class="gallery-type-description">Detailed description content</p>
    </div>
    <!-- Additional items -->
</div>
```

### Typography Effects
- `.text-glitch` - Glitch effect with data-text attribute
- `.text-mask` - Text masking effect
- `.text-gradient` - Gradient text color
- `.text-display` - Display font styling
- `.text-split` - Split color treatment for tags

## Form Patterns

### Standard Form Structure
```html
<form class="[form-type]" id="[form-id]" onsubmit="handle[Type]Form(event)">
    <fieldset class="form-section">
        <legend class="form-label-type font-mono">SECTION TITLE</legend>
        
        <div class="form-grid-type">
            <div class="form-group-type">
                <label class="form-label-type font-mono">FIELD LABEL</label>
                <input type="text" class="form-input-type" required>
            </div>
        </div>
    </fieldset>
    
    <button type="submit" class="form-button-type">SUBMIT TEXT</button>
</form>
```

### Form CSS Classes:
- `.form-section`, `.form-grid-type`, `.form-group-type`
- `.form-label-type`, `.form-input-type`, `.form-textarea-type`, `.form-button-type`
- `.checkbox-group-type`, `.checkbox-type`

## Responsive Behavior

### Mobile Considerations
All pages implement:
- Mobile-first responsive design
- Touch-friendly interactive elements
- Stacked layouts on small screens
- Preserved typography hierarchy
- Hamburger menu navigation

### CSS Override Structure
```css
/* Base styles for desktop */
.element { /* desktop styles */ }

/* Mobile overrides */
@media (max-width: 768px) {
    .element { /* mobile adaptations */ }
}
```

### Key Responsive Patterns:
- Grid layouts use `repeat(auto-fit, minmax(300px, 1fr))`
- Typography scales proportionally
- Form fields stack vertically on mobile
- Navigation collapses to hamburger menu
- Image galleries adapt to single columns

## JavaScript Integration

### Page-Specific Scripts
- **Home**: Gallery hero image loading
- **About**: Volunteer form handling
- **Artists**: Typography effects
- **Gallery**: Dynamic image loading and lightbox
- **Gallery Detail**: Performance optimization modules
- **Tickets**: Price calculation and form validation
- **Donations**: Amount selection and form handling
- **Schedule**: Clean information display (minimal JS)
- **404**: Debug logging and API testing

### Common JavaScript Features:
- Navigation menu toggle
- Lazy loading for images
- Lightbox gallery functionality
- Typography animations
- Image cache management
- Performance monitoring

## CSS and Asset Integration

### Stylesheet Loading Order:
1. `/css/base.css` - Design tokens and core styles
2. `/css/components.css` - Reusable component styles
3. `/css/typography.css` - Typography-forward design styles
4. `/css/mobile-overrides.css` - Mobile responsive overrides

### Image Integration:
- Dynamic hero images via `gallery-hero.js`
- Lazy loading for performance
- Progressive enhancement
- Fallback placeholders

## Accessibility Features

### Universal Accessibility:
- Semantic HTML structure
- ARIA labels and descriptions
- Skip links (on Home page)
- Keyboard navigation support
- Screen reader compatibility
- Alt text for all images
- Form field associations

### Form Accessibility:
- Fieldset and legend elements
- Required field indicators
- Error handling and validation
- Autocomplete attributes
- Proper input types

This comprehensive specification covers all implemented page patterns across the A Lo Cubano Boulder Fest website, providing both structural consistency and unique functionality for each page type while maintaining the typography-forward design philosophy throughout the user experience.