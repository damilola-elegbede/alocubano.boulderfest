#!/usr/bin/env node

/**
 * Fix Import Paths Script
 * Corrects import paths for simple-helpers based on file location
 */

import { promises as fs } from "fs";
import { join } from "path";

class ImportPathFixer {
  async fixAllImportPaths() {
    console.log("🔧 Fixing import paths...");

    const testFiles = await this.findTestFiles();
    let fixedCount = 0;

    for (const filepath of testFiles) {
      const wasFixed = await this.fixFileImportPaths(filepath);
      if (wasFixed) {
        fixedCount++;
        console.log(`✅ Fixed import paths in ${filepath}`);
      }
    }

    console.log(
      `\n🎉 Import path fixing completed! Fixed ${fixedCount} files.`,
    );
  }

  async findTestFiles() {
    const testFiles = [];

    async function scanDirectory(dir) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);

          if (entry.isDirectory()) {
            await scanDirectory(fullPath);
          } else if (entry.name.endsWith(".js")) {
            testFiles.push(fullPath);
          }
        }
      } catch (error) {
        // Skip directories that don't exist or can't be read
      }
    }

    await scanDirectory("tests");
    return testFiles;
  }

  async fixFileImportPaths(filepath) {
    try {
      let content = await fs.readFile(filepath, "utf8");
      const originalContent = content;

      // Determine correct import path based on file location
      const correctPath = this.getCorrectImportPath(filepath);

      // Fix the import path if it's wrong
      const wrongPaths = [
        '"../helpers/simple-helpers.js"',
        "'../helpers/simple-helpers.js'",
        '"../../helpers/simple-helpers.js"',
        "'../../helpers/simple-helpers.js'",
        '"/helpers/simple-helpers.js"',
        '"/tests/helpers/simple-helpers.js"',
      ];

      for (const wrongPath of wrongPaths) {
        if (content.includes(wrongPath)) {
          content = content.replace(
            new RegExp(wrongPath, "g"),
            `"${correctPath}"`,
          );
        }
      }

      // Only write if content changed
      if (content !== originalContent) {
        await fs.writeFile(filepath, content);
        return true;
      }

      return false;
    } catch (error) {
      console.error(
        `❌ Failed to fix import paths in ${filepath}:`,
        error.message,
      );
      return false;
    }
  }

  getCorrectImportPath(filepath) {
    // Convert to normalized path with forward slashes
    const normalizedPath = filepath.replace(/\\/g, "/");

    if (normalizedPath.includes("/tests/unit/")) {
      return "../helpers/simple-helpers.js";
    } else if (normalizedPath.includes("/tests/config/")) {
      return "../helpers/simple-helpers.js";
    } else if (normalizedPath.includes("/tests/utils/")) {
      return "../helpers/simple-helpers.js";
    } else if (
      normalizedPath.includes("/tests/") &&
      !normalizedPath.includes("/tests/")
    ) {
      return "./helpers/simple-helpers.js";
    } else {
      // Default for files directly in tests/
      return "./helpers/simple-helpers.js";
    }
  }
}

async function main() {
  const fixer = new ImportPathFixer();
  await fixer.fixAllImportPaths();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("💥 Import path fix failed:", error);
    process.exit(1);
  });
}

export { ImportPathFixer };
