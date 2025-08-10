// Test suite for build scripts and ES module compatibility
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

describe("Build Scripts and ES Module Compatibility", () => {
  const scriptsDir = path.join(__dirname, "..", "..", "scripts");
  const packageJsonPath = path.join(__dirname, "..", "..", "package.json");

  describe("Package.json Configuration", () => {
    test("should have type module configured", () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      expect(packageJson.type).toBe("module");
    });

    test("should have prebuild script configured", () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      expect(packageJson.scripts.prebuild).toBeDefined();
      expect(packageJson.scripts.prebuild).toContain(
        "generate-gallery-cache.js",
      );
      expect(packageJson.scripts.prebuild).toContain(
        "generate-featured-photos.js",
      );
    });
  });

  describe("Script ES Module Syntax Validation", () => {
    test("generate-gallery-cache.js should use ES imports", () => {
      const scriptPath = path.join(scriptsDir, "generate-gallery-cache.js");
      const content = fs.readFileSync(scriptPath, "utf8");

      // Should NOT contain CommonJS require statements
      expect(content).not.toMatch(/const\s+.*\s*=\s*require\(/);
      expect(content).not.toMatch(/require\(['"`]/);

      // Should contain ES import statements
      expect(content).toMatch(/import\s+.*\s+from\s+['"`]/);
      expect(content).toMatch(/import\s+fs\s+from\s+['"`]fs['"`]/);
      expect(content).toMatch(/import\s+path\s+from\s+['"`]path['"`]/);
      expect(content).toMatch(
        /import\s+{\s*google\s*}\s+from\s+['"`]googleapis['"`]/,
      );
    });

    test("generate-featured-photos.js should use ES imports", () => {
      const scriptPath = path.join(scriptsDir, "generate-featured-photos.js");
      const content = fs.readFileSync(scriptPath, "utf8");

      // Should NOT contain CommonJS require statements
      expect(content).not.toMatch(/const\s+.*\s*=\s*require\(/);
      expect(content).not.toMatch(/require\(['"`]/);

      // Should contain ES import statements
      expect(content).toMatch(/import\s+.*\s+from\s+['"`]/);
      expect(content).toMatch(/import\s+fs\s+from\s+['"`]fs['"`]/);
      expect(content).toMatch(/import\s+path\s+from\s+['"`]path['"`]/);
      expect(content).toMatch(
        /import\s+{\s*google\s*}\s+from\s+['"`]googleapis['"`]/,
      );
    });

    test("scripts should have __dirname compatibility for ES modules", () => {
      const galleryScript = fs.readFileSync(
        path.join(scriptsDir, "generate-gallery-cache.js"),
        "utf8",
      );
      const photosScript = fs.readFileSync(
        path.join(scriptsDir, "generate-featured-photos.js"),
        "utf8",
      );

      // Both scripts should have ES module __dirname setup
      [galleryScript, photosScript].forEach((content) => {
        expect(content).toMatch(
          /import\s+{\s*fileURLToPath\s*}\s+from\s+['"`]url['"`]/,
        );
        expect(content).toMatch(
          /const\s+__filename\s*=\s*fileURLToPath\(import\.meta\.url\)/,
        );
        expect(content).toMatch(
          /const\s+__dirname\s*=\s*path\.dirname\(__filename\)/,
        );
      });
    });
  });

  describe("Build Script Execution", () => {
    test("should execute prebuild scripts without ES module errors", async () => {
      // This test runs the actual prebuild command to catch ES module issues
      const buildProcess = spawn("npm", ["run", "prebuild"], {
        cwd: path.join(__dirname, "..", ".."),
        stdio: "pipe",
      });

      let stdout = "";
      let stderr = "";

      buildProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      buildProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          buildProcess.kill();
          reject(new Error("Build script timed out"));
        }, 30000);

        buildProcess.on("close", (code) => {
          clearTimeout(timeout);

          // Should not have ES module errors
          expect(stderr).not.toMatch(/ReferenceError: require is not defined/);
          expect(stderr).not.toMatch(/ES module/);

          // Should complete successfully
          expect(code).toBe(0);

          // Should generate expected output (either real data or skip in CI)
          const hasCredentials =
            stdout.includes("Fetching") && stdout.includes("gallery data");
          const skippedInCI =
            stdout.includes("Skipping") ||
            stdout.includes("Google credentials not found");

          expect(hasCredentials || skippedInCI).toBe(true);

          if (hasCredentials) {
            // Normal operation with credentials
            expect(stdout).toMatch(/Fetching.*gallery data/);
            expect(stdout).toMatch(/Fetching featured photos/);
            expect(stdout).toMatch(/saved to/);
          } else {
            // CI mode without credentials - scripts should skip gracefully
            expect(stdout).toMatch(/Skipping.*generation/i);
            expect(stdout).toMatch(/Google credentials not found/i);
          }

          resolve();
        });
      });
    }, 35000); // 35 second timeout for Jest

    test("should generate expected output files", async () => {
      const buildProcess = spawn("npm", ["run", "prebuild"], {
        cwd: path.join(__dirname, "..", ".."),
        stdio: "pipe",
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          buildProcess.kill();
          reject(new Error("Build script timed out"));
        }, 30000);

        buildProcess.on("close", (code) => {
          clearTimeout(timeout);

          expect(code).toBe(0);

          // Check that output files were created (or placeholders exist)
          const galleryDataPath = path.join(
            __dirname,
            "..",
            "..",
            "public",
            "gallery-data",
            "2025.json",
          );
          const featuredPhotosPath = path.join(
            __dirname,
            "..",
            "..",
            "public",
            "featured-photos.json",
          );

          // In development/CI, these might be placeholder files
          if (fs.existsSync(galleryDataPath)) {
            const galleryData = JSON.parse(
              fs.readFileSync(galleryDataPath, "utf8"),
            );
            expect(galleryData).toHaveProperty("year");
            expect(galleryData).toHaveProperty("categories");
            expect(galleryData).toHaveProperty("cacheTimestamp");
          }

          if (fs.existsSync(featuredPhotosPath)) {
            const featuredData = JSON.parse(
              fs.readFileSync(featuredPhotosPath, "utf8"),
            );
            expect(featuredData).toHaveProperty("items");
            expect(featuredData).toHaveProperty("totalCount");
            expect(featuredData).toHaveProperty("cacheTimestamp");
          }

          resolve();
        });
      });
    }, 35000);
  });

  describe("Vercel Compatibility", () => {
    test("should not have Python-related patterns that confuse Vercel", () => {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

      // Should not have Python build commands
      expect(packageJson.scripts.build).not.toMatch(/python/i);
      expect(packageJson.scripts.prebuild).not.toMatch(/pip/i);

      // Should be configured as Node.js project
      expect(packageJson.type).toBe("module");
      expect(packageJson.scripts).toHaveProperty("build");
    });

    test("should have .vercelignore to prevent Python detection", () => {
      const vercelignorePath = path.join(
        __dirname,
        "..",
        "..",
        ".vercelignore",
      );
      expect(fs.existsSync(vercelignorePath)).toBe(true);

      const content = fs.readFileSync(vercelignorePath, "utf8");
      expect(content).toMatch(/\.py$/m);
      expect(content).toMatch(/requirements\.txt/);
      expect(content).toMatch(/venv\//);
      expect(content).toMatch(/__pycache__/);
    });

    test("vercel.json should be properly configured for static deployment", () => {
      const vercelJsonPath = path.join(__dirname, "..", "..", "vercel.json");
      expect(fs.existsSync(vercelJsonPath)).toBe(true);

      const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, "utf8"));

      // Should have proper rewrites for static site
      expect(vercelConfig).toHaveProperty("rewrites");
      expect(vercelConfig.rewrites).toBeInstanceOf(Array);
      expect(vercelConfig.rewrites.length).toBeGreaterThan(0);

      // Should have root path rewrite to index.html for proper handling
      const rootRewrite = vercelConfig.rewrites.find((r) => r.source === "/");
      expect(rootRewrite).toBeDefined();
      expect(rootRewrite.destination).toBe("/pages/index.html");

      // Should have home rewrite since we use /home as main page
      const homeRewrite = vercelConfig.rewrites.find(
        (r) => r.source === "/home",
      );
      expect(homeRewrite).toBeDefined();
      expect(homeRewrite.destination).toBe("/pages/home.html");

      // Should have specific page rewrites for all pages
      const aboutRewrite = vercelConfig.rewrites.find(
        (r) => r.source === "/about",
      );
      expect(aboutRewrite).toBeDefined();
      expect(aboutRewrite.destination).toBe("/pages/about.html");

      // Should have images config
      expect(vercelConfig).toHaveProperty("images");
      expect(vercelConfig.images).toHaveProperty("sizes");

      // Should have minimal build configuration for static site deployment
      expect(vercelConfig).toHaveProperty("buildCommand");
      // Build command should be minimal since prebuild runs locally
      expect(vercelConfig.buildCommand).toBe("echo 'Static site ready'");
      expect(vercelConfig).toHaveProperty("outputDirectory");
      expect(vercelConfig.outputDirectory).toBe(".");
      expect(vercelConfig).toHaveProperty("framework");
      expect(vercelConfig.framework).toBe(null);

      // Functions should be for API routes only
      if (vercelConfig.functions) {
        Object.keys(vercelConfig.functions).forEach((func) => {
          expect(func).toMatch(/^api\//);
        });
      }
    });

    test.skip("index.html should redirect to /home", () => {
      const indexPath = path.join(__dirname, "..", "..", "index.html");
      const content = fs.readFileSync(indexPath, "utf8");

      // Should be a redirect page, not the main content
      expect(content).toMatch(
        /<title>A Lo Cubano Boulder Fest - Loading\.\.\.<\/title>/,
      );
      // Should contain redirect script
      expect(content).toMatch(/window\.location\.href\s*=\s*['"`]\/home['"`]/);
      // Should NOT contain main home page content
      expect(content).not.toMatch(/Experience.*3 Days.*of pure Cuban rhythm/);
    });
  });

  describe("Environment Validation", () => {
    test("should handle missing Google credentials gracefully", async () => {
      // Test with missing credentials to ensure graceful failure
      const env = { ...process.env };
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL = undefined;
      env.GOOGLE_PRIVATE_KEY = undefined;

      const buildProcess = spawn("npm", ["run", "prebuild"], {
        cwd: path.join(__dirname, "..", ".."),
        stdio: "pipe",
        env: env,
      });

      let stderr = "";
      let stdout = "";

      buildProcess.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      buildProcess.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          buildProcess.kill();
          reject(new Error("Build script timed out"));
        }, 30000);

        buildProcess.on("close", (code) => {
          clearTimeout(timeout);

          // Should not crash with ES module errors
          expect(stderr).not.toMatch(/ReferenceError: require is not defined/);
          expect(stderr).not.toMatch(/ES module/);

          // Either should exit with success (placeholders) or show credentials message
          if (code !== 0) {
            expect(stderr + stdout).toMatch(
              /Missing Google service account credentials|No credentials/,
            );
          }

          resolve();
        });
      });
    }, 35000);
  });
});
