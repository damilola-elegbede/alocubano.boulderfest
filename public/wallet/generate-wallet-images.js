import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source logo paths
const SOURCE_LOGO = join(__dirname, '../images/logo.png');
const SOURCE_LOGO_DARK = join(__dirname, '../images/logo-dark.png');

// Output directory
const OUTPUT_DIR = __dirname;

/**
 * Generate wallet images from source logo
 * Creates logo, icon, and background images at @1x, @2x, and @3x resolutions
 */
async function generateWalletImages() {
  console.log('🎨 Generating Apple Wallet images...\n');

  try {
    // Check if source logo exists
    await fs.access(SOURCE_LOGO);
    console.log(`✓ Source logo found: ${SOURCE_LOGO}`);

    // 1. Generate Logo Images (horizontal header logo)
    // Smaller, narrower logos for cleaner appearance (3:1 aspect ratio)
    console.log('\n📸 Generating logo images...');
    await generateLogo(120, 40, 'logo.png');
    await generateLogo(240, 80, 'logo@2x.png');
    await generateLogo(360, 120, 'logo@3x.png');

    // 2. Generate Icon Images (square icon)
    console.log('\n🔲 Generating icon images...');
    await generateIcon(29, 29, 'icon.png');
    await generateIcon(58, 58, 'icon@2x.png');
    await generateIcon(87, 87, 'icon@3x.png');

    // 3. Generate Background Images with Logo Watermark
    // Full-pass background with centered logo at 5% opacity
    console.log('\n🎨 Generating background images with logo watermark...');
    await generateBackground(375, 466, 319, 'background.png');     // 85% of 375 = 319
    await generateBackground(750, 932, 638, 'background@2x.png');  // 85% of 750 = 638
    await generateBackground(1125, 1398, 956, 'background@3x.png'); // 85% of 1125 = 956

    console.log('\n✅ All wallet images generated successfully!');
    console.log(`\nImages saved to: ${OUTPUT_DIR}`);

  } catch (error) {
    console.error('❌ Error generating wallet images:', error);
    process.exit(1);
  }
}

/**
 * Generate logo image (horizontal)
 * Fits logo within bounds with transparent background
 */
async function generateLogo(width, height, filename) {
  const outputPath = join(OUTPUT_DIR, filename);

  await sharp(SOURCE_LOGO)
    .resize(width, height, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
    })
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${filename} (${width}x${height})`);
}

/**
 * Generate icon image (square)
 * Resizes to exact dimensions
 */
async function generateIcon(width, height, filename) {
  const outputPath = join(OUTPUT_DIR, filename);

  await sharp(SOURCE_LOGO)
    .resize(width, height, {
      fit: 'cover'
    })
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${filename} (${width}x${height})`);
}

/**
 * Generate background image with centered logo watermark
 * Black background with white logo at 20% opacity
 * Background won't block QR code (unlike strip images)
 */
async function generateBackground(width, height, logoSize, filename) {
  const outputPath = join(OUTPUT_DIR, filename);

  // Create black background
  const background = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
  .png()
  .toBuffer();

  // Resize white logo and reduce opacity to 5%
  const resizedLogo = await sharp(SOURCE_LOGO_DARK)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Manually reduce alpha channel to 20% opacity
  const { data, info } = resizedLogo;
  const pixels = new Uint8Array(data);

  // RGBA format: every 4th byte is alpha
  for (let i = 3; i < pixels.length; i += 4) {
    pixels[i] = Math.floor(pixels[i] * 0.20); // Reduce alpha to 20%
  }

  // Create PNG from modified raw data
  const logo = await sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  })
  .png()
  .toBuffer();

  // Composite logo on background
  // Position: center
  const centerX = Math.floor((width - logoSize) / 2);
  const centerY = Math.floor((height - logoSize) / 2);

  await sharp(background)
    .composite([{
      input: logo,
      top: centerY,
      left: centerX,
      blend: 'over'
    }])
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${filename} (${width}x${height}, ${logoSize}x${logoSize} logo @ 20% opacity)`);
}

// Run the generator
generateWalletImages();
