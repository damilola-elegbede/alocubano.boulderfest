import { describe, it, expect } from "vitest";
import { splitSqlStatements } from "../../scripts/lib/sql-splitter.js";

describe("SQL Statement Splitter", () => {
  it("should handle simple semicolon-separated statements", () => {
    const sql = "CREATE TABLE users (id INT); INSERT INTO users VALUES (1);";
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("CREATE TABLE users (id INT)");
    expect(statements[1]).toBe("INSERT INTO users VALUES (1)");
  });

  it("should handle semicolons inside strings", () => {
    const sql =
      "INSERT INTO messages (text) VALUES ('Hello; World'); SELECT * FROM messages;";
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe(
      "INSERT INTO messages (text) VALUES ('Hello; World')",
    );
    expect(statements[1]).toBe("SELECT * FROM messages");
  });

  it("should handle escaped quotes in strings", () => {
    const sql = "INSERT INTO data VALUES ('It''s a test'); SELECT 1;";
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe("INSERT INTO data VALUES ('It''s a test')");
  });

  it("should handle line comments", () => {
    const sql = `-- This is a comment
CREATE TABLE test (id INT);
-- Another comment; with semicolon
INSERT INTO test VALUES (1);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TABLE test");
    expect(statements[1]).toContain("INSERT INTO test");
  });

  it("should handle block comments", () => {
    const sql = `/* Multi-line
comment; with semicolon */
CREATE TABLE test (id INT);
INSERT /* inline comment */ INTO test VALUES (1);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
  });

  it("should handle triggers with embedded semicolons", () => {
    const sql = `CREATE TRIGGER test_trigger
AFTER INSERT ON users
BEGIN
  UPDATE counts SET value = value + 1;
  INSERT INTO logs VALUES ('trigger fired');
END;
CREATE TABLE other (id INT);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain("CREATE TRIGGER");
    expect(statements[0]).toContain("END");
    expect(statements[1]).toBe("CREATE TABLE other (id INT)");
  });

  it("should handle custom migrate:break delimiter", () => {
    const sql = `CREATE TRIGGER complex_trigger
BEGIN
  UPDATE something;
END;
-- migrate:break
CREATE TABLE test (id INT);
-- migrate:break
INSERT INTO test VALUES (1);`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain("CREATE TRIGGER");
    expect(statements[1]).toContain("CREATE TABLE");
    expect(statements[2]).toContain("INSERT INTO");
  });

  it("should handle double quotes for identifiers", () => {
    const sql = `CREATE TABLE "table;name" (id INT); SELECT * FROM "table;name";`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toBe('CREATE TABLE "table;name" (id INT)');
    expect(statements[1]).toBe('SELECT * FROM "table;name"');
  });

  it("should handle mixed quote types", () => {
    const sql = `INSERT INTO test VALUES ('value1', "value2"); SELECT 'test';`;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
  });

  it("should handle empty statements gracefully", () => {
    const sql = ";;; CREATE TABLE test (id INT);;;";
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toBe("CREATE TABLE test (id INT)");
  });
});
