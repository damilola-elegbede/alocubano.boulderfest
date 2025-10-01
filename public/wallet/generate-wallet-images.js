import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Source logo path
const SOURCE_LOGO = join(__dirname, '../images/logo.png');

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
    // Aspect ratio: 160x50 = 3.2:1
    console.log('\n📸 Generating logo images...');
    await generateLogo(160, 50, 'logo.png');
    await generateLogo(320, 100, 'logo@2x.png');
    await generateLogo(480, 150, 'logo@3x.png');

    // 2. Generate Icon Images (square icon)
    console.log('\n🔲 Generating icon images...');
    await generateIcon(29, 29, 'icon.png');
    await generateIcon(58, 58, 'icon@2x.png');
    await generateIcon(87, 87, 'icon@3x.png');

    // 3. Generate Background Images with Watermark
    console.log('\n🖼️  Generating background images with watermark...');
    await generateBackground(180, 220, 150, 'background.png');
    await generateBackground(360, 440, 300, 'background@2x.png');
    await generateBackground(540, 660, 450, 'background@3x.png');

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
 * Generate background image with centered watermark
 * White background with logo at 5% opacity
 */
async function generateBackground(width, height, logoSize, filename) {
  const outputPath = join(OUTPUT_DIR, filename);

  // Create white background
  const background = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .png()
  .toBuffer();

  // Resize logo for watermark
  const watermarkResized = await sharp(SOURCE_LOGO)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Apply 5% opacity to watermark by reducing alpha channel
  const { data, info } = watermarkResized;
  for (let i = 0; i < data.length; i += 4) {
    // Reduce alpha channel to 5% of original
    data[i + 3] = Math.floor(data[i + 3] * 0.05);
  }

  // Convert back to PNG buffer
  const watermark = await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4
    }
  })
  .png()
  .toBuffer();

  // Composite watermark on background
  // Position: center
  const centerX = Math.floor((width - logoSize) / 2);
  const centerY = Math.floor((height - logoSize) / 2);

  await sharp(background)
    .composite([{
      input: watermark,
      top: centerY,
      left: centerX,
      blend: 'over'
    }])
    .png()
    .toFile(outputPath);

  console.log(`  ✓ ${filename} (${width}x${height}, ${logoSize}x${logoSize} logo @ 5% opacity)`);
}

// Run the generator
generateWalletImages();
