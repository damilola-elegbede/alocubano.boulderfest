# Phase 7: Google Sheets Synchronization

## Prerequisites from Phase 3

### Token Security Infrastructure

- ✅ Access Tokens implemented (long-lived, SHA-256 hashed)
- ✅ Action Tokens implemented (single-use, 30-min expiry)
- ✅ Comprehensive token authentication
- ✅ Rate limiting on external API interactions

## Google Sheets Sync Objectives

### 1. Token Authentication Requirements

- Use existing access tokens for Google Sheets API
- Implement secure token rotation
- Log all synchronization attempts

### 2. Data Synchronization Strategy

- One-way sync from event database to Google Sheets
- Incremental updates to minimize data transfer
- Secure, authenticated API calls

## Technical Implementation

### Advanced Sync Function with Robust Error Handling

```javascript
import { GoogleAuth } from "google-auth-library";
import { google } from "googleapis";
import { Logger } from "./logger";
import { RateLimiter } from "./rate-limiter";

class GoogleSheetsSyncError extends Error {
  constructor(message, type = "SyncError") {
    super(message);
    this.name = type;
  }
}

class GoogleSheetsSync {
  constructor(config) {
    this.logger = new Logger("GoogleSheetsSync");
    this.rateLimiter = new RateLimiter({
      maxConcurrent: 5,
      maxPerMinute: 50,
    });
    this.config = config;
    this.auth = this.initializeAuth();
  }

  initializeAuth() {
    return new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
    });
  }

  validateInput(data) {
    // Comprehensive input validation
    if (!data || !Array.isArray(data)) {
      throw new GoogleSheetsSyncError(
        "Invalid input: data must be an array",
        "ValidationError",
      );
    }

    // Optional: Add schema validation for each data object
    const requiredFields = ["id", "timestamp", "type"];
    data.forEach((item, index) => {
      requiredFields.forEach((field) => {
        if (!item.hasOwnProperty(field)) {
          throw new GoogleSheetsSyncError(
            `Missing required field '${field}' in data item at index ${index}`,
            "SchemaValidationError",
          );
        }
      });
    });

    // Optional: Add type-specific validations
    if (data.length > 10000) {
      throw new GoogleSheetsSyncError(
        "Maximum sync batch size exceeded (10,000 records)",
        "BatchSizeError",
      );
    }

    return true;
  }

  async syncToGoogleSheets(data, options = {}) {
    const {
      spreadsheetId = process.env.DEFAULT_SPREADSHEET_ID,
      range = "Sheet1!A2:Z",
      retries = 3,
      backoffStrategy = "exponential",
    } = options;

    try {
      // Validate input data
      this.validateInput(data);

      // Use rate limiter to control concurrent API calls
      return await this.rateLimiter.schedule(async () => {
        try {
          const sheets = google.sheets({ version: "v4", auth: this.auth });
          const response = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: {
              values: data.map((item) => [
                item.id,
                item.timestamp,
                item.type,
                // Add other required columns
                JSON.stringify(item.metadata || {}),
              ]),
            },
          });

          this.logger.info("Google Sheets sync successful", {
            recordsSynced: data.length,
            responseStatus: response.status,
          });

          return response;
        } catch (apiError) {
          // Categorize and handle different types of API errors
          if (apiError.code === 403) {
            throw new GoogleSheetsSyncError(
              "Authorization failed",
              "AuthorizationError",
            );
          }
          if (apiError.code === 429) {
            throw new GoogleSheetsSyncError(
              "Rate limit exceeded",
              "RateLimitError",
            );
          }
          throw apiError;
        }
      });
    } catch (error) {
      // Log and potentially retry synchronization
      this.logger.error("Google Sheets sync failed", {
        errorType: error.name,
        errorMessage: error.message,
        data: JSON.stringify(data),
      });

      // Implement retry mechanism with exponential backoff
      if (retries > 0) {
        const delay = this.calculateBackoff(retries, backoffStrategy);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.syncToGoogleSheets(data, {
          ...options,
          retries: retries - 1,
        });
      }

      throw error;
    }
  }

  calculateBackoff(retriesLeft, strategy = "exponential") {
    const baseDelay = 1000; // 1 second
    switch (strategy) {
      case "exponential":
        return baseDelay * Math.pow(2, 3 - retriesLeft);
      case "linear":
        return baseDelay * (4 - retriesLeft);
      default:
        return baseDelay;
    }
  }
}

// Example usage
const syncService = new GoogleSheetsSync({
  maxBatchSize: 10000,
  logLevel: "info",
});

try {
  const syncData = [
    {
      id: "ticket-123",
      timestamp: new Date().toISOString(),
      type: "ticket_sale",
      metadata: {
        eventName: "Boulder Fest 2026",
        ticketType: "Weekend Pass",
      },
    },
    // More data items...
  ];

  await syncService.syncToGoogleSheets(syncData);
} catch (error) {
  // Handle sync errors
  console.error("Sync failed:", error);
}
```

### Sync Features

- Comprehensive input validation
- Incremental data updates
- Detailed error logging
- Automatic retry mechanism with exponential backoff
- Strict rate limiting
- Token-based authentication
- Flexible configuration options

## Security Considerations

- Use existing access token infrastructure
- Implement strict rate limiting
- Secure transmission of sensitive data
- Comprehensive logging of sync activities
- Validate and sanitize all input data
- Handle potential authorization errors

## Performance Targets

- Sync Time: < 5 minutes for 10,000 records
- API Call Overhead: < 100ms per batch
- Minimal database performance impact
- Concurrent API call management

## Timeline

- Authentication Integration: 2 weeks
- Sync Mechanism Development: 3 weeks
- Performance Optimization: 2 weeks
- Testing and Refinement: 1 week

Total Estimated Time: 8 weeks

## Success Criteria

- 100% data integrity during synchronization
- Zero unauthorized access
- Minimal performance overhead
- Comprehensive sync logging
- Graceful error handling
- Secure data transmission

## Potential Challenges

- Handling large dataset synchronizations
- Managing API rate limits
- Ensuring data consistency
- Handling intermittent network issues
- Managing authentication token lifecycle

## Open Questions

- Exact sync frequency requirements
- Specific data transformation needs
- Handling potential sync conflicts
- Performance impact of retry mechanisms
- Long-term data retention strategy
