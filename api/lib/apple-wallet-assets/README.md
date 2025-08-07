# Apple Wallet Pass Image Assets

Place your image files in this directory for the Apple Wallet passes.

## Required Images

### Logo (appears in header)
- `logo.png` - 160×50 px
- `logo@2x.png` - 320×100 px (Retina)
- `logo@3x.png` - 480×150 px (iPhone Plus)

### Icon (appears in listings)
- `icon.png` - 29×29 px
- `icon@2x.png` - 58×58 px
- `icon@3x.png` - 87×87 px

### Background (watermark effect)
- `background.png` - 180×220 px
- `background@2x.png` - 360×440 px

## How to Generate from Your Logo

Using your existing `/images/logo.png`, create these versions:

```bash
# Install ImageMagick if needed
brew install imagemagick

# Generate logo versions (resize to fit, maintain aspect ratio)
convert ../../images/logo.png -resize 160x50 logo.png
convert ../../images/logo.png -resize 320x100 logo@2x.png
convert ../../images/logo.png -resize 480x150 logo@3x.png

# Generate icon versions (square crop)
convert ../../images/logo.png -resize 29x29 -gravity center -extent 29x29 icon.png
convert ../../images/logo.png -resize 58x58 -gravity center -extent 58x58 icon@2x.png
convert ../../images/logo.png -resize 87x87 -gravity center -extent 87x87 icon@3x.png

# Generate background versions (with transparency for watermark)
convert ../../images/logo.png -resize 180x220 -alpha set -channel A -evaluate set 10% background.png
convert ../../images/logo.png -resize 360x440 -alpha set -channel A -evaluate set 10% background@2x.png
```

## Color Scheme (Already Configured)

- **Background**: White (`rgb(255, 255, 255)`)
- **Text**: Black (`rgb(0, 0, 0)`)
- **Labels**: Cuban Flag Red (`rgb(206, 17, 38)`)
- **Attendee Name**: Cuban Flag Blue (`rgb(0, 40, 104)`)

## Notes

- Apple Wallet automatically uses the correct resolution based on device
- The background image creates the watermark effect
- Keep file sizes optimized (use PNG compression)
- Test on actual devices to see how it looks