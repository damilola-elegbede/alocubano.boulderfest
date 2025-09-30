# Wallet Pass Images

This directory contains branding images for Apple and Google Wallet passes for A Lo Cubano Boulder Fest.

## Brand Colors
- Cuban Red: #CE1126
- Cuban Blue: #002A8F
- Brand Blue: #5b6bb5
- White: #ffffff

## Files Required

### Logo Images (Horizontal)
- `logo.png` (160x50 pixels) - Main logo for pass header
- `logo@2x.png` (320x100 pixels) - High-res logo for pass header

### Icon Images (Square)
- `icon.png` (29x29 pixels) - Small square icon
- `icon@2x.png` (58x58 pixels) - High-res small square icon

### Strip Images (Banner)
- `strip.png` (375x98 pixels) - Banner image for pass
- `strip@2x.png` (750x196 pixels) - High-res banner image for pass

## Design Guidelines
- Professional Cuban salsa festival branding
- Uses Cuban flag colors as primary palette
- Includes "A LO CUBANO" festival name
- Festival dates: May 15-17, 2026
- Location: Boulder, CO
- Legible at small sizes
- Works on both light and dark backgrounds

## Current Status
SVG source files have been created. For production use, convert these SVG files to PNG format using:

```bash
# Using ImageMagick (if available)
convert logo.svg logo.png
convert logo@2x.svg logo@2x.png
convert icon.svg icon.png
convert icon@2x.svg icon@2x.png
convert strip.svg strip.png
convert strip@2x.svg strip@2x.png

# Or using online converters or design tools
```

The SVG files are designed to be easily convertible to PNG while maintaining proper branding and readability.