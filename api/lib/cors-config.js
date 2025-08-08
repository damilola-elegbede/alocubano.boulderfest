/**
 * CORS Configuration Module
 * Provides secure CORS origin management with environment variable support
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Module-level cache to avoid repeated disk I/O
let configCache = null;
let envCacheKey = null;

/**
 * Load CORS configuration from secure sources with caching
 * Priority: Environment variables -> JSON config file -> defaults
 */
export function getCorsConfig() {
  // Create cache key from environment variable to detect changes
  const currentEnvKey = process.env.CORS_ALLOWED_ORIGINS || '';
  
  // Return cached config if available and environment hasn't changed
  if (configCache && envCacheKey === currentEnvKey) {
    return configCache;
  }

  try {
    // Load base configuration from JSON file
    const configPath = path.join(__dirname, "../config/cors-config.json");
    const configFile = fs.readFileSync(configPath, "utf8");
    const baseConfig = JSON.parse(configFile);

    // Override with environment variable if provided
    let allowedOrigins = baseConfig.allowedOrigins;

    if (process.env.CORS_ALLOWED_ORIGINS) {
      // Parse comma-separated origins from environment variable
      allowedOrigins = process.env.CORS_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    }

    const config = {
      ...baseConfig,
      allowedOrigins: validateOrigins(allowedOrigins),
    };

    // Cache the configuration and environment key
    configCache = config;
    envCacheKey = currentEnvKey;

    return config;
  } catch (error) {
    console.error("Failed to load CORS configuration:", error.message);

    // Fallback to minimal secure defaults
    const fallbackConfig = {
      allowedOrigins: [
        "http://localhost:3000",
        "https://alocubano-boulderfest.vercel.app",
      ],
      allowCredentials: false,
      allowedMethods: ["GET", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    };

    // Cache fallback configuration
    configCache = fallbackConfig;
    envCacheKey = currentEnvKey;

    return fallbackConfig;
  }
}

/**
 * Validate and sanitize origin URLs
 */
function validateOrigins(origins) {
  const validated = [];

  for (const origin of origins) {
    try {
      // Parse URL to validate format
      const url = new URL(origin);

      // Only allow HTTP/HTTPS protocols
      if (!["http:", "https:"].includes(url.protocol)) {
        console.warn(`Invalid protocol in CORS origin: ${origin}`);
        continue;
      }

      // Reject wildcard patterns for security
      if (origin.includes("*")) {
        console.warn(`Wildcard CORS origin rejected for security: ${origin}`);
        continue;
      }

      validated.push(origin);
    } catch (error) {
      console.warn(`Invalid CORS origin format: ${origin}`);
    }
  }

  return validated;
}

/**
 * Check if an origin is allowed based on CORS configuration
 */
export function isOriginAllowed(origin, config) {
  if (!origin) {
    return false;
  }

  return config.allowedOrigins.includes(origin);
}

/**
 * Clear the configuration cache (useful for testing)
 */
export function clearConfigCache() {
  configCache = null;
  envCacheKey = null;
}
