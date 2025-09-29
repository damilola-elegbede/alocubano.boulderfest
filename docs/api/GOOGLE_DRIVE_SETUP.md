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

## Step 7: Configure Environment Variables in Vercel Dashboard

1. **Log in to Vercel Dashboard**
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Select your project
   - Navigate to **Settings → Environment Variables**

2. **Add Google Drive Variables**

   Add the following variables with values from your JSON file:

   | Variable | Value | Environment Scope |
   |----------|-------|-------------------|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` from JSON | Development, Preview, Production |
   | `GOOGLE_PRIVATE_KEY` | `private_key` from JSON (with line breaks) | Development, Preview, Production |
   | `GOOGLE_PROJECT_ID` | `project_id` from JSON | Development, Preview, Production |
   | `GOOGLE_DRIVE_FOLDER_ID` | `1elqFy6HFf792_vGju8wYaEBJtLjQyOSq` | Development, Preview, Production |

3. **Important Notes**
   - The `GOOGLE_PRIVATE_KEY` must include the entire key with line breaks
   - Start with `-----BEGIN PRIVATE KEY-----`
   - End with `-----END PRIVATE KEY-----`
   - Select appropriate environment scopes for each variable

4. **Pull Variables Locally**
   ```bash
   # After configuring in Vercel Dashboard
   vercel env pull

   # This creates .env.local with all variables
   ```

## Step 8: Verify Local Setup

After pulling environment variables from Vercel:

```bash
# Verify .env.local was created
ls -la .env.local

# Start development server
npm run vercel:dev

# Test the gallery API
curl http://localhost:3000/api/gallery
```

**IMPORTANT**: The `.env.local` file is automatically created by `vercel env pull` and should never be committed to version control!

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

## Local Development Workflow

1. **Pull Environment Variables**
   ```bash
   # Ensure you're linked to Vercel project
   vercel link

   # Pull all environment variables
   vercel env pull
   ```

2. **Start Development Server**
   ```bash
   # Start Vercel dev server with all environment variables
   npm run vercel:dev
   ```

3. **Test Gallery Integration**
   - Gallery page: http://localhost:3000/pages/typographic/gallery.html
   - API endpoint: http://localhost:3000/api/gallery

4. **Update Variables**
   - Update in Vercel Dashboard (Settings → Environment Variables)
   - Pull latest changes: `vercel env pull`
   - Restart dev server: `npm run vercel:dev`

The development server automatically uses environment variables from `.env.local` (created by `vercel env pull`), giving you access to the Google Drive integration with real photos from your configured folder.

For more information about the implementation, see the `/api/gallery.js` serverless function.
