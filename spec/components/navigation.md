# Navigation Component Specifications

## Overview

The A Lo Cubano Boulder Fest website features a sophisticated navigation system with typography-forward design, supporting both desktop horizontal navigation and mobile hamburger menu patterns. The navigation component provides smooth page transitions, active page highlighting, and comprehensive accessibility features.

## Architecture

### Core Files
- **JavaScript**: `/js/navigation.js` - Main navigation logic and mobile menu functionality
- **CSS**: `/css/navigation.css` - Navigation styles and responsive behavior  
- **Mobile CSS**: `/css/mobile-overrides.css` - Mobile-specific navigation enhancements
- **HTML**: Implemented in all pages in `/pages/` directory

### Component Classes
- `Navigation` - Main navigation controller class
- `PageTransition` - Handles page transitions and animations

## HTML Structure

### Complete Header Pattern
```html
<header class="header" id="navigation">
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
          <span class="menu-icon">
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
        <ul class="nav-list">
          <li><a href="/home" class="nav-link is-active" data-text="Home">Home</a></li>
          <li><a href="/about" class="nav-link" data-text="About">About</a></li>
          <li><a href="/artists" class="nav-link" data-text="Artists">Artists</a></li>
          <li><a href="/schedule" class="nav-link" data-text="Schedule">Schedule</a></li>
          <li><a href="/gallery" class="nav-link" data-text="Gallery">Gallery</a></li>
          <li><a href="/tickets" class="nav-link" data-text="Tickets">Tickets</a></li>
          <li><a href="/donations" class="nav-link" data-text="Support">Support</a></li>
        </ul>
      </nav>
    </div>
  </div>
</header>
```

### Skip Links for Accessibility
```html
<!-- Skip Links for Accessibility -->
<a href="#main-content" class="skip-link">Skip to main content</a>
<a href="#navigation" class="skip-link">Skip to navigation</a>
```

## Desktop Navigation Styles

### Fixed Header with Backdrop Blur
```css
.typographic .header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: var(--space-lg) 0;
  background: linear-gradient(to bottom, 
    var(--color-white) 0%, 
    var(--color-white) 90%, 
    transparent 100%);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-gray-200);
}
```

### Grid Layout System
```css
.typographic .grid {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-lg);
}
```

### Logo Components with Hover Effects
```css
.typographic .logo-link {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  text-decoration: none;
  color: inherit;
  transition: transform 0.2s ease-in-out;
}

.typographic .logo-link:hover {
  transform: translateY(-1px);
}

.typographic .logo-text {
  font-family: var(--font-display);
  font-size: var(--font-size-3xl);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.typographic .logo-main {
  font-weight: 700;
  color: var(--color-black);
  transition: all var(--transition-base);
}

.typographic .logo-separator {
  color: var(--color-red);
  font-weight: 400;
  margin: 0 var(--space-xs);
  transition: all var(--transition-base);
}

.typographic .logo-sub {
  font-weight: 400;
  color: var(--color-black);
  transition: all var(--transition-base);
}

/* Interactive Logo Hover States */
.typographic .logo-link:hover .logo-main {
  color: var(--color-blue);
}

.typographic .logo-link:hover .logo-separator {
  color: var(--color-blue);
  transform: scale(1.1);
}

.typographic .logo-link:hover .logo-sub {
  color: var(--color-red);
}
```

### Navigation Links with Typography Effects
```css
.typographic .nav-list {
  display: flex;
  gap: var(--space-2xl);
  align-items: baseline;
  list-style: none;
  margin: 0;
  padding: 0;
}

.typographic .nav-link {
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wider);
  text-transform: uppercase;
  color: var(--color-gray-700);
  text-decoration: none;
  position: relative;
  transition: all var(--transition-base);
  padding: var(--space-xs) 0;
}

/* Slide-down Hover Effect */
.typographic .nav-link::before {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  color: var(--color-black);
  font-weight: 700;
  transform: translateY(-100%);
  opacity: 0;
  transition: all var(--transition-base);
}

.typographic .nav-link:hover {
  color: transparent;
}

.typographic .nav-link:hover::before {
  transform: translateY(0);
  opacity: 1;
}
```

### Active State Styling
```css
.typographic .nav-link.is-active {
  color: var(--color-red);
  font-weight: 700;
}

.typographic .nav-link.is-active::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--color-red);
}
```

## Mobile Navigation System

### Mobile Menu Toggle Button

#### Typographic Style (Text-based)
```css
.typographic .menu-toggle {
  display: none;
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  color: var(--color-black);
  position: relative;
  transition: all var(--transition-base);
  z-index: var(--z-sticky);
}

.typographic .menu-toggle::before {
  content: 'MENU';
  transition: all var(--transition-base);
}

.typographic .menu-toggle.is-active::before {
  content: 'CLOSE';
  color: var(--color-red);
}
```

#### Component Style (Hamburger Icon)
```css
.menu-toggle {
  display: none;
  width: 40px;
  height: 40px;
  position: relative;
  z-index: var(--z-sticky);
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 0;
}

.menu-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 4px;
}

.menu-icon span {
  display: block;
  width: 24px;
  height: 2px;
  background-color: var(--color-black);
  transition: all var(--transition-base);
}

/* Hamburger to X Animation */
.menu-toggle.is-active .menu-icon span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}

.menu-toggle.is-active .menu-icon span:nth-child(2) {
  opacity: 0;
}

.menu-toggle.is-active .menu-icon span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}
```

### Mobile Menu Panel
```css
@media (max-width: 768px) {
  .nav-list {
    display: none; /* Hidden by default */
  }

  .nav-list.is-open {
    display: flex;
    position: fixed;
    top: 0;
    right: 0;
    width: 100%;
    max-width: 300px;
    height: 100vh;
    background: var(--color-white);
    box-shadow: -2px 0 20px rgba(0, 0, 0, 0.1);
    backdrop-filter: blur(20px);
    padding: var(--space-4xl) var(--space-xl) var(--space-xl);
    flex-direction: column;
    gap: var(--space-lg);
    z-index: 1000;
    transform: translateX(0);
    transition: transform 0.3s ease;
  }

  .nav-list.is-open .nav-link {
    font-size: var(--font-size-lg);
    font-weight: 500;
    padding: var(--space-md) 0;
    touch-action: manipulation;
    min-height: 44px;
    display: flex;
    align-items: center;
  }
}
```

### Mobile Responsive Breakpoints
```css
/* Mobile Enhancement Overrides */
@media (max-width: 768px) {
  .header {
    padding: var(--space-md) 0;
    background: rgba(255, 255, 255, 0.98);
    backdrop-filter: blur(20px);
  }

  .header-left img {
    height: 60px !important; /* Smaller logo for mobile */
  }

  .logo-text {
    font-size: var(--font-size-xl) !important;
    gap: var(--space-xs) !important;
  }

  .menu-toggle {
    width: 44px;
    height: 44px;
    touch-action: manipulation;
  }
}

/* Extra Small Screens */
@media (max-width: 480px) {
  .container {
    padding: 0 var(--space-md);
  }
}
```

## JavaScript Implementation

### Navigation Class Structure
```javascript
class Navigation {
    constructor() {
        this.currentDesign = localStorage.getItem('selectedDesign') || 'design1';
        this.mobileMenuOpen = false;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.createMobileMenu();
        this.highlightCurrentPage();
    }
}
```

### Event Handling System
```javascript
setupEventListeners() {
    // Mobile menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', () => this.toggleMobileMenu());
    }

    // Close mobile menu on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.mobileMenuOpen) {
            this.closeMobileMenu();
        }
    });

    // Close mobile menu on click outside
    document.addEventListener('click', (e) => {
        const navList = document.querySelector('.nav-list');
        const menuToggle = document.querySelector('.menu-toggle');
        
        if (this.mobileMenuOpen && menuToggle && !menuToggle.contains(e.target)) {
            if (navList && !navList.contains(e.target)) {
                this.closeMobileMenu();
            }
        }
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}
```

### Mobile Menu State Management
```javascript
toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const mobileMenu = document.querySelector('.mobile-menu');
    const menuToggle = document.querySelector('.menu-toggle');
    const navList = document.querySelector('.nav-list');

    if (this.mobileMenuOpen) {
        if (mobileMenu) mobileMenu.classList.add('is-open');
        if (navList) navList.classList.add('is-open');
        if (menuToggle) menuToggle.classList.add('is-active');
        document.body.style.overflow = 'hidden'; // Prevent body scroll
    } else {
        if (mobileMenu) mobileMenu.classList.remove('is-open');
        if (navList) navList.classList.remove('is-open');
        if (menuToggle) menuToggle.classList.remove('is-active');
        document.body.style.overflow = '';
    }
}
```

### Active Page Highlighting
```javascript
highlightCurrentPage() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname;
        if (currentPath === linkPath || 
           (currentPath === '/' && linkPath === '/home') || 
           (currentPath === '/home' && linkPath === '/home')) {
            link.classList.add('is-active');
        }
    });
}
```

## Page Transition System

### PageTransition Class
```javascript
class PageTransition {
    constructor() {
        this.init();
    }

    init() {
        document.body.classList.add('page-transition');
        
        // Handle link clicks
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.href && !link.href.startsWith('#') && 
                link.href.includes(window.location.host)) {
                e.preventDefault();
                this.navigateWithTransition(link.href);
            }
        });

        // Handle browser back/forward
        window.addEventListener('popstate', () => {
            this.loadPage(window.location.href, false);
        });
    }
}
```

### Transition Animation
```javascript
navigateWithTransition(url) {
    document.body.classList.add('page-exiting');
    
    setTimeout(() => {
        this.loadPage(url, true);
    }, 300);
}
```

## Accessibility Features

### Keyboard Navigation
- **Tab navigation**: All interactive elements are keyboard accessible
- **Escape key**: Closes mobile menu when open
- **Enter/Space**: Activates buttons and links
- **Arrow keys**: Navigation within dropdown menus (if implemented)

### Screen Reader Support
```html
<!-- ARIA Labels -->
<button class="menu-toggle" aria-label="Toggle menu">
<nav class="main-nav" role="navigation">
<a href="/home" class="nav-link is-active" aria-current="page">

<!-- Skip Links -->
<a href="#main-content" class="skip-link">Skip to main content</a>
<a href="#navigation" class="skip-link">Skip to navigation</a>
```

### Focus Management
```css
/* Focus indicators for accessibility */
.nav-link:focus,
.menu-toggle:focus,
.logo-link:focus {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}

/* Skip links styling */
.skip-link {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--color-black);
  color: var(--color-white);
  padding: 8px;
  text-decoration: none;
  z-index: 1000;
  transition: top 0.3s;
}

.skip-link:focus {
  top: 0;
}
```

### Touch Target Optimization
```css
@media (max-width: 768px) {
  .nav-link,
  .menu-toggle,
  .logo-link {
    min-height: 44px;
    min-width: 44px;
    touch-action: manipulation;
  }
}
```

## State Management

### Local Storage Integration
- **Design persistence**: Stores selected design theme in `localStorage`
- **Menu state**: Tracks mobile menu open/closed state
- **Navigation history**: Maintains navigation state across page loads

### Navigation States
1. **Default**: Standard navigation display
2. **Active**: Current page highlighted with `.is-active` class
3. **Mobile Open**: Mobile menu expanded with `.is-open` class
4. **Transitioning**: Page transition in progress with `.page-transition` class

## Performance Optimizations

### CSS Optimizations
- **Backdrop filter**: Uses `backdrop-filter: blur()` for modern glass effect
- **Hardware acceleration**: Transforms use `translateY()` for GPU acceleration
- **Transition timing**: Optimized transition durations (0.3s base, 0.1s touch feedback)

### JavaScript Optimizations
- **Event delegation**: Efficient event handling for multiple navigation items
- **Debounced interactions**: Prevents rapid-fire mobile menu toggles
- **Conditional loading**: Only initializes classes when needed

### Mobile Performance
```css
@media (max-width: 768px) {
  /* Reduce animations for performance */
  .text-glitch,
  .typewriter,
  .letter-dance {
    animation: none !important;
  }
  
  /* Simplified hover states for touch */
  .nav-link:hover::after {
    animation: none !important;
  }
}
```

## Touch Interactions

### Mobile Touch Feedback
```css
@media (max-width: 768px) {
  .menu-toggle:active,
  .nav-link:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
  }
}
```

### Gesture Support
- **Swipe gestures**: Mobile menu can be closed by swiping left (future enhancement)
- **Touch targets**: All interactive elements meet 44px minimum touch target size
- **Prevent zoom**: Input fields use 16px font size to prevent mobile zoom

## Browser Support

### Modern Features
- **CSS Grid**: Used for header layout
- **Backdrop Filter**: Glass effect on header
- **CSS Custom Properties**: Design token system
- **ES6 Classes**: JavaScript implementation

### Fallbacks
- **Grid fallback**: Flexbox backup for older browsers
- **Backdrop filter fallback**: Solid background for unsupported browsers
- **JavaScript fallback**: Graceful degradation if JavaScript disabled

## Testing Considerations

### Unit Tests
- Mobile menu toggle functionality
- Active page highlighting logic
- Event listener attachment/removal
- Page transition system

### Integration Tests
- Cross-page navigation flow
- Mobile menu interaction flow
- Keyboard navigation paths
- Screen reader compatibility

### Manual Testing
- Touch device testing on iOS/Android
- Keyboard-only navigation testing
- Screen reader testing with NVDA/JAWS/VoiceOver
- Cross-browser compatibility testing

## File References

### Core Implementation Files
- **`/js/navigation.js`** - Main navigation logic (285 lines)
- **`/css/navigation.css`** - Navigation styles (384 lines)
- **`/css/mobile-overrides.css`** - Mobile enhancements (369 lines)

### HTML Templates
- Navigation structure implemented in all `/pages/*.html` files
- Consistent header pattern across all pages
- Skip links and accessibility features in every page

### Configuration
- Design tokens defined in `/css/base.css`
- Responsive breakpoints: 768px (mobile), 480px (small mobile)
- Z-index layers: 1000 (header), 999 (mobile menu), var(--z-sticky) (toggle)