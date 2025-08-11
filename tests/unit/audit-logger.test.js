import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import AuditLogger from "../../lib/security/audit-logger.js";

describe("AuditLogger", () => {
  const logDir = path.resolve(process.cwd(), "logs", "audit");

  // Set up log directory before each test
  beforeEach(async () => {
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      // Ignore if directory already exists
    }
  });

  // Clean up log files after each test
  afterEach(async () => {
    try {
      const files = await fs.readdir(logDir);
      for (const file of files) {
        await fs.unlink(path.join(logDir, file));
      }
    } catch (error) {
      // Ignore errors if directory doesn't exist
    }
  });

  it("should log an event successfully", async () => {
    const logId = await AuditLogger.log({
      eventType: "TEST_EVENT",
      severity: AuditLogger.SEVERITY.INFO,
      context: { test: "data" },
    });

    expect(logId).toBeTruthy();

    // Verify log file was created
    const files = await fs.readdir(logDir);
    expect(files.length).toBe(1);

    // Read log file contents
    const logContent = await fs.readFile(path.join(logDir, files[0]), "utf-8");

    const logEntries = logContent
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    expect(logEntries.length).toBe(1);
    const entry = logEntries[0];

    expect(entry).toMatchObject({
      id: logId,
      eventType: "TEST_EVENT",
      severity: AuditLogger.SEVERITY.INFO,
      success: true,
      hash: expect.any(String),
    });
  });

  it("should sanitize sensitive context data", async () => {
    await AuditLogger.log({
      eventType: "SENSITIVE_TEST",
      context: {
        password: "secret123",
        token: "abc123",
        username: "testuser",
      },
    });

    const files = await fs.readdir(logDir);
    const logContent = await fs.readFile(path.join(logDir, files[0]), "utf-8");

    const logEntries = logContent
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));

    const entry = logEntries[0];

    // Verify sensitive data is removed
    expect(entry.password).toBeUndefined();
    expect(entry.token).toBeUndefined();
    // Non-sensitive data should remain
    expect(entry.username).toBe("testuser");
  });

  it("should retrieve logs with filters", async () => {
    // Log multiple events
    await AuditLogger.log({
      eventType: "LOGIN_SUCCESS",
      severity: AuditLogger.SEVERITY.INFO,
      context: { username: "user1" },
    });

    await AuditLogger.log({
      eventType: "LOGIN_FAILURE",
      severity: AuditLogger.SEVERITY.HIGH,
      success: false,
      context: { username: "user2" },
    });

    // Retrieve logs
    const successLogs = await AuditLogger.retrieveLogs({
      eventTypes: ["LOGIN_SUCCESS"],
      success: true,
    });

    const failureLogs = await AuditLogger.retrieveLogs({
      eventTypes: ["LOGIN_FAILURE"],
      success: false,
    });

    expect(successLogs.length).toBe(1);
    expect(failureLogs.length).toBe(1);

    expect(successLogs[0]).toMatchObject({
      eventType: "LOGIN_SUCCESS",
      success: true,
    });

    expect(failureLogs[0]).toMatchObject({
      eventType: "LOGIN_FAILURE",
      success: false,
    });
  });
});
