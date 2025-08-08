import { getDatabase } from "../api/lib/database.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const db = getDatabase();

  console.log("=== Running Database Migrations ===\n");

  // Read all migration files
  const migrationsDir = path.join(__dirname, "..", "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");

    // First remove all comment lines, then split by semicolons
    const cleanedSql = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");

    const statements = cleanedSql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s + (s.toUpperCase().includes("END") ? "" : ";"));

    // Execute statements individually (Turso doesn't support transactions)
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await db.execute(statement);
          console.log(`  ✓ Executed: ${statement.substring(0, 50)}...`);
        } catch (error) {
          if (
            error.message.includes("already exists") ||
            error.message.includes("duplicate column name")
          ) {
            console.log(
              `  ⚠ Already exists (skipped): ${statement.substring(0, 30)}...`,
            );
          } else {
            console.error(`  ✗ Failed: ${error.message}`);
            console.error(`    Statement: ${statement.substring(0, 100)}...`);
            // For critical errors, continue but log them
            console.warn(
              `    Continuing migration despite error in ${file}...`,
            );
          }
        }
      }
    }

    console.log(`  Completed ${file}\n`);
  }

  // Check final state
  console.log("=== Checking Final State ===\n");

  const tables = await db.execute(`
    SELECT name FROM sqlite_master 
    WHERE type='table' 
    ORDER BY name
  `);

  console.log("Tables in database:");
  tables.rows.forEach((t) => console.log(`  - ${t.name}`));

  process.exit(0);
}

runMigrations().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
