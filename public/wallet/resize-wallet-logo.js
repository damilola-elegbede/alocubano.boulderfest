import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE = join(__dirname, 'wallet-logo.png');
const OUTPUT_DIR = __dirname;

async function resizeWalletLogo() {
  console.log('🎨 Resizing wallet-logo.png...\n');

  // Validate source file exists
  if (!existsSync(SOURCE)) {
    throw new Error(`Source file not found: ${SOURCE}. Please run create-banner-logo.js first.`);
  }

  // Get original dimensions
  const metadata = await sharp(SOURCE).metadata();

  // Validate metadata
  if (!metadata.width || !metadata.height || !Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)) {
    throw new Error(`Invalid image metadata: width=${metadata.width}, height=${metadata.height}`);
  }

  console.log(`Source: ${metadata.width}x${metadata.height}px`);

  // Generate @2x (2x size)
  await sharp(SOURCE)
    .resize(metadata.width * 2, metadata.height * 2, { 
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(join(OUTPUT_DIR, 'wallet-logo-2x.png'));
  console.log(`  ✓ wallet-logo-2x.png (${metadata.width * 2}x${metadata.height * 2})`);

  // Generate @3x (3x size)
  await sharp(SOURCE)
    .resize(metadata.width * 3, metadata.height * 3, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .png()
    .toFile(join(OUTPUT_DIR, 'wallet-logo-3x.png'));
  console.log(`  ✓ wallet-logo-3x.png (${metadata.width * 3}x${metadata.height * 3})`);

  console.log('\n✅ Wallet logo resized successfully!');
}

resizeWalletLogo().catch(console.error);
