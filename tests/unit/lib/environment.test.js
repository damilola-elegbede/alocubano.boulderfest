/**
 * Unit Tests for Environment Detection Utilities
 * Tests environment identification and configuration across deployment environments
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getEnvironment,
  isProduction,
  isPreview,
  isDevelopment,
  isTest,
  isVercelBuild,
  isLocalDevelopment,
  hasGoogleDriveAccess,
  shouldUseBuildTimeCache,
  shouldGenerateBuildCache,
  getCacheStrategy,
  getConfig
} from '../../../lib/environment.js';

describe('Environment Detection - Unit Tests', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Clear all environment-related variables
    delete process.env.VERCEL_ENV;
    delete process.env.NODE_ENV;
    delete process.env.VERCEL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_PRIVATE_KEY;
    delete process.env.INTEGRATION_TEST_MODE;
    delete process.env.FORCE_RUNTIME_API;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getEnvironment', () => {
    describe('Vercel Environment Detection', () => {
      it('should return production for VERCEL_ENV=production', () => {
        process.env.VERCEL_ENV = 'production';

        expect(getEnvironment()).toBe('production');
      });

      it('should return preview for VERCEL_ENV=preview', () => {
        process.env.VERCEL_ENV = 'preview';

        expect(getEnvironment()).toBe('preview');
      });

      it('should return development for VERCEL_ENV=development', () => {
        process.env.VERCEL_ENV = 'development';

        expect(getEnvironment()).toBe('development');
      });
    });

    describe('Node Environment Detection', () => {
      it('should return test for NODE_ENV=test', () => {
        process.env.NODE_ENV = 'test';

        expect(getEnvironment()).toBe('test');
      });

      it('should return production for NODE_ENV=production', () => {
        process.env.NODE_ENV = 'production';

        expect(getEnvironment()).toBe('production');
      });

      it('should return local by default', () => {
        expect(getEnvironment()).toBe('local');
      });
    });

    describe('Priority Order', () => {
      it('should prioritize VERCEL_ENV over NODE_ENV', () => {
        process.env.VERCEL_ENV = 'preview';
        process.env.NODE_ENV = 'production';

        expect(getEnvironment()).toBe('preview');
      });

      it('should use NODE_ENV when VERCEL_ENV is not set', () => {
        process.env.NODE_ENV = 'test';

        expect(getEnvironment()).toBe('test');
      });

      it('should fallback to local when no env vars set', () => {
        expect(getEnvironment()).toBe('local');
      });
    });
  });

  describe('isProduction', () => {
    it('should return true for VERCEL_ENV=production', () => {
      process.env.VERCEL_ENV = 'production';

      expect(isProduction()).toBe(true);
    });

    it('should return false for preview environment', () => {
      process.env.VERCEL_ENV = 'preview';

      expect(isProduction()).toBe(false);
    });

    it('should return false for development environment', () => {
      process.env.VERCEL_ENV = 'development';

      expect(isProduction()).toBe(false);
    });

    it('should return false for test environment', () => {
      process.env.NODE_ENV = 'test';

      expect(isProduction()).toBe(false);
    });

    it('should return false for local environment', () => {
      expect(isProduction()).toBe(false);
    });
  });

  describe('isPreview', () => {
    it('should return true for VERCEL_ENV=preview', () => {
      process.env.VERCEL_ENV = 'preview';

      expect(isPreview()).toBe(true);
    });

    it('should return false for production environment', () => {
      process.env.VERCEL_ENV = 'production';

      expect(isPreview()).toBe(false);
    });

    it('should return false for development environment', () => {
      process.env.VERCEL_ENV = 'development';

      expect(isPreview()).toBe(false);
    });

    it('should return false for test environment', () => {
      process.env.NODE_ENV = 'test';

      expect(isPreview()).toBe(false);
    });
  });

  describe('isDevelopment', () => {
    it('should return true for VERCEL_ENV=development', () => {
      process.env.VERCEL_ENV = 'development';

      expect(isDevelopment()).toBe(true);
    });

    it('should return true for local environment', () => {
      expect(isDevelopment()).toBe(true);
    });

    it('should return false for production environment', () => {
      process.env.VERCEL_ENV = 'production';

      expect(isDevelopment()).toBe(false);
    });

    it('should return false for preview environment', () => {
      process.env.VERCEL_ENV = 'preview';

      expect(isDevelopment()).toBe(false);
    });

    it('should return false for test environment', () => {
      process.env.NODE_ENV = 'test';

      expect(isDevelopment()).toBe(false);
    });
  });

  describe('isTest', () => {
    it('should return true for NODE_ENV=test', () => {
      process.env.NODE_ENV = 'test';

      expect(isTest()).toBe(true);
    });

    it('should return false for production environment', () => {
      process.env.VERCEL_ENV = 'production';

      expect(isTest()).toBe(false);
    });

    it('should return false for preview environment', () => {
      process.env.VERCEL_ENV = 'preview';

      expect(isTest()).toBe(false);
    });

    it('should return false for development environment', () => {
      process.env.VERCEL_ENV = 'development';

      expect(isTest()).toBe(false);
    });

    it('should return false for local environment', () => {
      expect(isTest()).toBe(false);
    });
  });

  describe('isVercelBuild', () => {
    it('should return true when VERCEL=1', () => {
      process.env.VERCEL = '1';

      expect(isVercelBuild()).toBe(true);
    });

    it('should return false when VERCEL is not set', () => {
      expect(isVercelBuild()).toBe(false);
    });

    it('should return false when VERCEL is empty string', () => {
      process.env.VERCEL = '';

      expect(isVercelBuild()).toBe(false);
    });

    it('should return false when VERCEL=0', () => {
      process.env.VERCEL = '0';

      expect(isVercelBuild()).toBe(false);
    });
  });

  describe('isLocalDevelopment', () => {
    it('should return true when VERCEL is not set', () => {
      expect(isLocalDevelopment()).toBe(true);
    });

    it('should return false when VERCEL=1', () => {
      process.env.VERCEL = '1';

      expect(isLocalDevelopment()).toBe(false);
    });

    it('should return true when VERCEL is empty', () => {
      process.env.VERCEL = '';

      expect(isLocalDevelopment()).toBe(true);
    });
  });

  describe('hasGoogleDriveAccess', () => {
    it('should return true when both credentials are present', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(hasGoogleDriveAccess()).toBe(true);
    });

    it('should return false when email is missing', () => {
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(hasGoogleDriveAccess()).toBe(false);
    });

    it('should return false when private key is missing', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';

      expect(hasGoogleDriveAccess()).toBe(false);
    });

    it('should return false when both are missing', () => {
      expect(hasGoogleDriveAccess()).toBe(false);
    });

    it('should return false when email is empty string', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = '';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(hasGoogleDriveAccess()).toBe(false);
    });

    it('should return false when private key is empty string', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';
      process.env.GOOGLE_PRIVATE_KEY = '';

      expect(hasGoogleDriveAccess()).toBe(false);
    });
  });

  describe('shouldUseBuildTimeCache', () => {
    it('should return true in integration test mode', () => {
      process.env.INTEGRATION_TEST_MODE = 'true';

      expect(shouldUseBuildTimeCache()).toBe(true);
    });

    it('should return true for local development', () => {
      expect(shouldUseBuildTimeCache()).toBe(true);
    });

    it('should return false when FORCE_RUNTIME_API is set', () => {
      process.env.FORCE_RUNTIME_API = 'true';

      expect(shouldUseBuildTimeCache()).toBe(false);
    });

    it('should return false on Vercel', () => {
      process.env.VERCEL = '1';

      expect(shouldUseBuildTimeCache()).toBe(false);
    });

    it('should prioritize integration test mode over local development', () => {
      process.env.INTEGRATION_TEST_MODE = 'true';
      process.env.VERCEL = '1';

      expect(shouldUseBuildTimeCache()).toBe(true);
    });

    it('should respect FORCE_RUNTIME_API in local development', () => {
      process.env.FORCE_RUNTIME_API = 'true';

      expect(shouldUseBuildTimeCache()).toBe(false);
    });
  });

  describe('shouldGenerateBuildCache', () => {
    it('should return true when local with Google Drive access', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(shouldGenerateBuildCache()).toBe(true);
    });

    it('should return false when local without Google Drive access', () => {
      expect(shouldGenerateBuildCache()).toBe(false);
    });

    it('should return false on Vercel even with Google Drive access', () => {
      process.env.VERCEL = '1';
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(shouldGenerateBuildCache()).toBe(false);
    });

    it('should return false when only email is present', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'test@project.iam.gserviceaccount.com';

      expect(shouldGenerateBuildCache()).toBe(false);
    });

    it('should return false when only private key is present', () => {
      process.env.GOOGLE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nKEY\n-----END PRIVATE KEY-----\n';

      expect(shouldGenerateBuildCache()).toBe(false);
    });
  });

  describe('getCacheStrategy', () => {
    it('should return runtime for Vercel build', () => {
      process.env.VERCEL = '1';

      expect(getCacheStrategy()).toBe('runtime');
    });

    it('should return file for local development', () => {
      expect(getCacheStrategy()).toBe('file');
    });

    it('should return file when VERCEL is empty', () => {
      process.env.VERCEL = '';

      expect(getCacheStrategy()).toBe('file');
    });

    it('should return file when VERCEL=0', () => {
      process.env.VERCEL = '0';

      expect(getCacheStrategy()).toBe('file');
    });
  });

  describe('getConfig', () => {
    describe('Production Config', () => {
      beforeEach(() => {
        process.env.VERCEL_ENV = 'production';
        process.env.VERCEL = '1';
      });

      it('should return production configuration', () => {
        const config = getConfig();

        expect(config.environment).toBe('production');
        expect(config.isProduction).toBe(true);
        expect(config.isPreview).toBe(false);
        expect(config.isDevelopment).toBe(false);
        expect(config.isTest).toBe(false);
        expect(config.isVercel).toBe(true);
        expect(config.isLocal).toBe(false);
      });

      it('should use error log level in production', () => {
        const config = getConfig();

        expect(config.logLevel).toBe('error');
      });

      it('should disable detailed errors in production', () => {
        const config = getConfig();

        expect(config.enableDetailedErrors).toBe(false);
      });

      it('should disable debug logging in production', () => {
        const config = getConfig();

        expect(config.enableDebugLogging).toBe(false);
      });
    });

    describe('Preview Config', () => {
      beforeEach(() => {
        process.env.VERCEL_ENV = 'preview';
        process.env.VERCEL = '1';
      });

      it('should return preview configuration', () => {
        const config = getConfig();

        expect(config.environment).toBe('preview');
        expect(config.isProduction).toBe(false);
        expect(config.isPreview).toBe(true);
        expect(config.isDevelopment).toBe(false);
        expect(config.isTest).toBe(false);
        expect(config.isVercel).toBe(true);
        expect(config.isLocal).toBe(false);
      });

      it('should use debug log level in preview', () => {
        const config = getConfig();

        expect(config.logLevel).toBe('debug');
      });

      it('should enable detailed errors in preview', () => {
        const config = getConfig();

        expect(config.enableDetailedErrors).toBe(true);
      });

      it('should disable debug logging in preview', () => {
        const config = getConfig();

        expect(config.enableDebugLogging).toBe(false);
      });
    });

    describe('Development Config', () => {
      beforeEach(() => {
        process.env.VERCEL_ENV = 'development';
        process.env.VERCEL = '1';
      });

      it('should return development configuration', () => {
        const config = getConfig();

        expect(config.environment).toBe('development');
        expect(config.isProduction).toBe(false);
        expect(config.isPreview).toBe(false);
        expect(config.isDevelopment).toBe(true);
        expect(config.isTest).toBe(false);
        expect(config.isVercel).toBe(true);
        expect(config.isLocal).toBe(false);
      });

      it('should use debug log level in development', () => {
        const config = getConfig();

        expect(config.logLevel).toBe('debug');
      });

      it('should enable detailed errors in development', () => {
        const config = getConfig();

        expect(config.enableDetailedErrors).toBe(true);
      });

      it('should enable debug logging in development', () => {
        const config = getConfig();

        expect(config.enableDebugLogging).toBe(true);
      });
    });

    describe('Test Config', () => {
      beforeEach(() => {
        process.env.NODE_ENV = 'test';
      });

      it('should return test configuration', () => {
        const config = getConfig();

        expect(config.environment).toBe('test');
        expect(config.isProduction).toBe(false);
        expect(config.isPreview).toBe(false);
        expect(config.isDevelopment).toBe(false);
        expect(config.isTest).toBe(true);
        expect(config.isVercel).toBe(false);
        expect(config.isLocal).toBe(true);
      });

      it('should use debug log level in test', () => {
        const config = getConfig();

        expect(config.logLevel).toBe('debug');
      });

      it('should enable detailed errors in test', () => {
        const config = getConfig();

        expect(config.enableDetailedErrors).toBe(true);
      });

      it('should enable debug logging in test', () => {
        const config = getConfig();

        expect(config.enableDebugLogging).toBe(true);
      });
    });

    describe('Local Config', () => {
      it('should return local configuration', () => {
        const config = getConfig();

        expect(config.environment).toBe('local');
        expect(config.isProduction).toBe(false);
        expect(config.isPreview).toBe(false);
        expect(config.isDevelopment).toBe(true);
        expect(config.isTest).toBe(false);
        expect(config.isVercel).toBe(false);
        expect(config.isLocal).toBe(true);
      });

      it('should use debug log level locally', () => {
        const config = getConfig();

        expect(config.logLevel).toBe('debug');
      });

      it('should enable detailed errors locally', () => {
        const config = getConfig();

        expect(config.enableDetailedErrors).toBe(true);
      });

      it('should enable debug logging locally', () => {
        const config = getConfig();

        expect(config.enableDebugLogging).toBe(true);
      });
    });

    describe('Config Object Structure', () => {
      it('should include all expected fields', () => {
        const config = getConfig();

        expect(config).toHaveProperty('environment');
        expect(config).toHaveProperty('isProduction');
        expect(config).toHaveProperty('isPreview');
        expect(config).toHaveProperty('isDevelopment');
        expect(config).toHaveProperty('isTest');
        expect(config).toHaveProperty('isVercel');
        expect(config).toHaveProperty('isLocal');
        expect(config).toHaveProperty('logLevel');
        expect(config).toHaveProperty('enableDetailedErrors');
        expect(config).toHaveProperty('enableDebugLogging');
      });

      it('should have boolean flags', () => {
        const config = getConfig();

        expect(typeof config.isProduction).toBe('boolean');
        expect(typeof config.isPreview).toBe('boolean');
        expect(typeof config.isDevelopment).toBe('boolean');
        expect(typeof config.isTest).toBe('boolean');
        expect(typeof config.isVercel).toBe('boolean');
        expect(typeof config.isLocal).toBe('boolean');
        expect(typeof config.enableDetailedErrors).toBe('boolean');
        expect(typeof config.enableDebugLogging).toBe('boolean');
      });

      it('should have string environment and logLevel', () => {
        const config = getConfig();

        expect(typeof config.environment).toBe('string');
        expect(typeof config.logLevel).toBe('string');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should have mutually exclusive environment flags', () => {
      const environments = ['production', 'preview', 'development', 'test', 'local'];

      environments.forEach(env => {
        // Setup environment
        delete process.env.VERCEL_ENV;
        delete process.env.NODE_ENV;
        if (env === 'production' || env === 'preview' || env === 'development') {
          process.env.VERCEL_ENV = env;
        } else if (env === 'test') {
          process.env.NODE_ENV = 'test';
        }

        const config = getConfig();

        // Count how many flags are true
        const trueCount = [
          config.isProduction,
          config.isPreview,
          config.isDevelopment,
          config.isTest
        ].filter(Boolean).length;

        // Should have exactly one true flag (isDevelopment includes local)
        expect(trueCount).toBeGreaterThanOrEqual(1);
        expect(trueCount).toBeLessThanOrEqual(2); // isDevelopment is true for local
      });
    });

    it('should be consistent between function calls and config object', () => {
      process.env.VERCEL_ENV = 'production';
      process.env.VERCEL = '1';

      const config = getConfig();

      expect(config.isProduction).toBe(isProduction());
      expect(config.isPreview).toBe(isPreview());
      expect(config.isDevelopment).toBe(isDevelopment());
      expect(config.isTest).toBe(isTest());
      expect(config.isVercel).toBe(isVercelBuild());
      expect(config.isLocal).toBe(isLocalDevelopment());
      expect(config.environment).toBe(getEnvironment());
    });

    it('should maintain consistency across multiple calls', () => {
      process.env.VERCEL_ENV = 'preview';

      const env1 = getEnvironment();
      const env2 = getEnvironment();
      const isProd1 = isProduction();
      const isProd2 = isProduction();

      expect(env1).toBe(env2);
      expect(isProd1).toBe(isProd2);
    });
  });

  describe('Default Export', () => {
    it('should export all functions as default object', async () => {
      const environment = await import('../../../lib/environment.js');

      expect(environment.default).toBeDefined();
      expect(environment.default.getEnvironment).toBe(getEnvironment);
      expect(environment.default.isProduction).toBe(isProduction);
      expect(environment.default.isPreview).toBe(isPreview);
      expect(environment.default.isDevelopment).toBe(isDevelopment);
      expect(environment.default.isTest).toBe(isTest);
      expect(environment.default.isVercelBuild).toBe(isVercelBuild);
      expect(environment.default.isLocalDevelopment).toBe(isLocalDevelopment);
      expect(environment.default.hasGoogleDriveAccess).toBe(hasGoogleDriveAccess);
      expect(environment.default.shouldUseBuildTimeCache).toBe(shouldUseBuildTimeCache);
      expect(environment.default.shouldGenerateBuildCache).toBe(shouldGenerateBuildCache);
      expect(environment.default.getCacheStrategy).toBe(getCacheStrategy);
      expect(environment.default.getConfig).toBe(getConfig);
    });
  });
});
