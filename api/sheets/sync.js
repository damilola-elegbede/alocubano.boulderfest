import authService from "../../lib/auth-service.js";
import googleSheetsService from "../../lib/google-sheets-service.js";
import csrfService from "../../lib/csrf-service.js";
import { withSecurityHeaders } from "../../lib/security-headers.js";

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }

  try {
    // Check if Google Sheets is configured
    const requiredEnvVars = {
      GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
      GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
      GOOGLE_SHEETS_PRIVATE_KEY: process.env.GOOGLE_SHEETS_PRIVATE_KEY
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingVars.length > 0) {
      return res.status(503).json({
        error: 'Google Sheets not configured',
        message: 'Missing required environment variables for Google Sheets integration',
        missingVariables: missingVars,
        configurationStatus: {
          hasSheetId: !!process.env.GOOGLE_SHEET_ID,
          hasServiceAccountEmail: !!process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
          hasPrivateKey: !!process.env.GOOGLE_SHEETS_PRIVATE_KEY
        }
      });
    }

    // Setup sheets if needed
    await googleSheetsService.setupSheets();

    // Sync all data
    const result = await googleSheetsService.syncAllData();

    res.status(200).json({
      success: true,
      message: 'Google Sheets sync completed',
      timestamp: result.timestamp,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${process.env.GOOGLE_SHEET_ID}`
    });
  } catch (error) {
    console.error('Sheets sync error:', error);

    // Provide more specific error responses
    let statusCode = 500;
    const errorResponse = {
      error: 'Sync failed',
      message: error.message
    };

    if (error.message.includes('auth') || error.message.includes('permission')) {
      statusCode = 403;
      errorResponse.error = 'Authentication failed';
      errorResponse.hint = 'Check Google Sheets service account credentials';
    } else if (error.message.includes('not found') || error.message.includes('Sheet')) {
      statusCode = 404;
      errorResponse.error = 'Sheet not found';
      errorResponse.hint = 'Verify GOOGLE_SHEET_ID is correct and accessible';
    } else if (error.message.includes('quota') || error.message.includes('limit')) {
      statusCode = 429;
      errorResponse.error = 'Rate limit exceeded';
      errorResponse.hint = 'Try again later';
    }

    // Add debugging information in development
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'preview';
    if (isDevelopment) {
      errorResponse.debug = {
        stack: error.stack?.substring(0, 500),
        sheetId: process.env.GOOGLE_SHEET_ID ? 'configured' : 'missing',
        serviceAccount: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ? 'configured' : 'missing'
      };
    }

    res.status(statusCode).json(errorResponse);
  }
}

// Require authentication and CSRF protection
// Order is important: auth must run before CSRF to set req.admin
export default withSecurityHeaders(
  authService.requireAuth(
    csrfService.validateCSRF(handler)
  )
);
