/**
 * CORS Configuration Module
 * Provides secure CORS origin management with environment variable support
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load CORS configuration from secure sources
 * Priority: Environment variables -> JSON config file -> defaults
 */
export function getCorsConfig() {
  try {
    // Load base configuration from JSON file
    const configPath = path.join(__dirname, '../config/cors-config.json');
    const configFile = fs.readFileSync(configPath, 'utf8');
    const baseConfig = JSON.parse(configFile);

    // Override with environment variable if provided
    let allowedOrigins = baseConfig.allowedOrigins;
    
    if (process.env.CORS_ALLOWED_ORIGINS) {
      // Parse comma-separated origins from environment variable
      allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
        .split(',')
        .map(origin => origin.trim())
        .filter(origin => origin.length > 0);
    }

    return {
      ...baseConfig,
      allowedOrigins: validateOrigins(allowedOrigins)
    };
  } catch (error) {
    console.error('Failed to load CORS configuration:', error.message);
    
    // Fallback to minimal secure defaults
    return {
      allowedOrigins: [
        'http://localhost:3000',
        'https://alocubano-boulderfest.vercel.app'
      ],
      allowCredentials: false,
      allowedMethods: ['GET', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization']
    };
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
      if (!['http:', 'https:'].includes(url.protocol)) {
        console.warn(`Invalid protocol in CORS origin: ${origin}`);
        continue;
      }
      
      // Reject wildcard patterns for security
      if (origin.includes('*')) {
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