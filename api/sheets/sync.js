import authService from '../lib/auth-service.js';
import googleSheetsService from '../lib/google-sheets-service.js';

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end('Method Not Allowed');
  }
  
  try {
    // Check if Google Sheets is configured
    if (!process.env.GOOGLE_SHEET_ID || 
        !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
        !process.env.GOOGLE_PRIVATE_KEY) {
      return res.status(503).json({
        error: 'Google Sheets not configured',
        message: 'Missing required environment variables for Google Sheets integration'
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
    res.status(500).json({
      error: 'Sync failed',
      message: error.message
    });
  }
}

// Require authentication
export default authService.requireAuth(handler);