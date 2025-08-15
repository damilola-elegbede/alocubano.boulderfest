import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Global settings for ALL test types
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],

    // Consistent timeouts
    testTimeout: 5000,
    hookTimeout: 5000,

    // Single include/exclude pattern
    include: ["tests/**/*.test.js"],
    exclude: [
      "tests/e2e/**", // Playwright handles E2E
      "**/node_modules/**",
      "tests/meta/**", // Meta tests about infrastructure
    ],

    // NO environment detection
    // NO CI-specific branches
    // Same behavior everywhere
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true, // Consistent execution
        maxForks: 2, // Same locally and CI
      },
    },

    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      exclude: ["tests/**", "scripts/**", "**/*.config.js", "node_modules/**"],
      thresholds: {
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
    },

    // Simple reporter configuration
    reporters: process.env.GITHUB_ACTIONS
      ? ["default", "github-actions"] // Only reporter difference
      : ["default"],
  },

  // Path aliases
  resolve: {
    alias: {
      "@": resolve(__dirname, "./"),
      "@api": resolve(__dirname, "./api"),
      "@tests": resolve(__dirname, "./tests"),
      "@pages": resolve(__dirname, "./pages"),
    },
  },
});
