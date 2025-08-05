#!/usr/bin/env node

/**
 * Event Hero Image Optimization Script
 *
 * This script optimizes event hero images using Sharp to create:
 * - Responsive variants: desktop (1920px), mobile (768px), placeholder (32px)
 * - Modern formats: WebP, AVIF with JPEG fallbacks
 * - 90% size reduction target (3.5MB → 350KB per variant)
 * - Support for dynamic processing of future-event-hero[N].jpg pattern
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration for image optimization
const OPTIMIZATION_CONFIG = {
  desktop: {
    width: 1920,
    quality: { webp: 85, avif: 80, jpeg: 90 },
  },
  mobile: {
    width: 768,
    quality: { webp: 80, avif: 75, jpeg: 85 },
  },
  placeholder: {
    width: 32,
    quality: { webp: 70, avif: 65, jpeg: 80 },
  },
};

// Event hero mapping according to the plan
const EVENT_HERO_MAPPING = {
  "boulder-fest-2025": "boulder-fest-2025-hero.jpg",
  "boulder-fest-2026": "boulder-fest-2026-hero.jpg",
  "weekender-2026-09": "weekender-2026-09-hero.jpg",
  // Future events use numbered hero images
  "future-event-1": "future-event-hero1.jpg",
  "future-event-2": "future-event-hero2.jpg",
  "future-event-3": "future-event-hero3.jpg",
  // Add more as needed...
};

/**
 * Get the next available future hero number
 * @returns {number} Next available future hero number
 */
function getNextFutureHeroNumber() {
  const futureHeroes = Object.values(EVENT_HERO_MAPPING)
    .filter((hero) => hero.startsWith("future-event-hero"))
    .map((hero) => parseInt(hero.match(/\d+/)[0]))
    .sort((a, b) => a - b);

  return futureHeroes.length > 0 ? Math.max(...futureHeroes) + 1 : 1;
}

/**
 * Get hero image for event page (simplified one-hero-per-event logic)
 * @param {string} event Event identifier
 * @param {string} page Page identifier (optional, not used in simplified logic)
 * @returns {string} Hero image filename
 */
function getHeroForEventPage(event, page = null) {
  return EVENT_HERO_MAPPING[event] || "hero-default.jpg";
}

/**
 * Get event hero image
 * @param {string} event Event identifier
 * @returns {string} Hero image filename
 */
function getEventHero(event) {
  return EVENT_HERO_MAPPING[event];
}

/**
 * Create output directory structure
 * @param {string} outputDir Base output directory
 */
function createOutputDirectories(outputDir) {
  const dirs = [
    path.join(outputDir, "desktop"),
    path.join(outputDir, "mobile"),
    path.join(outputDir, "placeholder"),
  ];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created directory: ${dir}`);
    }
  });
}

/**
 * Optimize a single image with multiple variants and formats
 * @param {string} inputPath Path to source image
 * @param {string} outputDir Output directory
 * @param {string} baseName Base filename (without extension)
 */
async function optimizeImage(inputPath, outputDir, baseName) {
  console.log(`🖼️  Processing: ${baseName}`);

  try {
    const originalStats = fs.statSync(inputPath);
    const originalSize = originalStats.size;
    console.log(
      `   Original size: ${(originalSize / 1024 / 1024).toFixed(2)} MB`,
    );

    let totalOptimizedSize = 0;

    // Process each variant (desktop, mobile, placeholder)
    for (const [variant, config] of Object.entries(OPTIMIZATION_CONFIG)) {
      console.log(`   Creating ${variant} variant...`);

      const variantDir = path.join(outputDir, variant);

      // Create Sharp instance for this variant
      const image = sharp(inputPath).resize(config.width, null, {
        withoutEnlargement: true,
        fit: "inside",
      });

      // Generate WebP
      const webpPath = path.join(variantDir, `${baseName}.webp`);
      await image
        .clone()
        .webp({ quality: config.quality.webp })
        .toFile(webpPath);
      const webpStats = fs.statSync(webpPath);
      totalOptimizedSize += webpStats.size;
      console.log(`     WebP: ${(webpStats.size / 1024).toFixed(2)} KB`);

      // Generate AVIF
      const avifPath = path.join(variantDir, `${baseName}.avif`);
      await image
        .clone()
        .avif({ quality: config.quality.avif })
        .toFile(avifPath);
      const avifStats = fs.statSync(avifPath);
      totalOptimizedSize += avifStats.size;
      console.log(`     AVIF: ${(avifStats.size / 1024).toFixed(2)} KB`);

      // Generate JPEG fallback
      const jpegPath = path.join(variantDir, `${baseName}.jpg`);
      await image
        .clone()
        .jpeg({ quality: config.quality.jpeg })
        .toFile(jpegPath);
      const jpegStats = fs.statSync(jpegPath);
      totalOptimizedSize += jpegStats.size;
      console.log(`     JPEG: ${(jpegStats.size / 1024).toFixed(2)} KB`);
    }

    // Calculate size reduction
    const reductionPercent = (
      ((originalSize - totalOptimizedSize) / originalSize) *
      100
    ).toFixed(1);
    console.log(
      `   Total optimized size: ${(totalOptimizedSize / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(`   Size reduction: ${reductionPercent}%`);

    return {
      original: originalSize,
      optimized: totalOptimizedSize,
      reduction: parseFloat(reductionPercent),
    };
  } catch (error) {
    console.error(`❌ Error processing ${baseName}:`, error.message);
    return null;
  }
}

/**
 * Find all event hero images in the hero directory
 * @param {string} heroDir Hero images directory
 * @returns {Array} Array of image files to process
 */
function findEventHeroImages(heroDir) {
  const allFiles = fs.readdirSync(heroDir);

  // Get event hero images (those that match our mapping or future-event-hero pattern)
  const eventHeroFiles = allFiles.filter((file) => {
    if (!file.endsWith(".jpg")) return false;

    // Check if it's in our EVENT_HERO_MAPPING
    const isEventHero = Object.values(EVENT_HERO_MAPPING).includes(file);

    // Check if it's a future-event-hero[N].jpg pattern
    const isFutureHero = /^future-event-hero\d+\.jpg$/.test(file);

    return isEventHero || isFutureHero;
  });

  console.log(`Found ${eventHeroFiles.length} event hero images:`);
  eventHeroFiles.forEach((file) => console.log(`  - ${file}`));

  return eventHeroFiles.map((file) => ({
    filename: file,
    path: path.join(heroDir, file),
    baseName: path.basename(file, ".jpg"),
  }));
}

/**
 * Main optimization function
 */
async function main() {
  console.log("🚀 Starting Event Hero Image Optimization");
  console.log("=========================================");

  const projectRoot = path.join(__dirname, "..");
  const heroDir = path.join(projectRoot, "images", "hero");
  const outputDir = path.join(projectRoot, "images", "hero-optimized");

  // Verify hero directory exists
  if (!fs.existsSync(heroDir)) {
    console.error("❌ Hero directory not found:", heroDir);
    process.exit(1);
  }

  // Create output directories
  createOutputDirectories(outputDir);

  // Find event hero images
  const eventHeroes = findEventHeroImages(heroDir);

  if (eventHeroes.length === 0) {
    console.log("ℹ️  No event hero images found to optimize");
    return;
  }

  // Process each image
  console.log("\n📸 Processing Images");
  console.log("====================");

  const results = [];
  for (const hero of eventHeroes) {
    const result = await optimizeImage(hero.path, outputDir, hero.baseName);
    if (result) {
      results.push({ name: hero.filename, ...result });
    }
    console.log(""); // Add spacing between images
  }

  // Summary
  console.log("📊 Optimization Summary");
  console.log("=======================");

  if (results.length > 0) {
    const totalOriginal = results.reduce((sum, r) => sum + r.original, 0);
    const totalOptimized = results.reduce((sum, r) => sum + r.optimized, 0);
    const avgReduction =
      results.reduce((sum, r) => sum + r.reduction, 0) / results.length;

    console.log(`Images processed: ${results.length}`);
    console.log(
      `Total original size: ${(totalOriginal / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(
      `Total optimized size: ${(totalOptimized / 1024 / 1024).toFixed(2)} MB`,
    );
    console.log(`Average size reduction: ${avgReduction.toFixed(1)}%`);

    // Check if we met the 90% reduction target
    if (avgReduction >= 90) {
      console.log("🎉 Achieved 90%+ size reduction target!");
    } else if (avgReduction >= 80) {
      console.log("✅ Good size reduction achieved");
    } else {
      console.log("⚠️  Size reduction below expected targets");
    }

    console.log("\nOptimized images created in:", outputDir);
    console.log("\nImage variants available:");
    console.log("  - desktop/ (1920px wide)");
    console.log("  - mobile/ (768px wide)");
    console.log("  - placeholder/ (32px wide)");
    console.log("\nFormats: WebP, AVIF, JPEG");
  }

  console.log("\n🎉 Optimization complete!");
}

// Export utility functions for use by other scripts
export {
  EVENT_HERO_MAPPING,
  getHeroForEventPage,
  getEventHero,
  getNextFutureHeroNumber,
  optimizeImage,
  findEventHeroImages,
};

// Run the script if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
}
