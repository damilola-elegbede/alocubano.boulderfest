# Google Drive Integration Guide

This document explains how to set up and use the Google Drive API service for the gallery functionality.

## Overview

The Google Drive service fetches images and videos from a Google Drive folder and provides them in a structured format compatible with the existing gallery frontend. It includes caching, categorization, and comprehensive error handling.

## Setup Requirements

### 1. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Drive API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Drive API"
   - Click "Enable"
4. Create an API key:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the generated API key
   - (Optional) Restrict the key to Google Drive API only

### 2. Google Drive Folder Setup

1. Create a folder in Google Drive containing your festival images
2. Make the folder publicly accessible:
   - Right-click the folder → "Share"
   - Click "Change to anyone with the link"
   - Set permission to "Viewer"
3. Copy the folder ID from the URL:
   - URL format: `https://drive.google.com/drive/folders/[FOLDER_ID]`
   - Extract the `FOLDER_ID` part

### 3. Environment Variables

Configure these variables in **Vercel Dashboard** (Settings → Environment Variables):

| Variable | Description | Example |
|----------|-------------|---------|
| `GOOGLE_DRIVE_API_KEY` | API key from Google Cloud Console | `AIza...` |
| `GOOGLE_DRIVE_FOLDER_ID` | Google Drive folder ID | `1elqFy...` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email | `service@project.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | Service account private key | `-----BEGIN PRIVATE KEY-----...` |

**Local Setup:**
```bash
# Pull environment variables from Vercel
vercel env pull

# Verify .env.local was created
ls -la .env.local
```

## Image Categorization

Images are automatically categorized based on filename patterns:

- **Workshops**: Files containing "workshop", "class", "lesson", "tutorial", "learn"
- **Socials**: Files containing "social", "party", "dance", "dancing", "fun", "music"  
- **Performances**: Files containing "performance", "show", "stage", "concert", "artist", "performer"
- **Other**: All other files

## API Endpoints

### Gallery Data
- `GET /api/gallery` - Returns gallery data (now uses Google Drive when configured)
- `GET /api/featured-photos` - Returns featured photos from Google Drive

### Google Drive Management
- `GET /api/google-drive-health` - Service health and configuration status
- `GET /api/google-drive-cache` - Cache status and metrics
- `POST /api/google-drive-cache` - Warm up cache with fresh data (requires authentication)
- `DELETE /api/google-drive-cache` - Clear cache (requires authentication)

**Note**: POST and DELETE operations on the cache management endpoint require an `X-API-Key` header with the `INTERNAL_API_KEY` value for security purposes.

## Usage Examples

### Basic Gallery Request
```javascript
fetch('/api/gallery')
  .then(response => response.json())
  .then(data => {
    console.log('Total images:', data.totalCount);
    console.log('Categories:', Object.keys(data.categories));
    console.log('Source:', data.source); // 'google-drive-api' when configured
  });
```

### Check Service Health
```javascript
fetch('/api/google-drive-health')
  .then(response => response.json())
  .then(data => {
    console.log('Service configured:', data.configured);
    console.log('Health status:', data.health.status);
    console.log('Cache metrics:', data.metrics);
  });
```

### Clear Cache
```javascript
fetch('/api/google-drive-cache', { method: 'DELETE' })
  .then(response => response.json())
  .then(data => {
    console.log('Cache cleared:', data.success);
  });
```

## Data Structure

The service returns data in this format:

```json
{
  "eventId": "boulder-fest-2026",
  "event": "boulder-fest-2026", 
  "year": 2026,
  "totalCount": 150,
  "categories": {
    "workshops": [
      {
        "id": "file_id_123",
        "name": "Workshop_Dance_Basics.jpg",
        "type": "image",
        "mimeType": "image/jpeg",
        "url": "https://drive.google.com/file/d/...",
        "thumbnailUrl": "https://...",
        "downloadUrl": "https://drive.google.com/uc?id=...",
        "size": 2048576,
        "createdTime": "2024-01-15T10:30:00Z",
        "modifiedTime": "2024-01-15T10:30:00Z",
        "dimensions": {
          "width": 1920,
          "height": 1080,
          "rotation": 0
        }
      }
    ],
    "socials": [...],
    "performances": [...],
    "other": [...]
  },
  "hasMore": false,
  "source": "google-drive-api",
  "cacheTimestamp": "2024-01-15T12:00:00Z"
}
```

## Caching Behavior

- **Cache TTL**: 30 minutes for API responses
- **Memory Cache**: In-memory LRU cache with max 20 entries
- **Automatic Eviction**: Removes oldest 25% of entries when cache is full
- **Fallback**: Returns stale cache on API errors, empty gallery as final fallback

## Error Handling

The service gracefully handles various error scenarios:

1. **Missing Configuration**: Returns placeholder data with helpful error message
2. **API Errors**: Retries with exponential backoff for temporary failures
3. **Rate Limiting**: Automatically retries after delays
4. **Network Issues**: Falls back to cached data when available
5. **Invalid Responses**: Logs errors and returns fallback data

## Performance Metrics

The service tracks comprehensive metrics:

- API call count and response times
- Cache hit/miss ratios
- Rate limiting encounters
- Total items fetched
- Error counts

Access metrics via `/api/google-drive-health` endpoint.

## Troubleshooting

### Common Issues

1. **"API key invalid"**:
   - Verify the API key in Google Cloud Console
   - Ensure Google Drive API is enabled
   - Check for trailing spaces in environment variables

2. **"Folder not found"**:
   - Verify folder ID is correct
   - Ensure folder is publicly accessible
   - Check folder sharing permissions

3. **"Quota exceeded"**:
   - Check Google Cloud Console quotas
   - Implement request throttling if needed
   - Consider upgrading Google Cloud plan

4. **Empty gallery**:
   - Verify images are in the folder
   - Check supported MIME types
   - Review server logs for detailed errors

### Debug Mode

Enable detailed logging by checking the service health:

```bash
curl http://localhost:3000/api/google-drive-health
```

### Manual Cache Management

Clear cache manually to force fresh data:

```bash
curl -X DELETE http://localhost:3000/api/google-drive-cache
```

## Integration with Frontend

The gallery frontend automatically uses Google Drive data when available. No frontend changes are required - the existing gallery components will work seamlessly with Google Drive data.

## Security Considerations

- API keys are server-side only and never exposed to clients
- Folder access is read-only via public sharing
- No sensitive data is cached in memory
- All API calls are rate-limited and monitored

## Supported File Types

### Images
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)
- WebP (.webp)
- BMP (.bmp)
- TIFF (.tiff)
- SVG (.svg)
- ICO (.ico)
- AVIF (.avif)

### Videos (Optional)
- MP4 (.mp4)
- QuickTime (.mov)
- AVI (.avi)
- WebM (.webm)

Videos can be enabled by setting `includeVideos: true` in the fetch options.