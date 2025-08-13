#!/usr/bin/env node

// Verify file structure matches Vercel expectations
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");

console.log("🔍 Verifying File Structure for Vercel Deployment");
console.log("================================================");
console.log("📁 Architecture: Pages-based (index.html in pages/ directory)");
console.log("🔄 Routing: Root (/) -> pages/index.html via vercel.json rewrites");
console.log("");

// Files that should exist for routing to work
const expectedFiles = {
  "Root Files": ["vercel.json"],
  "Core Pages": [
    "pages/index.html",
    "pages/404.html",
    "pages/home.html",
    "pages/about.html",
    "pages/contact.html",
    "pages/donations.html",
    "pages/tickets.html",
    "pages/success.html",
    "pages/failure.html",
    "pages/my-ticket.html",
    "pages/my-tickets.html",
    "pages/checkout-success.html",
    "pages/checkout-cancel.html",
    "pages/admin.html",
  ],
  "Admin Pages": [
    "pages/admin/index.html",
    "pages/admin/login.html",
    "pages/admin/dashboard.html",
    "pages/admin/checkin.html",
    "pages/admin/analytics.html",
    "pages/admin/mfa-settings.html",
  ],
  "Event Pages - Boulder Fest 2025": [
    "pages/boulder-fest-2025-index.html",
    "pages/boulder-fest-2025-artists.html",
    "pages/boulder-fest-2025-schedule.html",
    "pages/boulder-fest-2025-gallery.html",
  ],
  "Event Pages - Boulder Fest 2026": [
    "pages/boulder-fest-2026-index.html",
    "pages/boulder-fest-2026-artists.html",
    "pages/boulder-fest-2026-schedule.html",
    "pages/boulder-fest-2026-gallery.html",
  ],
  "Event Pages - Weekender 2026-09": [
    "pages/weekender-2026-09-index.html",
    "pages/weekender-2026-09-artists.html",
    "pages/weekender-2026-09-schedule.html",
    "pages/weekender-2026-09-gallery.html",
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

let allGood = true;
let missingFiles = [];
let extraInfo = [];

// Event structure validation
function validateEventStructure() {
  const events = [
    "boulder-fest-2025",
    "boulder-fest-2026",
    "weekender-2026-09",
  ];
  const eventPages = ["index", "artists", "schedule", "gallery"];

  const heroImagePath = path.join(projectRoot, "images", "hero");
  const heroOptimizedPath = path.join(projectRoot, "images", "hero-optimized");

  let eventStructureValid = true;

  // Check event pages exist
  events.forEach((event) => {
    console.log(`  📅 Validating event: ${event}`);

    eventPages.forEach((pageType) => {
      const pagePath = path.join(
        projectRoot,
        "pages",
        `${event}-${pageType}.html`,
      );
      if (fs.existsSync(pagePath)) {
        console.log(`    ✅ ${event}-${pageType}.html exists`);
      } else {
        console.log(`    ❌ ${event}-${pageType}.html MISSING`);
        eventStructureValid = false;
      }
    });

    // Check hero images
    const heroImage = path.join(heroImagePath, `${event}-hero.jpg`);
    if (fs.existsSync(heroImage)) {
      console.log(`    ✅ Hero image exists: ${event}-hero.jpg`);
    } else {
      console.log(`    ⚠️  Hero image missing: ${event}-hero.jpg`);
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
            `${event}-hero.${format}`,
          );
          if (!fs.existsSync(optimizedImage)) {
            console.log(
              `    ⚠️  Missing optimized ${variant}/${format}: ${event}-hero.${format}`,
            );
          }
        });
      }
    });
  });

  // Check gallery data files
  console.log(`  📸 Validating gallery data files:`);
  const galleryDataDir = path.join(projectRoot, "public", "gallery-data");
  if (fs.existsSync(galleryDataDir)) {
    events.forEach((event) => {
      const galleryFile = path.join(galleryDataDir, `${event}.json`);
      if (fs.existsSync(galleryFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(galleryFile, "utf8"));
          if (data.eventId === event || data.event === event) {
            console.log(`    ✅ Gallery data valid: ${event}.json`);
          } else {
            console.log(`    ⚠️  Gallery data structure issue: ${event}.json`);
          }
        } catch (error) {
          console.log(`    ❌ Gallery data invalid JSON: ${event}.json`);
        }
      } else {
        console.log(`    ⚠️  Gallery data missing: ${event}.json`);
      }
    });
  } else {
    console.log(`    ❌ Gallery data directory missing: ${galleryDataDir}`);
  }

  return eventStructureValid;
}

// Check each category
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

// Check vercel.json configuration
console.log("⚙️  Vercel Configuration:");
const vercelJsonPath = path.join(projectRoot, "vercel.json");
if (fs.existsSync(vercelJsonPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));
    console.log("  ✅ vercel.json is valid JSON");

    if (config.rewrites && config.rewrites.length > 0) {
      console.log("  ✅ Has rewrite rules:");
      
      // Check for critical routing rules
      const rootRoute = config.rewrites.find(r => r.source === "/" && r.destination === "/pages/index.html");
      const indexRoute = config.rewrites.find(r => r.source === "/index.html" && r.destination === "/pages/index.html");
      
      if (rootRoute) {
        console.log("    ✅ Root route (/) -> pages/index.html configured");
      } else {
        console.log("    ❌ Root route (/) -> pages/index.html MISSING");
        allGood = false;
      }
      
      if (indexRoute) {
        console.log("    ✅ Index route (/index.html) -> pages/index.html configured");
      } else {
        console.log("    ⚠️  Index route (/index.html) -> pages/index.html missing");
      }
      
      const eventRoutes = config.rewrites.filter(r => 
        r.destination && r.destination.includes("pages/") && 
        (r.destination.includes("boulder-fest") || r.destination.includes("weekender"))
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

// Check pages directory structure
console.log("📄 Pages Directory Analysis:");
const pagesDir = path.join(projectRoot, "pages");
if (fs.existsSync(pagesDir)) {
  const pageFiles = fs
    .readdirSync(pagesDir)
    .filter((file) => file.endsWith(".html"));
  console.log(`  Found ${pageFiles.length} HTML pages:`);
  pageFiles.forEach((file) => {
    const filePath = path.join(pagesDir, file);
    const stats = fs.statSync(filePath);
    const size = Math.round((stats.size / 1024) * 100) / 100;
    console.log(`    ${file} (${size} KB)`);
  });
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
  const criticalPatterns = ["pages/", "pages/index.html", "api/", "vercel.json"];
  const problematicIgnores = ignoreLines.filter((line) =>
    criticalPatterns.some((pattern) => line.includes(pattern)),
  );

  if (problematicIgnores.length > 0) {
    console.log("  ⚠️  .vercelignore might be excluding critical files:");
    problematicIgnores.forEach((line) => console.log(`    - ${line}`));
    potentialIssues.push("Critical files might be ignored during deployment");
  } else {
    console.log("  ✅ .vercelignore looks safe");
  }
} else {
  console.log("  ✅ No .vercelignore file (using defaults)");
}

// Check for case sensitivity issues
const caseIssues = [];
if (process.platform !== "win32") {
  // Check for files that might have case issues
  const checkCases = ["VERCEL.JSON", "Vercel.json", "pages/INDEX.HTML", "pages/Index.html"];
  checkCases.forEach((file) => {
    if (fs.existsSync(path.join(projectRoot, file))) {
      caseIssues.push(file);
    }
  });
}

if (caseIssues.length > 0) {
  console.log("  ⚠️  Case sensitivity issues found:");
  caseIssues.forEach((file) => console.log(`    - ${file}`));
  potentialIssues.push("Case sensitivity issues detected");
} else {
  console.log("  ✅ No case sensitivity issues found");
}

console.log("");

// Validate event-based structure
console.log("🎭 Event-Based Architecture Validation:");
validateEventStructure();

console.log("");

// Summary
console.log("📋 Summary:");
console.log("===========");

if (allGood && missingFiles.length === 0) {
  console.log("✅ All critical files present and accounted for!");
  console.log("✅ File structure matches Vercel expectations for pages-based architecture");
  console.log("✅ Root route (/) correctly configured to serve pages/index.html");
  console.log("");
  console.log("🚀 Pages-based routing is properly configured:");
  console.log("   - Root (/) -> pages/index.html");
  console.log("   - Event routes -> pages/event-name-page.html");
  console.log("   - Static assets served from appropriate directories");
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
      `   - Missing ${missingFiles.length} files:`,
      missingFiles.join(", "),
    );
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
process.exit(allGood && missingFiles.length === 0 ? 0 : 1);
