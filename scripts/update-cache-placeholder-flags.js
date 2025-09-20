#!/usr/bin/env node

/**
 * Script to update existing gallery cache files with proper placeholder flags
 * Usage: node scripts/update-cache-placeholder-flags.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

/**
 * Update cache files to ensure proper placeholder flags
 */
function updateCachePlaceholderFlags() {
  console.log(`🔄 Updating gallery cache placeholder flags...`);

  const galleryDataDir = path.join(projectRoot, "public", "gallery-data");

  if (!fs.existsSync(galleryDataDir)) {
    console.log("❌ Gallery data directory does not exist");
    return;
  }

  // Check if Google Drive secrets are available
  const hasGoogleDriveSecrets =
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

  console.log(`Google Drive secrets available: ${hasGoogleDriveSecrets ? 'Yes' : 'No'}`);

  const files = fs.readdirSync(galleryDataDir).filter(file => file.endsWith('.json'));
  let updatedCount = 0;

  for (const filename of files) {
    const filePath = path.join(galleryDataDir, filename);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let needsUpdate = false;
      let originalIsPlaceholder = data.isPlaceholder;

      // Determine if this should be a placeholder based on content
      const hasRealData = data.totalCount > 0 ||
                          (data.categories && Object.values(data.categories).some(cat => cat.length > 0));

      if (hasRealData) {
        // File has real data - should NOT be a placeholder
        if (data.isPlaceholder === true) {
          console.log(`  ⚠️  File ${filename} has real data but is marked as placeholder - fixing`);
          delete data.isPlaceholder;
          delete data.message;
          needsUpdate = true;
        }
      } else {
        // File has no real data - should be a placeholder if secrets not available
        if (!hasGoogleDriveSecrets) {
          if (!data.isPlaceholder) {
            console.log(`  🔧 File ${filename} has no data and no secrets available - marking as placeholder`);
            data.isPlaceholder = true;
            data.message = "Placeholder data - Google Drive credentials not available";
            needsUpdate = true;
          }
        } else {
          // Secrets available but no data - this is an empty cache, not a placeholder
          if (data.isPlaceholder === true) {
            console.log(`  🔧 File ${filename} marked as placeholder but secrets are available - removing placeholder flag`);
            delete data.isPlaceholder;
            data.message = "Empty event gallery cache - to be populated when Google Drive folder is configured";
            needsUpdate = true;
          }
        }
      }

      if (needsUpdate) {
        // Update timestamp when making changes
        data.cacheTimestamp = new Date().toISOString();

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        updatedCount++;
        console.log(`  ✅ Updated ${filename} (was placeholder: ${originalIsPlaceholder}, now placeholder: ${data.isPlaceholder || false})`);
      } else {
        console.log(`  ✓  ${filename} is correctly configured (placeholder: ${data.isPlaceholder || false})`);
      }

    } catch (error) {
      console.error(`  ❌ Error processing ${filename}:`, error.message);
    }
  }

  console.log(`\n🎉 Processing complete. Updated ${updatedCount} of ${files.length} cache files.`);
}

/**
 * Validate cache files have proper placeholder handling
 */
function validateCacheFiles() {
  console.log(`\n🔍 Validating cache file placeholder handling...`);

  const galleryDataDir = path.join(projectRoot, "public", "gallery-data");
  const files = fs.readdirSync(galleryDataDir).filter(file => file.endsWith('.json'));

  let issuesFound = 0;

  for (const filename of files) {
    const filePath = path.join(galleryDataDir, filename);

    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const hasRealData = data.totalCount > 0 ||
                          (data.categories && Object.values(data.categories).some(cat => cat.length > 0));

      if (hasRealData && data.isPlaceholder === true) {
        console.log(`  ❌ Issue: ${filename} has real data but is marked as placeholder`);
        issuesFound++;
      } else if (!hasRealData && !data.isPlaceholder && !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
        console.log(`  ⚠️  Warning: ${filename} has no data and no secrets, but not marked as placeholder`);
        issuesFound++;
      } else {
        console.log(`  ✓  ${filename} is valid (has data: ${hasRealData}, is placeholder: ${data.isPlaceholder || false})`);
      }

    } catch (error) {
      console.error(`  ❌ Error validating ${filename}:`, error.message);
      issuesFound++;
    }
  }

  console.log(`\n📊 Validation complete. Found ${issuesFound} issues.`);
  return issuesFound === 0;
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("🎭 Gallery Cache Placeholder Flag Updater\n");

  // Load environment variables
  try {
    const dotenv = await import('dotenv');
    dotenv.config({ path: '.env.local' });
  } catch (error) {
    console.log('Note: dotenv not available, using system environment variables');
  }

  const command = process.argv[2];

  if (command === 'validate') {
    const isValid = validateCacheFiles();
    process.exit(isValid ? 0 : 1);
  } else {
    updateCachePlaceholderFlags();

    // Validate after update
    const isValid = validateCacheFiles();
    if (!isValid) {
      console.log("\n⚠️  Some issues remain after update. Manual review may be needed.");
    }
  }
}

export { updateCachePlaceholderFlags, validateCacheFiles };