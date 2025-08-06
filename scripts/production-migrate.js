#!/usr/bin/env node

/**
 * Production Migration Deployment Script
 * Safe deployment of database migrations to production environment
 */

import { MigrationSystem } from './migrate.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class ProductionMigrationDeployment {
  constructor() {
    this.migration = new MigrationSystem();
  }

  /**
   * Pre-flight checks before running production migrations
   */
  async preFlightChecks() {
    console.log('🔍 Running pre-flight checks...');

    // Check environment variables
    const requiredEnvVars = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];
    const missing = requiredEnvVars.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // Test database connection
    console.log('🔗 Testing database connection...');
    try {
      const db = this.migration.db;
      await db.execute('SELECT 1');
      console.log('✅ Database connection successful');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Check migration status
    console.log('📊 Checking current migration status...');
    const status = await this.migration.status();
    
    if (status.pending > 0) {
      console.log(`⚠️  Found ${status.pending} pending migrations`);
      return status;
    } else {
      console.log('✅ No pending migrations found');
      return status;
    }
  }

  /**
   * Create database backup before migrations (if supported)
   */
  async createBackup() {
    console.log('💾 Creating database backup...');
    
    try {
      // For Turso, we can create a database replica as backup
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `backup-pre-migration-${timestamp}`;
      
      console.log(`📂 Backup would be created as: ${backupName}`);
      console.log('ℹ️  Manual backup: Use Turso CLI to create replica before deployment');
      
      return { backupName, created: false, message: 'Manual backup recommended' };
    } catch (error) {
      console.warn('⚠️  Backup creation failed:', error.message);
      console.log('ℹ️  Continuing without backup - ensure manual backup exists');
      return { created: false, error: error.message };
    }
  }

  /**
   * Run production migrations with safety checks
   */
  async deployMigrations(options = {}) {
    const { dryRun = false, skipBackup = false } = options;
    
    console.log('🚀 Starting production migration deployment...');
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}`);

    try {
      // Step 1: Pre-flight checks
      const status = await this.preFlightChecks();
      
      if (status.pending === 0) {
        console.log('✨ No migrations to deploy');
        return { success: true, deployed: 0, message: 'No pending migrations' };
      }

      // Step 2: Create backup
      if (!skipBackup && !dryRun) {
        await this.createBackup();
      }

      // Step 3: Show what will be deployed
      console.log('\n📋 Migrations to be deployed:');
      const availableMigrations = await this.migration.getAvailableMigrations();
      const executedMigrations = await this.migration.getExecutedMigrations();
      const pendingMigrations = availableMigrations.filter(
        migration => !executedMigrations.includes(migration)
      );

      pendingMigrations.forEach((migration, index) => {
        console.log(`  ${index + 1}. ${migration}`);
      });

      // Step 4: Execute migrations (or simulate in dry run)
      if (dryRun) {
        console.log('\n🧪 DRY RUN - No changes will be made');
        return { 
          success: true, 
          deployed: 0, 
          pending: pendingMigrations.length,
          message: 'Dry run completed successfully' 
        };
      }

      // Step 5: Run actual migrations
      console.log('\n🔄 Executing migrations...');
      const result = await this.migration.runMigrations();

      // Step 6: Verify deployment
      console.log('\n🔍 Verifying deployment...');
      const verification = await this.migration.verifyMigrations();
      
      if (!verification.verified) {
        throw new Error('Migration verification failed');
      }

      // Step 7: Final status check
      const finalStatus = await this.migration.status();
      
      console.log('\n✅ Production migration deployment completed successfully');
      console.log(`📊 Deployed: ${result.executed} migrations`);
      console.log(`📊 Total migrations: ${finalStatus.total}`);
      console.log(`📊 Pending: ${finalStatus.pending}`);

      return {
        success: true,
        deployed: result.executed,
        total: finalStatus.total,
        pending: finalStatus.pending,
        verification
      };

    } catch (error) {
      console.error('❌ Production migration deployment failed:', error.message);
      
      // In production, provide recovery guidance
      if (process.env.NODE_ENV === 'production') {
        console.log('\n🚨 RECOVERY STEPS:');
        console.log('1. Check database connection and credentials');
        console.log('2. Verify migration file integrity');
        console.log('3. Review logs for specific error details');
        console.log('4. Consider restoring from backup if available');
        console.log('5. Contact development team for assistance');
      }

      throw error;
    }
  }

  /**
   * Health check after migration deployment
   */
  async healthCheck() {
    console.log('🏥 Running post-migration health check...');
    
    try {
      // Test basic database functionality
      const db = this.migration.db;
      
      // Check if core tables exist
      const tables = ['transactions', 'tickets', 'transaction_items', 'payment_events'];
      
      for (const table of tables) {
        try {
          await db.execute(`SELECT COUNT(*) FROM ${table} LIMIT 1`);
          console.log(`✅ Table ${table} is accessible`);
        } catch (error) {
          console.error(`❌ Table ${table} check failed:`, error.message);
          throw error;
        }
      }

      // Check migration system health
      await this.migration.verifyMigrations();
      
      console.log('✅ Health check passed');
      return { healthy: true };
      
    } catch (error) {
      console.error('❌ Health check failed:', error.message);
      return { healthy: false, error: error.message };
    }
  }
}

/**
 * CLI interface for production migrations
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'deploy';
  const flags = args.slice(1);
  
  const dryRun = flags.includes('--dry-run');
  const skipBackup = flags.includes('--skip-backup');
  const force = flags.includes('--force');

  const deployment = new ProductionMigrationDeployment();

  // Production safety check
  if (process.env.NODE_ENV === 'production' && !force && !dryRun) {
    console.log('⚠️  Production deployment detected!');
    console.log('Add --force flag to confirm production deployment');
    console.log('Or use --dry-run to simulate deployment');
    process.exit(1);
  }

  try {
    switch (command) {
      case 'deploy':
        await deployment.deployMigrations({ dryRun, skipBackup });
        break;
        
      case 'check':
        await deployment.preFlightChecks();
        break;
        
      case 'health':
        await deployment.healthCheck();
        break;
        
      case 'backup':
        await deployment.createBackup();
        break;
        
      case 'help':
        console.log(`
Production Migration Deployment Tool

Usage: node scripts/production-migrate.js [command] [flags]

Commands:
  deploy    Deploy pending migrations to production (default)
  check     Run pre-flight checks only
  health    Run post-deployment health check
  backup    Create database backup
  help      Show this help message

Flags:
  --dry-run      Simulate deployment without making changes
  --skip-backup  Skip backup creation step
  --force        Force production deployment (required in production)

Examples:
  node scripts/production-migrate.js deploy --dry-run
  NODE_ENV=production node scripts/production-migrate.js deploy --force
  node scripts/production-migrate.js check
  node scripts/production-migrate.js health
        `);
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run "node scripts/production-migrate.js help" for usage');
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Production migration error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Export for use as module
export { ProductionMigrationDeployment };

// Run CLI if executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}