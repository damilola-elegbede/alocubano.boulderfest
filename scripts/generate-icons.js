import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateIcons() {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  const iconDir = path.join(__dirname, '..', 'public', 'images', 'icons');
  
  // Create icons directory
  await fs.mkdir(iconDir, { recursive: true });
  
  // Create a simple icon with text (you can replace with actual logo)
  const svg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <rect width="512" height="512" fill="#667eea"/>
      <text x="256" y="280" font-family="Arial" font-size="200" font-weight="bold" 
            text-anchor="middle" fill="white">A</text>
      <text x="256" y="380" font-family="Arial" font-size="60" 
            text-anchor="middle" fill="white">CHECK-IN</text>
    </svg>
  `;
  
  // Generate icons for each size
  for (const size of sizes) {
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(path.join(iconDir, `icon-${size}x${size}.png`));
    
    console.log(`Generated icon-${size}x${size}.png`);
  }
  
  console.log('✅ All icons generated');
}

generateIcons().catch(console.error);