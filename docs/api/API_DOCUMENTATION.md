# API Documentation - A Lo Cubano Boulder Fest

## Gallery API

The Gallery API provides access to festival photos and videos stored in Google Drive.

### Endpoint

```
GET /api/gallery
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| folderId | string | `GOOGLE_DRIVE_FOLDER_ID` env var | Google Drive folder ID to fetch media from |

### Response Format

#### Success Response (200)

```json
{
  "folder": {
    "id": "1elqFy6HFf792_vGju8wYaEBJtLjQyOSq",
    "name": "A Lo Cubano 2025",
    "createdAt": "2024-01-15T10:30:00Z",
    "modifiedAt": "2024-12-20T15:45:00Z"
  },
  "items": [
    {
      "id": "1abc123def456",
      "name": "Opening Night Dance Floor.jpg",
      "type": "image",
      "mimeType": "image/jpeg",
      "thumbnailUrl": "https://drive.google.com/thumbnail?id=1abc123def456&sz=w400",
      "viewUrl": "https://drive.google.com/uc?export=view&id=1abc123def456",
      "downloadUrl": "https://drive.google.com/uc?export=download&id=1abc123def456",
      "size": 2456789,
      "createdAt": "2024-12-15T20:30:00Z"
    },
    {
      "id": "2def789ghi012",
      "name": "Workshop Highlights.mp4",
      "type": "video",
      "mimeType": "video/mp4",
      "thumbnailUrl": "https://drive.google.com/thumbnail?id=2def789ghi012&sz=w400",
      "viewUrl": "https://drive.google.com/uc?export=view&id=2def789ghi012",
      "downloadUrl": "https://drive.google.com/uc?export=download&id=2def789ghi012",
      "size": 45678901,
      "createdAt": "2024-12-16T10:15:00Z"
    }
  ],
  "count": 2
}
```

#### Error Responses

##### 400 Bad Request
```json
{
  "error": "Folder ID is required"
}
```

##### 403 Forbidden
```json
{
  "error": "Access denied. Please check folder permissions."
}
```

##### 404 Not Found
```json
{
  "error": "Folder not found"
}
```

##### 500 Internal Server Error
```json
{
  "error": "Failed to fetch gallery data",
  "message": "Detailed error message (development only)"
}
```

### Caching

- Responses are cached for 1 hour (`Cache-Control: s-maxage=3600, stale-while-revalidate`)
- The frontend also implements local storage caching

### Authentication

The API uses Google Service Account authentication to access Google Drive. No user authentication is required for API consumers.

### Rate Limiting

- Google Drive API has quotas that apply
- The API implements caching to minimize requests
- Consider implementing additional rate limiting if needed

### Usage Example

#### JavaScript (Frontend)

```javascript
async function loadGallery() {
  try {
    const response = await fetch('/api/gallery');
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Display gallery items
    data.items.forEach(item => {
      if (item.type === 'image') {
        console.log(`Image: ${item.name}`);
        // Display image using item.thumbnailUrl or item.viewUrl
      } else if (item.type === 'video') {
        console.log(`Video: ${item.name}`);
        // Display video using item.viewUrl
      }
    });
    
  } catch (error) {
    console.error('Failed to load gallery:', error);
    // Show fallback content
  }
}
```

#### cURL

```bash
# Get gallery items from default folder
curl https://your-domain.vercel.app/api/gallery

# Get gallery items from specific folder
curl https://your-domain.vercel.app/api/gallery?folderId=YOUR_FOLDER_ID
```

### Implementation Notes

1. **Image URLs**: The API provides three URLs for each item:
   - `thumbnailUrl`: Smaller version for gallery grids
   - `viewUrl`: Full-size version for viewing
   - `downloadUrl`: Direct download link

2. **Video Handling**: Videos include a thumbnail URL for preview images

3. **Performance**: The API fetches up to 100 items per request, ordered by creation date (newest first)

4. **Security**: The service account has read-only access to prevent any modifications

5. **CORS**: The API includes CORS headers to allow frontend access

### Future Enhancements

- Pagination support for folders with many items
- Subfolder navigation
- Search/filter capabilities
- Image metadata (EXIF data)
- Video duration and dimensions
- Batch operations for multiple folders

## Hero Image API

### Endpoint: `/api/hero-image/[pageId]`

Provides optimized hero images for specific pages with intelligent caching.

#### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `pageId` | string | required | Page identifier (home, about, gallery, etc.) |
| `w` | integer | 1200 | Target width in pixels |
| `format` | string | auto | Target format (webp, jpeg, auto) |
| `q` | integer | 80 | Quality level (1-100) |

#### Examples

```bash
# Home page hero image
GET /api/hero-image/home?w=1200&format=webp

# Gallery page hero image with high quality
GET /api/hero-image/gallery?w=1600&q=90
```

#### Caching
- **Client Cache**: 1 hour
- **CDN Cache**: 24 hours
- **ETag Support**: For conditional requests

## Image Proxy Enhancements

### Responsive Image Support

The image proxy now supports responsive image delivery with automatic format optimization.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `w` | integer | original | Target width in pixels |
| `format` | string | auto-detected | Target format (webp, jpeg) |
| `q` | integer | 75 | Quality level (1-100) |

#### Examples

```bash
# WebP format, 800px width
GET /api/image-proxy/[fileId]?w=800&format=webp

# Auto-detected format based on Accept header
GET /api/image-proxy/[fileId]?w=1200

# High quality JPEG
GET /api/image-proxy/[fileId]?w=1600&format=jpeg&q=90
```

#### Browser Support

- **WebP**: 95%+ browser support, automatic fallback to JPEG
- **Format Detection**: Based on `Accept` header, graceful degradation