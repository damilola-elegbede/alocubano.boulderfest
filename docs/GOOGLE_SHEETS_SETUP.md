# Google Sheets Integration Setup Guide

## Overview

This guide will help you set up Google Sheets integration to automatically sync registration data from your database to a Google Sheet that your non-technical colleagues can access.

## What You'll Get

A Google Sheet with 6 tabs that auto-update every 15 minutes:
- **Overview**: Key metrics and statistics at a glance
- **All Registrations**: Complete list of all ticket purchases
- **Check-in Status**: Real-time check-in tracking
- **Summary by Type**: Breakdown by ticket type
- **Daily Sales**: Revenue tracking over time
- **Wallet Analytics**: Digital wallet adoption metrics

## Setup Steps

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click "Create Project" or select an existing project
3. Name it something like "ALoCubano Festival"

### 2. Enable Google Sheets API

```bash
# If you have gcloud CLI installed:
gcloud services enable sheets.googleapis.com

# Or via Console:
# 1. Go to APIs & Services → Library
# 2. Search for "Google Sheets API"
# 3. Click Enable
```

### 3. Create a Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Fill in:
   - Name: `alocubano-sheets-sync`
   - Description: "Service account for syncing registration data to Google Sheets"
4. Click **Create and Continue**
5. Skip the optional steps (roles and user access)
6. Click **Done**

### 4. Create Service Account Key

1. Click on your new service account
2. Go to the **Keys** tab
3. Click **Add Key** → **Create new key**
4. Choose **JSON** format
5. Click **Create** - a JSON file will download
6. **Keep this file secure!** It contains credentials

### 5. Extract Credentials from JSON

Open the downloaded JSON file and find these values:

```json
{
  "client_email": "alocubano-sheets-sync@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
}
```

### 6. Create Your Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new blank spreadsheet
3. Name it "A Lo Cubano Festival - Registrations"
4. Copy the Sheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
   ```

### 7. Share Sheet with Service Account

1. Click the **Share** button in your Google Sheet
2. Paste the service account email (from step 5)
3. Set permission to **Editor**
4. Uncheck "Notify people"
5. Click **Share**

### 8. Add Environment Variables

Add these to your `.env.local` file for local testing:

```bash
# Google Sheets Configuration
GOOGLE_SHEET_ID=your-sheet-id-from-step-6
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account-email-from-step-5
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
your-private-key-from-step-5
-----END PRIVATE KEY-----"
SHEETS_TIMEZONE=America/Denver
CRON_SECRET=generate-a-random-string-here
```

**Important**: The private key must include the BEGIN/END headers and preserve all newlines.

### 9. Test Locally

```bash
# Test the integration
node scripts/test-sheets.js

# If successful, you'll see:
# ✅ Google Sheets integration working!
```

### 10. Deploy to Production

Add the same environment variables to Vercel:

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add each variable from step 8
4. Deploy your changes

## Using the Integration

### Manual Sync

1. Log into the admin dashboard
2. Click the **📊 Sync to Sheets** button
3. Wait for confirmation
4. Check your Google Sheet

### Automatic Sync

- Data syncs automatically every 15 minutes
- No action required
- Check Vercel Functions logs if issues arise

## Sharing with Colleagues

1. Open your Google Sheet
2. Click **Share**
3. Add your colleagues' email addresses
4. Set permission to **Viewer** (they only need to read)
5. Add a message: "This sheet auto-updates every 15 minutes with festival registration data"

## Troubleshooting

### "Permission denied" Error
- Make sure the sheet is shared with the service account email
- Verify the service account has Editor permissions

### "Invalid private key" Error
- Ensure the private key includes BEGIN/END headers
- Check that newlines are preserved (use quotes around the value)
- Try re-creating the service account key

### Sync Takes Too Long
- Large datasets may take 30-60 seconds
- Consider increasing the Vercel function timeout
- Data is batched efficiently, but network latency affects speed

### No Data Appearing
- Check that you have registrations in your database
- Verify all environment variables are set correctly
- Look at Vercel function logs for errors

## Security Notes

- Never commit the service account key to git
- Use environment variables for all credentials
- The service account only has access to the specific sheet you share
- Regularly rotate service account keys for security

## Support

If you encounter issues:
1. Check the test script output: `node scripts/test-sheets.js`
2. Review Vercel function logs
3. Ensure all environment variables are set
4. Verify Google Cloud APIs are enabled

## Next Steps

1. Share the sheet with your team
2. Set up alerts for important metrics
3. Create custom views or filters in the sheet
4. Consider adding charts or pivot tables for visualizations