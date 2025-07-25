#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Page to hero image mapping
const HERO_MAPPING = {
  'home': '/images/hero/home.jpg',
  'about': '/images/hero/about.jpg',
  'tickets': '/images/hero/tickets.jpg',
  'donations': '/images/hero/donations.jpg',
  'contact': '/images/hero/contact.jpg',
  '404': '/images/hero/hero-default.jpg'
};

// Event hero mapping according to the plan
const EVENT_HERO_MAPPING = {
  'boulder-fest-2025': '/images/hero/boulder-fest-2025-hero.jpg',
  'boulder-fest-2026': '/images/hero/boulder-fest-2026-hero.jpg',
  'weekender-2026-09': '/images/hero/weekender-2026-09-hero.jpg',
  // Future events use numbered hero images
  'future-event-1': '/images/hero/future-event-hero1.jpg',
  'future-event-2': '/images/hero/future-event-hero2.jpg',
  'future-event-3': '/images/hero/future-event-hero3.jpg',
  // Add more as needed...
};

// Event page mappings - all pages within an event use the same hero
const EVENT_PAGE_MAPPING = {
  // Current redirected pages that use event heroes
  'artists': 'boulder-fest-2026',
  'schedule': 'boulder-fest-2025', 
  'gallery': 'weekender-2026-09',
  // Future event-specific pages
  'boulder-fest-2025-artists': 'boulder-fest-2025',
  'boulder-fest-2025-schedule': 'boulder-fest-2025',
  'boulder-fest-2025-gallery': 'boulder-fest-2025',
  'boulder-fest-2025-tickets': 'boulder-fest-2025',
  'boulder-fest-2026-artists': 'boulder-fest-2026',
  'boulder-fest-2026-schedule': 'boulder-fest-2026',
  'boulder-fest-2026-gallery': 'boulder-fest-2026',
  'boulder-fest-2026-tickets': 'boulder-fest-2026',
  'weekender-2026-09-artists': 'weekender-2026-09',
  'weekender-2026-09-schedule': 'weekender-2026-09',
  'weekender-2026-09-gallery': 'weekender-2026-09',
  'weekender-2026-09-tickets': 'weekender-2026-09',
};

// Function to get page ID from filename
function getPageIdFromFilename(filename) {
  const baseName = path.basename(filename, '.html');
  return baseName;
}

// Function to get hero image path for page
function getHeroImagePath(pageId) {
  // Check if it's an event page first
  if (EVENT_PAGE_MAPPING[pageId]) {
    const eventId = EVENT_PAGE_MAPPING[pageId];
    return EVENT_HERO_MAPPING[eventId] || '/images/hero/hero-default.jpg';
  }
  
  // Otherwise use standard page mapping
  return HERO_MAPPING[pageId] || '/images/hero/hero-default.jpg';
}

// Utility functions for event hero management
function getHeroForEventPage(event, page) {
  return EVENT_HERO_MAPPING[event] || '/images/hero/hero-default.jpg';
}

function getEventHero(event) {
  return EVENT_HERO_MAPPING[event];
}

function getNextFutureHeroNumber() {
  const futureHeroes = Object.values(EVENT_HERO_MAPPING)
    .filter(hero => hero.includes('future-event-hero'))
    .map(hero => parseInt(hero.match(/\d+/)[0]))
    .sort((a, b) => a - b);
  
  return futureHeroes.length > 0 ? Math.max(...futureHeroes) + 1 : 1;
}

// New preload script content with responsive image support
function getNewPreloadScript(pageId) {
  const heroPath = getHeroImagePath(pageId);
  const baseName = path.basename(heroPath, '.jpg');
  const isEventHero = heroPath.includes('boulder-fest-') || heroPath.includes('weekender-') || heroPath.includes('future-event-');
  
  return `    <!-- Critical resource preloading -->
    <script>
      // Inline critical path optimization - Event hero images with responsive variants
      (function() {
        // Check if optimized variants exist for event heroes
        const heroPath = '${heroPath}';
        const isEventHero = ${isEventHero};
        
        if (isEventHero) {
          // Preload optimized variants for event heroes (WebP first, then JPEG fallback)
          const isMobile = window.innerWidth <= 768;
          const variant = isMobile ? 'mobile' : 'desktop';
          const baseName = '${baseName}';
          
          // Preload WebP variant
          const webpPreload = document.createElement('link');
          webpPreload.rel = 'preload';
          webpPreload.as = 'image';
          webpPreload.href = \`/images/hero-optimized/$\{variant}/$\{baseName}.webp\`;
          webpPreload.type = 'image/webp';
          document.head.appendChild(webpPreload);
          
          // Preload AVIF variant for supported browsers
          if (typeof window !== 'undefined' && 'OffscreenCanvas' in window) {
            const avifPreload = document.createElement('link');
            avifPreload.rel = 'preload';
            avifPreload.as = 'image';
            avifPreload.href = \`/images/hero-optimized/$\{variant}/$\{baseName}.avif\`;
            avifPreload.type = 'image/avif';
            document.head.appendChild(avifPreload);
          }
          
          // Fallback JPEG preload
          const jpegPreload = document.createElement('link');
          jpegPreload.rel = 'preload';
          jpegPreload.as = 'image';
          jpegPreload.href = \`/images/hero-optimized/$\{variant}/$\{baseName}.jpg\`;
          jpegPreload.type = 'image/jpeg';
          document.head.appendChild(jpegPreload);
        } else {
          // Standard hero image preload for top-level pages
          const heroPreload = document.createElement('link');
          heroPreload.rel = 'preload';
          heroPreload.as = 'image';
          heroPreload.href = heroPath;
          document.head.appendChild(heroPreload);
        }
        
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

module.exports = { 
  updateHtmlFile, 
  getHeroImagePath, 
  getPageIdFromFilename,
  getHeroForEventPage,
  getEventHero,
  getNextFutureHeroNumber,
  EVENT_HERO_MAPPING,
  EVENT_PAGE_MAPPING 
};