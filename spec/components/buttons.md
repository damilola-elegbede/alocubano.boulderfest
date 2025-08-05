# Button Component

## Base Button Styles

### Primary Button

```css
.btn-primary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-md) var(--space-2xl);
  font-family: var(--font-display);
  font-size: var(--font-size-lg);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-wider);
  color: var(--color-white);
  background-color: var(--color-black);
  border: 2px solid var(--color-black);
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
}

.btn-primary:hover {
  color: var(--color-black);
  background-color: var(--color-white);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

### Secondary Button

```css
.btn-secondary {
  /* Same as primary but inverted */
  color: var(--color-black);
  background-color: transparent;
  border: 2px solid var(--color-black);
}

.btn-secondary:hover {
  color: var(--color-white);
  background-color: var(--color-black);
}
```

### Accent Button

```css
.btn-accent {
  color: var(--color-white);
  background-color: var(--color-red);
  border: 2px solid var(--color-red);
}

.btn-accent:hover {
  color: var(--color-red);
  background-color: var(--color-white);
}
```

## Typography Buttons

### Form Button Type

Used in the typographic design system.

```css
.form-button-type {
  display: inline-block;
  padding: var(--space-lg) var(--space-3xl);
  font-family: var(--font-display);
  font-size: var(--font-size-xl);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-widest);
  background: var(--color-black);
  color: var(--color-white);
  border: none;
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
```

### Glitch Button

```css
.text-glitch-bg {
  position: relative;
  z-index: 1;
}

.text-glitch-bg::before,
.text-glitch-bg::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--color-black);
  z-index: -1;
}

.text-glitch-bg:hover::before {
  animation: glitch-bg-1 0.3s ease;
  background: var(--color-red);
}

.text-glitch-bg:hover::after {
  animation: glitch-bg-2 0.3s ease;
  background: var(--color-blue);
}
```

## Button Sizes

### Large

```css
.btn-large {
  padding: var(--space-xl) var(--space-4xl);
  font-size: var(--font-size-2xl);
}
```

### Small

```css
.btn-small {
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--font-size-sm);
}
```

## Special Effects

### Hover Slide Effect

```css
.btn-slide {
  position: relative;
  z-index: 1;
}

.btn-slide::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: var(--color-red);
  transition: left 0.3s ease;
  z-index: -1;
}

.btn-slide:hover::before {
  left: 0;
}
```

### Loading State

```css
.btn-loading {
  color: transparent;
  pointer-events: none;
}

.btn-loading::after {
  content: "";
  position: absolute;
  width: 20px;
  height: 20px;
  top: 50%;
  left: 50%;
  margin: -10px 0 0 -10px;
  border: 2px solid var(--color-white);
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
```

## Accessibility

- Minimum touch target of 44x44px
- Focus states with visible outline
- Sufficient color contrast (AA compliant)
- Disabled state clearly indicated
- Keyboard activation support
