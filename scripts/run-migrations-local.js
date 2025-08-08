import { getDatabase } from "../api/lib/database.js";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(dirname(__dirname), ".env.local") });

async function runMigrations() {
  const db = getDatabase();

  try {
    // Create migrations table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = join(dirname(__dirname), "migrations");
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    console.log(`Found ${files.length} migration files`);

    for (const file of files) {
      // Check if migration was already executed
      const result = await db.execute({
        sql: "SELECT * FROM migrations WHERE filename = ?",
        args: [file],
      });

      if (result.rows.length > 0) {
        console.log(`✓ Already executed: ${file}`);
        continue;
      }

      // Read and execute migration
      const sql = readFileSync(join(migrationsDir, file), "utf-8");

      // Split by semicolon and execute each statement
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      console.log(
        `Running migration: ${file} (${statements.length} statements)`,
      );

      // Use transaction for atomic migration execution
      try {
        await db.execute("BEGIN TRANSACTION");
        
        for (const statement of statements) {
          try {
            await db.execute(statement);
          } catch (error) {
            console.error(`Error executing statement in ${file}:`, error.message);
            console.error("Statement:", statement.substring(0, 100) + "...");
            await db.execute("ROLLBACK");
            throw error;
          }
        }
        
        // Record migration as executed within transaction
        await db.execute({
          sql: `INSERT OR IGNORE INTO migrations (filename, executed_at) VALUES (?, CURRENT_TIMESTAMP)`,
          args: [file],
        });
        
        await db.execute("COMMIT");
        console.log(`✅ Migration ${file} completed successfully`);
        
      } catch (error) {
        // Rollback already handled above for statement errors
        if (!error.message.includes("Error executing statement")) {
          await db.execute("ROLLBACK").catch(() => {});
        }
        throw error;
      }
    }

    console.log("\n✅ All migrations completed successfully");

    // Show table structure
    const tables = await db.execute(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);

    console.log("\n📊 Database tables:");
    for (const table of tables.rows) {
      console.log(`  - ${table.name}`);
    }
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

runMigrations().catch(console.error);
