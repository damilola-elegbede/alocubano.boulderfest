#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// Function to update a single HTML file
function updateHtmlFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const filename = path.basename(filePath);

    console.log(`Checking ${filename}...`);

    // Find and remove the image-cache-manager.js script tag
    const scriptRegex =
      /\s*<script src="\/js\/image-cache-manager\.js[^"]*"><\/script>\s*/g;

    if (scriptRegex.test(content)) {
      const newContent = content.replace(scriptRegex, "");
      fs.writeFileSync(filePath, newContent, "utf8");
      console.log(`✅ Removed image-cache-manager.js from ${filename}`);
    } else {
      console.log(
        `ℹ️ No image-cache-manager.js reference found in ${filename}`,
      );
    }
  } catch (error) {
    console.error(`❌ Error updating ${filePath}:`, error.message);
  }
}

// Main function
function main() {
  const pagesDir = path.join(__dirname, "..", "pages");

  console.log(
    "🔄 Removing image-cache-manager.js references from HTML files...",
  );
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

  console.log("🎉 Image cache manager cleanup completed!");
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { updateHtmlFile };
