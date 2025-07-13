# Claude Configuration for A Lo Cubano Boulder Fest

## Project Overview
This is a minimalist dance festival website for A Lo Cubano Boulder Fest. The design emphasizes typography, simplicity, and clean information architecture.

## Design Specifications
Before making any changes to this project, please read the comprehensive design specifications:
- **Main Spec**: `/spec/README.md` - Overview and design philosophy
- **Reference Standards**: The Artists and Schedule pages exemplify the ideal balance and simplicity
- **Simplicity Principles**: `/spec/design-system/simplicity-principles.md`
- **Page Patterns**: `/spec/layouts/page-patterns.md`

## Key Design Principles
1. **Typography First**: Text is the primary design element
2. **Minimal Color Palette**: Black, white, with red (#CC2936) and blue (#5B6BB5) accents only
3. **Clean Layouts**: Grid-based, generous whitespace, no complex positioning
4. **No Animations**: Remove or simplify any complex transitions
5. **Information Hierarchy**: Clear, scannable content structure

## Reference Pages
When implementing any new features or pages, use these as your guide:
- **Artists Page** (`/pages/typographic/artists.html`): Creative typography with consistent patterns
- **Schedule Page** (`/pages/typographic/schedule.html`): Clean, functional information display

## Technical Stack
- **Static HTML/CSS/JS**: No build process required
- **CSS Variables**: For consistent spacing and typography
- **Vercel Compatible**: Static site deployment ready
- **No Dependencies**: Pure vanilla implementation

## File Structure
```
/pages/typographic/  # Main website pages
/css/                # Stylesheets (use typography-simplified.css)
/js/                 # Minimal JavaScript for navigation
/images/             # Logo and placeholder images
/spec/               # Design specifications (READ FIRST)
```

## Development Guidelines
1. Always maintain simplicity - if in doubt, choose the simpler option
2. Test on mobile first - ensure readability at all sizes
3. Use semantic HTML for better accessibility
4. Keep JavaScript minimal - only for essential interactions
5. Follow the established patterns from Artists/Schedule pages

## Common Tasks
- **Adding a new page**: Copy the structure from Schedule page, maintain the same header/footer
- **Updating styles**: Edit typography-simplified.css, avoid adding complex effects
- **Adding content**: Use the established card patterns from the Artists page
- **Modifying navigation**: Update all pages to maintain consistency

## Vercel Deployment
This static site is fully compatible with Vercel:
- No build step required
- Serves directly from `/pages/typographic/` directory
- All assets use relative paths
- No server-side processing needed

## Important Notes
- The `/pages/typographic/` folder contains the current active design
- Other design variations in `/pages/` are legacy and not in use
- Always refer to the spec documentation before making design decisions
- Maintain the minimalist aesthetic - less is more