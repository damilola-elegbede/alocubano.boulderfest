# Mobile Navigation Specification

## Overview

The mobile navigation system for A Lo Cubano Boulder Fest uses a slide-in panel approach with a hamburger menu toggle. This specification documents the implementation patterns, class naming conventions, and interaction behaviors.

## Architecture

### HTML Structure
```html
<nav class="main-nav">
  <button class="menu-toggle" aria-label="Toggle menu">
    <span></span>
  </button>
  <ul class="nav-list">
    <li><a href="/home" class="nav-link" data-text="Home">Home</a></li>
    <li><a href="/about" class="nav-link" data-text="About">About</a></li>
    <li><a href="/artists" class="nav-link" data-text="Artists">Artists</a></li>
    <li><a href="/schedule" class="nav-link" data-text="Schedule">Schedule</a></li>
    <li><a href="/gallery" class="nav-link" data-text="Gallery">Gallery</a></li>
    <li><a href="/tickets" class="nav-link" data-text="Tickets">Tickets</a></li>
  </ul>
  <!-- Overlay element for full-screen coverage -->
  <div class="mobile-menu-overlay"></div>
</nav>
```

### CSS Implementation

#### Mobile-Only Display Logic
```css
@media (max-width: 768px) {
  /* Show hamburger button on mobile */
  .menu-toggle {
    display: block;
    background: none;
    border: none;
    cursor: pointer;
    width: 30px;
    height: 30px;
    position: relative;
  }

  /* Hide navigation list by default on mobile */
  .nav-list {
    display: none;
  }

  /* Full-screen overlay to block interaction outside menu */
  .mobile-menu-overlay {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9998;
  }
  
  .mobile-menu-overlay.is-open {
    display: block;
  }

  /* Show as slide-in panel when opened */
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
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    padding: var(--space-4xl) var(--space-xl) var(--space-xl);
    z-index: 9999;
    animation: slideInFromRight 0.3s ease-out;
  }
}
```

#### Animation Keyframes
```css
@keyframes slideInFromRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

#### Hamburger Animation
```css
.menu-toggle span {
  display: block;
  width: 100%;
  height: 2px;
  background: var(--color-black);
  transition: all 0.3s ease;
  position: relative;
}

.menu-toggle span::before,
.menu-toggle span::after {
  content: '';
  position: absolute;
  width: 100%;
  height: 2px;
  background: var(--color-black);
  transition: all 0.3s ease;
}

.menu-toggle span::before {
  top: -8px;
}

.menu-toggle span::after {
  bottom: -8px;
}

/* Active state - hamburger to X */
.menu-toggle.is-active span {
  background: transparent;
}

.menu-toggle.is-active span::before {
  transform: rotate(45deg);
  top: 0;
}

.menu-toggle.is-active span::after {
  transform: rotate(-45deg);
  bottom: 0;
}
```

## JavaScript Implementation

### Class Structure
```javascript
class Navigation {
  constructor() {
    this.mobileMenuOpen = false;
    this.init();
  }

  init() {
    this.setupEventListeners();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    const navList = document.querySelector('.nav-list');
    const menuToggle = document.querySelector('.menu-toggle');
    const overlay = document.querySelector('.mobile-menu-overlay');

    if (this.mobileMenuOpen) {
      // CRITICAL: Use 'is-open' class to match CSS selector
      navList?.classList.add('is-open');
      menuToggle?.classList.add('is-active');
      overlay?.classList.add('is-open');
      document.body.style.overflow = 'hidden'; // Prevent background scroll
      
      // Enable focus trap for accessibility
      this.enableFocusTrap();
    } else {
      navList?.classList.remove('is-open');
      menuToggle?.classList.remove('is-active');
      overlay?.classList.remove('is-open');
      document.body.style.overflow = ''; // Restore scroll
      
      // Disable focus trap
      this.disableFocusTrap();
    }
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
    const navList = document.querySelector('.nav-list');
    const menuToggle = document.querySelector('.menu-toggle');
    const overlay = document.querySelector('.mobile-menu-overlay');

    navList?.classList.remove('is-open');
    menuToggle?.classList.remove('is-active');
    overlay?.classList.remove('is-open');
    document.body.style.overflow = '';
    
    // Restore focus and disable focus trap
    this.disableFocusTrap();
  }

  // Focus management methods for accessibility
  getFocusableElements(container) {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');
    
    return container.querySelectorAll(focusableSelectors);
  }

  enableFocusTrap() {
    const navList = document.querySelector('.nav-list');
    if (!navList) return;

    const focusableElements = this.getFocusableElements(navList);
    if (focusableElements.length === 0) return;

    // Store the previously focused element to restore later
    this.previouslyFocusedElement = document.activeElement;

    this.firstFocusableElement = focusableElements[0];
    this.lastFocusableElement = focusableElements[focusableElements.length - 1];

    // Focus the first element when menu opens
    this.firstFocusableElement.focus();
  }

  disableFocusTrap() {
    // Restore focus to the element that was focused before opening the menu
    if (this.previouslyFocusedElement) {
      this.previouslyFocusedElement.focus();
      this.previouslyFocusedElement = null;
    }
  }

  handleFocusTrap(e) {
    if (!this.mobileMenuOpen) return;

    // Handle Tab key to trap focus within menu
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        // Shift + Tab: moving backwards
        if (document.activeElement === this.firstFocusableElement) {
          e.preventDefault();
          this.lastFocusableElement.focus();
        }
      } else {
        // Tab: moving forwards
        if (document.activeElement === this.lastFocusableElement) {
          e.preventDefault();
          this.firstFocusableElement.focus();
        }
      }
    }
  }
}
```

### Event Handlers
```javascript
setupEventListeners() {
  // Mobile menu toggle
  const menuToggle = document.querySelector('.menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => this.toggleMobileMenu());
  }

  // Handle keyboard navigation and focus trap
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
    
    // Enable focus trap when menu is open
    this.handleFocusTrap(e);
  });

  // Focus trap using focusin event (backup method)
  document.addEventListener('focusin', (e) => {
    if (!this.mobileMenuOpen) return;
    
    const navList = document.querySelector('.nav-list');
    if (!navList || navList.contains(e.target)) return;
    
    // If focus moves outside the menu, redirect it back to the first focusable element
    if (this.firstFocusableElement) {
      e.preventDefault();
      this.firstFocusableElement.focus();
    }
  });

  // Close on overlay click
  const overlay = document.querySelector('.mobile-menu-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => this.closeMobileMenu());
  }

  // Close on outside click (fallback)
  document.addEventListener('click', (e) => {
    const navList = document.querySelector('.nav-list');
    const menuToggle = document.querySelector('.menu-toggle');

    if (this.mobileMenuOpen && menuToggle && !menuToggle.contains(e.target)) {
      if (navList && !navList.contains(e.target)) {
        this.closeMobileMenu();
      }
    }
  });
}
```

## Critical Implementation Notes

### Class Naming Convention

⚠️ **CRITICAL**: JavaScript class targeting must exactly match CSS selectors:

- **CSS Selector**: `.nav-list.is-open`
- **JavaScript Target**: `navList.classList.add('is-open')`

**Historical Bug**: The original implementation had a mismatch where JavaScript targeted `mobile-menu` class while CSS expected `is-open` class, causing the mobile navigation to fail completely.

### State Classes

| Class | Element | Purpose |
|-------|---------|---------|
| `is-open` | `.nav-list` | Shows/hides mobile navigation panel |
| `is-active` | `.menu-toggle` | Animates hamburger to X transformation |

### Desktop Protection

```css
@media (min-width: 769px) {
  .menu-toggle { 
    display: none !important; 
  }
  
  .nav-list { 
    display: flex !important;
    position: static !important;
    width: auto !important;
    height: auto !important;
    background: transparent !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    flex-direction: row !important;
    padding: 0 !important;
  }
}
```

## Interaction Behaviors

### Opening Menu
1. User taps hamburger button
2. JavaScript adds `is-open` class to `.nav-list`
3. JavaScript adds `is-active` class to `.menu-toggle`
4. CSS animates slide-in from right
5. Background scroll is disabled (`body { overflow: hidden }`)

### Closing Menu
Menu closes via:
- **Hamburger button tap**: Toggle state
- **Outside click**: Click anywhere outside menu or button
- **Escape key**: Keyboard accessibility
- **Navigation link click**: Automatic closure after navigation

### Animations
- **Slide-in duration**: 0.3s ease-out
- **Hamburger transformation**: 0.3s ease
- **Backdrop blur**: 20px for visual depth

## Accessibility Features

### Keyboard Support
- ✅ **Tab navigation**: All menu items accessible
- ✅ **Escape key**: Closes mobile menu
- ✅ **Enter/Space**: Activates hamburger button

### Screen Reader Support
- ✅ **ARIA label**: `aria-label="Toggle menu"` on hamburger button
- ✅ **Semantic markup**: Proper `<nav>` and `<ul>` structure
- ✅ **Focus management**: Logical tab order maintained

### Touch Accessibility
- ✅ **Touch targets**: Minimum 44px x 44px for all interactive elements
- ✅ **Touch response**: `touch-action: manipulation` for better response
- ✅ **Visual feedback**: Clear pressed states

## Testing Requirements

### Functional Testing
- [ ] Hamburger button toggles menu
- [ ] Menu slides in from right on open
- [ ] Menu slides out on close
- [ ] Outside click closes menu
- [ ] Escape key closes menu
- [ ] Background scroll disabled when menu open
- [ ] Navigation links work properly
- [ ] Hamburger animates to X and back

### Device Testing
- [ ] iOS Safari (iPhone)
- [ ] Chrome Mobile (Android)
- [ ] Various screen sizes (320px - 768px)
- [ ] Portrait and landscape orientations

### Accessibility Testing
- [ ] Keyboard-only navigation
- [ ] Screen reader compatibility
- [ ] Touch target sizes (min 44px)
- [ ] Color contrast ratios
- [ ] Focus indicators visible

## Common Issues & Troubleshooting

### Menu Not Opening
**Symptom**: Hamburger button click has no effect
**Cause**: Class mismatch between JavaScript and CSS
**Solution**: Ensure JavaScript uses `is-open` class, not `mobile-menu`

```javascript
// ❌ Wrong - will not work
navList.classList.add('mobile-menu');

// ✅ Correct - matches CSS selector
navList.classList.add('is-open');
```

### Menu Not Sliding
**Symptom**: Menu appears instantly without animation
**Cause**: Missing CSS animation or transition properties
**Solution**: Verify `@keyframes slideInFromRight` and animation properties

### Background Still Scrollable
**Symptom**: Page scrolls behind open menu
**Cause**: Missing body overflow control
**Solution**: Ensure `document.body.style.overflow = 'hidden'` on menu open

## Performance Considerations

### Optimizations
- **Hardware acceleration**: `transform` properties trigger GPU acceleration
- **Backdrop filter**: Creates depth without additional DOM elements
- **Event delegation**: Minimal event listeners for better performance
- **CSS containment**: `contain: layout style paint` for menu panel

### Mobile-Specific
- **Reduced animations**: Complex animations disabled on mobile
- **Touch optimization**: `touch-action: manipulation` prevents delays
- **Viewport meta**: Proper viewport configuration prevents zoom issues

---

**Last Updated**: July 2025
**Status**: Active Implementation
**Maintainer**: Development Team