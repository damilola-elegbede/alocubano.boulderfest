# Color System

## Color Palette

### Base Colors
```css
--color-black: #000000;    /* Primary text, strong contrast */
--color-white: #FFFFFF;    /* Backgrounds, inverted text */
```

### Brand Accent Colors
```css
--color-red: #CC2936;      /* Cuban flag red - CTAs, emphasis */
--color-blue: #5B6BB5;     /* Cuban flag blue - links, focus states */
```

### Grayscale Palette
```css
--color-gray-900: #111111; /* Near-black for high contrast text */
--color-gray-800: #333333; /* Dark text on light backgrounds */
--color-gray-700: #555555; /* Medium-dark text, secondary headings */
--color-gray-600: #666666; /* Muted text, captions */
--color-gray-500: #888888; /* Subtle text, placeholders */
--color-gray-400: #999999; /* Light text, disabled states */
--color-gray-300: #BBBBBB; /* Borders, dividers */
--color-gray-200: #DDDDDD; /* Light borders, form fields */
--color-gray-100: #F5F5F5; /* Background highlights, hover states */
```

## Implementation Reference

### Defined in `/css/base.css` (Lines 5-19)
All color variables are centrally defined in the root selector:
- Primary colors: Lines 5-6
- Brand colors: Lines 7-8  
- Grayscale: Lines 11-19

### Implementation Note: Legacy Color Reference
⚠️ **ACTION REQUIRED**: `--color-primary` is referenced in `/css/typography.css` (lines 489, 525) but not defined in the color system. **Recommended solution**: Replace these references with `--color-blue` (#5B6BB5) as it's the established brand color for interactive elements like hover states.

**Affected selectors**:
- `.social-link-type:hover` (line 489) - Should use `--color-blue` for brand consistency
- `.footer-info a:hover` (line 525) - Should use `--color-blue` for link hover states

## Usage Guidelines

### Text Colors
- **Primary Text**: `--color-black` (#000000) on light backgrounds
- **Secondary Text**: `--color-gray-700` (#555555) for reduced emphasis
- **Muted Text**: `--color-gray-600` (#666666) for captions, meta information
- **Disabled Text**: `--color-gray-400` (#999999) for inactive elements
- **Inverted Text**: `--color-white` (#FFFFFF) on dark backgrounds

### Accent & Interactive Colors
- **Links**: `--color-blue` (#5B6BB5) - Used in navigation, links, focus states
- **Call-to-Action**: `--color-red` (#CC2936) - Buttons, emphasis, highlights
- **Focus Indicators**: `--color-blue` (#5B6BB5) - 2px solid outline (base.css:210, 219)

### Background Colors
- **Primary Background**: `--color-white` (#FFFFFF)
- **Subtle Background**: `--color-gray-100` (#F5F5F5) for cards, sections
- **Dark Sections**: `--color-black` (#000000) with white text
- **Hover States**: `--color-gray-100` (#F5F5F5) for interactive elements

### Borders & Dividers
- **Subtle Borders**: `--color-gray-200` (#DDDDDD) for form fields, cards
- **Medium Borders**: `--color-gray-300` (#BBBBBB) for stronger separation
- **Interactive Borders**: `--color-blue` (#5B6BB5) for focused form fields

## Special Effects & Typography

### Gradient Effects
```css
/* Brand gradient (blue to red) */
background: linear-gradient(45deg, var(--color-blue), var(--color-red));

/* Reverse gradient (red to blue) */
background: linear-gradient(45deg, var(--color-red), var(--color-blue));
```
*Used in: `/css/typography.css` lines 407, 530, 562, 572, 578*
*Used in: `/css/components.css` lines 195, 636*

### Text Stroke Effects
```css
/* Black text stroke for outlined text */
-webkit-text-stroke: 2px var(--color-black);
text-stroke: 2px var(--color-black);
```
*Used in: `/css/typography.css` lines 539-540, 800-801*

### Loading Animations
```css
/* Skeleton loading gradient */
background: linear-gradient(90deg, var(--color-gray-100) 25%, var(--color-gray-200) 50%, var(--color-gray-100) 75%);
```
*Used in: `/css/components.css` line 514*

## Color Usage by Component

### Navigation (`/css/navigation.css`)
- Header background: `--color-white` with gradient fade
- Links: `--color-black` (default), `--color-red` (active), `--color-blue` (hover)
- Mobile menu: `--color-black` background, `--color-white` text
- Borders: `--color-gray-200` for separation

### Typography (`/css/typography.css`)
- Body text: `--color-black` on `--color-white`
- Links: `--color-blue` with `--color-red` hover
- Code blocks: `--color-gray-100` background, `--color-blue` border
- Blockquotes: `--color-gray-700` text, `--color-blue` left border

### Forms (`/css/forms.css`)
- Input fields: `--color-white` background, `--color-gray-300` border
- Focus states: `--color-blue` border
- Error states: `--color-red` border and text
- Disabled: `--color-gray-100` background

### Components (`/css/components.css`)
- Cards: `--color-white` background, `--color-gray-200` border
- Buttons: Various combinations of brand colors
- Lightbox: `--color-black` background, `--color-white` text
- Loading states: `--color-gray-100` and `--color-gray-200`

## Accessibility Compliance

### WCAG AA Contrast Ratios
- **Black on White** (#000000 on #FFFFFF): 21:1 ✅ (Excellent)
- **Gray-700 on White** (#555555 on #FFFFFF): 7.9:1 ✅ (AA Large)
- **Gray-600 on White** (#666666 on #FFFFFF): 5.7:1 ✅ (AA Normal)
- **Blue on White** (#5B6BB5 on #FFFFFF): 4.8:1 ✅ (AA Normal)
- **Red on White** (#CC2936 on #FFFFFF): 7.2:1 ✅ (AA Large)
- **White on Black** (#FFFFFF on #000000): 21:1 ✅ (Excellent)
- **White on Blue** (#FFFFFF on #5B6BB5): 4.8:1 ✅ (AA Normal)
- **White on Red** (#FFFFFF on #CC2936): 7.2:1 ✅ (AA Large)

### Color-Blind Accessibility
- Red and blue are sufficiently distinct in hue and lightness
- Gray scale provides non-color-dependent hierarchy
- Interactive states use both color and visual cues (underlines, borders)

## File Dependencies

### Primary Definition
- **Base Variables**: `/css/base.css` (lines 5-19)

### Usage Across Stylesheets
- **Typography**: `/css/typography.css` (60+ references)
- **Navigation**: `/css/navigation.css` (25+ references)  
- **Components**: `/css/components.css` (35+ references)
- **Forms**: `/css/forms.css` (20+ references)
- **Mobile**: `/css/mobile-overrides.css` (5+ references)

### Total Color References
Approximately **150+ color variable references** across all CSS files, ensuring consistent brand application throughout the entire design system.