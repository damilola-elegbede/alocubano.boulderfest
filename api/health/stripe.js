import Stripe from "stripe";
import { HealthStatus } from "../../lib/monitoring/health-checker.js";

/**
 * Initialize Stripe client with strict error handling
 */
function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("❌ FATAL: STRIPE_SECRET_KEY secret not configured");
  }

  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
}

/**
 * Check Stripe webhook configuration
 */
async function checkWebhookConfig(stripe) {
  try {
    if (!process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET) {
      return {
        configured: false,
        message: "Webhook endpoint secret not configured",
      };
    }

    // List webhook endpoints to verify configuration
    const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 10 });

    const activeEndpoints = webhookEndpoints.data.filter(
      (endpoint) => endpoint.status === "enabled",
    );

    return {
      configured: true,
      active_endpoints: activeEndpoints.length,
      webhook_secret_configured: true,
    };
  } catch (error) {
    // Webhooks might not be accessible with current API key permissions
    return {
      configured: !!process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET,
      message: "Unable to verify webhook endpoints (permission denied)",
      webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_ENDPOINT_SECRET,
    };
  }
}

/**
 * Check Stripe API rate limits
 */
function extractRateLimitInfo(headers) {
  return {
    remaining: headers["stripe-rate-limit-remaining"] || "unknown",
    limit: headers["stripe-rate-limit-limit"] || "unknown",
    reset: headers["stripe-rate-limit-reset"]
      ? new Date(
          parseInt(headers["stripe-rate-limit-reset"]) * 1000,
        ).toISOString()
      : "unknown",
  };
}

/**
 * Check recent payment activity
 */
async function checkRecentActivity(stripe) {
  try {
    // Check recent payment intents (last hour)
    const oneHourAgo = Math.floor((Date.now() - 3600000) / 1000);

    const recentPayments = await stripe.paymentIntents.list({
      created: { gte: oneHourAgo },
      limit: 100,
    });

    const statusCounts = {
      succeeded: 0,
      processing: 0,
      requires_payment_method: 0,
      requires_confirmation: 0,
      requires_action: 0,
      canceled: 0,
      failed: 0,
    };

    recentPayments.data.forEach((payment) => {
      if (statusCounts.hasOwnProperty(payment.status)) {
        statusCounts[payment.status]++;
      }
    });

    return {
      total_last_hour: recentPayments.data.length,
      status_breakdown: statusCounts,
      has_more: recentPayments.has_more,
    };
  } catch (error) {
    return {
      error: `Unable to fetch recent activity: ${error.message}`,
    };
  }
}

/**
 * Check Stripe service health
 */
export const checkStripeHealth = async () => {
  const startTime = Date.now();

  try {
    // Initialize Stripe client
    const stripe = getStripeClient();

    // Test API connectivity by fetching balance
    let balance;
    let rateLimits = {};

    try {
      const balanceResponse = await stripe.balance.retrieve();
      balance = balanceResponse;

      // Extract rate limit info from the last request
      if (stripe.getLastResponse) {
        const lastResponse = stripe.getLastResponse();
        rateLimits = extractRateLimitInfo(lastResponse.headers || {});
      }
    } catch (error) {
      throw new Error(`API connectivity test failed: ${error.message}`);
    }

    // Check webhook configuration
    const webhookStatus = await checkWebhookConfig(stripe);

    // Check recent payment activity
    const recentActivity = await checkRecentActivity(stripe);

    // Format balance information
    const availableBalance = balance.available.reduce((acc, b) => {
      acc[b.currency] = (b.amount / 100).toFixed(2);
      return acc;
    }, {});

    const pendingBalance = balance.pending.reduce((acc, b) => {
      acc[b.currency] = (b.amount / 100).toFixed(2);
      return acc;
    }, {});

    // Determine health status
    let status = HealthStatus.HEALTHY;
    const warnings = [];

    if (!webhookStatus.configured) {
      status = HealthStatus.DEGRADED;
      warnings.push("Webhook not fully configured");
    }

    if (recentActivity.error) {
      warnings.push("Unable to fetch recent activity");
    }

    if (
      rateLimits.remaining !== "unknown" &&
      parseInt(rateLimits.remaining) < 100
    ) {
      status = HealthStatus.DEGRADED;
      warnings.push("API rate limit approaching");
    }

    return {
      status,
      response_time: `${Date.now() - startTime}ms`,
      details: {
        api_accessible: true,
        livemode: !process.env.STRIPE_SECRET_KEY?.includes("test"),
        webhook_configured: webhookStatus.configured,
        webhook_details: webhookStatus,
        balance: {
          available: availableBalance,
          pending: pendingBalance,
        },
        recent_activity: recentActivity,
        rate_limits: rateLimits,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    };
  } catch (error) {
    // Determine if this is a configuration error or service error
    const errorMessage =
      error?.message || error?.toString?.() || "Unknown error";
    const isConfigError =
      errorMessage.includes("secret key") ||
      errorMessage.includes("Invalid API Key");

    return {
      status: HealthStatus.UNHEALTHY,
      response_time: `${Date.now() - startTime}ms`,
      error: errorMessage,
      details: {
        api_accessible: false,
        error_type: isConfigError ? "ConfigurationError" : "ServiceError",
        raw_error: error.raw
          ? {
              type: error.raw.type,
              code: error.raw.code,
              message: error.raw.message,
            }
          : undefined,
      },
    };
  }
};

/**
 * Vercel serverless function handler
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const health = await checkStripeHealth();
    const statusCode = health.status === HealthStatus.HEALTHY ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
}
