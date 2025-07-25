#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to update a single HTML file
function updateHtmlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const filename = path.basename(filePath);
    
    console.log(`Checking ${filename}...`);
    
    // Find and remove the inline object-position style
    const styleRegex = /\s*style="object-position:\s*top\s+center\s*!\s*important;?"[^>]*/g;
    
    if (styleRegex.test(content)) {
      const newContent = content.replace(styleRegex, '');
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Removed inline object-position style from ${filename}`);
    } else {
      console.log(`ℹ️ No inline object-position style found in ${filename}`);
    }
    
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const pagesDir = path.join(__dirname, '..', 'pages');
  
  console.log('🔄 Removing inline object-position styles from HTML files...');
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
  
  console.log('🎉 Inline style cleanup completed!');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateHtmlFile };