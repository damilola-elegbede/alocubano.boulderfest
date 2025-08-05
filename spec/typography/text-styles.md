# Text Styling Patterns

## Display Text Effects

### Text Gradient

Creates a gradient fill effect for dramatic headlines.

```css
.text-gradient {
  background: linear-gradient(
    135deg,
    var(--color-red) 0%,
    var(--color-black) 100%
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Text Outline

Creates hollow text with visible stroke.

```css
.text-outline {
  color: transparent;
  -webkit-text-stroke: 2px var(--color-black);
  text-stroke: 2px var(--color-black);
}
```

### Text Mask

Creates textured or patterned text fills.

```css
.text-mask {
  background: repeating-linear-gradient(
    90deg,
    var(--color-black),
    var(--color-black) 2px,
    transparent 2px,
    transparent 4px
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

### Glitch Effect

Animated distortion effect for emphasis.

```css
.text-glitch {
  position: relative;
  animation: glitch 2s infinite;
}

.text-glitch::before,
.text-glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.text-glitch::before {
  animation: glitch-1 0.5s infinite;
  color: var(--color-red);
  z-index: -1;
}

.text-glitch::after {
  animation: glitch-2 0.5s infinite;
  color: var(--color-blue);
  z-index: -2;
}
```

## Typography Compositions

### Typewriter Effect

Simulates typing animation.

```css
.typewriter {
  overflow: hidden;
  border-right: 2px solid var(--color-black);
  white-space: nowrap;
  animation:
    typing 3.5s steps(40, end),
    blink-caret 0.75s step-end infinite;
}
```

### Vertical Text

For decorative sidebar elements.

```css
.text-vertical {
  writing-mode: vertical-rl;
  text-orientation: mixed;
  transform: rotate(180deg);
}
```

### Mixed Size Composition

Creates dynamic text layouts.

```css
.text-composition {
  .text-large {
    font-size: var(--font-size-4xl);
  }
  .text-medium {
    font-size: var(--font-size-2xl);
  }
  .text-small {
    font-size: var(--font-size-lg);
  }
}
```

## Text Animation Patterns

### Hover Effects

```css
.text-hover-slide {
  position: relative;
  overflow: hidden;
}

.text-hover-slide::after {
  content: attr(data-text);
  position: absolute;
  top: 100%;
  left: 0;
  transition: top 0.3s ease;
}

.text-hover-slide:hover::after {
  top: 0;
}
```

### Reveal Animation

```css
.text-reveal {
  opacity: 0;
  transform: translateY(20px);
  animation: reveal 0.6s ease forwards;
}

@keyframes reveal {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

## Best Practices

1. Use display effects sparingly for maximum impact
2. Ensure sufficient contrast for readability
3. Provide fallbacks for webkit-specific properties
4. Test animations for performance on mobile
5. Always include non-animated states for accessibility
