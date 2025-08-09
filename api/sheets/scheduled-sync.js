import googleSheetsService from "../lib/google-sheets-service.js";

export default async function handler(req, res) {
  // Verify cron secret (set by Vercel)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Check if Google Sheets is configured
    if (
      !process.env.GOOGLE_SHEET_ID ||
      !process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL ||
      !process.env.GOOGLE_SHEETS_PRIVATE_KEY
    ) {
      console.log("Google Sheets not configured, skipping scheduled sync");
      return res.status(200).json({
        success: false,
        message: "Google Sheets not configured",
      });
    }

    // Setup sheets if needed
    await googleSheetsService.setupSheets();

    // Sync all data
    const result = await googleSheetsService.syncAllData();

    console.log(`Scheduled sync completed at ${result.timestamp}`);

    res.status(200).json({
      success: true,
      timestamp: result.timestamp,
    });
  } catch (error) {
    console.error("Scheduled sync failed:", error);
    res.status(500).json({
      error: "Sync failed",
      message: error.message,
    });
  }
}
