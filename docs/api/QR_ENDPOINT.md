# QR Code Generation Endpoint

## Overview

The QR Code Generation endpoint provides secure, cacheable PNG images of QR codes for ticket validation. This endpoint is designed for email compatibility and web display, supporting JWT-based token validation with comprehensive error handling.

## Endpoint Specification

### Request

**URL**: `GET /api/qr/generate`

**Parameters**:
- `token` (required) - JWT token string for ticket validation

**Headers**:
- `Accept: image/png` (recommended)
- `Cache-Control: no-cache` (optional, to bypass cache)

### Response

**Success (200 OK)**:
- **Content-Type**: `image/png`
- **Cache-Control**: `public, max-age=86400` (24-hour cache)
- **Content-Length**: Binary PNG image size
- **Body**: Raw PNG image buffer

**Error Responses**:
- `400 Bad Request` - Invalid or missing token parameter
- `405 Method Not Allowed` - Non-GET request method
- `500 Internal Server Error` - QR code generation failure

## Technical Implementation

### QR Code Specifications

```javascript
const qrOptions = {
  errorCorrectionLevel: "M",    // Medium error correction (15%)
  width: 300,                   // 300x300 pixels
  margin: 2,                    // 2-unit margin
  color: {
    dark: "#000000",           // Black QR modules
    light: "#FFFFFF",          // White background
  },
};
```

### Data Format

QR codes contain URLs in the format:
```
https://domain.com/my-ticket#<jwt-token>
```

The base URL is automatically determined:
- **Production**: Uses `VERCEL_URL` environment variable
- **Development**: Defaults to `http://localhost:8080`

### Token Validation

The endpoint validates JWT tokens using the QR Token Service:

```javascript
import { getQRTokenService } from "../../lib/qr-token-service.js";

const qrTokenService = getQRTokenService();
const validation = qrTokenService.validateToken(token);
```

**Validation checks**:
- JWT signature verification
- Token expiration (configurable TTL)
- Token format and structure
- Issuer validation

## Usage Examples

### Web Browser

```html
<img src="/api/qr/generate?token=YOUR_TOKEN_HERE..."
     alt="Ticket QR Code"
     width="300"
     height="300" />
```

### Email Templates

```html
<!-- Direct image embedding -->
<img src="https://yourdomain.com/api/qr/generate?token=YOUR_TOKEN_HERE..."
     alt="Your Ticket QR Code"
     style="width: 300px; height: 300px; display: block; margin: 0 auto;" />
```

### JavaScript Fetch

```javascript
async function loadQRCode(token) {
  try {
    const response = await fetch(`/api/qr/generate?token=${encodeURIComponent(token)}`);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const imageUrl = URL.createObjectURL(blob);

    // Use imageUrl for display
    document.getElementById('qr-image').src = imageUrl;

  } catch (error) {
    console.error('Failed to load QR code:', error);
  }
}
```

### cURL Command

```bash
curl -X GET "https://yourdomain.com/api/qr/generate?token=<jwt-token>" \
     -H "Accept: image/png" \
     -o ticket-qr.png
```

## Error Handling

### Client-Side Error Handling

```javascript
async function handleQRCodeErrors(token) {
  try {
    const response = await fetch(`/api/qr/generate?token=${token}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Unknown error');
    }

    return await response.blob();

  } catch (error) {
    switch (error.message) {
      case 'Token parameter is required':
        console.error('Missing token parameter');
        break;
      case 'Invalid or expired token':
        console.error('Token validation failed');
        break;
      default:
        console.error('QR generation failed:', error.message);
    }
    throw error;
  }
}
```

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `400: Token parameter is required` | Missing or empty token | Provide valid JWT token |
| `400: Invalid or expired token` | Token validation failed | Use current, valid token |
| `405: Method not allowed` | Non-GET request | Use GET method only |
| `500: Failed to generate QR code` | Server-side generation error | Retry request, check logs |

## Performance Considerations

### Caching Strategy

**Browser Cache**: 24-hour cache headers enable client-side caching:

```http
Cache-Control: public, max-age=86400
```

**CDN/Proxy Cache**: QR codes are cacheable by intermediate proxies

**Application Cache**: Consider implementing server-side Redis cache for high-traffic scenarios

### Performance Optimizations

1. **Image Format**: PNG optimized for QR code patterns
2. **Error Correction**: Medium level (15%) balances reliability and size
3. **Fixed Dimensions**: 300x300px provides optimal scan reliability
4. **Compression**: PNG compression reduces file size

### Performance Metrics

- **Typical Response Time**: 50-150ms
- **Image Size**: 2-5KB (varies by content)
- **Cache Hit Ratio**: 80-95% (with proper caching)
- **Error Correction**: Handles up to 15% data corruption

## Security Features

### Token Security

- **JWT Signature**: Cryptographic signature prevents tampering
- **Expiration**: Configurable token TTL (typically 72 hours)
- **Issuer Validation**: Tokens must originate from authenticated source
- **No Sensitive Data**: QR contains only public ticket URL

### Access Control

- **No Authentication Required**: Public endpoint for ticket display
- **Rate Limiting**: Implement at reverse proxy level if needed
- **CORS**: Configure based on client domain requirements

### Privacy Protection

- **No Logging**: Token values not logged in plaintext
- **Temporary URLs**: QR data points to temporary ticket display URLs
- **No PII**: QR codes contain no personally identifiable information

## Monitoring and Debugging

### Success Metrics

```javascript
// Track successful QR generations
console.log(`Generated QR code: ${qrData} (${isTest ? 'TEST' : 'PRODUCTION'})`);
```

### Error Logging

```javascript
// Server-side error logging
console.error("Error generating QR code PNG:", error.message);

// Development-only error details
if (process.env.NODE_ENV === "development") {
  console.error("Full error:", error);
}
```

### Health Monitoring

Monitor these metrics:
- **Response Time**: P50, P95, P99 latencies
- **Error Rate**: 4xx and 5xx response percentages
- **Cache Hit Rate**: Browser and proxy cache effectiveness
- **Token Validation**: Success vs failure rates

## Integration with Frontend

### QR Cache Manager Integration

The endpoint works seamlessly with the QR Cache Manager for optimal performance:

```javascript
// Automatic caching with 7-day localStorage
await window.qrCacheManager.loadQRCode(token, container, {
  showSkeleton: true,
  retryOnError: true,
  onProgress: (progress) => console.log('QR load progress:', progress)
});
```

### Ticket Display Integration

Used in ticket display pages (`/my-ticket`) and email confirmations:

```javascript
// Render QR code in ticket container
const qrData = `${baseUrl}/my-ticket#${token}`;
const qrElement = await generateQRDisplay(qrData);
container.appendChild(qrElement);
```

## Testing

### Unit Tests

```javascript
// Test token validation
test('should validate JWT token correctly', async () => {
  const validToken = generateTestToken();
  const response = await fetch(`/api/qr/generate?token=${validToken}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
});

// Test error scenarios
test('should return 400 for invalid token', async () => {
  const response = await fetch('/api/qr/generate?token=invalid');
  expect(response.status).toBe(400);
});
```

### Integration Tests

```javascript
// Test end-to-end QR generation and scanning
test('generated QR code should be scannable', async () => {
  const token = createValidTicketToken();
  const response = await fetch(`/api/qr/generate?token=${token}`);
  const qrBlob = await response.blob();

  // Verify QR code contains expected URL
  const decodedData = await decodeQRFromBlob(qrBlob);
  expect(decodedData).toContain('/my-ticket#');
});
```

### Load Testing

```bash
# Test endpoint under load
k6 run --vus 50 --duration 30s qr-endpoint-load-test.js
```

## Troubleshooting

### Common Issues

**Issue**: QR code not displaying in emails
- **Cause**: Email client blocks external images
- **Solution**: Use base64 data URLs or email service image proxying

**Issue**: Token validation errors
- **Cause**: Expired or malformed JWT
- **Solution**: Regenerate token, check JWT configuration

**Issue**: Slow response times
- **Cause**: No caching, high server load
- **Solution**: Implement caching, optimize QR generation

### Debug Commands

```bash
# Test endpoint directly
curl -I "https://yourdomain.com/api/qr/generate?token=<test-token>"

# Check token validity
node -e "console.log(require('jsonwebtoken').decode('<token>'))"

# Validate image output
file downloaded-qr.png  # Should show: PNG image data, 300 x 300
```

## Environment Configuration

### Required Environment Variables

```bash
# JWT signing secret (from registration system)
REGISTRATION_SECRET=your-jwt-secret-key

# Base URL for QR data (auto-detected in most cases)
VERCEL_URL=your-production-domain.com
```

### Optional Configuration

```bash
# QR code customization (if needed)
QR_ERROR_CORRECTION_LEVEL=M    # L, M, Q, H
QR_CODE_SIZE=300              # Pixel dimensions
QR_MARGIN=2                   # Margin units
```

## Future Enhancements

### Planned Features

1. **SVG Output**: Vector format option for better scaling
2. **Custom Branding**: Festival logo overlay on QR codes
3. **Batch Generation**: Multiple QR codes in single request
4. **Analytics**: Track QR code generation and usage metrics
5. **Rate Limiting**: Built-in request throttling

### API Versioning

Future versions will maintain backward compatibility:
- `v1`: Current implementation
- `v2`: Enhanced features with optional parameters
- Deprecation notices for legacy features