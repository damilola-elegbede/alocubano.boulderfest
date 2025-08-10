/**
 * Cache Warming API - A Lo Cubano Boulder Fest
 * Pre-loads critical data into cache for optimal performance
 *
 * Features:
 * - Pre-load critical event data into cache
 * - Ticket availability pre-caching
 * - Gallery data warming
 * - Analytics data warming
 * - Progress tracking for long operations
 * - Admin authentication required
 * - Intelligent warming strategies
 */

import authService from "../lib/auth-service.js";
import { getCacheService } from "../lib/cache-service.js";
import { getCache, CACHE_TYPES } from "../../lib/cache/index.js";
import { withSecurityHeaders } from "../lib/security-headers.js";

// Rate limiting: max 5 warm operations per 10 minutes per admin
const rateLimitMap = new Map();
const MAX_WARM_OPERATIONS = 5;
const RATE_LIMIT_WINDOW = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(adminId) {
  const now = Date.now();
  const key = `warm_${adminId}`;
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
    allowed: window.count <= MAX_WARM_OPERATIONS,
    remaining: Math.max(0, MAX_WARM_OPERATIONS - window.count),
    resetTime: window.resetTime,
  };
}

/**
 * Generate critical event data for warming
 */
async function getEventWarmingData() {
  return {
    // Core event information - highest priority
    "event:boulder-fest-2026": {
      name: "A Lo Cubano Boulder Fest 2026",
      dates: "May 15-17, 2026",
      location: "Avalon Ballroom, Boulder, CO",
      status: "upcoming",
      timezone: "America/Denver",
      capacity: 500,
      lastUpdated: new Date().toISOString(),
    },

    // Ticket configuration - critical for sales
    "tickets:config": {
      earlyBird: {
        price: 125,
        available: true,
        limit: 100,
        description: "Early Bird Special",
      },
      regular: {
        price: 150,
        available: true,
        limit: 300,
        description: "Regular Admission",
      },
      vip: {
        price: 250,
        available: true,
        limit: 50,
        description: "VIP Experience",
      },
      workshop: {
        price: 75,
        available: true,
        limit: 100,
        description: "Workshop Access",
      },
    },

    // Featured artists - frequently accessed
    "artists:featured": [
      "Maykel Fonts",
      "Dayme y El High",
      "Chacal",
      "El Micha",
      "Gente de Zona",
      "Jacob Forever",
    ],

    // Schedule highlights
    "schedule:highlights": {
      friday: {
        "19:00": "Opening Ceremony",
        "20:00": "Maykel Fonts Performance",
        "22:00": "Social Dancing",
      },
      saturday: {
        "10:00": "Workshop Sessions",
        "14:00": "Lunch Break",
        "16:00": "Artist Panels",
        "20:00": "Main Show",
        "23:00": "Late Night Social",
      },
      sunday: {
        "10:00": "Final Workshops",
        "14:00": "Closing Ceremony",
        "16:00": "Farewell Social",
      },
    },
  };
}

/**
 * Generate ticket availability data for warming
 */
async function getTicketWarmingData() {
  // This would normally fetch from database
  // For warming purposes, we create realistic test data
  return {
    "tickets:availability:earlybird": {
      total: 100,
      sold: 45,
      remaining: 55,
      price: 125,
      status: "available",
    },
    "tickets:availability:regular": {
      total: 300,
      sold: 125,
      remaining: 175,
      price: 150,
      status: "available",
    },
    "tickets:availability:vip": {
      total: 50,
      sold: 32,
      remaining: 18,
      price: 250,
      status: "low_stock",
    },
    "tickets:availability:workshop": {
      total: 100,
      sold: 67,
      remaining: 33,
      price: 75,
      status: "available",
    },
  };
}

/**
 * Generate gallery data for warming
 */
async function getGalleryWarmingData() {
  return {
    "gallery:years": ["2023", "2024", "2025", "2026"],

    "gallery:featured:2025": [
      {
        id: "photo_001",
        title: "Opening Night Magic",
        year: "2025",
        featured: true,
        thumbnail: "https://drive.google.com/thumbnail?id=example1",
      },
      {
        id: "photo_002",
        title: "Dance Floor Energy",
        year: "2025",
        featured: true,
        thumbnail: "https://drive.google.com/thumbnail?id=example2",
      },
    ],

    "gallery:stats:2025": {
      totalPhotos: 247,
      totalVideos: 18,
      categories: ["performances", "workshops", "social", "backstage"],
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Generate analytics data for warming
 */
async function getAnalyticsWarmingData() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return {
    "analytics:config": {
      trackingEnabled: true,
      sampleRate: 0.1,
      endpoints: ["tickets", "gallery", "subscribe", "artists"],
      retentionDays: 90,
    },

    [`analytics:daily:${yesterday.toISOString().split("T")[0]}`]: {
      pageViews: 1247,
      uniqueVisitors: 892,
      ticketSales: 23,
      bounceRate: 0.35,
      avgSessionDuration: 180,
    },

    "analytics:popular_pages": [
      { path: "/tickets", views: 2341, conversions: 89 },
      { path: "/artists", views: 1876, conversions: 12 },
      { path: "/gallery", views: 1654, conversions: 5 },
      { path: "/schedule", views: 987, conversions: 3 },
    ],
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
      sections = ["all"], // Which sections to warm: 'all', 'event', 'tickets', 'gallery', 'analytics'
      priority = "normal", // 'low', 'normal', 'high' - affects TTL
      dryRun = false, // Preview what would be warmed
      force = false, // Force warming even if data exists
    } = body;

    console.log(
      `[CACHE-WARM] Admin ${adminId} initiated warming for sections:`,
      sections,
    );

    // Get cache service
    const cacheService = getCacheService();
    const cache = await cacheService.ensureInitialized();

    let result = {
      success: false,
      sections,
      priority,
      warmedCount: 0,
      operations: [],
      dryRun,
      force,
      timestamp: new Date().toISOString(),
      adminId,
      progress: {
        total: 0,
        completed: 0,
        failed: 0,
      },
    };

    // Set TTL based on priority
    const ttlMap = {
      low: 1800, // 30 minutes
      normal: 3600, // 1 hour
      high: 7200, // 2 hours
    };
    const warmTtl = ttlMap[priority] || ttlMap.normal;

    // Determine which sections to process
    const sectionsToProcess = sections.includes("all")
      ? ["event", "tickets", "gallery", "analytics"]
      : sections;

    let totalOperations = 0;
    let completedOperations = 0;

    for (const section of sectionsToProcess) {
      try {
        let warmingData = {};
        let namespace = section;
        let cacheType = CACHE_TYPES.STATIC;

        switch (section) {
          case "event":
            warmingData = await getEventWarmingData();
            namespace = "event";
            cacheType = CACHE_TYPES.STATIC;
            break;

          case "tickets":
            warmingData = await getTicketWarmingData();
            namespace = "tickets";
            cacheType = CACHE_TYPES.DYNAMIC;
            break;

          case "gallery":
            warmingData = await getGalleryWarmingData();
            namespace = "gallery";
            cacheType = CACHE_TYPES.GALLERY;
            break;

          case "analytics":
            warmingData = await getAnalyticsWarmingData();
            namespace = "analytics";
            cacheType = CACHE_TYPES.ANALYTICS;
            break;

          default:
            result.operations.push({
              section,
              status: "error",
              error: `Unknown section: ${section}`,
            });
            result.progress.failed++;
            continue;
        }

        const keys = Object.keys(warmingData);
        totalOperations += keys.length;
        result.progress.total += keys.length;

        if (dryRun) {
          result.operations.push({
            section,
            status: "preview",
            keysToWarm: keys.length,
            keys: keys.slice(0, 5), // Show first 5 keys as preview
            ttl: warmTtl,
            cacheType,
          });
          completedOperations += keys.length;
        } else {
          // Warm the cache with data
          let sectionWarmedCount = 0;

          for (const [key, value] of Object.entries(warmingData)) {
            try {
              // Check if key exists and skip if not forcing
              if (!force && (await cache.exists(key, { namespace }))) {
                continue;
              }

              const success = await cache.set(key, value, {
                namespace,
                ttl: warmTtl,
                type: cacheType,
                forceMemory: priority === "high", // High priority items go to memory
              });

              if (success) {
                sectionWarmedCount++;
                completedOperations++;
                result.progress.completed++;
              }
            } catch (keyError) {
              console.warn(`[CACHE-WARM] Failed to warm key ${key}:`, keyError);
              result.progress.failed++;
            }
          }

          result.operations.push({
            section,
            status: "completed",
            warmedKeys: sectionWarmedCount,
            totalKeys: keys.length,
            ttl: warmTtl,
            cacheType,
            namespace,
          });

          result.warmedCount += sectionWarmedCount;
        }
      } catch (sectionError) {
        console.error(
          `[CACHE-WARM] Error warming section ${section}:`,
          sectionError,
        );
        result.operations.push({
          section,
          status: "error",
          error: sectionError.message,
        });
        result.progress.failed++;
      }
    }

    result.success = true;

    // Update final progress
    result.progress.total = totalOperations;

    // Audit logging
    console.log(`[CACHE-WARM] Admin ${adminId} completed warming:`, {
      sections: sectionsToProcess,
      warmedCount: result.warmedCount,
      priority,
      dryRun,
    });

    // Add rate limit headers
    res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
    res.setHeader(
      "X-RateLimit-Reset",
      new Date(rateLimit.resetTime).toISOString(),
    );

    return res.status(200).json(result);
  } catch (error) {
    console.error("[CACHE-WARM] Error:", error);
    return res.status(500).json({
      error: "Internal server error",
      message: "Cache warming operation failed",
    });
  }
}

export default withSecurityHeaders(handler);

// Export warming functions for testing
export {
  getEventWarmingData,
  getTicketWarmingData,
  getGalleryWarmingData,
  getAnalyticsWarmingData,
  checkRateLimit,
};
