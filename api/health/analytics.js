import { google } from '@googleapis/sheets';
import { HealthStatus } from "../../lib/monitoring/health-checker.js";

/**
 * Initialize Google Sheets client
 */
async function getGoogleSheetsClient() {
  try {
    // Check for API key configuration
    if (
      !process.env.GOOGLE_SHEETS_API_KEY &&
      !process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ) {
      throw new Error('Google Sheets API credentials not configured');
    }

    let auth;

    // Use service account if available (preferred)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const credentials = JSON.parse(
        Buffer.from(
          process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
          'base64'
        ).toString()
      );

      auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
      });
    } else if (process.env.GOOGLE_SHEETS_API_KEY) {
      // Fallback to API key (read-only) - don't pass as auth parameter
      auth = null;
    } else {
      throw new Error('No valid Google Sheets credentials found');
    }

    // Initialize sheets client
    const sheetsConfig = { version: 'v4' };
    if (auth) {
      sheetsConfig.auth = auth;
    }

    return google.sheets(sheetsConfig);
  } catch (error) {
    throw new Error(
      `Failed to initialize Google Sheets client: ${error.message}`
    );
  }
}

/**
 * Check spreadsheet accessibility
 */
async function checkSpreadsheetAccess(sheets) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return {
        accessible: false,
        error: 'Spreadsheet ID not configured'
      };
    }

    // Try to get spreadsheet metadata
    const requestParams = {
      spreadsheetId,
      fields: 'spreadsheetId,properties.title,sheets.properties'
    };

    // Add API key for API key authentication
    if (
      !process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
      process.env.GOOGLE_SHEETS_API_KEY
    ) {
      requestParams.key = process.env.GOOGLE_SHEETS_API_KEY;
    }

    const response = await sheets.spreadsheets.get(requestParams);

    const spreadsheet = response.data;
    const sheetNames =
      spreadsheet.sheets?.map((s) => s.properties?.title) || [];

    return {
      accessible: true,
      spreadsheet_id: spreadsheet.spreadsheetId,
      title: spreadsheet.properties?.title,
      sheet_count: spreadsheet.sheets?.length || 0,
      sheet_names: sheetNames
    };
  } catch (error) {
    return {
      accessible: false,
      error: `Spreadsheet access failed: ${error.message}`,
      error_code: error.code || 'UNKNOWN'
    };
  }
}

/**
 * Check API quota usage
 */
async function checkQuotaUsage(sheets) {
  try {
    // Google Sheets API doesn't provide direct quota info
    // We'll estimate based on recent usage patterns

    // Try a simple read operation to test quota
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return {
        status: 'unknown',
        message: 'Cannot check quota without spreadsheet ID'
      };
    }

    // Attempt to read a small range
    const testRange = 'A1:A1';
    const requestParams = {
      spreadsheetId,
      range: testRange
    };

    // Add API key for API key authentication
    if (
      !process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
      process.env.GOOGLE_SHEETS_API_KEY
    ) {
      requestParams.key = process.env.GOOGLE_SHEETS_API_KEY;
    }

    const response = await sheets.spreadsheets.values.get(requestParams);

    // If we get here, we have quota available
    return {
      status: 'available',
      test_read_successful: true,
      api_version: 'v4'
    };
  } catch (error) {
    if (error.code === 429) {
      return {
        status: 'exceeded',
        error: 'API quota exceeded',
        retry_after: error.retryAfter || 'unknown'
      };
    }

    return {
      status: 'error',
      error: `Quota check failed: ${error.message}`
    };
  }
}

/**
 * Check recent write activity
 */
async function checkRecentActivity() {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return {
        message: 'Cannot check activity without spreadsheet ID'
      };
    }

    // Note: Google Sheets API doesn't provide direct activity logs
    // In production, you might want to track this separately
    return {
      message: 'Activity tracking requires separate implementation',
      recommendation:
        'Consider implementing activity logging in your application'
    };
  } catch (error) {
    return {
      error: `Activity check failed: ${error.message}`
    };
  }
}

/**
 * Test write capability
 */
async function testWriteCapability(sheets) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    if (!spreadsheetId) {
      return {
        writable: false,
        error: 'Spreadsheet ID not configured'
      };
    }

    // Check if we have write permissions
    // Service account should have write access, API key won't
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      // Try to append a test row (we'll clear it immediately)
      const testData = [['HEALTH_CHECK_TEST', new Date().toISOString()]];

      try {
        // Append test data
        const appendParams = {
          spreadsheetId,
          range: 'HealthCheck!A:B', // Use a dedicated health check sheet
          valueInputOption: 'USER_ENTERED',
          insertDataOption: 'INSERT_ROWS',
          requestBody: {
            values: testData
          }
        };

        // Add API key for API key authentication (though write won't work with API key)
        if (
          !process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
          process.env.GOOGLE_SHEETS_API_KEY
        ) {
          appendParams.key = process.env.GOOGLE_SHEETS_API_KEY;
        }

        await sheets.spreadsheets.values.append(appendParams);

        // Clear test data
        const clearParams = {
          spreadsheetId,
          range: 'HealthCheck!A:B',
          requestBody: {}
        };

        // Add API key for API key authentication (though write won't work with API key)
        if (
          !process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
          process.env.GOOGLE_SHEETS_API_KEY
        ) {
          clearParams.key = process.env.GOOGLE_SHEETS_API_KEY;
        }

        await sheets.spreadsheets.values.clear(clearParams);

        return {
          writable: true,
          test_write_successful: true
        };
      } catch (error) {
        if (error.code === 404) {
          // HealthCheck sheet doesn't exist, but we can write
          return {
            writable: true,
            note: 'Write permissions available, HealthCheck sheet not found'
          };
        }
        throw error;
      }
    } else {
      return {
        writable: false,
        reason: 'API key authentication (read-only)'
      };
    }
  } catch (error) {
    return {
      writable: false,
      error: `Write test failed: ${error.message}`
    };
  }
}

/**
 * Check Google Sheets analytics health
 */
export const checkAnalyticsHealth = async() => {
  const startTime = Date.now();

  try {
    // Initialize Google Sheets client
    const sheets = await getGoogleSheetsClient();

    // Check spreadsheet accessibility
    const spreadsheetAccess = await checkSpreadsheetAccess(sheets);

    // Check API quota
    const quotaStatus = await checkQuotaUsage(sheets);

    // Test write capability
    const writeCapability = await testWriteCapability(sheets);

    // Check recent activity (if applicable)
    const recentActivity = await checkRecentActivity();

    // Determine health status
    let status = HealthStatus.HEALTHY;
    const warnings = [];
    const errors = [];

    if (!spreadsheetAccess.accessible) {
      status = HealthStatus.UNHEALTHY;
      errors.push('Spreadsheet not accessible');
    }

    if (quotaStatus.status === 'exceeded') {
      status = HealthStatus.UNHEALTHY;
      errors.push('API quota exceeded');
    } else if (quotaStatus.status === 'error') {
      status = HealthStatus.DEGRADED;
      warnings.push('Unable to verify quota status');
    }

    if (!writeCapability.writable && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      status = HealthStatus.DEGRADED;
      warnings.push('Write capability not available');
    }

    // Check for configuration issues
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      status = HealthStatus.UNHEALTHY;
      errors.push('Spreadsheet ID not configured');
    }

    return {
      status,
      response_time: `${Date.now() - startTime}ms`,
      details: {
        api_accessible: spreadsheetAccess.accessible,
        authentication_type: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
          ? 'service_account'
          : 'api_key',
        spreadsheet: spreadsheetAccess,
        quota: quotaStatus,
        write_capability: writeCapability,
        recent_activity: recentActivity,
        warnings: warnings.length > 0 ? warnings : undefined,
        errors: errors.length > 0 ? errors : undefined
      }
    };
  } catch (error) {
    // Determine if this is a configuration error or service error
    const isConfigError =
      error.message.includes('credentials') ||
      error.message.includes('not configured') ||
      error.message.includes('API key');

    return {
      status: HealthStatus.UNHEALTHY,
      response_time: `${Date.now() - startTime}ms`,
      error: error.message,
      details: {
        api_accessible: false,
        error_type: isConfigError ? 'ConfigurationError' : 'ServiceError'
      }
    };
  }
};

/**
 * Vercel serverless function handler
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const health = await checkAnalyticsHealth();
    const statusCode = health.status === HealthStatus.HEALTHY ? 200 : 503;

    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: HealthStatus.UNHEALTHY,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
