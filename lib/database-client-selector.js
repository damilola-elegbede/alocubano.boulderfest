/**
 * Database Client Selector
 * Dynamically selects the appropriate LibSQL client based on runtime environment
 */

/**
 * Detect the current runtime environment
 */
function detectRuntime() {
  // Check for Edge Runtime (Vercel Edge Functions)
  if (typeof EdgeRuntime !== "undefined") {
    return "edge";
  }

  // Check for Vercel deployment (non-edge)
  if (process.env.VERCEL) {
    return "vercel";
  }

  // Check for browser environment
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    return "browser";
  }

  // Default to Node.js
  return "node";
}

/**
 * Get the appropriate LibSQL client for the current environment
 */
export async function getLibSQLClient() {
  const runtime = detectRuntime();

  console.log(`[Database] Detected runtime: ${runtime}`);

  switch (runtime) {
    case "edge":
    case "vercel":
    case "browser":
      // Use web client for Edge Functions and browser environments
      const { createClient: createWebClient } = await import(
        "@libsql/client/web"
      );
      return createWebClient;

    case "node":
    default:
      // Use Node.js client for tests and local development
      try {
        const { createClient: createNodeClient } = await import(
          "@libsql/client"
        );
        return createNodeClient;
      } catch (error) {
        // Fallback to web client if Node client not available
        console.warn(
          "[Database] Node client not available, falling back to web client",
        );
        const { createClient: createWebClient } = await import(
          "@libsql/client/web"
        );
        return createWebClient;
      }
  }
}

/**
 * Runtime information for debugging
 */
export function getRuntimeInfo() {
  return {
    runtime: detectRuntime(),
    isEdge: typeof EdgeRuntime !== "undefined",
    isVercel: !!process.env.VERCEL,
    isBrowser: typeof window !== "undefined",
    isNode:
      typeof process !== "undefined" &&
      process.versions &&
      process.versions.node,
    nodeVersion: process.versions?.node || null,
  };
}
