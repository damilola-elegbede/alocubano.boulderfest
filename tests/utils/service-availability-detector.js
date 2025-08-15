/**
 * Service Availability Detection System
 * Implements health checking before test execution with graceful degradation
 */

export class ServiceAvailabilityDetector {
  constructor() {
    this.serviceChecks = new Map();
    this.availability = new Map();
    this.lastChecked = new Map();
    this.checkInterval = 60000; // 1 minute cache
  }

  /**
   * Register a service health check
   * @param {string} serviceName - Service identifier
   * @param {Function} healthCheck - Async function that returns boolean or throws
   * @param {Object} options - Configuration options
   */
  registerService(serviceName, healthCheck, options = {}) {
    this.serviceChecks.set(serviceName, {
      check: healthCheck,
      timeout: options.timeout || 5000,
      required: options.required || false,
      fallback: options.fallback || null,
      description: options.description || serviceName,
    });
  }

  /**
   * Check availability of a specific service
   * @param {string} serviceName - Service to check
   * @returns {Promise<boolean>} Service availability
   */
  async checkService(serviceName) {
    const lastCheck = this.lastChecked.get(serviceName);
    const now = Date.now();

    // Use cached result if recent
    if (lastCheck && now - lastCheck < this.checkInterval) {
      return this.availability.get(serviceName) || false;
    }

    const serviceConfig = this.serviceChecks.get(serviceName);
    if (!serviceConfig) {
      console.warn(
        `Service ${serviceName} not registered for availability checking`,
      );
      return false;
    }

    try {
      const available = await Promise.race([
        serviceConfig.check(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Health check timeout")),
            serviceConfig.timeout,
          ),
        ),
      ]);

      this.availability.set(serviceName, Boolean(available));
      this.lastChecked.set(serviceName, now);

      if (available) {
        console.log(`✅ Service ${serviceName} is available`);
      } else {
        console.log(`❌ Service ${serviceName} is unavailable`);
      }

      return Boolean(available);
    } catch (error) {
      console.log(
        `❌ Service ${serviceName} health check failed:`,
        error.message,
      );
      this.availability.set(serviceName, false);
      this.lastChecked.set(serviceName, now);
      return false;
    }
  }

  /**
   * Check availability of all registered services
   * @returns {Promise<Object>} Map of service availability
   */
  async checkAllServices() {
    const results = {};
    const promises = Array.from(this.serviceChecks.keys()).map(
      async (serviceName) => {
        results[serviceName] = await this.checkService(serviceName);
      },
    );

    await Promise.all(promises);
    return results;
  }

  /**
   * Get service prerequisites for test execution
   * @param {string[]} requiredServices - Services needed for test
   * @returns {Promise<Object>} Prerequisite validation result
   */
  async validatePrerequisites(requiredServices) {
    const results = {
      canRun: true,
      available: [],
      unavailable: [],
      required: [],
      optional: [],
      skipReasons: [],
    };

    for (const serviceName of requiredServices) {
      const isAvailable = await this.checkService(serviceName);
      const serviceConfig = this.serviceChecks.get(serviceName);

      if (isAvailable) {
        results.available.push(serviceName);
      } else {
        results.unavailable.push(serviceName);

        if (serviceConfig?.required) {
          results.required.push(serviceName);
          results.canRun = false;
          results.skipReasons.push(
            `Required service ${serviceName} unavailable`,
          );
        } else {
          results.optional.push(serviceName);
        }
      }
    }

    return results;
  }

  /**
   * Create test skip condition helper
   * @param {string[]} requiredServices - Services needed for test
   * @returns {Promise<Function>} Skip condition function
   */
  async createSkipCondition(requiredServices) {
    const prerequisites = await this.validatePrerequisites(requiredServices);

    return function skipIfUnavailable() {
      if (!prerequisites.canRun) {
        return {
          skip: true,
          reason: `Services unavailable: ${prerequisites.skipReasons.join(", ")}`,
        };
      }
      return { skip: false };
    };
  }

  /**
   * Execute test with service availability conditional logic
   * @param {string[]} requiredServices - Services needed for test
   * @param {Function} testFn - Test function to execute
   * @param {Function} fallbackFn - Optional fallback test function
   * @returns {Promise<any>} Test result or skip signal
   */
  async withServiceAvailability(requiredServices, testFn, fallbackFn = null) {
    const prerequisites = await this.validatePrerequisites(requiredServices);

    if (!prerequisites.canRun) {
      if (fallbackFn) {
        console.log(
          `🔄 Running fallback test due to: ${prerequisites.skipReasons.join(", ")}`,
        );
        return await fallbackFn();
      } else {
        console.log(
          `⏭️  Skipping test due to: ${prerequisites.skipReasons.join(", ")}`,
        );
        return { skipped: true, reason: prerequisites.skipReasons.join(", ") };
      }
    }

    return await testFn();
  }

  /**
   * Clear availability cache
   */
  clearCache() {
    this.availability.clear();
    this.lastChecked.clear();
  }

  /**
   * Get current availability status
   * @returns {Object} Current service availability map
   */
  getAvailabilityStatus() {
    const status = {};
    for (const [serviceName] of this.serviceChecks) {
      status[serviceName] = {
        available: this.availability.get(serviceName) || false,
        lastChecked: this.lastChecked.get(serviceName) || null,
        cacheAge: this.lastChecked.get(serviceName)
          ? Date.now() - this.lastChecked.get(serviceName)
          : null,
      };
    }
    return status;
  }
}

// Create and configure global service detector
export const serviceDetector = new ServiceAvailabilityDetector();

// Register common services
serviceDetector.registerService(
  "database",
  async () => {
    try {
      // Check if database client can be created
      const { getDatabaseClient } = await import("../../api/lib/database.js");
      const client = await getDatabaseClient();

      // Perform a simple query
      const result = await client.execute("SELECT 1 as test");
      return result && result.rows && result.rows.length > 0;
    } catch (error) {
      return false;
    }
  },
  {
    timeout: 10000,
    required: true,
    description: "Database connectivity",
  },
);

serviceDetector.registerService(
  "brevo",
  async () => {
    try {
      // Check if Brevo API key is configured
      if (!process.env.BREVO_API_KEY) {
        return false;
      }

      // Try to get Brevo service
      const { getEmailSubscriberService } = await import(
        "../../api/lib/email-subscriber-service.js"
      );
      const service = getEmailSubscriberService();
      await service.ensureInitialized();

      // Try a simple operation
      const stats = await service.getSubscriberStats();
      return stats && typeof stats.total === "number";
    } catch (error) {
      return false;
    }
  },
  {
    timeout: 8000,
    required: false,
    description: "Brevo email service",
  },
);

serviceDetector.registerService(
  "googleSheets",
  async () => {
    try {
      // Check if Google Sheets environment variables are configured
      if (
        !process.env.GOOGLE_SHEET_ID ||
        !process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL
      ) {
        return false;
      }

      // Try to create Google Sheets service
      const { GoogleSheetsService } = await import(
        "../../api/lib/google-sheets-service.js"
      );
      const service = new GoogleSheetsService();
      await service.initialize();

      return service.sheets && service.auth;
    } catch (error) {
      return false;
    }
  },
  {
    timeout: 10000,
    required: false,
    description: "Google Sheets API",
  },
);

serviceDetector.registerService(
  "stripe",
  async () => {
    try {
      // Check if Stripe keys are configured
      if (
        !process.env.STRIPE_SECRET_KEY ||
        !process.env.STRIPE_PUBLISHABLE_KEY
      ) {
        return false;
      }

      // Basic validation of key format
      const secretKey = process.env.STRIPE_SECRET_KEY;
      return (
        secretKey.startsWith("sk_test_") || secretKey.startsWith("sk_live_")
      );
    } catch (error) {
      return false;
    }
  },
  {
    timeout: 3000,
    required: false,
    description: "Stripe payment processing",
  },
);

// Export helper functions for easy use in tests
export const checkService = (serviceName) =>
  serviceDetector.checkService(serviceName);
export const checkAllServices = () => serviceDetector.checkAllServices();
export const validatePrerequisites = (services) =>
  serviceDetector.validatePrerequisites(services);
export const withServiceAvailability = (services, testFn, fallbackFn) =>
  serviceDetector.withServiceAvailability(services, testFn, fallbackFn);

export default serviceDetector;
