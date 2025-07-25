#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Page to hero image mapping
const HERO_MAPPING = {
  'home': '/images/hero/home.jpg',
  'about': '/images/hero/about.jpg',
  'artists': '/images/hero/artists.jpg',
  'schedule': '/images/hero/schedule.jpg',
  'gallery': '/images/hero/gallery.jpg',
  'gallery-2025': '/images/hero/gallery-2025.jpg',
  'tickets': '/images/hero/tickets.jpg',
  'donations': '/images/hero/donations.jpg',
  'contact': '/images/hero/contact.jpg',
  '404': '/images/hero/hero-default.jpg'
};

// Function to get page ID from filename
function getPageIdFromFilename(filename) {
  const baseName = path.basename(filename, '.html');
  return HERO_MAPPING[baseName] ? baseName : 'home';
}

// Function to get hero image path for page
function getHeroImagePath(pageId) {
  return HERO_MAPPING[pageId] || '/images/hero/hero-default.jpg';
}

// New preload script content
function getNewPreloadScript(pageId) {
  const heroPath = getHeroImagePath(pageId);
  
  return `    <!-- Critical resource preloading -->
    <script>
      // Inline critical path optimization - Static hero images
      (function() {
        // Preload static hero image for current page
        const heroPreload = document.createElement('link');
        heroPreload.rel = 'preload';
        heroPreload.as = 'image';
        heroPreload.href = '${heroPath}';
        document.head.appendChild(heroPreload);
        
        // Preload gallery data for gallery pages
        const pageId = window.location.pathname.split('/').pop() || 'home';
        if (pageId.includes('gallery')) {
          const year = pageId.includes('2025') ? '2025' : new Date().getFullYear();
          const galleryDataPreload = document.createElement('link');
          galleryDataPreload.rel = 'preload';
          galleryDataPreload.as = 'fetch';
          galleryDataPreload.href = \`/api/gallery?year=$\{year}&category=workshops\`;
          galleryDataPreload.crossOrigin = 'anonymous';
          document.head.appendChild(galleryDataPreload);
        }
      })();
    </script>`;
}

// Function to update a single HTML file
function updateHtmlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    const pageId = getPageIdFromFilename(filename);
    
    console.log(`Updating ${filename} (pageId: ${pageId})`);
    
    // Find and replace the preload script section
    const preloadRegex = /<!-- Critical resource preloading -->[\s\S]*?<\/script>/;
    
    if (preloadRegex.test(content)) {
      const newContent = content.replace(preloadRegex, getNewPreloadScript(pageId));
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Updated ${filename}`);
    } else {
      console.log(`⚠️ No preload script found in ${filename}`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const pagesDir = path.join(__dirname, '..', 'pages');
  
  console.log('🔄 Updating hero image preloads in HTML files...');
  console.log(`Pages directory: ${pagesDir}`);
  
  if (!fs.existsSync(pagesDir)) {
    console.error('❌ Pages directory not found!');
    process.exit(1);
  }
  
  // Get all HTML files
  const htmlFiles = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html'))
    .map(file => path.join(pagesDir, file));
  
  console.log(`Found ${htmlFiles.length} HTML files:`);
  htmlFiles.forEach(file => console.log(`  - ${path.basename(file)}`));
  
  // Update each file
  htmlFiles.forEach(updateHtmlFile);
  
  console.log('🎉 Hero image preload updates completed!');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateHtmlFile, getHeroImagePath, getPageIdFromFilename };