# Typography Scale

## Type Scale System

Based on a 1.25 ratio (Major Third) for harmonious proportions.

```css
--font-size-xs: 0.75rem; /* 12px */
--font-size-sm: 0.875rem; /* 14px */
--font-size-base: 1rem; /* 16px */
--font-size-lg: 1.125rem; /* 18px */
--font-size-xl: 1.25rem; /* 20px */
--font-size-2xl: 1.5rem; /* 24px */
--font-size-3xl: 1.875rem; /* 30px */
--font-size-4xl: 2.25rem; /* 36px */
--font-size-5xl: 3rem; /* 48px */
--font-size-6xl: 3.75rem; /* 60px */
--font-size-7xl: 4.5rem; /* 72px */
--font-size-8xl: 6rem; /* 96px */
--font-size-9xl: 8rem; /* 128px */
```

## Font Families

```css
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
--font-serif: "Playfair Display", Georgia, serif;
--font-display: "Bebas Neue", Impact, sans-serif;
--font-mono: "Space Mono", "Courier New", monospace;
```

## Usage Hierarchy

### Hero Typography

- **Massive Headlines**: `--font-size-8xl` to `--font-size-9xl`
- **Font**: `--font-display`
- **Weight**: 700
- **Line Height**: 1.0
- **Letter Spacing**: `-0.05em`

### Section Headers

- **H1**: `--font-size-6xl` (desktop) / `--font-size-4xl` (mobile)
- **H2**: `--font-size-4xl` (desktop) / `--font-size-3xl` (mobile)
- **H3**: `--font-size-3xl` (desktop) / `--font-size-2xl` (mobile)
- **Font**: `--font-display` or `--font-serif`
- **Weight**: 400-900

### Body Text

- **Paragraph**: `--font-size-base` to `--font-size-lg`
- **Font**: `--font-sans`
- **Weight**: 400
- **Line Height**: 1.5-1.75

### Special Text

- **Code/Technical**: `--font-mono`, `--font-size-sm`
- **Quotes**: `--font-serif`, `--font-size-xl`, italic
- **Captions**: `--font-sans`, `--font-size-sm`, opacity 0.8

## Responsive Scaling

```css
/* Mobile type scale reduction */
@media (max-width: 768px) {
  :root {
    --font-size-6xl: 3rem; /* Down from 3.75rem */
    --font-size-7xl: 3.75rem; /* Down from 4.5rem */
    --font-size-8xl: 4.5rem; /* Down from 6rem */
    --font-size-9xl: 6rem; /* Down from 8rem */
  }
}
```

## Line Height Scale

```css
--line-height-none: 1;
--line-height-tight: 1.1;
--line-height-snug: 1.25;
--line-height-normal: 1.5;
--line-height-relaxed: 1.75;
--line-height-loose: 2;
```

## Letter Spacing

```css
--letter-spacing-tight: -0.05em;
--letter-spacing-normal: 0;
--letter-spacing-wide: 0.05em;
--letter-spacing-wider: 0.1em;
--letter-spacing-widest: 0.2em;
```
