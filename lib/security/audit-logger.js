import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

// Audit log configuration
const CONFIG = {
  LOG_DIR: path.resolve(process.cwd(), "logs", "audit"),
  MAX_LOG_SIZE_BYTES: 10 * 1024 * 1024, // 10MB per log file
  MAX_LOG_FILES: 10, // Keep up to 10 log files
  RETENTION_DAYS: 90, // Keep logs for 90 days
};

// Severity levels for audit events
const SEVERITY_LEVELS = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
};

class AuditLogger {
  /**
   * Create audit log entry
   * @param {Object} options - Audit log entry details
   * @param {string} options.eventType - Type of security event
   * @param {string} options.severity - Severity level of the event
   * @param {Object} options.context - Additional context for the event
   * @param {boolean} [options.success=true] - Whether the event was successful
   */
  static async log({
    eventType,
    severity = SEVERITY_LEVELS.INFO,
    context = {},
    success = true,
  }) {
    try {
      // Sanitize context to remove sensitive information
      const sanitizedContext = this._sanitizeContext(context);

      // Create log entry
      const logEntry = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        eventType,
        severity,
        success,
        ...sanitizedContext,
      };

      // Generate a hash for tamper detection
      const entryHash = this._generateEntryHash(logEntry);

      // Convert log entry to JSON
      const logLine =
        JSON.stringify({
          ...logEntry,
          hash: entryHash,
        }) + "\n";

      // Write log synchronously for testing reliability
      await this._writeLogAsync(logLine);

      // Real-time alerting for critical events
      if (severity === SEVERITY_LEVELS.CRITICAL) {
        this._triggerCriticalAlert(logEntry);
      }

      return logEntry.id;
    } catch (error) {
      console.error("Audit log failed:", error);
      // Fallback error logging without throwing
      return null;
    }
  }

  /**
   * Sanitize context to remove sensitive information
   * @param {Object} context - Original context object
   * @returns {Object} Sanitized context
   */
  static _sanitizeContext(context) {
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "credentials",
      "sensitiveData",
    ];

    const sanitized = { ...context };

    sensitiveKeys.forEach((key) => {
      if (sanitized[key]) {
        delete sanitized[key];
      }
    });

    // Truncate long fields
    Object.keys(sanitized).forEach((key) => {
      if (typeof sanitized[key] === "string" && sanitized[key].length > 500) {
        sanitized[key] = sanitized[key].substring(0, 500) + "...";
      }
    });

    return sanitized;
  }

  /**
   * Generate a hash for tamper detection
   * @param {Object} logEntry - Log entry to hash
   * @returns {string} Hash of the log entry
   */
  static _generateEntryHash(logEntry) {
    const hashInput = JSON.stringify({
      id: logEntry.id,
      timestamp: logEntry.timestamp,
      eventType: logEntry.eventType,
      severity: logEntry.severity,
    });

    return crypto.createHash("sha256").update(hashInput).digest("hex");
  }

  /**
   * Asynchronously write log entry
   * @param {string} logLine - Log entry to write
   */
  static async _writeLogAsync(logLine) {
    try {
      // Use test override directory if set, otherwise use default
      const logDir = this._testLogDir || CONFIG.LOG_DIR;
      
      // Ensure log directory exists
      await fs.mkdir(logDir, { recursive: true });

      // Get current log file path - use more granular timestamp in test mode
      let logFileName;
      if (this._testLogDir) {
        // In test mode, create unique file per test run to ensure isolation
        logFileName = `audit-test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}.log`;
      } else {
        // In production, use date-based files as usual
        logFileName = `audit-${new Date().toISOString().split("T")[0]}.log`;
      }
      
      const logFilePath = path.join(logDir, logFileName);

      // Append log entry
      await fs.appendFile(logFilePath, logLine);

      // Manage log file rotation and retention (only in production)
      if (!this._testLogDir) {
        await this._manageLogFiles();
      }
    } catch (error) {
      console.error("Log writing failed:", error);
    }
  }

  /**
   * Manage log file rotation and retention
   */
  static async _manageLogFiles() {
    try {
      // Use test override directory if set, otherwise use default
      const logDir = this._testLogDir || CONFIG.LOG_DIR;
      
      // Get all log files
      const logFiles = await fs.readdir(logDir);

      // Sort files by creation time (oldest first)
      const sortedFiles = (
        await Promise.all(
          logFiles.map(async (file) => {
            const stats = await fs.stat(path.join(logDir, file));
            return { file, stats };
          }),
        )
      ).sort((a, b) => a.stats.birthtimeMs - b.stats.birthtimeMs);

      // Remove old files
      while (sortedFiles.length > CONFIG.MAX_LOG_FILES) {
        const oldestFile = sortedFiles.shift();
        await fs.unlink(path.join(logDir, oldestFile.file));
      }

      // Remove files older than retention period
      const retentionThreshold =
        Date.now() - CONFIG.RETENTION_DAYS * 24 * 60 * 60 * 1000;

      for (const fileInfo of sortedFiles) {
        if (fileInfo.stats.birthtimeMs < retentionThreshold) {
          await fs.unlink(path.join(logDir, fileInfo.file));
        }
      }
    } catch (error) {
      console.error("Log file management failed:", error);
    }
  }

  /**
   * Trigger real-time alerts for critical events
   * @param {Object} logEntry - Critical log entry
   */
  static async _triggerCriticalAlert(logEntry) {
    try {
      // Placeholder for alert mechanisms
      // Could integrate with:
      // - Email alerts
      // - Slack/Discord notifications
      // - PagerDuty
      // - Custom webhook
      console.warn(
        "CRITICAL SECURITY EVENT:",
        JSON.stringify(logEntry, null, 2),
      );
    } catch (error) {
      console.error("Critical alert failed:", error);
    }
  }

  /**
   * Retrieve log entries for forensic analysis
   * @param {Object} filters - Query filters
   * @returns {Array} Matching log entries
   */
  static async retrieveLogs({
    startDate,
    endDate,
    eventTypes = [],
    severityLevels = [],
    success,
  } = {}) {
    try {
      // Use test override directory if set, otherwise use default
      const logDir = this._testLogDir || CONFIG.LOG_DIR;
      
      const logFiles = await fs.readdir(logDir);
      const logs = [];

      for (const logFile of logFiles) {
        const filePath = path.join(logDir, logFile);
        const fileContent = await fs.readFile(filePath, "utf-8");

        const fileEntries = fileContent
          .split("\n")
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line));

        const filteredEntries = fileEntries.filter((entry) => {
          const matchDate =
            (!startDate || new Date(entry.timestamp) >= new Date(startDate)) &&
            (!endDate || new Date(entry.timestamp) <= new Date(endDate));

          const matchEventType =
            eventTypes.length === 0 || eventTypes.includes(entry.eventType);

          const matchSeverity =
            severityLevels.length === 0 ||
            severityLevels.includes(entry.severity);

          const matchSuccess =
            success === undefined || entry.success === success;

          return matchDate && matchEventType && matchSeverity && matchSuccess;
        });

        logs.push(...filteredEntries);
      }

      return logs;
    } catch (error) {
      console.error("Log retrieval failed:", error);
      return [];
    }
  }
}

// Expose severity levels
AuditLogger.SEVERITY = SEVERITY_LEVELS;

export default AuditLogger;
