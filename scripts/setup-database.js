#!/usr/bin/env node

/**
 * Database Setup Script
 * Initializes the database for development and testing
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import { getDatabaseClient } from '../api/lib/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupDatabase() {
  console.log('🔧 Setting up database...');
  
  try {
    // Initialize database client
    const client = await getDatabaseClient();
    console.log('✅ Database client initialized');
    
    // Run migrations
    const migrationsDir = join(__dirname, '..', 'migrations');
    const migrationFiles = await fs.readdir(migrationsDir);
    const sqlFiles = migrationFiles
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    console.log(`📝 Found ${sqlFiles.length} migration files`);
    
    for (const file of sqlFiles) {
      const sql = await fs.readFile(join(migrationsDir, file), 'utf-8');
      
      // Split by semicolons but handle statements properly
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        if (statement.trim()) {
          try {
            await client.execute(statement + ';');
            console.log(`✅ Applied: ${file}`);
          } catch (err) {
            // Ignore errors for existing tables/columns
            if (!err.message.includes('already exists')) {
              console.warn(`⚠️ Warning in ${file}: ${err.message}`);
            }
          }
        }
      }
    }
    
    console.log('✅ Database setup complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}

export { setupDatabase };