# Google Drive Gallery Integration Setup Guide

This guide walks you through setting up Google Drive API access for the A Lo Cubano Boulder Fest gallery feature.

## Prerequisites

- Access to Google Cloud Console
- Admin access to your Vercel project
- Access to the Google Drive folder containing festival media

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **"Create Project"** (or select from dropdown menu)
3. Enter project details:
   - **Project name**: `alocubano-gallery`
   - **Project ID**: Will be auto-generated (note this for later)
4. Click **"Create"**

## Step 2: Enable Google Drive API

1. In your Google Cloud project, navigate to **"APIs & Services"** > **"Library"**
2. Search for **"Google Drive API"**
3. Click on it and press **"Enable"**
4. Wait for the API to be enabled (this may take a few seconds)

## Step 3: Create Service Account

1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"Create Credentials"** > **"Service Account"**
3. Fill in the service account details:
   - **Service account name**: `alocubano-drive-reader`
   - **Service account ID**: Auto-generated
   - **Description**: "Read-only access to festival media folders"
4. Click **"Create and Continue"**
5. For the role, select **"Viewer"** (Basic > Viewer)
6. Click **"Continue"** and then **"Done"**

## Step 4: Generate Service Account Key

1. In the Credentials page, click on your newly created service account
2. Navigate to the **"Keys"** tab
3. Click **"Add Key"** > **"Create new key"**
4. Choose **JSON** format
5. Click **"Create"**
6. **IMPORTANT**: Save the downloaded JSON file securely - you cannot download it again!

## Step 5: Extract Required Values from JSON

Open the downloaded JSON file and locate these values:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "alocubano-drive-reader@your-project-id.iam.gserviceaccount.com",
  ...
}
```

You'll need:
- `client_email`
- `private_key`
- `project_id`

## Step 6: Share Google Drive Folder with Service Account

1. Go to your Google Drive folder: https://drive.google.com/drive/folders/1elqFy6HFf792_vGju8wYaEBJtLjQyOSq
2. Right-click on the folder and select **"Share"**
3. Add the service account email (from `client_email` in the JSON)
4. Set permission to **"Viewer"**
5. Uncheck "Notify people" (service accounts don't have inboxes)
6. Click **"Share"**

## Step 7: Configure Vercel Environment Variables

1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to **"Settings"** > **"Environment Variables"**
4. Add the following variables:

### GOOGLE_SERVICE_ACCOUNT_EMAIL
- **Value**: The `client_email` from your JSON file
- **Example**: `alocubano-drive-reader@your-project-id.iam.gserviceaccount.com`

### GOOGLE_PRIVATE_KEY
- **Value**: The `private_key` from your JSON file
- **IMPORTANT**: Include the entire key with line breaks preserved
- The value should start with `-----BEGIN PRIVATE KEY-----` and end with `-----END PRIVATE KEY-----`

### GOOGLE_PROJECT_ID
- **Value**: The `project_id` from your JSON file
- **Example**: `alocubano-gallery-123456`

### GOOGLE_DRIVE_FOLDER_ID
- **Value**: `1elqFy6HFf792_vGju8wYaEBJtLjQyOSq`
- This is extracted from the Google Drive URL

5. Make sure to add these for all environments (Production, Preview, Development)

## Step 8: Test Locally (Optional)

For local development, create a `.env.local` file:

```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
GOOGLE_PROJECT_ID=your-project-id
GOOGLE_DRIVE_FOLDER_ID=1elqFy6HFf792_vGju8wYaEBJtLjQyOSq
```

**IMPORTANT**: Never commit this file to version control!

## Step 9: Deploy and Verify

1. Deploy your changes to Vercel
2. Check the Vercel function logs for any errors
3. Visit the gallery page to see if images load correctly

## Troubleshooting

### "Permission denied" errors
- Verify the service account email has access to the Google Drive folder
- Check that you're using the correct folder ID
- Ensure the service account has "Viewer" permissions

### "Invalid credentials" errors
- Double-check the private key formatting (preserve line breaks)
- Verify all environment variables are set correctly
- Make sure you're using the correct project ID

### Images not loading
- Check browser console for errors
- Verify the API is enabled in Google Cloud Console
- Check Vercel function logs for detailed error messages

## Security Best Practices

1. **Never commit credentials**: Keep the JSON file and `.env.local` out of version control
2. **Use read-only access**: The service account should only have "Viewer" permissions
3. **Rotate keys regularly**: Generate new keys periodically
4. **Monitor usage**: Check Google Cloud Console for unusual API activity
5. **Limit folder access**: Only share specific folders, not your entire Drive

## Next Steps

Once configured, the gallery will:
1. Fetch images from the specified Google Drive folder
2. Display them in a responsive grid layout
3. Cache results for better performance
4. Provide fallback content if the API is unavailable

## Local Development Setup

For local testing, you can use the `.env.local` file:

1. Copy the example file:
   ```bash
   cp .env.example .env.local
   ```

2. Add your credentials to `.env.local`:
   ```env
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
   GOOGLE_PROJECT_ID=your-project-id
   GOOGLE_DRIVE_FOLDER_ID=1elqFy6HFf792_vGju8wYaEBJtLjQyOSq
   ```

3. Run the development server:
   ```bash
   ./scripts/start.sh
   # or
   python3 server.py
   ```

4. Test the gallery:
   - Gallery page: http://localhost:8000/pages/typographic/gallery.html
   - API endpoint: http://localhost:8000/api/gallery

The local server includes the Google Drive API integration, so you'll see real photos from your Google Drive folder in development.

For more information about the implementation, see the `/api/gallery.js` serverless function.