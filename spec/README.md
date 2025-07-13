# A Lo Cubano Boulder Fest - Design Specification

## Overview
This document serves as the comprehensive design specification for the A Lo Cubano Boulder Fest website. It captures all design decisions, patterns, and guidelines for future implementation.

## Directory Structure
```
spec/
├── README.md                   # This file - main documentation
├── design-system/             # Core design system documentation
│   ├── colors.md             # Color palette and usage
│   ├── spacing.md            # Spacing system and grid
│   └── variables.md          # CSS custom properties
├── components/               # Component specifications
│   ├── navigation.md         # Header and navigation patterns
│   ├── buttons.md           # Button styles and states
│   ├── cards.md             # Card layouts and variations
│   └── forms.md             # Form elements and validation
├── layouts/                 # Page layout patterns
│   ├── grid-system.md       # Grid specifications
│   ├── responsive.md        # Breakpoints and mobile design
│   └── sections.md          # Section patterns
├── typography/              # Typography system
│   ├── type-scale.md        # Font sizes and hierarchy
│   ├── fonts.md             # Font families and loading
│   └── text-styles.md       # Text styling patterns
├── animations/              # Animation specifications
│   ├── transitions.md       # Transition timing and easing
│   ├── hover-states.md      # Interactive states
│   └── effects.md           # Special effects (glitch, etc.)
└── content/                 # Content guidelines
    ├── voice-tone.md        # Writing style guide
    ├── information-arch.md  # Site structure
    └── assets.md            # Image and media specs
```

## Design Philosophy

### Core Principles
1. **Typography First**: Text is the primary design element
2. **Minimalist Aesthetic**: Clean, focused, distraction-free
3. **Cultural Authenticity**: Respectful representation of Cuban culture
4. **Performance Focused**: Fast loading, smooth interactions
5. **Accessibility**: WCAG 2.1 AA compliant

### Visual Language
- **Bold Typography**: Using display fonts for impact
- **Strategic Color**: Red accents on monochrome base
- **Generous Whitespace**: Let content breathe
- **Subtle Animation**: Enhance, don't distract
- **Clear Hierarchy**: Guide the eye naturally

### Reference Standards
The **Artists** and **Schedule** pages exemplify the ideal balance and simplicity for this website:
- **Artists Page**: Demonstrates creative typography use with consistent card patterns
- **Schedule Page**: Shows clean, scannable information hierarchy with minimal styling

These pages should be used as the standard for all other page designs.

## Quick Reference

### Colors
- Primary: `#000000` (Black)
- Secondary: `#FFFFFF` (White)
- Accent: `#CC2936` (Cuban Red)
- Support: `#5B6BB5` (Cuban Blue)

### Fonts
- Display: `Bebas Neue`
- Accent: `Playfair Display`
- Monospace: `Space Mono`
- Body: `Inter`

### Breakpoints
- Mobile: `< 768px`
- Tablet: `768px - 1024px`
- Desktop: `> 1024px`

## Implementation Notes
- All specifications use CSS custom properties for maintainability
- Mobile-first responsive approach
- Progressive enhancement for animations
- Semantic HTML structure throughout

## Design Standards Reference

### Artists Page Pattern
- Hero with massive typographic title
- Text composition blocks mixing font sizes and styles
- Consistent card structure with: number, name, meta info, description, tags
- Creative use of monospace "code comment" style for additional info
- Grid-based layout with generous spacing

### Schedule Page Pattern
- Clean day/time/event structure
- Minimal visual styling - focus on readability
- Consistent time formatting in monospace
- Clear visual separation between days
- Simple grid layout: time column + details column
- No unnecessary animations or effects