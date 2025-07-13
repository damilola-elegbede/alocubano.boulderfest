# Navigation Component

## Header Structure

### HTML Pattern
```html
<header class="header">
  <div class="container">
    <div class="grid">
      <div class="header-left">
        <img src="logo.png" alt="Logo" style="height: 78px;">
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
  background: linear-gradient(to bottom, 
    var(--color-white) 0%, 
    var(--color-white) 90%, 
    transparent 100%);
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

### Toggle Button
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
  
  .nav-list {
    position: fixed;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-white);
    transform: translateY(-100vh);
    transition: transform 0.3s ease;
  }
  
  .nav-list.is-open {
    transform: translateY(0);
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

## Accessibility
- Keyboard navigable with Tab
- Toggle button has aria-label
- Current page indicated with aria-current
- Sufficient color contrast
- Focus states clearly visible