-- Test migration to verify system works

-- UP migration
CREATE TABLE IF NOT EXISTS test_table (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DOWN migration (for rollback)
-- DROP TABLE IF EXISTS test_table;