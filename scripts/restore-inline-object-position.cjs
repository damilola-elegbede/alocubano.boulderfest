#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Function to update a single HTML file
function updateHtmlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const filename = path.basename(filePath);

    console.log(`Checking ${filename}...`);

    // Find hero-splash-img elements and add the inline style
    const imgRegex =
      /(<img[^>]*id="hero-splash-image"[^>]*class="hero-splash-img")([^>]*>)/g;

    if (imgRegex.test(content)) {
      const newContent = content.replace(
        imgRegex,
        '$1 style="object-position: top center !important;"$2',
      );
      fs.writeFileSync(filePath, newContent, "utf8");
      console.log(`✅ Added inline object-position style to ${filename}`);
    } else {
      console.log(`ℹ️ No hero-splash-img element found in ${filename}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const pagesDir = path.join(__dirname, "..", "pages");

  console.log("🔄 Adding inline object-position styles to HTML files...");
  console.log(`Pages directory: ${pagesDir}`);

  if (!fs.existsSync(pagesDir)) {
    console.error("❌ Pages directory not found!");
    process.exit(1);
  }

  // Get all HTML files
  const htmlFiles = fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith(".html"))
    .map((file) => path.join(pagesDir, file));

  console.log(`Found ${htmlFiles.length} HTML files:`);
  htmlFiles.forEach((file) => console.log(`  - ${path.basename(file)}`));

  // Update each file
  htmlFiles.forEach(updateHtmlFile);

  console.log("🎉 Inline style restoration completed!");
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateHtmlFile };
