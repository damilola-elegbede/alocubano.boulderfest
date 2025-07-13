# Transition Specifications

## Timing Functions

### Base Transitions
```css
--transition-base: 0.3s ease;
--transition-slow: 0.5s ease;
--transition-fast: 0.15s ease;
```

### Easing Functions
```css
--ease-in-out-expo: cubic-bezier(0.87, 0, 0.13, 1);
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);
--ease-bounce: cubic-bezier(0.175, 0.885, 0.32, 1.275);
```

## Common Transitions

### Hover Transitions
```css
/* Link hover */
a {
  transition: color var(--transition-base);
}

/* Button hover */
button {
  transition: all var(--transition-base);
}

/* Card hover */
.card {
  transition: transform var(--transition-base),
              box-shadow var(--transition-base);
}
```

### Page Transitions
```css
/* Fade in on load */
.fade-in {
  opacity: 0;
  animation: fadeIn 0.6s ease forwards;
}

@keyframes fadeIn {
  to {
    opacity: 1;
  }
}

/* Slide up on scroll */
.slide-up {
  opacity: 0;
  transform: translateY(30px);
  transition: all 0.6s var(--ease-out-expo);
}

.slide-up.is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

## Text Animations

### Typewriter Effect
```css
@keyframes typing {
  from { width: 0 }
  to { width: 100% }
}

@keyframes blink-caret {
  from, to { border-color: transparent }
  50% { border-color: var(--color-black) }
}

.typewriter {
  overflow: hidden;
  border-right: 2px solid var(--color-black);
  white-space: nowrap;
  animation: 
    typing 3.5s steps(40, end),
    blink-caret 0.75s step-end infinite;
}
```

### Glitch Effect
```css
@keyframes glitch {
  0%, 100% { transform: translate(0) }
  20% { transform: translate(-2px, 2px) }
  40% { transform: translate(-2px, -2px) }
  60% { transform: translate(2px, 2px) }
  80% { transform: translate(2px, -2px) }
}

@keyframes glitch-1 {
  0%, 100% { clip-path: inset(0 0 0 0) }
  25% { clip-path: inset(0 0 50% 0) }
  50% { clip-path: inset(50% 0 0 0) }
  75% { clip-path: inset(0 0 30% 0) }
}

@keyframes glitch-2 {
  0%, 100% { transform: translate(0) }
  20% { transform: translate(2px, -2px) }
  40% { transform: translate(-2px, 2px) }
  60% { transform: translate(3px, 3px) }
  80% { transform: translate(-3px, -3px) }
}
```

## Scroll Animations

### Parallax Effect
```css
.parallax {
  transform: translateY(var(--parallax-offset, 0));
  transition: transform 0s;
  will-change: transform;
}

/* JavaScript updates --parallax-offset based on scroll */
```

### Reveal on Scroll
```css
.reveal {
  opacity: 0;
  transform: translateY(50px);
  transition: all 0.8s var(--ease-out-expo);
}

.reveal.is-revealed {
  opacity: 1;
  transform: translateY(0);
}

/* Stagger children */
.reveal-stagger > * {
  transition-delay: calc(var(--index) * 0.1s);
}
```

## Performance Guidelines

### Best Practices
1. Use `transform` and `opacity` for smooth 60fps animations
2. Add `will-change` for properties that will animate
3. Remove `will-change` after animation completes
4. Use CSS animations over JavaScript when possible
5. Reduce animations on mobile for better performance

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```