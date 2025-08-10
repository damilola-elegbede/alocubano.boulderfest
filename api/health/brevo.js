import fetch from "node-fetch";
import { HealthStatus } from "../../lib/monitoring/health-checker.js";

/**
 * Brevo API configuration
 */
const BREVO_API_BASE = "https://api.brevo.com/v3";

/**
 * Get Brevo API headers
 */
function getBrevoHeaders() {
  if (!process.env.BREVO_API_KEY) {
    throw new Error("Brevo API key not configured");
  }

  return {
    accept: "application/json",
    "content-type": "application/json",
    "api-key": process.env.BREVO_API_KEY,
  };
}

/**
 * Check Brevo account info and quota
 */
async function checkAccountInfo() {
  try {
    const response = await fetch(`${BREVO_API_BASE}/account`, {
      method: "GET",
      headers: getBrevoHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Account info fetch failed: ${response.status} - ${error}`,
      );
    }

    const account = await response.json();

    // Get plan details
    const plan = account.plan?.[0] || {};
    const credits = plan.credits || {};

    return {
      company_name: account.companyName,
      email: account.email,
      plan_type: plan.type || "unknown",
      credits_type: plan.creditsType || "sendLimit",
      send_limit: credits.sendLimit || 0,
      emails_sent: credits.used || 0,
      emails_remaining: (credits.sendLimit || 0) - (credits.used || 0),
      quota_usage_percent: credits.sendLimit
        ? parseFloat(((credits.used / credits.sendLimit) * 100).toFixed(2))
        : 0,
    };
  } catch (error) {
    throw new Error(`Failed to get account info: ${error.message}`);
  }
}

/**
 * Check email lists/contacts
 */
async function checkContactLists() {
  try {
    const response = await fetch(`${BREVO_API_BASE}/contacts/lists?limit=50`, {
      method: "GET",
      headers: getBrevoHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lists fetch failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const lists = data.lists || [];

    // Find newsletter list if configured
    const newsletterListId = process.env.BREVO_NEWSLETTER_LIST_ID;
    let newsletterList = null;

    if (newsletterListId) {
      newsletterList = lists.find(
        (list) =>
          list.id === parseInt(newsletterListId) ||
          list.name?.toLowerCase().includes("newsletter"),
      );
    }

    return {
      total_lists: data.count || lists.length,
      newsletter_list_found: !!newsletterList,
      newsletter_list_details: newsletterList
        ? {
            id: newsletterList.id,
            name: newsletterList.name,
            total_subscribers: newsletterList.totalSubscribers || 0,
            total_blacklisted: newsletterList.totalBlacklisted || 0,
          }
        : null,
    };
  } catch (error) {
    return {
      error: `Unable to fetch contact lists: ${error.message}`,
    };
  }
}

/**
 * Check email templates
 */
async function checkEmailTemplates() {
  try {
    const response = await fetch(`${BREVO_API_BASE}/smtp/templates?limit=50`, {
      method: "GET",
      headers: getBrevoHeaders(),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Templates fetch failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const templates = data.templates || [];

    // Check for configured templates
    const welcomeTemplateId = process.env.BREVO_WELCOME_TEMPLATE_ID;
    const verificationTemplateId = process.env.BREVO_VERIFICATION_TEMPLATE_ID;

    const welcomeTemplate = templates.find(
      (t) =>
        t.id === parseInt(welcomeTemplateId) ||
        t.name?.toLowerCase().includes("welcome"),
    );

    const verificationTemplate = templates.find(
      (t) =>
        t.id === parseInt(verificationTemplateId) ||
        t.name?.toLowerCase().includes("verification"),
    );

    return {
      total_templates: data.count || templates.length,
      welcome_template_found: !!welcomeTemplate,
      verification_template_found: !!verificationTemplate,
      configured_templates: {
        welcome: welcomeTemplate
          ? {
              id: welcomeTemplate.id,
              name: welcomeTemplate.name,
              status: welcomeTemplate.isActive ? "active" : "inactive",
            }
          : null,
        verification: verificationTemplate
          ? {
              id: verificationTemplate.id,
              name: verificationTemplate.name,
              status: verificationTemplate.isActive ? "active" : "inactive",
            }
          : null,
      },
    };
  } catch (error) {
    return {
      error: `Unable to fetch templates: ${error.message}`,
    };
  }
}

/**
 * Check recent email activity
 */
async function checkRecentEmailActivity() {
  try {
    // Get statistics for the last 7 days
    const endDate = new Date().toISOString().split("T")[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const response = await fetch(
      `${BREVO_API_BASE}/smtp/statistics/aggregatedReport?startDate=${startDate}&endDate=${endDate}`,
      {
        method: "GET",
        headers: getBrevoHeaders(),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Statistics fetch failed: ${response.status} - ${error}`);
    }

    const stats = await response.json();

    return {
      period: `${startDate} to ${endDate}`,
      requests: stats.requests || 0,
      delivered: stats.delivered || 0,
      opens: stats.opens || 0,
      clicks: stats.clicks || 0,
      hard_bounces: stats.hardBounces || 0,
      soft_bounces: stats.softBounces || 0,
      complaints: stats.complaints || 0,
      unsubscriptions: stats.unsubscriptions || 0,
      delivery_rate:
        stats.requests > 0
          ? ((stats.delivered / stats.requests) * 100).toFixed(2) + "%"
          : "N/A",
      open_rate:
        stats.delivered > 0
          ? ((stats.opens / stats.delivered) * 100).toFixed(2) + "%"
          : "N/A",
    };
  } catch (error) {
    return {
      error: `Unable to fetch email statistics: ${error.message}`,
    };
  }
}

/**
 * Check Brevo service health
 */
export const checkBrevoHealth = async () => {
  const startTime = Date.now();

  try {
    // Run independent checks in parallel to reduce latency
    const [accountInfo, contactLists, templates, recentActivity] = await Promise.all([
      checkAccountInfo(),
      checkContactLists(),
      checkEmailTemplates(),
      checkRecentEmailActivity(),
    ]);

    // Determine health status
    let status = HealthStatus.HEALTHY;
    const warnings = [];
    const errors = [];

    // Check quota usage - check critical threshold first
    if (accountInfo.quota_usage_percent > 95) {
      status = HealthStatus.UNHEALTHY;
      errors.push(`Email quota critical: ${accountInfo.quota_usage_percent}%`);
    } else if (accountInfo.quota_usage_percent > 90) {
      status = HealthStatus.DEGRADED;
      warnings.push(
        `Email quota usage high: ${accountInfo.quota_usage_percent}%`,
      );
    }

    // Check for missing configurations
    if (!contactLists.newsletter_list_found) {
      warnings.push("Newsletter list not found");
    }

    if (!templates.welcome_template_found) {
      warnings.push("Welcome email template not found");
    }

    if (!templates.verification_template_found) {
      warnings.push("Verification email template not found");
    }

    // Check for high bounce rate
    if (recentActivity.requests > 0) {
      const bounceRate =
        ((recentActivity.hard_bounces + recentActivity.soft_bounces) /
          recentActivity.requests) *
        100;
      if (bounceRate > 5) {
        status = HealthStatus.DEGRADED;
        warnings.push(`High bounce rate: ${bounceRate.toFixed(2)}%`);
      }
    }

    // Check for service errors
    if (contactLists.error || templates.error || recentActivity.error) {
      status = HealthStatus.DEGRADED;
    }

    return {
      status,
      response_time: `${Date.now() - startTime}ms`,
      details: {
        api_accessible: true,
        account: accountInfo,
        lists: contactLists,
        templates: templates,
        recent_activity: recentActivity,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined,
      },
    };
  } catch (error) {
    // Determine if this is a configuration error or service error
    const isConfigError =
      error.message.includes("API key") ||
      error.message.includes("not configured");

    return {
      status: HealthStatus.UNHEALTHY,
      response_time: `${Date.now() - startTime}ms`,
      error: error.message,
      details: {
        api_accessible: false,
        error_type: isConfigError ? "ConfigurationError" : "ServiceError",
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
    const health = await checkBrevoHealth();
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
