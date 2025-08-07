import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createWalletImages() {
  const walletDir = path.join(process.cwd(), 'public', 'wallet');
  const googleDir = path.join(process.cwd(), 'public', 'images', 'wallet');
  
  // Create directories
  await fs.mkdir(walletDir, { recursive: true });
  await fs.mkdir(googleDir, { recursive: true });
  
  // Create purple gradient base image
  const purple = { r: 102, g: 126, b: 234 };
  
  // Apple Wallet images
  console.log('Creating Apple Wallet images...');
  
  // Logo - 320x100 pixels (@2x)
  await sharp({
    create: {
      width: 320,
      height: 100,
      channels: 4,
      background: { ...purple, alpha: 1 }
    }
  })
  .composite([{
    input: Buffer.from(
      '<svg width="320" height="100">' +
      '<text x="160" y="60" font-family="Arial" font-size="30" fill="white" text-anchor="middle">A Lo Cubano</text>' +
      '</svg>'
    ),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(path.join(walletDir, 'logo@2x.png'));
  
  // Icon - 58x58 pixels (@2x)
  await sharp({
    create: {
      width: 58,
      height: 58,
      channels: 4,
      background: { ...purple, alpha: 1 }
    }
  })
  .composite([{
    input: Buffer.from(
      '<svg width="58" height="58">' +
      '<circle cx="29" cy="29" r="28" fill="#667EEA"/>' +
      '<text x="29" y="38" font-family="Arial" font-size="24" fill="white" text-anchor="middle">AL</text>' +
      '</svg>'
    ),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(path.join(walletDir, 'icon@2x.png'));
  
  // Strip - 750x196 pixels (@2x)
  await sharp({
    create: {
      width: 750,
      height: 196,
      channels: 4,
      background: { ...purple, alpha: 1 }
    }
  })
  .composite([{
    input: Buffer.from(
      '<svg width="750" height="196">' +
      '<rect width="750" height="196" fill="url(#grad)"/>' +
      '<defs>' +
      '<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">' +
      '<stop offset="0%" style="stop-color:#667EEA;stop-opacity:1" />' +
      '<stop offset="100%" style="stop-color:#4C51BF;stop-opacity:1" />' +
      '</linearGradient>' +
      '</defs>' +
      '<text x="375" y="110" font-family="Arial" font-size="40" fill="white" text-anchor="middle">Boulder Fest 2026</text>' +
      '</svg>'
    ),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(path.join(walletDir, 'strip@2x.png'));
  
  // Create @1x versions
  await sharp(path.join(walletDir, 'logo@2x.png')).resize(160, 50).toFile(path.join(walletDir, 'logo.png'));
  await sharp(path.join(walletDir, 'icon@2x.png')).resize(29, 29).toFile(path.join(walletDir, 'icon.png'));
  await sharp(path.join(walletDir, 'strip@2x.png')).resize(375, 98).toFile(path.join(walletDir, 'strip.png'));
  
  // Google Wallet images
  console.log('Creating Google Wallet images...');
  
  // Logo - 660x660 pixels
  await sharp({
    create: {
      width: 660,
      height: 660,
      channels: 4,
      background: { ...purple, alpha: 1 }
    }
  })
  .composite([{
    input: Buffer.from(
      '<svg width="660" height="660">' +
      '<circle cx="330" cy="330" r="320" fill="#667EEA"/>' +
      '<text x="330" y="350" font-family="Arial" font-size="80" fill="white" text-anchor="middle">A Lo Cubano</text>' +
      '</svg>'
    ),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(path.join(googleDir, 'google-logo.png'));
  
  // Hero - 1860x480 pixels
  await sharp({
    create: {
      width: 1860,
      height: 480,
      channels: 4,
      background: { ...purple, alpha: 1 }
    }
  })
  .composite([{
    input: Buffer.from(
      '<svg width="1860" height="480">' +
      '<rect width="1860" height="480" fill="url(#herograd)"/>' +
      '<defs>' +
      '<linearGradient id="herograd" x1="0%" y1="0%" x2="0%" y2="100%">' +
      '<stop offset="0%" style="stop-color:#667EEA;stop-opacity:1" />' +
      '<stop offset="100%" style="stop-color:#4C51BF;stop-opacity:1" />' +
      '</linearGradient>' +
      '</defs>' +
      '<text x="930" y="240" font-family="Arial" font-size="60" fill="white" text-anchor="middle">A Lo Cubano Boulder Fest 2026</text>' +
      '<text x="930" y="300" font-family="Arial" font-size="30" fill="white" opacity="0.8" text-anchor="middle">May 15-17 • Avalon Ballroom</text>' +
      '</svg>'
    ),
    top: 0,
    left: 0
  }])
  .png()
  .toFile(path.join(googleDir, 'google-hero.png'));
  
  console.log('✓ Wallet images created successfully');
  
  // List created files
  console.log('\nCreated Apple Wallet images:');
  const appleFiles = await fs.readdir(walletDir);
  appleFiles.forEach(file => console.log(`  - public/wallet/${file}`));
  
  console.log('\nCreated Google Wallet images:');
  const googleFiles = await fs.readdir(googleDir);
  googleFiles.forEach(file => console.log(`  - public/images/wallet/${file}`));
}

createWalletImages().catch(console.error);