/**
 * SQL Security Module
 * Provides secure SQL query construction and validation utilities
 */

/**
 * Validate and sanitize table names for SQLite
 * SQLite table names must match specific patterns for security
 */
export function validateTableName(tableName) {
  if (typeof tableName !== "string") {
    throw new Error("Table name must be a string");
  }

  // SQLite table names can only contain letters, digits, and underscores
  // Must start with a letter or underscore
  const validTableNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

  if (!validTableNamePattern.test(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  // Additional security: reject system tables and dangerous names
  const forbiddenNames = [
    "sqlite_master",
    "sqlite_sequence",
    "sqlite_stat1",
    "sqlite_stat2",
    "sqlite_stat3",
    "sqlite_stat4",
  ];

  if (forbiddenNames.includes(tableName.toLowerCase())) {
    throw new Error(`Access to system table denied: ${tableName}`);
  }

  return tableName;
}

/**
 * Create a secure PRAGMA query for table information
 * Uses whitelisted table names to prevent SQL injection
 */
export function createSecurePragmaQuery(pragmaType, tableName) {
  const validatedTableName = validateTableName(tableName);

  const allowedPragmaTypes = ["table_info", "index_list"];
  if (!allowedPragmaTypes.includes(pragmaType)) {
    throw new Error(`Invalid pragma type: ${pragmaType}`);
  }

  // Return query with validated table name
  return `PRAGMA ${pragmaType}("${validatedTableName}")`;
}

/**
 * Create a secure COUNT query for table row counting
 */
export function createSecureCountQuery(tableName) {
  const validatedTableName = validateTableName(tableName);

  // Use quoted identifier to prevent injection
  return `SELECT COUNT(*) as count FROM "${validatedTableName}"`;
}

/**
 * Whitelist of expected application table names
 * Only these tables will be processed in table information queries
 */
const EXPECTED_TABLE_NAMES = [
  "email_subscribers",
  "email_events",
  "email_audit_log",
  "transactions",
  "tickets",
  "transaction_items",
  "payment_events",
  "qr_validations",
  "wallet_pass_events",
  "access_tokens",
  "action_tokens",
  "migrations",
  "test_table",
];

/**
 * Filter table names to only include expected application tables
 */
export function filterApplicationTables(tableNames) {
  return tableNames.filter(
    (name) =>
      EXPECTED_TABLE_NAMES.includes(name) &&
      !name.toLowerCase().startsWith("sqlite_"),
  );
}
