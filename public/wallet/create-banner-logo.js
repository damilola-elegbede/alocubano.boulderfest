import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SOURCE_LOGO = join(__dirname, '../images/logo.png');
const OUTPUT_DIR = __dirname;

/**
 * Create a placeholder banner logo
 * USER: Replace these generated files with your actual banner image
 */
async function createBannerLogo() {
  console.log('🎨 Creating placeholder banner logo...');
  console.log('⚠️  IMPORTANT: Replace these with your actual "A LO CUBANO | BOULDER FEST" banner image!\n');

  // For now, create a wider version of the logo as placeholder
  // @1x: 320x50px, @2x: 640x100px, @3x: 960x150px
  
  await sharp(SOURCE_LOGO)
    .resize(320, 50, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(join(OUTPUT_DIR, 'wallet-logo.png'));
  console.log('  ✓ wallet-logo.png (320x50) - PLACEHOLDER');

  await sharp(SOURCE_LOGO)
    .resize(640, 100, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(join(OUTPUT_DIR, 'wallet-logo@2x.png'));
  console.log('  ✓ wallet-logo@2x.png (640x100) - PLACEHOLDER');

  await sharp(SOURCE_LOGO)
    .resize(960, 150, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(join(OUTPUT_DIR, 'wallet-logo@3x.png'));
  console.log('  ✓ wallet-logo@3x.png (960x150) - PLACEHOLDER');

  console.log('\n⚠️  ACTION REQUIRED:');
  console.log('Replace the files above with your actual banner:');
  console.log('  "A LO CUBANO | BOULDER FEST" with logo on left');
}

createBannerLogo().catch(console.error);
