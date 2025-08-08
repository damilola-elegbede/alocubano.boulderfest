import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const iconDir = path.join(__dirname, '..', 'public', 'images', 'icons');
  const logoPath = path.join(__dirname, '..', 'images', 'logo.png');
  
  // Create icons directory
  await fs.mkdir(iconDir, { recursive: true });
  
  // Check if logo exists
  try {
    await fs.access(logoPath);
    console.log('Using logo.png from /images/logo.png');
  } catch (error) {
    console.error('Logo not found at', logoPath);
    console.log('Please ensure logo.png exists in the /images directory');
    process.exit(1);
  }
  
  // Generate icons for each size from the actual logo
  for (const size of sizes) {
    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 102, g: 126, b: 234, alpha: 1 } // #667eea background
      })
      .png()
      .toFile(path.join(iconDir, `icon-${size}x${size}.png`));
    
    console.log(`Generated icon-${size}x${size}.png`);
  }
  
  console.log('✅ All icons generated from logo.png');
}

generateIcons().catch(console.error);