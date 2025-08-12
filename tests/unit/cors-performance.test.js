import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";

// Mock fs to control disk I/O behavior
vi.mock("fs");
const mockFs = vi.mocked(fs);

describe("CORS Configuration Performance Optimizations", () => {
  let corsConfigModule;
  
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.resetModules();

    // Mock the cors-config.json file content
    const mockConfigContent = JSON.stringify({
      allowedOrigins: ["http://localhost:3000", "https://test.example.com"],
      allowCredentials: false,
      allowedMethods: ["GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    });

    mockFs.readFileSync.mockReturnValue(mockConfigContent);
    
    // Import fresh module instance
    corsConfigModule = await import("../../api/lib/cors-config.js");
    
    // Clear any existing cache from the fresh module
    corsConfigModule.clearConfigCache();
  });

  it("should cache CORS configuration to avoid repeated disk reads", async () => {
    const { getCorsConfig } = corsConfigModule;

    // First call should read from disk
    const config1 = getCorsConfig();

    // Second call should use cache (no additional disk read)
    const config2 = getCorsConfig();

    // Third call should also use cache
    const config3 = getCorsConfig();

    // Verify fs.readFileSync was only called once
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // Verify all configs are identical (cache working)
    expect(config1).toEqual(config2);
    expect(config2).toEqual(config3);

    // Verify config structure
    expect(config1).toHaveProperty("allowedOrigins");
    expect(config1).toHaveProperty("allowCredentials");
    expect(config1).toHaveProperty("allowedMethods");
    expect(config1).toHaveProperty("allowedHeaders");

    expect(config1.allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://test.example.com",
    ]);
  });

  it("should invalidate cache when environment variable changes", async () => {
    const { getCorsConfig, clearConfigCache } = corsConfigModule;

    // Start completely fresh
    delete process.env.CORS_ALLOWED_ORIGINS;

    // First call without env var
    const config1 = getCorsConfig();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // Clear cache to ensure fresh read with new env
    clearConfigCache();

    // Set environment variable
    process.env.CORS_ALLOWED_ORIGINS =
      "https://new.example.com,https://another.example.com";
    
    // Get config with new env var (should read file again)
    const config2 = getCorsConfig();

    // Should have called readFileSync twice (once for each config)
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);

    // Config should be different
    expect(config1.allowedOrigins).not.toEqual(config2.allowedOrigins);
    expect(config2.allowedOrigins).toEqual([
      "https://new.example.com",
      "https://another.example.com",
    ]);

    // Clean up
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  it("should cache fallback configuration on error", async () => {
    const { getCorsConfig, clearConfigCache } = corsConfigModule;

    clearConfigCache();

    // Make readFileSync throw an error
    mockFs.readFileSync.mockImplementation(() => {
      throw new Error("File not found");
    });

    // First call should handle error and cache fallback
    const config1 = getCorsConfig();

    // Second call should use cached fallback
    const config2 = getCorsConfig();

    // Should only call readFileSync once (then use cached fallback)
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // Both configs should be identical fallback configs
    expect(config1).toEqual(config2);
    expect(config1.allowedOrigins).toEqual([
      "http://localhost:3000",
      "https://alocubano-boulderfest.vercel.app",
    ]);
  });

  it("should provide clearConfigCache function for testing", async () => {
    const { getCorsConfig, clearConfigCache } = corsConfigModule;

    // Load config into cache
    getCorsConfig();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // Call again should use cache
    getCorsConfig();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // Clear cache
    clearConfigCache();

    // Next call should read from disk again
    getCorsConfig();
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it("should handle concurrent access safely", async () => {
    const { getCorsConfig, clearConfigCache } = corsConfigModule;

    clearConfigCache();

    // Simulate concurrent calls
    const promises = Array.from({ length: 10 }, () => getCorsConfig());
    const results = await Promise.all(promises);

    // Should only read from disk once despite concurrent calls
    expect(mockFs.readFileSync).toHaveBeenCalledTimes(1);

    // All results should be identical
    const firstResult = results[0];
    results.forEach((result) => {
      expect(result).toEqual(firstResult);
    });
  });
});
