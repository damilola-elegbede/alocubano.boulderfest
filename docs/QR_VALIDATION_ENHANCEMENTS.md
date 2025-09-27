# QR Validation Endpoint Enhancements

## Overview

The QR validation endpoint (`/api/tickets/validate`) has been significantly enhanced to handle JWT tokens and provide comprehensive scan tracking with improved security and analytics capabilities.

## Key Enhancements

### 1. JWT Token Support

#### Before
- Only supported direct validation codes
- Limited token validation logic

#### After
- **Full JWT token support** using QRTokenService
- **Backward compatibility** with legacy validation codes
- **Enhanced security** with proper JWT validation
- **Token expiry handling** with appropriate error responses

### 2. Database Schema Enhancements

#### New Tables Added (Migration 037)

##### `scan_logs` Table
```sql
CREATE TABLE scan_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticket_id TEXT NOT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scan_status TEXT NOT NULL CHECK (scan_status IN ('valid', 'already_scanned', 'expired', 'invalid', 'rate_limited', 'suspicious')),
    scan_location TEXT,
    device_info TEXT,
    ip_address TEXT,
    user_agent TEXT,
    validation_source TEXT DEFAULT 'web',
    token_type TEXT CHECK (token_type IN ('JWT', 'direct')),
    failure_reason TEXT,
    request_id TEXT,
    scan_duration_ms INTEGER,
    security_flags TEXT, -- JSON string containing security-related flags
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

##### Enhanced `tickets` Table
```sql
-- Added validation_status field
ALTER TABLE tickets ADD COLUMN validation_status TEXT DEFAULT 'active'
CHECK (validation_status IN ('active', 'expired', 'suspended', 'revoked'));

-- Added event_end_date for event expiry validation
ALTER TABLE tickets ADD COLUMN event_end_date DATETIME;
```

### 3. Enhanced Rate Limiting

#### Per-IP Rate Limiting (Existing)
- 50 attempts per minute
- 5-minute lockout after exceeding limit

#### New: Per-Ticket Rate Limiting
- **10 scans per hour per ticket**
- 30-minute lockout after exceeding limit
- Prevents ticket abuse and suspicious scanning patterns

### 4. Comprehensive Scan Tracking

#### What Gets Logged
- **Every scan attempt** (successful and failed)
- **Detailed metadata**: timestamp, location, device info, IP address
- **Security flags**: suspicious patterns, rate limiting events
- **Performance metrics**: scan duration, request ID
- **Token type identification**: JWT vs direct validation codes

#### Analytics Capabilities
- Track scan patterns for security analysis
- Monitor device and location usage
- Detect suspicious scanning behavior
- Performance monitoring and optimization

### 5. Enhanced Response Format

#### Success Response
```json
{
  "valid": true,
  "ticket": {
    "id": "T-2024-001",
    "type": "VIP Pass",
    "attendee": "John Doe",
    "event": "A Lo Cubano Boulder Fest 2026"
  },
  "validation": {
    "status": "valid",
    "scan_count": 1,
    "last_scanned": "2024-01-15T10:30:00Z",
    "message": "Welcome John! Ticket validated successfully"
  }
}
```

#### Error Response
```json
{
  "valid": false,
  "error": "Token has expired",
  "validation": {
    "status": "expired",
    "message": "Token has expired"
  }
}
```

### 6. Security Enhancements

#### Event End Validation
- **Automatic event expiry checking**
- Returns HTTP 410 for expired events
- Prevents ticket use after event completion

#### Enhanced Error Categorization
- **400**: Invalid token format
- **401**: Expired or invalid token
- **404**: Ticket not found
- **410**: Event ended or maximum scans exceeded
- **429**: Rate limit exceeded
- **503**: Service unavailable

#### Suspicious Pattern Detection
- Monitors for injection attempts
- Logs security risks for monitoring
- Rate limiting based on IP and ticket ID

### 7. JWT Token Integration

#### QRTokenService Integration
- Uses centralized QR token service for JWT validation
- Consistent token handling across the application
- Proper error handling for expired/invalid tokens

#### Token Format Support
```javascript
// JWT Token Payload
{
  "tid": "T-2024-001",    // Ticket ID
  "iat": 1640995200,      // Issued at
  "exp": 1648771200,      // Expires at
  "isTest": false         // Test mode flag
}
```

## Implementation Details

### Key Functions Added

#### `checkPerTicketRateLimit(ticketId)`
- Implements per-ticket rate limiting
- Returns rate limit status and retry information

#### `isEventEnded(ticket)`
- Checks if event has ended based on event_end_date
- Prevents post-event ticket validation

#### `logScanAttempt(db, scanData)`
- Comprehensive scan logging to scan_logs table
- Non-blocking operation to prevent validation delays

#### Enhanced `validateTicket(db, validationCode, source, isJWT)`
- Supports both JWT tokens and legacy validation codes
- Atomic transaction handling
- Enhanced validation checks (event end, validation status)

### Backward Compatibility

#### Legacy Support Maintained
- **Direct validation codes** still supported
- **Existing QR codes** continue to work
- **API contract preservation** for existing integrations

#### Migration Strategy
- Database migration adds new fields with defaults
- Existing tickets get default validation_status: 'active'
- New scan_logs table doesn't affect existing functionality

## Usage Examples

### JWT Token Validation
```javascript
// Generate JWT token
const qrTokenService = getQRTokenService();
const token = qrTokenService.generateToken({ tid: 'T-2024-001' });

// Validate via API
const response = await fetch('/api/tickets/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token })
});
```

### Legacy Validation Code
```javascript
// Use direct validation code
const response = await fetch('/api/tickets/validate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token: 'VAL-CODE-123' })
});
```

## Monitoring and Analytics

### Scan Analytics
- Query scan_logs for usage patterns
- Monitor successful vs failed validations
- Track device and location trends

### Security Monitoring
- Monitor rate_limited scans
- Track suspicious scanning patterns
- Analyze security flags for threats

### Performance Monitoring
- Track scan_duration_ms for optimization
- Monitor rate limiting effectiveness
- Analyze user experience metrics

## Migration Required

To fully activate all enhancements, run the database migration:

```bash
npm run migrate:up
```

This will create the `scan_logs` table and add the new fields to the `tickets` table.

## Testing

The enhancements maintain full backward compatibility and can be tested with:

1. **Existing QR codes** (legacy validation codes)
2. **New JWT tokens** generated by QRTokenService
3. **Rate limiting scenarios**
4. **Event expiry scenarios**
5. **Security pattern detection**

## Benefits

### For Event Staff
- **Faster validation** with comprehensive information
- **Better error messages** for troubleshooting
- **Real-time scan tracking** and analytics

### For Security
- **Enhanced fraud detection** with comprehensive logging
- **Rate limiting** prevents abuse
- **Suspicious pattern detection** for security monitoring

### For Analytics
- **Detailed scan metrics** for event analysis
- **Device and location tracking** for insights
- **Performance monitoring** for optimization

### For Developers
- **Robust error handling** with proper HTTP status codes
- **Comprehensive logging** for debugging
- **JWT token support** for modern security practices