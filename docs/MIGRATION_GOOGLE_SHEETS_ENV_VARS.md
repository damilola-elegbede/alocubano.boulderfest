# Migration Guide: Google Sheets Environment Variables

## Overview

As of Phase 7, the Google Sheets integration uses separate environment variables from the Google Drive API to prevent configuration conflicts.

## Background

Previously, both Google Drive (for gallery images) and Google Sheets (for ticket sync) integrations were using the same environment variable names:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

This caused a critical issue where configuring one service would overwrite the credentials for the other, making it impossible to use both services simultaneously.

## Changes

### Old Variables (DEPRECATED for Sheets)
```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=sheets-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="sheets private key"
```

### New Variables (REQUIRED for Sheets)
```bash
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=sheets-account@project.iam.gserviceaccount.com
GOOGLE_SHEETS_PRIVATE_KEY="sheets private key"
```

### Drive Variables (UNCHANGED)
```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=drive-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="drive private key"
```

## Migration Steps

### For New Deployments

1. Use the new variable names for Google Sheets:
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_SHEETS_PRIVATE_KEY`

2. Keep existing variable names for Google Drive:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`

### For Existing Deployments

1. **Identify which service is currently configured**
   - Check if you're using Google Drive gallery: Look for `GOOGLE_DRIVE_FOLDER_ID`
   - Check if you're using Google Sheets sync: Look for `GOOGLE_SHEET_ID`

2. **If using only Google Sheets (no Drive)**:
   - Rename `GOOGLE_SERVICE_ACCOUNT_EMAIL` to `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`
   - Rename `GOOGLE_PRIVATE_KEY` to `GOOGLE_SHEETS_PRIVATE_KEY`

3. **If using both Drive and Sheets**:
   - Keep Drive variables as-is
   - Add new Sheets variables with `GOOGLE_SHEETS_` prefix
   - You can use the same service account for both if it has appropriate permissions

4. **Update your environment files**:
   ```bash
   # In .env.local or production environment
   
   # Drive API (for gallery)
   GOOGLE_SERVICE_ACCOUNT_EMAIL=drive-service@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="drive private key"
   
   # Sheets API (for ticket sync)
   GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=sheets-service@project.iam.gserviceaccount.com
   GOOGLE_SHEETS_PRIVATE_KEY="sheets private key"
   ```

5. **Restart your application** to pick up the new environment variables

## Why This Change?

1. **Separation of Concerns**: Drive and Sheets are separate Google APIs that may require different permissions or service accounts
2. **Flexibility**: Allows using different service accounts for each service
3. **Security**: Can limit permissions per service account (Drive only needs read, Sheets needs read/write)
4. **Clarity**: Makes it explicit which credentials are for which service

## Affected Files

- `api/lib/google-sheets-service.js` - Uses new `GOOGLE_SHEETS_*` variables
- `api/sheets/sync.js` - Checks for new variables
- `api/sheets/scheduled-sync.js` - Checks for new variables
- `scripts/test-sheets.js` - Tests with new variables

## Verification

After migration, verify both services work:

```bash
# Test Google Sheets sync
npm run test:sheets

# Test Google Drive gallery (if applicable)
# Check that /api/gallery endpoint still returns images
```

## Support

If you encounter issues during migration:
1. Check that all required environment variables are set
2. Verify service account permissions for both APIs
3. Ensure the Google Sheet is shared with the Sheets service account email
4. Check logs for specific error messages