#!/usr/bin/env node

/**
 * Script to ensure navigation consistency across all pages
 * This script analyzes all HTML pages and updates navigation menus to be consistent
 * Usage: node scripts/update-navigation.js [--dry-run] [--event=event-id]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Navigation structure configuration
const CORE_NAVIGATION = [
  { path: '/', text: 'Home', id: 'home' },
  { path: '/about', text: 'About', id: 'about' },
  { path: '/tickets', text: 'Tickets', id: 'tickets' },
  { path: '/donations', text: 'Donations', id: 'donations' },
  { path: '/contact', text: 'Contact', id: 'contact' }
];

const EVENT_NAVIGATION = [
  { path: 'artists', text: 'Artists', id: 'artists' },
  { path: 'schedule', text: 'Schedule', id: 'schedule' },
  { path: 'gallery', text: 'Gallery', id: 'gallery' },
  { path: 'tickets', text: 'Tickets', id: 'tickets' }
];

/**
 * Get all events from existing pages
 */
function getAllEvents() {
  const pagesDir = path.join(projectRoot, 'pages');
  const eventPages = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html') && file.includes('-'))
    .map(file => {
      const match = file.match(/^([a-z0-9-]+)-[a-z]+\.html$/);
      return match ? match[1] : null;
    })
    .filter(event => event && !['gallery-2025'].includes(event)) // Filter legacy pages
    .filter((event, index, array) => array.indexOf(event) === index); // Remove duplicates
  
  return eventPages.sort();
}

/**
 * Generate navigation HTML for core pages
 */
function generateCoreNavigation(currentPageId) {
  const navItems = CORE_NAVIGATION.map(item => {
    const isActive = currentPageId === item.id;
    const activeClass = isActive ? ' class="active"' : '';
    return `        <li><a href="${item.path}"${activeClass}>${item.text}</a></li>`;
  }).join('\n');
  
  return `      <ul class="nav-menu" id="nav-menu">
${navItems}
      </ul>`;
}

/**
 * Generate navigation HTML for event pages
 */
function generateEventNavigation(eventId, currentPageType) {
  const navItems = EVENT_NAVIGATION.map(item => {
    const isActive = currentPageType === item.id;
    const activeClass = isActive ? ' class="active"' : '';
    const href = `/${eventId}-${item.path}`;
    return `        <li><a href="${href}"${activeClass}>${item.text}</a></li>`;
  }).join('\n');
  
  return `      <ul class="nav-menu" id="nav-menu">
${navItems}
      </ul>`;
}

/**
 * Determine page type from filename
 */
function getPageInfo(filename) {
  const baseName = path.basename(filename, '.html');
  
  // Check if it's an event page
  const eventMatch = baseName.match(/^([a-z0-9-]+)-([a-z]+)$/);
  if (eventMatch) {
    return {
      type: 'event',
      eventId: eventMatch[1],
      pageType: eventMatch[2],
      pageId: baseName
    };
  }
  
  // Core page
  return {
    type: 'core',
    eventId: null,
    pageType: baseName,
    pageId: baseName
  };
}

/**
 * Update navigation in a single HTML file
 */
function updateNavigationInFile(filePath, dryRun = false) {
  const filename = path.basename(filePath);
  const pageInfo = getPageInfo(filename);
  
  console.log(`📄 Processing ${filename} (${pageInfo.type}${pageInfo.eventId ? `: ${pageInfo.eventId}` : ''})`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find navigation section - look for both nav-menu and nav-list patterns
    let navRegex = /(<ul class="nav-menu" id="nav-menu">[\s\S]*?<\/ul>)/;
    let match = content.match(navRegex);
    
    if (!match) {
      // Try alternative navigation pattern
      navRegex = /(<ul class="nav-list" id="main-navigation">[\s\S]*?<\/ul>)/;
      match = content.match(navRegex);
    }
    
    if (!match) {
      console.log(`  ⚠️  No navigation menu found in ${filename}`);
      return false;
    }
    
    const oldNav = match[1];
    let newNav;
    
    if (pageInfo.type === 'event') {
      newNav = generateEventNavigation(pageInfo.eventId, pageInfo.pageType);
    } else {
      newNav = generateCoreNavigation(pageInfo.pageId);
    }
    
    // Check if navigation needs updating
    if (oldNav.trim() === newNav.trim()) {
      console.log(`  ✅ Navigation already up to date`);
      return true;
    }
    
    if (dryRun) {
      console.log(`  🔍 [DRY RUN] Navigation would be updated`);
      console.log(`    Old: ${oldNav.replace(/\s+/g, ' ').trim().substring(0, 60)}...`);
      console.log(`    New: ${newNav.replace(/\s+/g, ' ').trim().substring(0, 60)}...`);
      return true;
    }
    
    // Update the content
    const updatedContent = content.replace(navRegex, newNav);
    
    // Write back to file
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`  ✅ Navigation updated successfully`);
    
    return true;
    
  } catch (error) {
    console.log(`  ❌ Error processing ${filename}: ${error.message}`);
    return false;
  }
}

/**
 * Update mobile navigation in a single HTML file
 */
function updateMobileNavigationInFile(filePath, dryRun = false) {
  const filename = path.basename(filePath);
  const pageInfo = getPageInfo(filename);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Find mobile navigation section
    const mobileNavRegex = /(<ul class="mobile-nav-menu" id="mobile-nav-menu">[\s\S]*?<\/ul>)/;
    const match = content.match(mobileNavRegex);
    
    if (!match) {
      // Mobile nav might not exist in all pages
      return true;
    }
    
    const oldMobileNav = match[1];
    let newMobileNav;
    
    if (pageInfo.type === 'event') {
      const mobileNavItems = EVENT_NAVIGATION.map(item => {
        const isActive = pageInfo.pageType === item.id;
        const activeClass = isActive ? ' class="active"' : '';
        const href = `/${pageInfo.eventId}-${item.path}`;
        return `        <li><a href="${href}"${activeClass}>${item.text}</a></li>`;
      }).join('\n');
      
      newMobileNav = `      <ul class="mobile-nav-menu" id="mobile-nav-menu">
${mobileNavItems}
      </ul>`;
    } else {
      const mobileNavItems = CORE_NAVIGATION.map(item => {
        const isActive = pageInfo.pageId === item.id;
        const activeClass = isActive ? ' class="active"' : '';
        return `        <li><a href="${item.path}"${activeClass}>${item.text}</a></li>`;
      }).join('\n');
      
      newMobileNav = `      <ul class="mobile-nav-menu" id="mobile-nav-menu">
${mobileNavItems}
      </ul>`;
    }
    
    // Check if mobile navigation needs updating
    if (oldMobileNav.trim() === newMobileNav.trim()) {
      return true;
    }
    
    if (dryRun) {
      console.log(`  🔍 [DRY RUN] Mobile navigation would be updated`);
      return true;
    }
    
    // Update the content
    const updatedContent = content.replace(mobileNavRegex, newMobileNav);
    
    // Write back to file
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`  ✅ Mobile navigation updated successfully`);
    
    return true;
    
  } catch (error) {
    console.log(`  ⚠️  Error updating mobile navigation in ${filename}: ${error.message}`);
    return true; // Don't fail the whole process for mobile nav issues
  }
}

/**
 * Validate navigation consistency across all pages
 */
function validateNavigationConsistency() {
  console.log('🔍 Validating navigation consistency...');
  
  const pagesDir = path.join(projectRoot, 'pages');
  const htmlFiles = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html'))
    .sort();
  
  const issues = [];
  const events = new Set();
  
  htmlFiles.forEach(filename => {
    const filePath = path.join(pagesDir, filename);
    const pageInfo = getPageInfo(filename);
    
    if (pageInfo.type === 'event') {
      events.add(pageInfo.eventId);
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for navigation menu
      if (!content.includes('nav-menu')) {
        issues.push(`${filename}: No navigation menu found`);
      }
      
      // Check for proper href format in event pages
      if (pageInfo.type === 'event') {
        const eventLinks = content.match(/href="\/[^"]*"/g) || [];
        const invalidLinks = eventLinks.filter(link => {
          const href = link.match(/href="([^"]*)"/)[1];
          return href.startsWith('/') && 
                 !href.startsWith(`/${pageInfo.eventId}-`) && 
                 !CORE_NAVIGATION.some(nav => nav.path === href);
        });
        
        if (invalidLinks.length > 0) {
          issues.push(`${filename}: Invalid event links found: ${invalidLinks.join(', ')}`);
        }
      }
      
    } catch (error) {
      issues.push(`${filename}: Error reading file - ${error.message}`);
    }
  });
  
  console.log(`  📊 Found ${events.size} events: ${Array.from(events).join(', ')}`);
  
  if (issues.length > 0) {
    console.log('  ❌ Navigation consistency issues found:');
    issues.forEach(issue => console.log(`    - ${issue}`));
    return false;
  } else {
    console.log('  ✅ All navigation menus are consistent');
    return true;
  }
}

/**
 * Main function to update all navigation
 */
function updateAllNavigation(options = {}) {
  const { dryRun = false, eventFilter = null } = options;
  
  console.log('🧭 Updating Navigation Across All Pages');
  console.log('=========================================\n');
  
  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }
  
  const pagesDir = path.join(projectRoot, 'pages');
  let htmlFiles = fs.readdirSync(pagesDir)
    .filter(file => file.endsWith('.html'))
    .sort();
  
  // Filter by event if specified
  if (eventFilter) {
    htmlFiles = htmlFiles.filter(file => {
      const pageInfo = getPageInfo(file);
      return pageInfo.type === 'core' || pageInfo.eventId === eventFilter;
    });
    console.log(`📋 Filtering to event: ${eventFilter}`);
  }
  
  console.log(`📄 Processing ${htmlFiles.length} HTML files...\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  htmlFiles.forEach(filename => {
    const filePath = path.join(pagesDir, filename);
    
    const desktopSuccess = updateNavigationInFile(filePath, dryRun);
    const mobileSuccess = updateMobileNavigationInFile(filePath, dryRun);
    
    if (desktopSuccess && mobileSuccess) {
      successCount++;
    } else {
      errorCount++;
    }
  });
  
  console.log('\n📊 Summary:');
  console.log(`  ✅ Successfully processed: ${successCount} files`);
  if (errorCount > 0) {
    console.log(`  ❌ Errors encountered: ${errorCount} files`);
  }
  
  // Validate consistency
  if (!dryRun) {
    console.log('');
    validateNavigationConsistency();
  }
  
  console.log('\n🎉 Navigation update completed!');
  
  if (!dryRun) {
    console.log('📋 Next steps:');
    console.log('   1. Test navigation on all pages');
    console.log('   2. Verify mobile navigation works correctly');
    console.log('   3. Check active states highlight correctly');
  }
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    eventFilter: null
  };
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/update-navigation.js [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run        Show what would be changed without modifying files');
    console.log('  --event=EVENT    Update only pages for specific event');
    console.log('  --help, -h       Show this help message');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/update-navigation.js');
    console.log('  node scripts/update-navigation.js --dry-run');
    console.log('  node scripts/update-navigation.js --event=boulder-fest-2026');
    process.exit(0);
  }
  
  if (args.includes('--dry-run')) {
    options.dryRun = true;
  }
  
  const eventArg = args.find(arg => arg.startsWith('--event='));
  if (eventArg) {
    options.eventFilter = eventArg.split('=')[1];
  }
  
  return options;
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  updateAllNavigation(options);
}

export { 
  updateAllNavigation, 
  validateNavigationConsistency, 
  getAllEvents,
  generateCoreNavigation,
  generateEventNavigation 
};