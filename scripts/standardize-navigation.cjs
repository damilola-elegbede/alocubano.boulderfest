#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Complete navigation structure that should be on all pages
const NAVIGATION_LINKS = [
  { href: '/home', text: 'Home', dataText: 'Home' },
  { href: '/about', text: 'About', dataText: 'About' },
  { href: '/artists', text: 'Artists', dataText: 'Artists' },
  { href: '/schedule', text: 'Schedule', dataText: 'Schedule' },
  { href: '/gallery', text: 'Gallery', dataText: 'Gallery' },
  { href: '/tickets', text: 'Tickets', dataText: 'Tickets' },
  { href: '/donations', text: 'Donate', dataText: 'Donate' },
  { href: '/contact', text: 'Contact', dataText: 'Contact' }
];

// Function to determine which link should be active for each page
function getActiveLink(filename) {
  const baseName = path.basename(filename, '.html');
  
  if (baseName === 'home') return '/home';
  if (baseName === 'about') return '/about';
  if (baseName === 'artists') return '/artists';
  if (baseName === 'schedule') return '/schedule';
  if (baseName.includes('gallery')) return '/gallery';
  if (baseName === 'tickets') return '/tickets';
  if (baseName === 'donations') return '/donations';
  if (baseName === 'contact') return '/contact';
  
  return null; // No active link for other pages
}

// Function to generate navigation HTML
function generateNavigationHTML(activeHref) {
  const navItems = NAVIGATION_LINKS.map(link => {
    const isActive = link.href === activeHref;
    const activeClass = isActive ? ' is-active' : '';
    return `                        <li><a href="${link.href}" class="nav-link${activeClass}" data-text="${link.dataText}">${link.text}</a></li>`;
  }).join('\n');
  
  return `                    <ul class="nav-list">
${navItems}
                    </ul>`;
}

// Function to update a single HTML file
function updateHtmlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    
    console.log(`Checking ${filename}...`);
    
    // Skip files that don't have main navigation (like test files)
    if (!content.includes('nav-list')) {
      console.log(`ℹ️ ${filename} doesn't have main navigation - skipping`);
      return;
    }
    
    // Find and replace the navigation section
    const navRegex = /<ul class="nav-list">[\s\S]*?<\/ul>/;
    
    if (navRegex.test(content)) {
      const activeHref = getActiveLink(filename);
      const newNavigation = generateNavigationHTML(activeHref);
      
      const newContent = content.replace(navRegex, newNavigation);
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Updated navigation in ${filename}${activeHref ? ` (active: ${activeHref})` : ''}`);
    } else {
      console.log(`⚠️ Could not find nav-list in ${filename}`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const pagesDir = path.join(__dirname, '..', 'pages');
  
  console.log('🔄 Standardizing navigation across all pages...');
  console.log(`Pages directory: ${pagesDir}`);
  console.log(`Navigation links: ${NAVIGATION_LINKS.map(l => l.text).join(', ')}`);
  
  if (!fs.existsSync(pagesDir)) {
    console.error('❌ Pages directory not found!');
    process.exit(1);
  }
  
  // Get all HTML files
  const htmlFiles = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html'))
    .map(file => path.join(pagesDir, file));
  
  console.log(`\nFound ${htmlFiles.length} HTML files:`);
  htmlFiles.forEach(file => console.log(`  - ${path.basename(file)}`));
  console.log('');
  
  // Update each file
  htmlFiles.forEach(updateHtmlFile);
  
  console.log('\n🎉 Navigation standardization completed!');
  console.log('All pages now have consistent navigation with all main-level links.');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateHtmlFile, generateNavigationHTML, getActiveLink };