import { getDatabase } from '../api/lib/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const db = getDatabase();
  
  console.log('=== Running Database Migrations ===\n');
  
  // Read all migration files
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of files) {
    console.log(`Running migration: ${file}`);
    
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    
    // Split by semicolons but be careful with triggers
    const statements = sql
      .split(/;\s*$(?!\s*END)/gm)
      .filter(s => s.trim())
      .map(s => s.trim() + (s.trim().toUpperCase().includes('END') ? '' : ';'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.execute(statement);
          console.log(`  ✓ Executed: ${statement.substring(0, 50)}...`);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`  ⚠ Already exists (skipped)`);
          } else {
            console.error(`  ✗ Failed:`, error.message);
            // Continue with other statements
          }
        }
      }
    }
    
    console.log(`  Completed ${file}\n`);
  }
  
  // Check final state
  console.log('=== Checking Final State ===\n');
  
  const tables = await db.execute(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `);
  
  console.log('Tables in database:');
  tables.rows.forEach(t => console.log(`  - ${t.name}`));
  
  process.exit(0);
}

runMigrations().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});