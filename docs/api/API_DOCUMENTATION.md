# API Documentation - A Lo Cubano Boulder Fest

## Overview

The A Lo Cubano Boulder Fest API provides comprehensive access to festival media, performance monitoring, image optimization services, ticket registration management, and health monitoring capabilities. Built on Vercel's serverless platform, the API emphasizes performance, caching, security, and modern web standards.

### Base URL

```
https://alocubanoboulderfest.vercel.app/api
```

### API Versions

| Version               | Status | Features                                                |
| --------------------- | ------ | ------------------------------------------------------- |
| **Phase 3** (Current) | Active | AVIF support, Performance metrics, Multi-year galleries |
| Phase 2               | Legacy | Advanced caching, Service workers                       |
| Phase 1               | Legacy | Basic gallery, WebP support                             |

### Common Headers

#### Request Headers

```http
Accept: application/json
Content-Type: application/json  # For POST requests
User-Agent: YourApp/1.0
```

#### Response Headers

```http
Content-Type: application/json
Cache-Control: s-maxage=3600, stale-while-revalidate
ETag: "response-hash"
X-API-Version: phase-3
X-Request-ID: req_abc123def456
```

### Rate Limiting

All API endpoints implement rate limiting to ensure service availability:

| Endpoint                   | Limit        | Window   |
| -------------------------- | ------------ | -------- |
| `/api/gallery*`            | 60 requests  | 1 minute |
| `/api/image-proxy/*`       | 100 requests | 1 minute |
| `/api/performance-metrics` | 100 requests | 1 minute |
| `/api/featured-photos`     | 30 requests  | 1 minute |

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1690876800
```

### Error Handling

All API endpoints return consistent error formats:

```json
{
  "error": "Brief error description",
  "message": "Detailed error message (optional)",
  "code": "ERROR_CODE",
  "requestId": "req_abc123def456",
  "timestamp": "2025-07-23T10:30:00.000Z"
}
```

### Authentication

- **Public APIs**: No authentication required for read operations
- **Service Account**: Google Drive integration uses service account authentication
- **CORS**: Configured for cross-origin requests from festival domain

### Performance Features

- **CDN Integration**: All static assets served via Vercel Edge Network
- **Intelligent Caching**: Multi-layer caching strategy (browser, CDN, server)
- **Format Optimization**: Automatic format selection (AVIF → WebP → JPEG)
- **Compression**: Brotli/Gzip compression for JSON responses
- **Monitoring**: Real-time performance tracking and analytics

## Registration API

The registration system enables ticket purchasers to register attendee information within a 72-hour window after purchase. See [REGISTRATION_API.md](./REGISTRATION_API.md) for complete documentation.

### Quick Reference

| Endpoint | Method | Description | Rate Limit |
|----------|--------|-------------|------------|
| `/api/registration/[token]` | GET | Get registration status for all tickets | - |
| `/api/tickets/register` | POST | Register single ticket | 3/15min |
| `/api/registration/batch` | POST | Register multiple tickets | 3/15min |
| `/api/registration/health` | GET | System health check | - |

### Key Features
- JWT-based authentication
- 72-hour registration window
- Automatic email confirmations
- Rate limiting (3 attempts per 15 minutes)
- Input validation and XSS prevention
- Atomic batch registration

## Health & Monitoring APIs

### General Health Check

#### Endpoint

```
GET /api/health/check
```

Provides overall application health status including database connectivity, external service availability, and system performance metrics.

#### Response Format

##### Success Response (200)

```json
{
  "status": "healthy",
  "timestamp": "2025-08-26T15:30:00.000Z",
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "healthy",
      "responseTime": 45,
      "connectionPool": "available"
    },
    "externalServices": {
      "stripe": "healthy",
      "brevo": "healthy",
      "googleDrive": "healthy"
    },
    "system": {
      "memory": "normal",
      "cpu": "normal",
      "disk": "normal"
    }
  },
  "uptime": 86400,
  "responseTime": 125
}
```

### Database Health Check

#### Endpoint

```
GET /api/health/database
```

Monitors development database connectivity, migration status, and performance metrics.

#### Response Format

##### Success Response (200)

```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "responseTime": 35,
    "migrations": {
      "total": 15,
      "completed": 15,
      "failed": 0,
      "lastMigration": {
        "filename": "015_add_wallet_passes.sql",
        "status": "completed",
        "executedAt": "2025-08-20T10:15:00.000Z"
      }
    },
    "tables": {
      "count": 8,
      "healthy": true
    }
  },
  "timestamp": "2025-08-26T15:30:00.000Z"
}
```

### E2E Database Health Check

#### Endpoint

```
GET /api/health/e2e-database
```

**Availability**: Only available when `E2E_TEST_MODE=true` or `ENVIRONMENT=e2e-test`

Provides comprehensive health monitoring for the E2E test database, including schema validation, migration status, and test data verification.

#### Access Control

This endpoint implements strict access controls for security:

- **Environment Requirement**: Only accessible in E2E test environments
- **Database Validation**: Ensures database URL contains "e2e-test" identifier
- **Safe Operations**: Read-only health checks, no data modification

#### Response Format

##### Success Response (200)

```json
{
  "status": "healthy",
  "timestamp": "2025-08-26T15:30:00.000Z",
  "environment": "e2e-test",
  "checks": {
    "clientCreation": {
      "success": true
    },
    "connectivity": {
      "connected": true,
      "latency": null
    },
    "schema": {
      "valid": true,
      "totalTables": 8,
      "requiredTables": 8,
      "presentTables": 8,
      "missingTables": [],
      "columnChecks": {
        "registrations": {
          "hasRequiredColumns": true,
          "columns": 12,
          "missing": []
        }
      }
    },
    "migrations": {
      "total": 15,
      "completed": 15,
      "failed": 0,
      "pending": 0,
      "lastMigration": {
        "filename": "015_add_wallet_passes.sql",
        "status": "completed",
        "executed_at": "2025-08-25T14:20:00.000Z"
      }
    },
    "testData": {
      "testRegistrations": 1,
      "testSubscribers": 1,
      "hasTestData": true
    }
  },
  "summary": {
    "databaseConnected": true,
    "schemaValid": true,
    "migrationsComplete": true,
    "testDataPresent": true,
    "overallHealth": true
  },
  "responseTime": 245
}
```

##### Access Denied Response (403)

```json
{
  "error": "E2E health check endpoint is not available in this environment"
}
```

##### Unhealthy Response (503)

```json
{
  "status": "unhealthy",
  "timestamp": "2025-08-26T15:30:00.000Z",
  "environment": "e2e-test",
  "checks": {
    "connectivity": {
      "connected": false,
      "error": "Connection timeout after 5000ms"
    },
    "schema": {
      "valid": false,
      "error": "Table 'registrations' not found"
    }
  },
  "responseTime": 5250
}
```

#### Health Check Categories

##### Client Creation
- Database client initialization
- Credential validation
- Connection string parsing

##### Connectivity
- Basic database ping test  
- Connection timeout handling
- Network latency measurement

##### Schema Validation
- **Required Tables**: `migrations`, `registrations`, `email_subscribers`, `tickets`, `payment_events`, `admin_rate_limits`, `admin_sessions`, `wallet_passes`
- **Column Validation**: Verifies critical columns exist in core tables
- **Table Counts**: Tracks total vs expected table counts

##### Migration Status
- Migration completion tracking
- Failed migration detection
- Last migration metadata
- Pending migration identification

##### Test Data Verification
- E2E test data presence (`%@e2e-test.%` email pattern)
- Test registration count validation
- Test subscriber verification

#### Usage Examples

##### cURL

```bash
# Check E2E database health
curl -f http://localhost:3000/api/health/e2e-database | jq '.'

# Health check in CI/CD pipeline
curl -f https://your-e2e-environment.vercel.app/api/health/e2e-database \
  -H "Accept: application/json" | jq '.status'
```

##### JavaScript

```javascript
// E2E test setup validation
async function validateE2EEnvironment() {
  try {
    const response = await fetch('/api/health/e2e-database');
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`);
    }
    
    const health = await response.json();
    
    if (health.status !== 'healthy') {
      throw new Error('E2E database is not healthy');
    }
    
    console.log('✅ E2E environment is ready');
    console.log(`Database: ${health.summary.databaseConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`Schema: ${health.summary.schemaValid ? 'Valid' : 'Invalid'}`);
    console.log(`Test Data: ${health.summary.testDataPresent ? 'Present' : 'Missing'}`);
    
    return health;
  } catch (error) {
    console.error('❌ E2E environment validation failed:', error);
    throw error;
  }
}

// Use in test setup
beforeAll(async () => {
  await validateE2EEnvironment();
});
```

##### CI/CD Integration

```yaml
# GitHub Actions workflow example
- name: Validate E2E Database Health
  run: |
    # Wait for database to be ready
    timeout 60 bash -c 'until curl -f ${{ env.E2E_BASE_URL }}/api/health/e2e-database; do sleep 2; done'
    
    # Verify health status
    HEALTH_STATUS=$(curl -s ${{ env.E2E_BASE_URL }}/api/health/e2e-database | jq -r '.status')
    
    if [ "$HEALTH_STATUS" != "healthy" ]; then
      echo "❌ E2E database health check failed"
      curl -s ${{ env.E2E_BASE_URL }}/api/health/e2e-database | jq '.'
      exit 1
    fi
    
    echo "✅ E2E database is healthy and ready"
```

#### Error Recovery

The endpoint provides detailed error information to help diagnose and resolve issues:

1. **Connection Issues**: Check database credentials and network connectivity
2. **Schema Problems**: Run E2E database setup: `npm run db:e2e:setup`
3. **Missing Test Data**: Execute test data insertion: `npm run db:e2e:clean && npm run db:e2e:setup`
4. **Migration Failures**: Reset and re-run migrations: `npm run migrate:e2e:reset`

#### Security Considerations

- **Environment Isolation**: Strict environment validation prevents production access
- **Read-Only Operations**: Health checks perform no data modifications
- **Credential Validation**: Database credentials verified before connection attempts
- **Error Sanitization**: Sensitive information filtered from error responses

## Gallery API

The Gallery API provides access to festival photos and videos stored in Google Drive.

### Endpoint

```
GET /api/gallery
```

### Query Parameters

| Parameter | Type   | Default                          | Description                                |
| --------- | ------ | -------------------------------- | ------------------------------------------ |
| folderId  | string | `GOOGLE_DRIVE_FOLDER_ID` env var | Google Drive folder ID to fetch media from |

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
    const response = await fetch("/api/gallery");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Display gallery items
    data.items.forEach((item) => {
      if (item.type === "image") {
        console.log(`Image: ${item.name}`);
        // Display image using item.thumbnailUrl or item.viewUrl
      } else if (item.type === "video") {
        console.log(`Video: ${item.name}`);
        // Display video using item.viewUrl
      }
    });
  } catch (error) {
    console.error("Failed to load gallery:", error);
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

## Multi-Year Gallery API (Phase 3)

### Endpoint

```
GET /api/gallery/years
```

Provides a list of all available gallery years with metadata for navigation and year selection.

### Response Format

#### Success Response (200)

```json
{
  "years": [
    {
      "year": "2025",
      "title": "A Lo Cubano 2025",
      "folderId": "1elqFy6HFf792_vGju8wYaEBJtLjQyOSq",
      "description": "Second annual festival with expanded workshops",
      "itemCount": 156,
      "coverImage": {
        "id": "1abc123def456",
        "thumbnailUrl": "https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=400&format=webp"
      },
      "createdAt": "2025-05-15T00:00:00Z",
      "status": "active"
    },
    {
      "year": "2024",
      "title": "A Lo Cubano 2024",
      "folderId": "1xyz789abc012",
      "description": "Growth year with amazing performances",
      "itemCount": 89,
      "coverImage": {
        "id": "2def456ghi789",
        "thumbnailUrl": "https://alocubanoboulderfest.vercel.app/api/image-proxy/2def456ghi789?w=400&format=webp"
      },
      "createdAt": "2024-05-17T00:00:00Z",
      "status": "archived"
    }
  ],
  "count": 2,
  "defaultYear": "2025"
}
```

#### Error Responses

##### 500 Internal Server Error

```json
{
  "error": "Failed to fetch gallery years",
  "message": "Unable to retrieve folder configurations"
}
```

### Usage Example

#### JavaScript (Frontend)

```javascript
async function loadGalleryYears() {
  try {
    const response = await fetch("/api/gallery/years");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Build year navigation
    data.years.forEach((yearInfo) => {
      console.log(`${yearInfo.year}: ${yearInfo.itemCount} photos`);
      // Create navigation buttons for each year
    });

    // Load default year gallery
    loadGalleryByYear(data.defaultYear);
  } catch (error) {
    console.error("Failed to load gallery years:", error);
  }
}
```

### Caching

- Responses are cached for 6 hours (`Cache-Control: s-maxage=21600, stale-while-revalidate`)
- Backend implements intelligent cache invalidation when gallery data changes

## Performance Metrics API (Phase 3)

### Endpoint

```
POST /api/performance-metrics
```

Collects and analyzes performance metrics from client-side monitoring.

### Request Format

#### Headers

| Header         | Required | Description                   |
| -------------- | -------- | ----------------------------- |
| `Content-Type` | Yes      | Must be `application/json`    |
| `User-Agent`   | No       | Browser/client identification |

#### Request Body

```json
{
  "metrics": {
    "navigation": {
      "type": "navigation",
      "name": "page-load",
      "startTime": 0,
      "duration": 1250.5,
      "entries": {
        "fetchStart": 12.3,
        "domainLookupStart": 12.3,
        "domainLookupEnd": 25.7,
        "connectStart": 25.7,
        "connectEnd": 89.2,
        "requestStart": 89.5,
        "responseStart": 234.8,
        "responseEnd": 456.2,
        "domContentLoadedEventStart": 678.9,
        "domContentLoadedEventEnd": 692.1,
        "loadEventStart": 1247.3,
        "loadEventEnd": 1250.5
      }
    },
    "resources": [
      {
        "name": "https://example.com/api/gallery",
        "entryType": "resource",
        "startTime": 234.5,
        "duration": 156.7,
        "transferSize": 12456,
        "encodedBodySize": 11234,
        "decodedBodySize": 45678
      }
    ],
    "marks": [
      {
        "name": "gallery-load-start",
        "entryType": "mark",
        "startTime": 345.6
      },
      {
        "name": "gallery-load-end",
        "entryType": "mark",
        "startTime": 567.8
      }
    ],
    "measures": [
      {
        "name": "gallery-load-time",
        "entryType": "measure",
        "startTime": 345.6,
        "duration": 222.2
      }
    ]
  },
  "context": {
    "page": "/gallery",
    "userAgent": "Mozilla/5.0...",
    "connection": {
      "effectiveType": "4g",
      "downlink": 2.5,
      "rtt": 150
    },
    "device": {
      "memory": 8,
      "hardwareConcurrency": 4
    },
    "timestamp": "2025-07-23T10:30:00.000Z"
  }
}
```

### Response Format

#### Success Response (200)

```json
{
  "received": true,
  "metrics": {
    "processed": 15,
    "stored": 15,
    "errors": 0
  },
  "analysis": {
    "pageLoadTime": 1250.5,
    "performanceScore": 85,
    "recommendations": [
      "Consider optimizing largest contentful paint",
      "Gallery API response time is within acceptable range"
    ]
  },
  "timestamp": "2025-07-23T10:30:00.123Z"
}
```

#### Error Responses

##### 400 Bad Request

```json
{
  "error": "Invalid metrics data",
  "details": "Missing required navigation timing data"
}
```

##### 413 Payload Too Large

```json
{
  "error": "Metrics payload too large",
  "maxSize": "100KB"
}
```

##### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60
}
```

### Rate Limiting

- **Client IP**: 100 requests per minute
- **Payload Size**: Maximum 100KB per request
- **Metrics Count**: Maximum 500 metrics per request

### Usage Example

#### JavaScript (Frontend)

```javascript
// Collect and send performance metrics
async function sendPerformanceMetrics() {
  try {
    // Collect navigation timing
    const navigation = performance.getEntriesByType("navigation")[0];

    // Collect resource timing
    const resources = performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/api/"))
      .slice(0, 50); // Limit to prevent large payloads

    // Collect custom marks and measures
    const marks = performance.getEntriesByType("mark");
    const measures = performance.getEntriesByType("measure");

    // Get connection info if available
    const connection = navigator.connection || {};

    const metricsData = {
      metrics: {
        navigation: {
          type: navigation.entryType,
          name: navigation.name,
          startTime: navigation.startTime,
          duration: navigation.duration,
          entries: {
            fetchStart: navigation.fetchStart,
            domainLookupStart: navigation.domainLookupStart,
            domainLookupEnd: navigation.domainLookupEnd,
            connectStart: navigation.connectStart,
            connectEnd: navigation.connectEnd,
            requestStart: navigation.requestStart,
            responseStart: navigation.responseStart,
            responseEnd: navigation.responseEnd,
            domContentLoadedEventStart: navigation.domContentLoadedEventStart,
            domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
            loadEventStart: navigation.loadEventStart,
            loadEventEnd: navigation.loadEventEnd,
          },
        },
        resources: resources.map((resource) => ({
          name: resource.name,
          entryType: resource.entryType,
          startTime: resource.startTime,
          duration: resource.duration,
          transferSize: resource.transferSize,
          encodedBodySize: resource.encodedBodySize,
          decodedBodySize: resource.decodedBodySize,
        })),
        marks: marks.map((mark) => ({
          name: mark.name,
          entryType: mark.entryType,
          startTime: mark.startTime,
        })),
        measures: measures.map((measure) => ({
          name: measure.name,
          entryType: measure.entryType,
          startTime: measure.startTime,
          duration: measure.duration,
        })),
      },
      context: {
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        connection: {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
        },
        device: {
          memory: navigator.deviceMemory,
          hardwareConcurrency: navigator.hardwareConcurrency,
        },
        timestamp: new Date().toISOString(),
      },
    };

    const response = await fetch("/api/performance-metrics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(metricsData),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log("Performance metrics sent:", result);
  } catch (error) {
    console.error("Failed to send performance metrics:", error);
  }
}

// Send metrics after page load
window.addEventListener("load", () => {
  // Wait a bit to ensure all resources are loaded
  setTimeout(sendPerformanceMetrics, 1000);
});
```

### Data Processing

The API processes metrics to generate insights:

1. **Performance Scoring**: Calculates overall performance score based on Core Web Vitals
2. **Trend Analysis**: Tracks performance over time
3. **Bottleneck Detection**: Identifies slow resources and operations
4. **Device Correlation**: Analyzes performance across different devices/connections
5. **Recommendations**: Provides actionable optimization suggestions

### Privacy and Data Retention

- **No PII**: Only technical performance data is collected
- **Retention**: Metrics are retained for 90 days
- **Aggregation**: Data is aggregated for reporting
- **Opt-out**: Users can disable metrics collection via browser settings

## Featured Photos API (Phase 3)

### Endpoint

```
GET /api/featured-photos
```

Returns a curated selection of featured photos optimized for homepage display and social media sharing.

### Query Parameters

| Parameter | Type    | Default | Description                                              |
| --------- | ------- | ------- | -------------------------------------------------------- |
| `limit`   | integer | 12      | Number of photos to return (max: 50)                     |
| `year`    | string  | current | Filter by specific year (2023, 2024, 2025, etc.)         |
| `format`  | string  | auto    | Preferred image format (avif, webp, jpeg, auto)          |
| `size`    | string  | medium  | Thumbnail size (small=400px, medium=800px, large=1200px) |

### Response Format

#### Success Response (200)

```json
{
  "photos": [
    {
      "id": "1abc123def456",
      "title": "Opening Night Dance Floor",
      "description": "Dancers enjoying the vibrant opening night atmosphere",
      "year": "2025",
      "category": "social-dancing",
      "photographer": "Maria Rodriguez",
      "featured": true,
      "urls": {
        "thumbnail": "https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=400&format=webp",
        "medium": "https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=800&format=webp",
        "large": "https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=1200&format=webp",
        "avif_medium": "https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=800&format=avif",
        "original": "https://drive.google.com/uc?export=view&id=1abc123def456"
      },
      "metadata": {
        "dimensions": { "width": 2048, "height": 1365 },
        "aspectRatio": 1.5,
        "fileSize": 2456789,
        "capturedAt": "2025-05-15T21:30:00Z",
        "uploadedAt": "2025-05-16T10:15:00Z"
      },
      "socialMedia": {
        "instagram": "https://www.instagram.com/p/example123",
        "hashtags": [
          "#alocubano2025",
          "#salsadancing",
          "#boulder",
          "#cubansalsa"
        ]
      }
    }
  ],
  "pagination": {
    "total": 156,
    "count": 12,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjFhYmMxMjMiLCJ0aW1lIjoiMjAyNS0wNS0xNlQxMDoxNTowMFoifQ"
  },
  "filters": {
    "year": "2025",
    "categories": [
      "workshops",
      "social-dancing",
      "performances",
      "behind-scenes"
    ],
    "photographers": ["Maria Rodriguez", "Carlos Mendez", "Sofia Hernandez"]
  },
  "lastUpdated": "2025-07-23T08:30:00Z"
}
```

#### Error Responses

##### 400 Bad Request

```json
{
  "error": "Invalid parameters",
  "details": {
    "limit": "Maximum limit is 50",
    "year": "Year must be between 2023-2026"
  }
}
```

##### 404 Not Found

```json
{
  "error": "No featured photos found",
  "message": "No photos match the specified criteria",
  "filters": {
    "year": "2022",
    "category": "workshops"
  }
}
```

### Usage Examples

#### JavaScript (Frontend)

```javascript
// Load featured photos for homepage
async function loadFeaturedPhotos() {
  try {
    const response = await fetch("/api/featured-photos?limit=8&size=medium");

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Create responsive image gallery
    data.photos.forEach((photo) => {
      const pictureElement = createResponsiveImage(photo);
      document.querySelector(".featured-gallery").appendChild(pictureElement);
    });
  } catch (error) {
    console.error("Failed to load featured photos:", error);
    // Show fallback content
  }
}

// Create responsive image with modern formats
function createResponsiveImage(photo) {
  const picture = document.createElement("picture");

  // AVIF source for modern browsers
  const avifSource = document.createElement("source");
  avifSource.srcset = photo.urls.avif_medium;
  avifSource.type = "image/avif";
  picture.appendChild(avifSource);

  // WebP source for broad support
  const webpSource = document.createElement("source");
  webpSource.srcset = photo.urls.medium;
  webpSource.type = "image/webp";
  picture.appendChild(webpSource);

  // JPEG fallback
  const img = document.createElement("img");
  img.src = photo.urls.medium.replace("format=webp", "format=jpeg");
  img.alt = photo.title;
  img.loading = "lazy";
  picture.appendChild(img);

  return picture;
}
```

#### React Component

```jsx
// React component for featured photos gallery
import { useState, useEffect } from "react";

function FeaturedPhotosGallery({ year, limit = 12 }) {
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchPhotos() {
      try {
        const params = new URLSearchParams({
          limit: limit.toString(),
          ...(year && { year }),
        });

        const response = await fetch(`/api/featured-photos?${params}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status}`);
        }

        const data = await response.json();
        setPhotos(data.photos);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchPhotos();
  }, [year, limit]);

  if (loading) return <div>Loading featured photos...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="featured-photos-grid">
      {photos.map((photo) => (
        <div key={photo.id} className="photo-card">
          <picture>
            <source srcSet={photo.urls.avif_medium} type="image/avif" />
            <source srcSet={photo.urls.medium} type="image/webp" />
            <img
              src={photo.urls.medium.replace("format=webp", "format=jpeg")}
              alt={photo.title}
              loading="lazy"
            />
          </picture>
          <div className="photo-info">
            <h3>{photo.title}</h3>
            <p>{photo.description}</p>
            <span className="photographer">by {photo.photographer}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### Caching and Performance

- **Response Cache**: 2 hours (`Cache-Control: s-maxage=7200, stale-while-revalidate`)
- **Image Cache**: 1 year for processed images
- **CDN Distribution**: Global edge caching via Vercel
- **Preload Support**: Critical photos automatically preloaded
- **Format Optimization**: Automatic AVIF/WebP delivery based on browser support

### Social Media Integration

Featured photos include social media metadata for easy sharing:

```html
<!-- Open Graph meta tags -->
<meta
  property="og:image"
  content="https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=1200&format=jpeg&q=85"
/>
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="800" />
<meta property="og:image:alt" content="Opening Night Dance Floor" />

<!-- Twitter Card meta tags -->
<meta
  name="twitter:image"
  content="https://alocubanoboulderfest.vercel.app/api/image-proxy/1abc123def456?w=1200&format=jpeg&q=85"
/>
<meta name="twitter:card" content="summary_large_image" />
```

## Hero Image API

### Endpoint: `/api/hero-image/[pageId]`

Provides optimized hero images for specific pages with intelligent caching.

#### Parameters

| Parameter | Type    | Default  | Description                                  |
| --------- | ------- | -------- | -------------------------------------------- |
| `pageId`  | string  | required | Page identifier (home, about, gallery, etc.) |
| `w`       | integer | 1200     | Target width in pixels                       |
| `format`  | string  | auto     | Target format (webp, jpeg, auto)             |
| `q`       | integer | 80       | Quality level (1-100)                        |

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

## Enhanced Image Proxy API (Phase 3)

### Endpoint

```
GET /api/image-proxy/[fileId]
```

Advanced image processing proxy with support for modern formats, responsive delivery, and intelligent format negotiation.

### Query Parameters

| Parameter | Type    | Default     | Description                                                       |
| --------- | ------- | ----------- | ----------------------------------------------------------------- |
| `w`       | integer | original    | Target width in pixels (max: 4000)                                |
| `h`       | integer | auto        | Target height in pixels (maintains aspect ratio if not specified) |
| `format`  | string  | auto        | Target format (avif, webp, jpeg, auto)                            |
| `q`       | integer | 75          | Quality level (1-100)                                             |
| `fit`     | string  | cover       | Resize mode (cover, contain, fill, inside, outside)               |
| `bg`      | string  | transparent | Background color for padding (hex without #)                      |
| `dpr`     | float   | 1.0         | Device pixel ratio (1.0-3.0)                                      |

### Format Support and Browser Compatibility

#### AVIF Support (New in Phase 3)

- **Browser Support**: Chrome 85+, Firefox 93+, Safari 16.1+
- **Compression**: Up to 50% smaller than WebP, 90% smaller than JPEG
- **Quality**: Superior compression with better visual quality retention
- **Fallback**: Automatic fallback to WebP → JPEG for unsupported browsers

#### Format Negotiation

The API automatically selects the optimal format based on:

1. **Accept Header**: Analyzes `Accept: image/*` header capabilities
2. **User Agent**: Browser-specific format support detection
3. **Query Parameter**: Explicit format override
4. **Progressive Enhancement**: AVIF → WebP → JPEG fallback chain

### Request Examples

#### Basic Usage

```bash
# Auto-optimized image (format negotiated based on browser)
GET /api/image-proxy/1abc123def456?w=800

# High-DPI display optimization
GET /api/image-proxy/1abc123def456?w=800&dpr=2.0

# Specific format request
GET /api/image-proxy/1abc123def456?w=1200&format=avif&q=80
```

#### Advanced Processing

```bash
# Square thumbnail with background
GET /api/image-proxy/1abc123def456?w=400&h=400&fit=cover

# Hero image with specific dimensions
GET /api/image-proxy/1abc123def456?w=1600&h=900&fit=cover&q=85

# Gallery thumbnail optimized for mobile
GET /api/image-proxy/1abc123def456?w=400&format=webp&q=70&dpr=1.5
```

#### Format-Specific Requests

```bash
# AVIF for modern browsers (best compression)
GET /api/image-proxy/1abc123def456?w=1200&format=avif&q=75

# WebP fallback
GET /api/image-proxy/1abc123def456?w=1200&format=webp&q=75

# JPEG fallback for older browsers
GET /api/image-proxy/1abc123def456?w=1200&format=jpeg&q=80
```

### Response Headers

#### Success Response Headers

```http
HTTP/2 200 OK
Content-Type: image/avif  # or image/webp, image/jpeg
Cache-Control: public, max-age=31536000, s-maxage=31536000
ETag: "abc123-w800-avif-q75"
Vary: Accept, User-Agent
X-Image-Format: avif
X-Original-Size: 2456789
X-Compressed-Size: 456789
X-Compression-Ratio: 81.4
X-Processing-Time: 145ms
```

#### Error Response Headers

```http
HTTP/2 404 Not Found
Content-Type: application/json
Cache-Control: no-cache

{
  "error": "Image not found",
  "fileId": "invalid-file-id"
}
```

### Error Responses

#### 400 Bad Request

```json
{
  "error": "Invalid parameters",
  "details": {
    "width": "Maximum width is 4000px",
    "quality": "Quality must be between 1-100"
  }
}
```

#### 404 Not Found

```json
{
  "error": "Image not found",
  "fileId": "1abc123def456"
}
```

#### 413 Payload Too Large

```json
{
  "error": "Source image too large",
  "maxSize": "50MB",
  "actualSize": "75MB"
}
```

#### 429 Too Many Requests

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 60,
  "limit": "100 requests per minute"
}
```

#### 500 Internal Server Error

```json
{
  "error": "Image processing failed",
  "message": "Unable to process image format",
  "requestId": "req_abc123"
}
```

### Performance Features

#### Intelligent Caching

- **CDN Cache**: 1 year for processed images (`max-age=31536000`)
- **Browser Cache**: 1 year with ETag support for conditional requests
- **Vary Headers**: Ensures correct format delivery per browser
- **Cache Keys**: Include all processing parameters for cache isolation

#### Processing Optimization

- **Lazy Processing**: Images processed on first request, then cached
- **Background Queue**: Large image processing moved to background workers
- **Memory Management**: Automatic cleanup of processing buffers
- **Resource Limits**: CPU and memory limits prevent server overload

### Integration Examples

#### Responsive Image Sets

```html
<!-- Modern browsers with AVIF support -->
<picture>
  <source
    srcset="
      /api/image-proxy/1abc123?w=800&format=avif&dpr=1 1x,
      /api/image-proxy/1abc123?w=800&format=avif&dpr=2 2x
    "
    type="image/avif"
  />

  <source
    srcset="
      /api/image-proxy/1abc123?w=800&format=webp&dpr=1 1x,
      /api/image-proxy/1abc123?w=800&format=webp&dpr=2 2x
    "
    type="image/webp"
  />

  <img
    src="/api/image-proxy/1abc123?w=800&format=jpeg"
    srcset="
      /api/image-proxy/1abc123?w=800&format=jpeg&dpr=1 1x,
      /api/image-proxy/1abc123?w=800&format=jpeg&dpr=2 2x
    "
    alt="Festival photo"
    loading="lazy"
  />
</picture>
```

#### JavaScript Integration

```javascript
// Automatic format negotiation
function getOptimizedImageUrl(fileId, width, options = {}) {
  const params = new URLSearchParams({
    w: width,
    ...options,
  });

  // Let the server negotiate format based on browser capabilities
  return `/api/image-proxy/${fileId}?${params}`;
}

// Usage examples
const heroUrl = getOptimizedImageUrl("1abc123", 1600, { q: 85, fit: "cover" });
const thumbUrl = getOptimizedImageUrl("1abc123", 400, {
  q: 70,
  dpr: window.devicePixelRatio,
});

// Preload critical images
function preloadImage(fileId, width, format = "auto") {
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.href = `/api/image-proxy/${fileId}?w=${width}&format=${format}`;
  document.head.appendChild(link);
}
```

#### CSS Integration

```css
/* Background image with high-DPI support */
.hero-section {
  background-image: url("/api/image-proxy/1abc123?w=1600&format=auto&q=80");
}

@media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 2dppx) {
  .hero-section {
    background-image: url("/api/image-proxy/1abc123?w=1600&format=auto&q=80&dpr=2");
  }
}

/* Mobile-optimized thumbnails */
@media (max-width: 768px) {
  .gallery-thumb {
    background-image: url("/api/image-proxy/1abc123?w=400&format=auto&q=70");
  }
}
```

### Security and Rate Limiting

#### Security Features

- **Input Validation**: All parameters validated and sanitized
- **File Type Restriction**: Only processes supported image formats
- **Size Limits**: Maximum processing dimensions and file sizes
- **Access Control**: Integration with Google Drive permissions

#### Rate Limiting

- **Per IP**: 100 requests per minute
- **Per File**: 10 concurrent processing requests
- **Global**: 1000 concurrent image processing operations
- **Burst Handling**: Short bursts allowed with token bucket algorithm

### Monitoring and Analytics

#### Performance Metrics

- **Processing Time**: Average image processing duration
- **Cache Hit Rate**: Percentage of cached vs. processed requests
- **Format Distribution**: Usage statistics by format (AVIF/WebP/JPEG)
- **Error Rate**: Failed processing attempts and reasons
- **Bandwidth Savings**: Compression efficiency across formats

#### Health Checks

```bash
# Health check endpoint
GET /api/image-proxy/health

{
  "status": "healthy",
  "processing": {
    "queue": 5,
    "active": 12,
    "failed": 0
  },
  "cache": {
    "hitRate": 0.847,
    "size": "2.3GB",
    "items": 15420
  },
  "formats": {
    "avif": 0.45,
    "webp": 0.35,
    "jpeg": 0.20
  }
}
```

## Phase 3 API Integration Guide

### Complete Gallery Integration

For a full-featured gallery implementation using all Phase 3 APIs:

```javascript
class FestivalGalleryManager {
  constructor(config = {}) {
    this.baseUrl = config.baseUrl || "/api";
    this.cache = new Map();
    this.performanceMetrics = [];
  }

  // Initialize multi-year gallery
  async initializeGallery() {
    try {
      // Mark start of gallery initialization
      performance.mark("gallery-init-start");

      // Load available years
      const yearsResponse = await fetch(`${this.baseUrl}/gallery/years`);
      const yearsData = await yearsResponse.json();

      // Build year navigation
      this.renderYearNavigation(yearsData.years);

      // Load default year gallery
      await this.loadGallery(yearsData.defaultYear);

      // Load featured photos for hero section
      await this.loadFeaturedPhotos();

      performance.mark("gallery-init-end");
      performance.measure(
        "gallery-initialization",
        "gallery-init-start",
        "gallery-init-end",
      );

      // Send performance metrics
      this.sendPerformanceMetrics();
    } catch (error) {
      console.error("Failed to initialize gallery:", error);
      this.showFallbackContent();
    }
  }

  // Load gallery for specific year
  async loadGallery(year) {
    try {
      const folderId = this.getFolderIdForYear(year);
      const response = await fetch(
        `${this.baseUrl}/gallery?folderId=${folderId}`,
      );
      const galleryData = await response.json();

      this.renderGallery(galleryData.items);
      this.cache.set(`gallery-${year}`, galleryData);
    } catch (error) {
      console.error(`Failed to load gallery for ${year}:`, error);
    }
  }

  // Load featured photos
  async loadFeaturedPhotos(options = {}) {
    try {
      const params = new URLSearchParams({
        limit: options.limit || 8,
        size: options.size || "medium",
        format: this.getSupportedFormat(),
      });

      const response = await fetch(`${this.baseUrl}/featured-photos?${params}`);
      const featuredData = await response.json();

      this.renderFeaturedPhotos(featuredData.photos);
    } catch (error) {
      console.error("Failed to load featured photos:", error);
    }
  }

  // Detect optimal image format for browser
  getSupportedFormat() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;

    // Check AVIF support
    if (canvas.toDataURL("image/avif").startsWith("data:image/avif")) {
      return "avif";
    }

    // Check WebP support
    if (canvas.toDataURL("image/webp").startsWith("data:image/webp")) {
      return "webp";
    }

    return "jpeg";
  }

  // Create responsive image element
  createResponsiveImage(photo, sizes = "(max-width: 768px) 100vw, 50vw") {
    const picture = document.createElement("picture");

    // AVIF source
    const avifSource = document.createElement("source");
    avifSource.srcset = `
      ${this.getImageUrl(photo.id, { w: 400, format: "avif" })} 400w,
      ${this.getImageUrl(photo.id, { w: 800, format: "avif" })} 800w,
      ${this.getImageUrl(photo.id, { w: 1200, format: "avif" })} 1200w
    `;
    avifSource.sizes = sizes;
    avifSource.type = "image/avif";
    picture.appendChild(avifSource);

    // WebP source
    const webpSource = document.createElement("source");
    webpSource.srcset = `
      ${this.getImageUrl(photo.id, { w: 400, format: "webp" })} 400w,
      ${this.getImageUrl(photo.id, { w: 800, format: "webp" })} 800w,
      ${this.getImageUrl(photo.id, { w: 1200, format: "webp" })} 1200w
    `;
    webpSource.sizes = sizes;
    webpSource.type = "image/webp";
    picture.appendChild(webpSource);

    // JPEG fallback
    const img = document.createElement("img");
    img.srcSet = `
      ${this.getImageUrl(photo.id, { w: 400, format: "jpeg" })} 400w,
      ${this.getImageUrl(photo.id, { w: 800, format: "jpeg" })} 800w,
      ${this.getImageUrl(photo.id, { w: 1200, format: "jpeg" })} 1200w
    `;
    img.src = this.getImageUrl(photo.id, { w: 800, format: "jpeg" });
    img.sizes = sizes;
    img.alt = photo.name || photo.title || "Festival photo";
    img.loading = "lazy";
    picture.appendChild(img);

    return picture;
  }

  // Generate optimized image URL
  getImageUrl(fileId, options = {}) {
    const params = new URLSearchParams({
      w: options.w || 800,
      format: options.format || "auto",
      q: options.q || 75,
      dpr: options.dpr || window.devicePixelRatio || 1,
      ...options,
    });

    return `${this.baseUrl}/image-proxy/${fileId}?${params}`;
  }

  // Send performance metrics
  async sendPerformanceMetrics() {
    try {
      const navigation = performance.getEntriesByType("navigation")[0];
      const resources = performance
        .getEntriesByType("resource")
        .filter((entry) => entry.name.includes("/api/"));
      const marks = performance.getEntriesByType("mark");
      const measures = performance.getEntriesByType("measure");

      const metricsData = {
        metrics: {
          navigation: this.formatNavigationTiming(navigation),
          resources: resources.map(this.formatResourceTiming),
          marks: marks.map(this.formatPerformanceEntry),
          measures: measures.map(this.formatPerformanceEntry),
        },
        context: {
          page: window.location.pathname,
          userAgent: navigator.userAgent,
          connection: this.getConnectionInfo(),
          device: this.getDeviceInfo(),
          timestamp: new Date().toISOString(),
        },
      };

      await fetch(`${this.baseUrl}/performance-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metricsData),
      });
    } catch (error) {
      console.error("Failed to send performance metrics:", error);
    }
  }

  // Format navigation timing for metrics
  formatNavigationTiming(navigation) {
    return {
      type: navigation.entryType,
      name: navigation.name,
      startTime: navigation.startTime,
      duration: navigation.duration,
      entries: {
        fetchStart: navigation.fetchStart,
        domainLookupStart: navigation.domainLookupStart,
        domainLookupEnd: navigation.domainLookupEnd,
        connectStart: navigation.connectStart,
        connectEnd: navigation.connectEnd,
        requestStart: navigation.requestStart,
        responseStart: navigation.responseStart,
        responseEnd: navigation.responseEnd,
        domContentLoadedEventStart: navigation.domContentLoadedEventStart,
        domContentLoadedEventEnd: navigation.domContentLoadedEventEnd,
        loadEventStart: navigation.loadEventStart,
        loadEventEnd: navigation.loadEventEnd,
      },
    };
  }

  // Format resource timing for metrics
  formatResourceTiming(resource) {
    return {
      name: resource.name,
      entryType: resource.entryType,
      startTime: resource.startTime,
      duration: resource.duration,
      transferSize: resource.transferSize,
      encodedBodySize: resource.encodedBodySize,
      decodedBodySize: resource.decodedBodySize,
    };
  }

  // Format performance entry
  formatPerformanceEntry(entry) {
    return {
      name: entry.name,
      entryType: entry.entryType,
      startTime: entry.startTime,
      duration: entry.duration || 0,
    };
  }

  // Get connection information
  getConnectionInfo() {
    const connection =
      navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;
    return connection
      ? {
          effectiveType: connection.effectiveType,
          downlink: connection.downlink,
          rtt: connection.rtt,
        }
      : {};
  }

  // Get device information
  getDeviceInfo() {
    return {
      memory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
    };
  }
}

// Initialize gallery on page load
document.addEventListener("DOMContentLoaded", () => {
  const galleryManager = new FestivalGalleryManager();
  galleryManager.initializeGallery();
});
```

### API Endpoint Summary

| Endpoint                    | Purpose               | Phase | Key Features                      |
| --------------------------- | --------------------- | ----- | --------------------------------- |
| `/api/gallery`              | Main gallery data     | 1,2,3 | Google Drive integration, caching |
| `/api/gallery/years`        | Multi-year navigation | 3     | Year filtering, metadata          |
| `/api/featured-photos`      | Curated highlights    | 3     | Social media optimization         |
| `/api/image-proxy/[fileId]` | Image optimization    | 1,2,3 | AVIF, WebP, responsive delivery   |
| `/api/performance-metrics`  | Performance tracking  | 3     | Real-time monitoring              |
| `/api/hero-image/[pageId]`  | Page-specific heroes  | 2,3   | Context-aware optimization        |
| `/api/health/check`         | General health        | 3     | System-wide monitoring            |
| `/api/health/database`      | Dev DB health         | 3     | Database connectivity             |
| `/api/health/e2e-database`  | E2E DB health         | 3     | E2E test environment monitoring   |

### Best Practices for Integration

1. **Progressive Enhancement**: Always provide fallbacks for modern formats
2. **Performance Monitoring**: Integrate metrics collection for continuous optimization
3. **Caching Strategy**: Leverage multi-layer caching for optimal performance
4. **Error Handling**: Implement graceful degradation for network failures
5. **Accessibility**: Include proper alt text and semantic markup
6. **SEO Optimization**: Use structured data and Open Graph tags
7. **Mobile First**: Optimize for mobile devices and slower connections
8. **Security**: Validate all inputs and sanitize outputs

### Migration from Earlier Phases

#### Phase 1 → Phase 3

- Update image URLs to use enhanced proxy with AVIF support
- Implement performance metrics collection
- Add multi-year gallery support

#### Phase 2 → Phase 3

- Integrate performance metrics API
- Update service worker for AVIF format handling
- Add featured photos endpoint integration

### Support and Troubleshooting

#### Common Issues

1. **AVIF not loading**: Check browser support, ensure fallback chain is complete
2. **Rate limiting**: Implement exponential backoff and request queuing
3. **Large payload errors**: Reduce image sizes and implement pagination
4. **Cache misses**: Verify cache keys and warming strategies

#### Debug Endpoints

- `/api/image-proxy/health` - Image processing health status
- `/api/health/check` - General API debugging information
- `/api/health/e2e-database` - E2E database status (E2E mode only)
- Browser DevTools Network tab - Monitor request/response patterns

#### Performance Optimization Tips

- Preload critical images using `<link rel="preload">`
- Use Intersection Observer for lazy loading
- Implement progressive image loading
- Monitor Core Web Vitals metrics
- Optimize for 3G and slower connections

This comprehensive API documentation provides developers with everything needed to integrate the Phase 3 features of the A Lo Cubano Boulder Fest website, ensuring optimal performance, modern image formats, detailed monitoring capabilities, and comprehensive health checking for both development and E2E test environments.