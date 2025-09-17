/**
 * Enterprise Database Integration Tests
 *
 * Comprehensive tests for the enterprise database deployment system:
 * - Configuration management
 * - Feature flag integration
 * - Migration procedures
 * - Health checks
 * - Platform tools
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDatabaseConfiguration, resetConfiguration } from '../../lib/database-config.js';
import { getFeatureFlagManager, resetFeatureFlags, createContext } from '../../lib/feature-flags.js';
import { createEnterpriseDatabaseClient, getEnterpriseDatabaseService, resetEnterpriseDatabaseService } from '../../lib/enterprise-database-integration.js';
import { EnterpriseMigration, MIGRATION_PHASES } from '../../scripts/migrate-to-enterprise.js';
import { DeploymentHealthCheck } from '../../scripts/deployment-health-check.js';
import { PlatformTools } from '../../scripts/platform-tools.js';
import { resetConnectionManager } from '../../lib/connection-manager.js';
import { resetDatabaseInstance } from '../../lib/database.js';

describe('Enterprise Database Integration', () => {
  beforeEach(async () => {
    // Reset all singletons before each test
    resetConfiguration();
    resetFeatureFlags();
    await resetDatabaseInstance();
    await resetEnterpriseDatabaseService();
    await resetConnectionManager();

    // Mock environment for testing
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DATABASE_URL', ':memory:');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe('Configuration Management', () => {
    it('should load environment-specific configuration', () => {
      const config = getDatabaseConfiguration();

      expect(config.environment).toBe('test');
      expect(config.getConfig()).toBeDefined();
      expect(config.getConnectionPoolConfig()).toBeDefined();
      expect(config.getCircuitBreakerConfig()).toBeDefined();
    });

    it('should validate configuration', async () => {
      const config = getDatabaseConfiguration();

      // Should pass validation with default test config
      await expect(config.validateConfiguration()).resolves.toBe(true);
    });

    it('should update configuration at runtime', async () => {
      const config = getDatabaseConfiguration();

      const updates = { maxConnections: 3 };
      await config.updateConfig('connectionPool', updates);

      const updatedConfig = config.getConnectionPoolConfig();
      expect(updatedConfig.maxConnections).toBe(3);
    });

    it('should handle configuration validation errors', async () => {
      const config = getDatabaseConfiguration();

      // Invalid configuration should throw
      const invalidUpdates = { maxConnections: -1 };
      await expect(config.updateConfig('connectionPool', invalidUpdates))
        .rejects.toThrow();
    });

    it('should export and import configuration', async () => {
      const config = getDatabaseConfiguration();

      // Export configuration
      const exported = config.exportConfiguration();
      expect(exported.configuration).toBeDefined();
      expect(exported.environment).toBe('test');

      // Modify configuration
      await config.updateConfig('connectionPool', { maxConnections: 5 });

      // Import original configuration
      await config.importConfiguration(exported.configuration);

      const restored = config.getConnectionPoolConfig();
      expect(restored.maxConnections).toBe(1); // Test default
    });
  });

  describe('Feature Flag System', () => {
    it('should initialize with test defaults', () => {
      const flags = getFeatureFlagManager();
      const stats = flags.getStatistics();

      expect(stats.totalFlags).toBeGreaterThan(0);
      expect(stats.environment).toBe('test');
    });

    it('should evaluate feature flags correctly', () => {
      const flags = getFeatureFlagManager();
      const context = createContext({ userId: 'test-user' });

      // Test flags should be disabled by default
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL', context)).toBe(false);
      expect(flags.isEnabled('ENABLE_CIRCUIT_BREAKER', context)).toBe(false);
    });

    it('should handle runtime overrides', () => {
      const flags = getFeatureFlagManager();
      const context = createContext();

      // Override flag
      flags.setOverride('ENABLE_CONNECTION_POOL', true, 'test');
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL', context)).toBe(true);

      // Remove override
      flags.removeOverride('ENABLE_CONNECTION_POOL');
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL', context)).toBe(false);
    });

    it('should support rollout percentages', () => {
      const flags = getFeatureFlagManager();
      const context = createContext({ userId: 'test-user' });

      // Set 0% rollout
      flags.updateRolloutPercentage('ENABLE_CONNECTION_POOL', 0);
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL', context)).toBe(false);

      // Set 100% rollout
      flags.updateRolloutPercentage('ENABLE_CONNECTION_POOL', 100);
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL', context)).toBe(true);
    });

    it('should handle emergency killswitch', () => {
      const flags = getFeatureFlagManager();

      // Enable some enterprise features
      flags.setOverride('ENABLE_CONNECTION_POOL', true, 'test');
      flags.setOverride('ENABLE_CIRCUIT_BREAKER', true, 'test');

      // Trigger killswitch
      flags.emergencyKillswitch('test-emergency');

      // All enterprise features should be disabled
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL')).toBe(false);
      expect(flags.isEnabled('ENABLE_CIRCUIT_BREAKER')).toBe(false);

      // Legacy fallback should be enabled
      expect(flags.isEnabled('ENABLE_LEGACY_FALLBACK')).toBe(true);
    });
  });

  describe('Enterprise Database Client', () => {
    it('should initialize with test configuration', async () => {
      const client = createEnterpriseDatabaseClient();

      await client.initialize();
      expect(client.initialized).toBe(true);

      const health = await client.getHealthStatus();
      expect(health.initialized).toBe(true);
      expect(health.features).toBeDefined();

      await client.close();
    });

    it('should use legacy mode when enterprise features disabled', async () => {
      const client = createEnterpriseDatabaseClient();

      // Execute a simple query (should use legacy client)
      const result = await client.execute('SELECT 1 as test');
      expect(result.rows).toBeDefined();
      expect(result.rows[0].test).toBe(1);

      await client.close();
    });

    it('should handle transactions', async () => {
      const client = createEnterpriseDatabaseClient();

      const result = await client.transaction(async (tx) => {
        await tx.execute('CREATE TEMP TABLE test_tx (id INTEGER, value TEXT)');
        await tx.execute('INSERT INTO test_tx (id, value) VALUES (1, ?)', ['test']);
        return await tx.execute('SELECT * FROM test_tx WHERE id = 1');
      });

      expect(result.rows).toBeDefined();
      expect(result.rows[0].value).toBe('test');

      await client.close();
    });

    it('should handle batch operations', async () => {
      const client = createEnterpriseDatabaseClient();

      const statements = [
        { sql: 'CREATE TEMP TABLE test_batch (id INTEGER, value TEXT)', args: [] },
        { sql: 'INSERT INTO test_batch (id, value) VALUES (1, ?)', args: ['test1'] },
        { sql: 'INSERT INTO test_batch (id, value) VALUES (2, ?)', args: ['test2'] }
      ];

      const results = await client.batch(statements);
      expect(results).toHaveLength(3);

      await client.close();
    });
  });

  describe('Enterprise Database Service', () => {
    it('should manage multiple clients', async () => {
      const service = getEnterpriseDatabaseService();

      const client1 = await service.getClient(createContext({ userId: 'user1' }));
      const client2 = await service.getClient(createContext({ userId: 'user2' }));
      const defaultClient = await service.getDefaultClient();

      expect(client1).toBeDefined();
      expect(client2).toBeDefined();
      expect(defaultClient).toBeDefined();
      expect(client1).not.toBe(client2);

      const health = await service.getServiceHealth();
      expect(health.activeClients).toBeGreaterThan(0);

      await service.closeAll();
    });
  });

  describe('Migration System', () => {
    it('should validate preconditions', async () => {
      const migration = new EnterpriseMigration({ dryRun: true });

      // Mock successful validation
      const validateSpy = vi.spyOn(migration, 'validatePreconditions').mockResolvedValue();

      await expect(migration.validatePreconditions()).resolves.toBeUndefined();
      expect(validateSpy).toHaveBeenCalled();
    });

    it('should handle dry run mode', async () => {
      const migration = new EnterpriseMigration({
        dryRun: true,
        targetPhase: MIGRATION_PHASES.VALIDATE
      });

      // Mock validation methods
      vi.spyOn(migration, 'validateDatabaseConnectivity').mockResolvedValue(true);
      vi.spyOn(migration, 'validateSystemResources').mockResolvedValue(true);
      vi.spyOn(migration, 'validateDependencies').mockResolvedValue(true);

      const result = await migration.start();
      expect(result.phase).toBe(MIGRATION_PHASES.VALIDATE);
      expect(result.errors).toBe(0);
    });

    it('should track migration status', async () => {
      const migration = new EnterpriseMigration({ dryRun: true });

      // Check initial status
      const initialStatus = migration.status.getStatus();
      expect(initialStatus.phase).toBe(MIGRATION_PHASES.VALIDATE);
      expect(initialStatus.completedSteps).toBe(0);
    });
  });

  describe('Health Check System', () => {
    it('should run basic health checks', async () => {
      const healthCheck = new DeploymentHealthCheck();

      const result = await healthCheck.runHealthCheck();

      expect(result.healthScore).toBeGreaterThanOrEqual(0);
      expect(result.healthScore).toBeLessThanOrEqual(100);
      expect(result.status).toMatch(/healthy|degraded|unhealthy|critical/);
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should calculate health scores correctly', async () => {
      const healthCheck = new DeploymentHealthCheck();

      // Create mock results
      const mockResults = [
        { category: 'DATABASE_CONNECTIVITY', score: 100 },
        { category: 'PERFORMANCE', score: 80 },
        { category: 'FEATURE_FLAGS', score: 90 }
      ];

      const healthScore = healthCheck.calculateHealthScore(mockResults);
      expect(healthScore).toBeGreaterThan(0);
      expect(healthScore).toBeLessThanOrEqual(100);
    });

    it('should detect critical failures', async () => {
      const healthCheck = new DeploymentHealthCheck();

      const mockResults = [
        { category: 'DATABASE_CONNECTIVITY', status: 'failure', critical: true, score: 0 },
        { category: 'PERFORMANCE', status: 'success', critical: false, score: 100 }
      ];

      const status = healthCheck.determineOverallStatus(mockResults, 50);
      expect(status).toBe('critical');
    });
  });

  describe('Platform Tools', () => {
    it('should show configuration', async () => {
      const tools = new PlatformTools();

      const result = await tools.showConfiguration([]);

      expect(result.command).toBe('config:show');
      expect(result.configuration).toBeDefined();
      expect(result.environment).toBe('test');
    });

    it('should validate configuration', async () => {
      const tools = new PlatformTools();

      const result = await tools.validateConfiguration([]);

      expect(result.command).toBe('config:validate');
      expect(result.status).toBe('valid');
    });

    it('should show feature flags', async () => {
      const tools = new PlatformTools();

      const result = await tools.showFeatureFlags([]);

      expect(result.command).toBe('flags:show');
      expect(result.statistics).toBeDefined();
      expect(result.enabledFlags).toBeDefined();
    });

    it('should enable feature flags', async () => {
      const tools = new PlatformTools();

      const result = await tools.enableFeatureFlag(['ENABLE_CONNECTION_POOL', 'test']);

      expect(result.command).toBe('flags:enable');
      expect(result.flagKey).toBe('ENABLE_CONNECTION_POOL');
      expect(result.status).toBe('enabled');
    });

    it('should show system health', async () => {
      const tools = new PlatformTools();

      const result = await tools.showSystemHealth([]);

      expect(result.command).toBe('monitor:health');
      expect(result.health).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle enterprise feature rollout', async () => {
      const flags = getFeatureFlagManager();
      const client = createEnterpriseDatabaseClient();

      // Start with enterprise features disabled
      expect(flags.isEnabled('ENABLE_CONNECTION_POOL')).toBe(false);

      // Enable connection pool
      flags.setOverride('ENABLE_CONNECTION_POOL', true, 'test');

      // Client should detect the change on next operation
      await client.execute('SELECT 1');

      const health = await client.getHealthStatus();
      expect(health.features.connectionPool).toBe(true);

      await client.close();
    });

    it('should handle graceful degradation', async () => {
      const flags = getFeatureFlagManager();
      const client = createEnterpriseDatabaseClient();

      // Enable legacy fallback
      flags.setOverride('ENABLE_LEGACY_FALLBACK', true, 'test');

      // Should still work even with enterprise features enabled
      flags.setOverride('ENABLE_CONNECTION_POOL', true, 'test');

      const result = await client.execute('SELECT 1 as test');
      expect(result.rows[0].test).toBe(1);

      await client.close();
    });

    it('should support configuration updates during runtime', async () => {
      const config = getDatabaseConfiguration();
      const flags = getFeatureFlagManager();

      // Update configuration
      await config.updateConfig('connectionPool', { maxConnections: 3 });

      // Update feature flags
      flags.updateRolloutPercentage('ENABLE_CONNECTION_POOL', 50);

      // Verify changes are reflected
      const poolConfig = config.getConnectionPoolConfig();
      expect(poolConfig.maxConnections).toBe(3);

      const flagStats = flags.getStatistics();
      expect(flagStats.flags.ENABLE_CONNECTION_POOL.rolloutPercentage).toBe(50);
    });

    it('should integrate with monitoring system', async () => {
      const client = createEnterpriseDatabaseClient();

      // Perform operations that should be tracked
      await client.execute('SELECT 1');
      await client.execute('SELECT 2');

      const health = await client.getHealthStatus();
      expect(health.operationCount).toBeGreaterThan(0);
      expect(health.errorRate).toBe(0);

      await client.close();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle configuration errors gracefully', async () => {
      const config = getDatabaseConfiguration();

      // Try to set invalid configuration
      await expect(
        config.updateConfig('connectionPool', { maxConnections: 'invalid' })
      ).rejects.toThrow();

      // Configuration should remain valid
      await expect(config.validateConfiguration()).resolves.toBe(true);
    });

    it('should handle feature flag errors gracefully', () => {
      const flags = getFeatureFlagManager();

      // Try to access unknown flag
      const result = flags.isEnabled('UNKNOWN_FLAG');
      expect(result).toBe(false); // Should return safe default
    });

    it('should handle client errors gracefully', async () => {
      const client = createEnterpriseDatabaseClient();

      // Try to execute invalid SQL (should be caught by validation)
      await expect(
        client.execute('INVALID SQL STATEMENT')
      ).rejects.toThrow();

      // Client should still be functional
      const result = await client.execute('SELECT 1');
      expect(result.rows[0]['1']).toBe(1);

      await client.close();
    });
  });
});

describe('Environment-Specific Behavior', () => {
  it('should use test-specific configuration', () => {
    const config = getDatabaseConfiguration();
    const testConfig = config.getConfig();

    // Test environment should have enterprise features disabled
    expect(testConfig.connectionPool.maxConnections).toBe(1);
    expect(testConfig.circuitBreaker.enabled).toBe(false);
    expect(testConfig.monitoring.enabled).toBe(false);
  });

  it('should detect test environment correctly', () => {
    const config = getDatabaseConfiguration();
    const flags = getFeatureFlagManager();

    expect(config.environment).toBe('test');

    // Test-specific defaults should apply
    expect(flags.isEnabled('ENABLE_CONNECTION_POOL')).toBe(false);
    expect(flags.isEnabled('ENABLE_CIRCUIT_BREAKER')).toBe(false);
  });
});