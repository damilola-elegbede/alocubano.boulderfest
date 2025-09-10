/**
 * Cache Clear API - A Lo Cubano Boulder Fest
 * Provides secure cache clearing functionality with pattern-based and selective clearing
 *
 * Features:
 * - Pattern-based cache clearing (wildcard support)
 * - Selective clearing by cache type/namespace
 * - Clear all caches option
 * - Admin authentication required
 * - Audit logging with detailed operations
 * - Rate limiting protection
 */

import authService from "../../lib/auth-service.js";
import { getCacheService } from "../../lib/cache-service.js";
import { getCache } from "../../lib/cache/index.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";

// Rate limiting: max 10 clear operations per minute per admin
const rateLimitMap = new Map();
const MAX_CLEAR_OPERATIONS = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(adminId) {
  const now = Date.now();
  const key = `clear_${adminId}`;
  const window = rateLimitMap.get(key) || {
    count: 0,
    resetTime: now + RATE_LIMIT_WINDOW,
  };

  if (now > window.resetTime) {
    window.count = 1;
    window.resetTime = now + RATE_LIMIT_WINDOW;
  } else {
    window.count++;
  }

  rateLimitMap.set(key, window);

  return {
    allowed: window.count <= MAX_CLEAR_OPERATIONS,
    remaining: Math.max(0, MAX_CLEAR_OPERATIONS - window.count),
    resetTime: window.resetTime,
  };
}

async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Authentication check
    const sessionToken = authService.getSessionFromRequest(req);
    if (!sessionToken) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const verification = authService.verifySessionToken(sessionToken);
    if (!verification.valid) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const adminId = verification.admin.id;

    // Rate limiting check
    const rateLimit = checkRateLimit(adminId);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: "Rate limit exceeded",
        remaining: rateLimit.remaining,
        resetTime: new Date(rateLimit.resetTime).toISOString(),
      });
    }

    // Parse request body
    const body = req.body || {};
    const {
      action = "selective", // 'selective', 'pattern', 'all', 'namespace'
      pattern, // Wildcard pattern for pattern clearing
      namespace, // Specific namespace to clear
      cacheType, // Specific cache type (gallery, tickets, api-responses, etc.)
      dryRun = false, // Preview what would be cleared without actually clearing
      reason = "Manual admin clear", // Audit trail reason
    } = body;

    console.log(
      `[CACHE-CLEAR] Admin ${adminId} initiated ${action} clear operation`,
    );

    // Get cache service
    const cacheService = getCacheService();
    const cache = await cacheService.ensureInitialized();

    let result = {
      success: false,
      action,
      clearedCount: 0,
      operations: [],
      dryRun,
      timestamp: new Date().toISOString(),
      adminId,
      reason,
    };

    // Perform clearing operations based on action type
    switch (action) {
      case "all":
        if (dryRun) {
          result.operations.push({
            type: "all_caches",
            description: "Would clear all cache layers (memory + Redis)",
            estimated: "All cached data",
          });
        } else {
          // Clear both memory and Redis layers
          if (typeof cache.flushAll === "function") {
            await cache.flushAll();
            result.clearedCount = "all";
          } else {
            // Fallback: clear known namespaces
            const namespaces = [
              "gallery",
              "tickets",
              "api-responses",
              "sessions",
              "analytics",
              "payments",
              "counters",
            ];
            let totalCleared = 0;

            for (const ns of namespaces) {
              try {
                const cleared = await cache.delPattern("*", { namespace: ns });
                totalCleared += cleared;
                result.operations.push({
                  type: "namespace_clear",
                  namespace: ns,
                  cleared,
                });
              } catch (error) {
                result.operations.push({
                  type: "namespace_clear_error",
                  namespace: ns,
                  error: error.message,
                });
              }
            }

            result.clearedCount = totalCleared;
          }
        }
        result.success = true;
        break;

      case "pattern":
        if (!pattern) {
          return res
            .status(400)
            .json({ error: "Pattern is required for pattern clearing" });
        }

        // Validate pattern is a string
        if (typeof pattern !== "string") {
          return res.status(400).json({ 
            error: "Pattern must be a string" 
          });
        }

        // Validate pattern length (max 2048 characters)
        if (pattern.length > 2048) {
          return res.status(400).json({ 
            error: "Pattern exceeds maximum length of 2048 characters" 
          });
        }

        // Validate pattern contains only safe characters
        // Allow: alphanumeric, hyphens, underscores, colons, asterisks, 
        // question marks, forward slashes, dots, square brackets
        const safePatternRegex = /^[\w\-:*?/.[\]]+$/;
        if (!safePatternRegex.test(pattern)) {
          return res.status(400).json({ 
            error: "Pattern contains invalid characters. Only alphanumeric characters, hyphens, underscores, colons, asterisks, question marks, forward slashes, dots, and square brackets are allowed." 
          });
        }

        if (dryRun) {
          result.operations.push({
            type: "pattern_clear",
            pattern,
            description: `Would clear keys matching pattern: ${pattern}`,
            namespace: namespace || "all",
          });
        } else {
          const cleared = await cache.delPattern(pattern, { namespace });
          result.clearedCount = cleared;
          result.operations.push({
            type: "pattern_clear",
            pattern,
            namespace: namespace || "global",
            cleared,
          });
        }
        result.success = true;
        break;

      case "namespace":
        if (!namespace) {
          return res
            .status(400)
            .json({ error: "Namespace is required for namespace clearing" });
        }

        if (dryRun) {
          result.operations.push({
            type: "namespace_clear",
            namespace,
            description: `Would clear all keys in namespace: ${namespace}`,
          });
        } else {
          if (typeof cache.flushNamespace === "function") {
            const cleared = await cache.flushNamespace(namespace);
            result.clearedCount = cleared;
          } else {
            const cleared = await cache.delPattern("*", { namespace });
            result.clearedCount = cleared;
          }

          result.operations.push({
            type: "namespace_clear",
            namespace,
            cleared: result.clearedCount,
          });
        }
        result.success = true;
        break;

      case "selective": {
        // Selective clearing based on cache type
        const operations = [];
        let totalCleared = 0;

        if (cacheType) {
          // Clear specific cache type
          const typeNamespaceMap = {
            gallery: "gallery",
            tickets: "tickets",
            sessions: "sessions",
            analytics: "analytics",
            payments: "payments",
            api: "api-responses",
          };

          const targetNamespace = typeNamespaceMap[cacheType];
          if (!targetNamespace) {
            return res.status(400).json({
              error: "Invalid cache type",
              validTypes: Object.keys(typeNamespaceMap),
            });
          }

          if (dryRun) {
            operations.push({
              type: "selective_clear",
              cacheType,
              namespace: targetNamespace,
              description: `Would clear ${cacheType} cache`,
            });
          } else {
            const cleared = await cache.delPattern("*", {
              namespace: targetNamespace,
            });
            totalCleared += cleared;
            operations.push({
              type: "selective_clear",
              cacheType,
              namespace: targetNamespace,
              cleared,
            });
          }
        } else {
          // Clear expired entries across all namespaces
          const namespaces = [
            "gallery",
            "tickets",
            "api-responses",
            "sessions",
            "analytics",
          ];

          for (const ns of namespaces) {
            if (dryRun) {
              operations.push({
                type: "expired_clear",
                namespace: ns,
                description: `Would clear expired entries in ${ns}`,
              });
            } else {
              try {
                // This would require TTL-based clearing in a real implementation
                // For now, we'll log the operation
                operations.push({
                  type: "expired_check",
                  namespace: ns,
                  note: "Expired entry clearing not implemented yet",
                });
              } catch (error) {
                operations.push({
                  type: "expired_clear_error",
                  namespace: ns,
                  error: error.message,
                });
              }
            }
          }
        }

        result.clearedCount = totalCleared;
        result.operations = operations;
        result.success = true;
        break;
      }

      default:
        return res.status(400).json({
          error: "Invalid action",
          validActions: ["all", "pattern", "namespace", "selective"],
        });
    }

    // Audit logging
    console.log(
      `[CACHE-CLEAR] Admin ${adminId} completed ${action} operation:`,
      {
        clearedCount: result.clearedCount,
        operations: result.operations.length,
        dryRun,
        reason,
      },
    );

    // Add rate limit headers
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(rateLimit.resetTime).toISOString(),
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("[CACHE-CLEAR] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Cache clear operation failed",
    });
  }
}

export default withSecurityHeaders(handler);

// Export for testing
export { checkRateLimit };
