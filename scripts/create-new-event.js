#!/usr/bin/env node

/**
 * Script to create new event pages and associated assets
 * Usage: node scripts/create-new-event.js <event-id> [--template=event-id]
 * Example: node scripts/create-new-event.js salsa-fest-2027 --template=boulder-fest-2026
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

// Event page types that should be created for each event
const EVENT_PAGE_TYPES = ["artists", "schedule", "gallery", "tickets"];

// Default template event to copy from if no template is specified
const DEFAULT_TEMPLATE = "boulder-fest-2026";

/**
 * Get next available future event hero number
 */
function getNextFutureHeroNumber() {
  const heroDir = path.join(projectRoot, "images", "hero");
  const existingHeroes = fs
    .readdirSync(heroDir)
    .filter(
      (file) => file.startsWith("future-event-hero") && file.endsWith(".jpg"),
    )
    .map((file) => parseInt(file.match(/\d+/)[0]))
    .sort((a, b) => a - b);

  return existingHeroes.length > 0 ? Math.max(...existingHeroes) + 1 : 1;
}

/**
 * Create hero image placeholders for the new event
 */
function createHeroImages(eventId, futureHeroNumber) {
  console.log(`🖼️  Creating hero images for ${eventId}...`);

  const heroDir = path.join(projectRoot, "images", "hero");
  const optimizedDir = path.join(projectRoot, "images", "hero-optimized");

  // Create main hero image (copy from future-event-hero template)
  const sourceHero = path.join(
    heroDir,
    `future-event-hero${futureHeroNumber}.jpg`,
  );
  const targetHero = path.join(heroDir, `${eventId}-hero.jpg`);

  if (fs.existsSync(sourceHero)) {
    fs.copyFileSync(sourceHero, targetHero);
    console.log(`  ✅ Created hero image: ${eventId}-hero.jpg`);
  } else {
    // Copy from future-event-hero1.jpg as fallback
    const fallbackHero = path.join(heroDir, "future-event-hero1.jpg");
    if (fs.existsSync(fallbackHero)) {
      fs.copyFileSync(fallbackHero, targetHero);
      console.log(`  ✅ Created hero image from fallback: ${eventId}-hero.jpg`);
    } else {
      console.log(`  ⚠️  Could not create hero image - no template found`);
    }
  }

  // Create optimized variants
  const variants = ["desktop", "mobile", "placeholder"];
  const formats = ["jpg", "webp", "avif"];

  variants.forEach((variant) => {
    const variantDir = path.join(optimizedDir, variant);
    if (fs.existsSync(variantDir)) {
      formats.forEach((format) => {
        const sourceFile = path.join(
          variantDir,
          `future-event-hero${futureHeroNumber}.${format}`,
        );
        const targetFile = path.join(variantDir, `${eventId}-hero.${format}`);

        if (fs.existsSync(sourceFile)) {
          fs.copyFileSync(sourceFile, targetFile);
        } else {
          // Try fallback
          const fallbackFile = path.join(
            variantDir,
            `future-event-hero1.${format}`,
          );
          if (fs.existsSync(fallbackFile)) {
            fs.copyFileSync(fallbackFile, targetFile);
          }
        }
      });
      console.log(`  ✅ Created optimized ${variant} variants`);
    }
  });
}

/**
 * Create event page from template
 */
function createEventPage(eventId, pageType, templateEventId) {
  console.log(`📄 Creating ${eventId}-${pageType}.html...`);

  const templatePath = path.join(
    projectRoot,
    "pages",
    `${templateEventId}-${pageType}.html`,
  );
  const targetPath = path.join(
    projectRoot,
    "pages",
    `${eventId}-${pageType}.html`,
  );

  if (!fs.existsSync(templatePath)) {
    console.log(`  ❌ Template not found: ${templateEventId}-${pageType}.html`);
    return false;
  }

  // Read template content
  let content = fs.readFileSync(templatePath, "utf8");

  // Replace template event ID with new event ID
  content = content.replace(new RegExp(templateEventId, "g"), eventId);

  // Update title and meta descriptions to reflect new event
  const eventDisplayName = eventId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  content = content.replace(
    /title>(.*?) - (.*?) - A Lo Cubano</,
    `title>$1 - ${eventDisplayName} - A Lo Cubano<`,
  );

  content = content.replace(
    /meta name="description" content="(.*?)"/,
    `meta name="description" content="Coming Soon! $1 for ${eventDisplayName}."`,
  );

  // Update hero image references
  content = content.replace(
    new RegExp(`${templateEventId}-hero`, "g"),
    `${eventId}-hero`,
  );

  // Write the new file
  fs.writeFileSync(targetPath, content, "utf8");
  console.log(`  ✅ Created ${eventId}-${pageType}.html`);

  return true;
}

/**
 * Update gallery cache configuration
 */
function updateGalleryCacheConfig(eventId) {
  console.log(`🔧 Updating gallery cache configuration...`);

  const cacheScriptPath = path.join(
    projectRoot,
    "scripts",
    "generate-gallery-cache.js",
  );
  let content = fs.readFileSync(cacheScriptPath, "utf8");

  // Add new event to EVENT_GALLERY_CONFIG
  const configMatch = content.match(
    /(const EVENT_GALLERY_CONFIG = \{[\s\S]*?)\s*\/\/ Add future events here as needed/,
  );
  if (configMatch) {
    const newConfig =
      configMatch[1] +
      `  '${eventId}': null, // To be configured when folder is available\n  // Add future events here as needed`;
    content = content.replace(configMatch[0], newConfig);

    fs.writeFileSync(cacheScriptPath, content, "utf8");
    console.log(`  ✅ Added ${eventId} to gallery cache configuration`);
  } else {
    console.log(
      `  ⚠️  Could not update gallery cache configuration automatically`,
    );
  }
}

/**
 * Update hero preload configuration
 */
function updateHeroPreloadConfig(eventId) {
  console.log(`🔧 Updating hero preload configuration...`);

  const preloadScriptPath = path.join(
    projectRoot,
    "scripts",
    "update-hero-preloads.cjs",
  );
  let content = fs.readFileSync(preloadScriptPath, "utf8");

  // Add new event to EVENT_HERO_MAPPING
  const heroMappingMatch = content.match(
    /(const EVENT_HERO_MAPPING = \{[\s\S]*?)\s*\/\/ Add more as needed\.\.\./,
  );
  if (heroMappingMatch) {
    const newMapping =
      heroMappingMatch[1] +
      `  '${eventId}': '/images/hero/${eventId}-hero.jpg',\n  // Add more as needed...`;
    content = content.replace(heroMappingMatch[0], newMapping);
  }

  // Add event pages to EVENT_PAGE_MAPPING
  const pageMappingMatch = content.match(
    /(\/\/ Future event-specific pages[\s\S]*?)(,\s*};)/,
  );
  if (pageMappingMatch) {
    const eventPages = EVENT_PAGE_TYPES.map(
      (pageType) => `  '${eventId}-${pageType}': '${eventId}'`,
    ).join(",\n");

    const newPageMapping =
      pageMappingMatch[1] + `,\n${eventPages}` + pageMappingMatch[2];
    content = content.replace(pageMappingMatch[0], newPageMapping);
  }

  fs.writeFileSync(preloadScriptPath, content, "utf8");
  console.log(`  ✅ Updated hero preload configuration for ${eventId}`);
}

/**
 * Create gallery data placeholder
 */
function createGalleryDataPlaceholder(eventId) {
  console.log(`📸 Creating gallery data placeholder...`);

  const galleryDataDir = path.join(projectRoot, "public", "gallery-data");
  if (!fs.existsSync(galleryDataDir)) {
    fs.mkdirSync(galleryDataDir, { recursive: true });
  }

  // Check if Google Drive secrets are available to determine if this should be a placeholder
  const hasGoogleDriveSecrets = 
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && 
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_GALLERY_FOLDER_ID;

  const placeholderData = {
    eventId,
    event: eventId,
    items: [],
    totalCount: 0,
    categories: { workshops: [], socials: [], other: [] },
    hasMore: false,
    cacheTimestamp: new Date().toISOString(),
  };

  // Only set isPlaceholder and message when Google Drive secrets are not available
  if (!hasGoogleDriveSecrets) {
    placeholderData.isPlaceholder = true;
    placeholderData.message = "Placeholder data - Google Drive credentials not available";
  } else {
    // When secrets are available, this is just an empty cache that will be populated
    placeholderData.message = "Empty event gallery cache - to be populated when Google Drive folder is configured";
  }

  const outputPath = path.join(galleryDataDir, `${eventId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(placeholderData, null, 2));
  console.log(`  ✅ Created gallery data placeholder: ${eventId}.json`);
  console.log(`      Placeholder mode: ${!hasGoogleDriveSecrets ? 'true (no Google Drive secrets)' : 'false (secrets available)'}`);
}

/**
 * Main function to create a new event
 */
function createNewEvent(eventId, templateEventId = DEFAULT_TEMPLATE) {
  console.log(`🎭 Creating new event: ${eventId}`);
  console.log(`📋 Using template: ${templateEventId}\n`);

  // Validate event ID format
  if (!eventId || !eventId.match(/^[a-z0-9-]+$/)) {
    console.error(
      "❌ Invalid event ID. Use lowercase letters, numbers, and hyphens only.",
    );
    process.exit(1);
  }

  // Check if event already exists
  const existingPage = path.join(
    projectRoot,
    "pages",
    `${eventId}-artists.html`,
  );
  if (fs.existsSync(existingPage)) {
    console.error(`❌ Event ${eventId} already exists!`);
    process.exit(1);
  }

  // Check if template exists
  const templatePage = path.join(
    projectRoot,
    "pages",
    `${templateEventId}-artists.html`,
  );
  if (!fs.existsSync(templatePage)) {
    console.error(`❌ Template event ${templateEventId} not found!`);
    process.exit(1);
  }

  try {
    // Create hero images
    const futureHeroNumber = getNextFutureHeroNumber();
    createHeroImages(eventId, futureHeroNumber);

    // Create event pages
    let allPagesCreated = true;
    EVENT_PAGE_TYPES.forEach((pageType) => {
      if (!createEventPage(eventId, pageType, templateEventId)) {
        allPagesCreated = false;
      }
    });

    if (!allPagesCreated) {
      console.log("⚠️  Some pages could not be created from template");
    }

    // Update configurations
    updateGalleryCacheConfig(eventId);
    updateHeroPreloadConfig(eventId);

    // Create gallery data placeholder
    createGalleryDataPlaceholder(eventId);

    console.log("\n🎉 Event creation completed!");
    console.log("📋 Next steps:");
    console.log(`   1. Update hero images in /images/hero/${eventId}-hero.jpg`);
    console.log(
      `   2. Configure Google Drive folder ID in scripts/generate-gallery-cache.js`,
    );
    console.log(`   3. Update event details in the HTML pages`);
    console.log(`   4. Add navigation links if needed`);
    console.log(`   5. Run npm run verify-structure to validate`);
  } catch (error) {
    console.error("❌ Error creating event:", error.message);
    process.exit(1);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(
      "Usage: node scripts/create-new-event.js <event-id> [--template=event-id]",
    );
    console.log("");
    console.log("Examples:");
    console.log("  node scripts/create-new-event.js salsa-fest-2027");
    console.log(
      "  node scripts/create-new-event.js weekender-2027-03 --template=weekender-2026-09",
    );
    console.log("");
    console.log(
      "Event ID should use lowercase letters, numbers, and hyphens only.",
    );
    process.exit(0);
  }

  const eventId = args[0];
  let templateEventId = DEFAULT_TEMPLATE;

  // Parse template argument
  const templateArg = args.find((arg) => arg.startsWith("--template="));
  if (templateArg) {
    templateEventId = templateArg.split("=")[1];
  }

  return { eventId, templateEventId };
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  const { eventId, templateEventId } = parseArgs();
  createNewEvent(eventId, templateEventId);
}

export { createNewEvent, getNextFutureHeroNumber };
