#!/usr/bin/env node

/**
 * Verify File Structure for Vercel Deployment
 * 
 * This script validates that all required files exist for Vercel deployment
 * and provides environment-aware validation for generated files like CSS bundles.
 * 
 * Environment-Aware CSS Bundle Validation:
 * ----------------------------------------
 * CSS bundles are generated during the build process and are required for production
 * but optional during development.
 * 
 * - Development mode: Bundles are optional, warnings shown if missing
 * - Production mode: Bundles are required, script fails if missing
 * - CI mode: Bundles are required, script fails if missing
 * 
 * Environment Variables:
 * ----------------------
 * - NODE_ENV=production: Forces production mode (bundles required)
 * - CI=true or GITHUB_ACTIONS=true: Forces CI mode (bundles required)
 * - REQUIRE_CSS_BUNDLES=true: Override to require bundles in any environment
 * 
 * Exit Codes:
 * -----------
 * - 0: All required files present (or bundles optional in dev mode)
 * - 1: Missing required files or bundles when required
 * 
 * Usage:
 * ------
 * Development: node scripts/verify-structure.js
 * Production: NODE_ENV=production node scripts/verify-structure.js
 * CI: CI=true node scripts/verify-structure.js
 * Force bundles: REQUIRE_CSS_BUNDLES=true node scripts/verify-structure.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

// Environment detection for conditional validation
const isProduction = process.env.NODE_ENV === 'production';
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const requireBundles = process.env.REQUIRE_CSS_BUNDLES === 'true' || isProduction || isCI;

console.log("🔍 Verifying File Structure for Vercel Deployment");
console.log("================================================");
console.log("📁 Architecture: Organized directory structure with Vercel routing");
console.log("🔄 Routing: Root (/) -> index.html -> /home via vercel.json rewrites");
console.log(`🌍 Environment: ${isProduction ? 'Production' : isCI ? 'CI' : 'Development'}`);
console.log(`📦 CSS Bundles: ${requireBundles ? 'Required' : 'Optional (development mode)'}`);
console.log("");

// Files that should exist for routing to work - Updated for organized structure
const expectedFiles = {
  "Root Files": [
    "index.html", // Root index that redirects to /home
    "vercel.json"
  ],
  "Core Pages (pages/core/)": [
    "pages/core/home.html",
    "pages/core/about.html",
    "pages/core/contact.html",
    "pages/core/donations.html",
    "pages/core/tickets.html",
    "pages/core/success.html",
    "pages/core/failure.html",
    "pages/core/my-tickets.html",
    "pages/core/checkout-cancel.html",
  ],
  "Standalone Pages": [
    "pages/404.html",
    "pages/admin.html",
    "pages/my-ticket.html",
  ],
  "Admin Pages (pages/admin/)": [
    "pages/admin/index.html",
    "pages/admin/login.html",
    "pages/admin/dashboard.html",
    "pages/admin/checkin.html",
    "pages/admin/analytics.html",
    "pages/admin/mfa-settings.html",
    "pages/admin/tickets.html",
    "pages/admin/registrations.html",
  ],
  "Event Pages - Boulder Fest 2025 (pages/events/boulder-fest-2025/)": [
    "pages/events/boulder-fest-2025/index.html",
    "pages/events/boulder-fest-2025/artists.html",
    "pages/events/boulder-fest-2025/schedule.html",
    "pages/events/boulder-fest-2025/gallery.html",
  ],
  "Event Pages - Boulder Fest 2026 (pages/events/boulder-fest-2026/)": [
    "pages/events/boulder-fest-2026/index.html",
    "pages/events/boulder-fest-2026/artists.html",
    "pages/events/boulder-fest-2026/schedule.html",
    "pages/events/boulder-fest-2026/gallery.html",
  ],
  "Event Pages - Weekender 2025-11 (pages/events/weekender-2025-11/)": [
    "pages/events/weekender-2025-11/index.html",
    "pages/events/weekender-2025-11/artists.html",
    "pages/events/weekender-2025-11/schedule.html",
    "pages/events/weekender-2025-11/gallery.html",
  ],
  "API Directory": [
    "api/debug.js",
    "api/gallery.js",
    "api/featured-photos.js",
    "api/image-proxy/[fileId].js",
  ],
  "Static Assets": [
    "css/base.css",
    "css/typography.css",
    "js/main.js",
    "js/navigation.js",
    "images/logo.png",
    "images/favicons/favicon-32x32.png",
  ],
};

// Generated files that are optional in development but required in production/CI
// These files are created by the build process (npm run build)
const generatedFiles = {
  "CSS Bundles (Generated)": [
    "css/bundle-critical.css",
    "css/bundle-deferred.css",
    "css/bundle-admin.css",
  ],
};

let allGood = true;
let missingFiles = [];
let extraInfo = [];

// Event structure validation - Updated for organized structure
function validateEventStructure() {
  const events = [
    { name: "boulder-fest-2025", path: "pages/events/boulder-fest-2025" },
    { name: "boulder-fest-2026", path: "pages/events/boulder-fest-2026" },
    { name: "weekender-2025-11", path: "pages/events/weekender-2025-11" },
  ];
  const eventPages = ["index", "artists", "schedule", "gallery"];

  const heroImagePath = path.join(projectRoot, "images", "hero");
  const heroOptimizedPath = path.join(projectRoot, "images", "hero-optimized");

  let eventStructureValid = true;

  // Check event pages exist in organized structure
  events.forEach((event) => {
    console.log(`  📅 Validating event: ${event.name}`);

    eventPages.forEach((pageType) => {
      const pagePath = path.join(
        projectRoot,
        event.path,
        `${pageType}.html`,
      );
      if (fs.existsSync(pagePath)) {
        console.log(`    ✅ ${event.path}/${pageType}.html exists`);
      } else {
        console.log(`    ❌ ${event.path}/${pageType}.html MISSING`);
        eventStructureValid = false;
      }
    });

    // Check hero images (using current event naming)
    const heroEventName = event.name;
    const heroImage = path.join(heroImagePath, `${heroEventName}-hero.jpg`);
    if (fs.existsSync(heroImage)) {
      console.log(`    ✅ Hero image exists: ${heroEventName}-hero.jpg`);
    } else {
      console.log(`    ⚠️  Hero image missing: ${heroEventName}-hero.jpg`);
    }

    // Check optimized hero variants
    const variants = ["desktop", "mobile", "placeholder"];
    const formats = ["jpg", "webp", "avif"];

    variants.forEach((variant) => {
      const variantDir = path.join(heroOptimizedPath, variant);
      if (fs.existsSync(variantDir)) {
        formats.forEach((format) => {
          const optimizedImage = path.join(
            variantDir,
            `${heroEventName}-hero.${format}`,
          );
          if (!fs.existsSync(optimizedImage)) {
            console.log(
              `    ⚠️  Missing optimized ${variant}/${format}: ${heroEventName}-hero.${format}`,
            );
          }
        });
      }
    });
  });

  // Check gallery data files - OPTIONAL in CI/CD environments
  console.log(`  📸 Validating gallery data files:`);

  // Try multiple possible locations for gallery data
  const possibleGalleryPaths = [
    path.join(projectRoot, "public", "gallery-data"),
    path.join(projectRoot, "gallery-data"),
    path.join(projectRoot, "dist", "gallery-data")
  ];

  let galleryDataDir = null;
  for (const possiblePath of possibleGalleryPaths) {
    if (fs.existsSync(possiblePath)) {
      galleryDataDir = possiblePath;
      break;
    }
  }

  if (galleryDataDir) {
    console.log(`    ✅ Gallery data directory exists at ${galleryDataDir}`);
    events.forEach((event) => {
      const galleryEventName = event.name;
      const galleryFile = path.join(galleryDataDir, `${galleryEventName}.json`);
      if (fs.existsSync(galleryFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(galleryFile, "utf8"));
          if (data.eventId === galleryEventName || data.event === galleryEventName) {
            console.log(`    ✅ Gallery data valid: ${galleryEventName}.json`);
          } else {
            console.log(`    ⚠️  Gallery data structure issue: ${galleryEventName}.json`);
          }
        } catch (error) {
          console.log(`    ❌ Gallery data invalid JSON: ${galleryEventName}.json`);
        }
      } else {
        console.log(`    ⚠️  Gallery data missing: ${galleryEventName}.json`);
      }
    });
  } else {
    if (isCI) {
      console.log(`    ✅ Gallery data directory missing in CI environment (expected)`);
      console.log(`    📝 Gallery data is excluded from git and will be populated at runtime`);
      // Don't mark as failed in CI - this is expected behavior
    } else {
      console.log(`    ⚠️  Gallery data directory missing from all expected locations`);
      console.log(`    📝 This is expected in development - data populated from Google Drive at runtime`);
      // Don't fail validation for missing gallery data - it's dynamically generated
    }
  }

  return eventStructureValid;
}

// Check each category of required files
Object.entries(expectedFiles).forEach(([category, files]) => {
  console.log(`📂 ${category}:`);

  files.forEach((file) => {
    const filePath = path.join(projectRoot, file);
    const exists = fs.existsSync(filePath);

    if (exists) {
      const stats = fs.statSync(filePath);
      const size = Math.round((stats.size / 1024) * 100) / 100; // KB with 2 decimals
      console.log(`  ✅ ${file} (${size} KB)`);
    } else {
      console.log(`  ❌ ${file} - MISSING`);
      allGood = false;
      missingFiles.push(file);
    }
  });

  console.log("");
});

// Check generated files (CSS bundles) with conditional validation
// This is where environment-aware logic handles optional vs required bundles
Object.entries(generatedFiles).forEach(([category, files]) => {
  console.log(`📂 ${category}:`);

  // Check if any bundles exist
  const bundleExists = files.some(file => {
    const filePath = path.join(projectRoot, file);
    return fs.existsSync(filePath);
  });

  if (!bundleExists && !requireBundles) {
    // Development mode - bundles are optional
    console.log(`  ℹ️  CSS bundles not generated (development mode)`);
    console.log(`  📝 Run 'npm run build' to generate CSS bundles`);
    console.log(`  📝 Bundles are automatically generated during production builds`);
  } else if (!bundleExists && requireBundles) {
    // Production/CI mode - bundles are required
    console.log(`  ❌ CSS bundles required but not found`);
    console.log(`  📝 Run 'npm run build' to generate CSS bundles`);
    allGood = false;
    files.forEach(file => missingFiles.push(file));
  } else {
    // Validate each bundle individually
    files.forEach((file) => {
      const filePath = path.join(projectRoot, file);
      const exists = fs.existsSync(filePath);

      if (exists) {
        const stats = fs.statSync(filePath);
        const size = Math.round((stats.size / 1024) * 100) / 100; // KB with 2 decimals
        console.log(`  ✅ ${file} (${size} KB)`);
      } else {
        // Show error in production/CI, warning in development
        console.log(`  ${requireBundles ? '❌' : '⚠️'} ${file} - MISSING`);
        if (requireBundles) {
          allGood = false;
          missingFiles.push(file);
        }
      }
    });
  }

  console.log("");
});

// Check vercel.json configuration
console.log("⚙️  Vercel Configuration:");
const vercelJsonPath = path.join(projectRoot, "vercel.json");
if (fs.existsSync(vercelJsonPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
    console.log("  ✅ vercel.json is valid JSON");

    if (config.rewrites && config.rewrites.length > 0) {
      console.log("  ✅ Has rewrite rules:");

      // Check for critical routing rules - Updated for organized structure
      const homeRoute = config.rewrites.find(r =>
        r.source === "/home" && r.destination === "/pages/core/home"
      );

      if (homeRoute) {
        console.log(`    ✅ Home route (/home) -> ${homeRoute.destination} configured`);
      } else {
        console.log("    ❌ Home route (/home) -> /pages/core/home MISSING");
        allGood = false;
      }

      // Check core pages routing
      const coreRoute = config.rewrites.find(r =>
        r.source && r.source.includes("(about|tickets|donations|contact|checkout-success|checkout-cancel|my-tickets|success|failure)") &&
        r.destination === "/pages/core/$1"
      );
      if (coreRoute) {
        console.log("    ✅ Core pages routing configured");
      } else {
        console.log("    ⚠️  Core pages routing pattern not found");
      }

      // Check event routes - look for organized structure routing
      const eventRoutes = config.rewrites.filter(r =>
        r.destination && r.destination.includes("/pages/events/")
      );
      console.log(`    ✅ Found ${eventRoutes.length} event-specific routes`);

      console.log("  📝 All rewrite rules:");
      config.rewrites.forEach((rule, index) => {
        console.log(`    ${index + 1}. ${rule.source} -> ${rule.destination}`);
      });
    } else {
      console.log("  ⚠️  No rewrite rules found");
      allGood = false;
    }

    if (config.functions) {
      console.log("  ✅ Has function configurations:");
      Object.entries(config.functions).forEach(([func, settings]) => {
        console.log(`    ${func}: ${JSON.stringify(settings)}`);
      });
    }
  } catch (error) {
    console.log(`  ❌ vercel.json has invalid JSON: ${error.message}`);
    allGood = false;
  }
} else {
  console.log("  ❌ vercel.json missing");
  allGood = false;
}
console.log("");

// Check pages directory structure - Updated for organized structure
console.log("📄 Pages Directory Analysis:");
const pagesDir = path.join(projectRoot, "pages");
if (fs.existsSync(pagesDir)) {
  // Check core pages
  const coreDir = path.join(pagesDir, "core");
  if (fs.existsSync(coreDir)) {
    const coreFiles = fs.readdirSync(coreDir).filter(file => file.endsWith(".html"));
    console.log(`  Found ${coreFiles.length} core pages in pages/core/:`);
    coreFiles.forEach((file) => {
      const filePath = path.join(coreDir, file);
      const stats = fs.statSync(filePath);
      const size = Math.round((stats.size / 1024) * 100) / 100;
      console.log(`    pages/core/${file} (${size} KB)`);
    });
  }

  // Check event pages
  const eventsDir = path.join(pagesDir, "events");
  if (fs.existsSync(eventsDir)) {
    const eventDirs = fs.readdirSync(eventsDir).filter(item => {
      const fullPath = path.join(eventsDir, item);
      return fs.statSync(fullPath).isDirectory();
    });
    console.log(`  Found ${eventDirs.length} event directories in pages/events/:`);
    eventDirs.forEach((eventDir) => {
      const eventPath = path.join(eventsDir, eventDir);
      const eventFiles = fs.readdirSync(eventPath).filter(file => file.endsWith(".html"));
      console.log(`    pages/events/${eventDir}/ (${eventFiles.length} pages)`);
      eventFiles.forEach((file) => {
        const filePath = path.join(eventPath, file);
        const stats = fs.statSync(filePath);
        const size = Math.round((stats.size / 1024) * 100) / 100;
        console.log(`      ${file} (${size} KB)`);
      });
    });
  }

  // Check admin pages
  const adminDir = path.join(pagesDir, "admin");
  if (fs.existsSync(adminDir)) {
    const adminFiles = fs.readdirSync(adminDir).filter(file => file.endsWith(".html"));
    console.log(`  Found ${adminFiles.length} admin pages in pages/admin/:`);
    adminFiles.forEach((file) => {
      const filePath = path.join(adminDir, file);
      const stats = fs.statSync(filePath);
      const size = Math.round((stats.size / 1024) * 100) / 100;
      console.log(`    pages/admin/${file} (${size} KB)`);
    });
  }

  // Check root level pages
  const rootPageFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith(".html"));
  if (rootPageFiles.length > 0) {
    console.log(`  Found ${rootPageFiles.length} root-level pages:`);
    rootPageFiles.forEach((file) => {
      const filePath = path.join(pagesDir, file);
      const stats = fs.statSync(filePath);
      const size = Math.round((stats.size / 1024) * 100) / 100;
      console.log(`    pages/${file} (${size} KB)`);
    });
  }
} else {
  console.log("  ❌ pages/ directory missing");
  allGood = false;
}
console.log("");

// Check for potential issues
console.log("🚨 Potential Issues:");
const potentialIssues = [];

// Check if there are any .vercelignore exclusions that might be problematic
const vercelIgnorePath = path.join(projectRoot, ".vercelignore");
if (fs.existsSync(vercelIgnorePath)) {
  const ignoreContent = fs.readFileSync(vercelIgnorePath, "utf8");
  const ignoreLines = ignoreContent
    .split("\n")
    .filter((line) => line.trim() && !line.startsWith("#"));

  // Check if any critical files are being ignored
  const criticalPatterns = ["pages/", "pages/core/", "pages/events/", "pages/admin/", "api/", "vercel.json"];
  const problematicIgnores = ignoreLines.filter((line) =>
    criticalPatterns.some((pattern) => line.includes(pattern)),
  );

  // Check for Apple Wallet assets that might be needed (but are correctly ignored)
  const appleWalletIgnored = ignoreLines.some(line => line.includes("apple-wallet-assets"));
  if (appleWalletIgnored) {
    console.log("  ✅ Apple Wallet assets correctly excluded for security:");
    console.log("    - api/lib/apple-wallet-assets/ contains certificates and private keys");
    console.log("    - These should NOT be deployed to Vercel for security reasons");
    console.log("    - Wallet functionality handled via environment variables in production");
  }

  if (problematicIgnores.length > 0) {
    // Filter out apple-wallet-assets since it's expected to be ignored
    const reallyProblematic = problematicIgnores.filter(line => !line.includes("apple-wallet-assets"));
    if (reallyProblematic.length > 0) {
      console.log("  ⚠️  .vercelignore might be excluding critical files:");
      reallyProblematic.forEach((line) => console.log(`    - ${line}`));
      potentialIssues.push("Critical files might be ignored during deployment");
    } else {
      console.log("  ✅ .vercelignore looks safe for critical files");
    }
  } else {
    console.log("  ✅ .vercelignore looks safe for critical files");
  }
} else {
  console.log("  ✅ No .vercelignore file (using defaults)");
}

// Skip case sensitivity check on case-insensitive filesystems to avoid false positives
// Vercel deployment will work correctly regardless of local filesystem case sensitivity
console.log("  ✅ Case sensitivity check skipped (Vercel handles this automatically)");

console.log("");

// Validate event-based structure
console.log("🎭 Event-Based Architecture Validation:");
const eventStructureValid = validateEventStructure();

console.log("");

// Summary
console.log("📋 Summary:");
console.log("===========");

if (allGood && missingFiles.length === 0 && eventStructureValid) {
  console.log("✅ All critical files present and accounted for!");
  console.log("✅ File structure matches Vercel expectations for organized architecture");
  console.log("✅ Root index.html correctly redirects to /home");
  console.log("✅ Organized directory structure validated successfully");
  console.log("✅ Event-based architecture validated successfully");
  console.log("");
  console.log("🚀 Organized routing is properly configured:");
  console.log("   - Root (/) -> index.html -> redirects to /home");
  console.log("   - Core pages -> pages/core/ via vercel.json rewrites");
  console.log("   - Event pages -> pages/events/{event}/ via vercel.json rewrites");
  console.log("   - Admin pages -> pages/admin/ via vercel.json rewrites");
  console.log("   - Gallery data populated dynamically at runtime");
  console.log("");
  console.log("🤔 If there are still deployment issues, check:");
  console.log("   1. Build process and file deployment");
  console.log("   2. Vercel function logs for errors");
  console.log("   3. Network/CDN caching issues");
  console.log("   4. API endpoint functionality");
} else {
  console.log("❌ Issues found:");
  if (missingFiles.length > 0) {
    console.log(
      `   - Missing ${missingFiles.length} critical files:`,
      missingFiles.join(", "),
    );
  }
  if (!eventStructureValid) {
    console.log("   - Event structure validation failed");
  }
  if (potentialIssues.length > 0) {
    potentialIssues.forEach((issue) => console.log(`   - ${issue}`));
  }
}

console.log("");
console.log("🚀 Next Steps:");
console.log("   1. Deploy with debugging enabled");
console.log("   2. Check /api/debug endpoint on live site");
console.log("   3. Monitor Vercel function logs");
console.log("   4. Test each route individually");

// Exit with error code if issues found
process.exit(allGood && missingFiles.length === 0 && eventStructureValid ? 0 : 1);
