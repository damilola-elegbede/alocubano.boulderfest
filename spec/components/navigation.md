# Navigation Component

## Header Structure

### HTML Pattern

```html
<header class="header">
  <div class="container">
    <div class="grid">
      <div class="header-left">
        <img src="logo.png" alt="Logo" style="height: 78px;" />
        <div class="logo-text">
          <span class="logo-main">A LO CUBANO</span>
          <span class="logo-separator">|</span>
          <span class="logo-sub">Boulder Fest</span>
        </div>
      </div>
      <nav class="main-nav">
        <button class="menu-toggle" aria-label="Toggle menu">
          <span></span>
        </button>
        <ul class="nav-list">
          <li><a href="#" class="nav-link" data-text="Home">Home</a></li>
          <!-- More items -->
        </ul>
      </nav>
    </div>
  </div>
</header>
```

### CSS Specifications

#### Fixed Header

```css
.header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  padding: var(--space-lg) 0;
  background: linear-gradient(
    to bottom,
    var(--color-white) 0%,
    var(--color-white) 90%,
    transparent 100%
  );
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-gray-200);
  transition: all 0.3s ease;
}
```

#### Logo Styling

```css
.logo-text {
  font-family: var(--font-display);
  font-size: var(--font-size-3xl);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.logo-main {
  font-weight: 700;
  color: var(--color-black);
}

.logo-separator {
  color: var(--color-red);
  font-weight: 400;
}

.logo-sub {
  font-weight: 400;
  color: var(--color-black);
}
```

#### Navigation Links

```css
.nav-link {
  position: relative;
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wide);
  transition: all 0.3s ease;
}

/* Hover effect with text swap */
.nav-link::after {
  content: attr(data-text);
  position: absolute;
  top: 100%;
  left: 0;
  font-weight: 700;
  color: var(--color-red);
  overflow: hidden;
  pointer-events: none;
  transition: top 0.3s ease;
}

.nav-link:hover::after {
  top: 0;
}
```

## Mobile Navigation

### Toggle Button & Mobile Menu Implementation

#### CSS Structure

```css
.menu-toggle {
  display: none;
  width: 32px;
  height: 32px;
  position: relative;
}

@media (max-width: 768px) {
  .menu-toggle {
    display: block;
  }

  /* Hide navigation list by default on mobile */
  .nav-list {
    display: none;
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
    padding: var(--space-4xl) var(--space-xl) var(--space-xl);
    z-index: 9999;
    animation: slideInFromRight 0.3s ease-out;
  }
}

@keyframes slideInFromRight {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}
```

#### JavaScript Integration

```javascript
// Class targeting must match CSS selectors
toggleMobileMenu() {
  this.mobileMenuOpen = !this.mobileMenuOpen;
  const navList = document.querySelector('.nav-list');
  const menuToggle = document.querySelector('.menu-toggle');

  if (this.mobileMenuOpen) {
    // Use 'is-open' class to match CSS selector
    navList?.classList.add('is-open');
    menuToggle?.classList.add('is-active');
    document.body.style.overflow = 'hidden';
  } else {
    navList?.classList.remove('is-open');
    menuToggle?.classList.remove('is-active');
    document.body.style.overflow = '';
  }
}
```

## States

### Active State

```css
.nav-link.is-active {
  color: var(--color-red);
  font-weight: 700;
}
```

### Scroll State

```css
.header.is-scrolled {
  padding: var(--space-md) 0;
  background: rgba(255, 255, 255, 0.95);
}
```

### Mobile Menu Toggle State

```css
.menu-toggle.is-active span {
  /* Hamburger to X animation */
  transform: rotate(45deg);
}

.menu-toggle.is-active span::before {
  transform: rotate(90deg);
  top: 0;
}

.menu-toggle.is-active span::after {
  transform: rotate(90deg);
  bottom: 0;
}
```

## Class Naming Convention

### State Classes

- **`.is-open`**: Applied to `.nav-list` when mobile menu is active
- **`.is-active`**: Applied to `.menu-toggle` for hamburger animation
- **`.is-active`**: Applied to `.nav-link` for current page indication

### Important: JavaScript/CSS Alignment

⚠️ **Critical**: JavaScript class targeting must exactly match CSS selectors. Use `is-open` consistently across both JavaScript and CSS for mobile menu functionality.

## Accessibility

- Keyboard navigable with Tab
- Toggle button has aria-label
- Current page indicated with aria-current
- Sufficient color contrast
- Focus states clearly visible
- Mobile menu closes with Escape key
- Outside click detection for mobile menu closure
- Body scroll disabled when mobile menu is open
