# Color System

## Color Palette

### Primary Colors
```css
--color-black: #000000;
--color-white: #FFFFFF;
```

### Accent Colors
```css
--color-red: #CC2936;      /* Cuban flag red */
--color-blue: #5B6BB5;     /* Cuban flag blue */
```

### Gray Scale
```css
--color-gray-50: #FAFAFA;
--color-gray-100: #F5F5F5;
--color-gray-200: #E5E5E5;
--color-gray-300: #D4D4D4;
--color-gray-400: #A3A3A3;
--color-gray-500: #737373;
--color-gray-600: #525252;
--color-gray-700: #404040;
--color-gray-800: #262626;
--color-gray-900: #171717;
```

## Usage Guidelines

### Text Colors
- **Primary Text**: `--color-black` on light backgrounds
- **Inverted Text**: `--color-white` on dark backgrounds
- **Muted Text**: `--color-gray-600` for secondary content
- **Accent Text**: `--color-red` for emphasis and links

### Background Colors
- **Primary Background**: `--color-white`
- **Secondary Background**: `--color-gray-50`
- **Dark Sections**: `--color-black` with white text
- **Hover States**: `--color-gray-100` for interactive elements

### Special Effects
- **Text Gradient**: Red to black for dramatic headlines
- **Text Outline**: Black stroke on white for outlined text
- **Text Mask**: Background clip for texture effects

## Accessibility
- All color combinations meet WCAG AA standards
- Minimum contrast ratio of 4.5:1 for normal text
- Minimum contrast ratio of 3:1 for large text
- Red accent used sparingly to avoid color-only communication

## Implementation
```css
/* Text gradient example */
.text-gradient {
  background: linear-gradient(135deg, var(--color-red) 0%, var(--color-black) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Text outline example */
.text-outline {
  color: transparent;
  -webkit-text-stroke: 2px var(--color-black);
  text-stroke: 2px var(--color-black);
}
```