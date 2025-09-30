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
ALTER TABLE tickets ADD COLUMN validation_status TEXT DEFAULT 'valid'
CHECK (validation_status IN ('valid', 'invalid', 'expired', 'revoked'));

-- Added event_end_date for event expiry validation
ALTER TABLE tickets ADD COLUMN event_end_date DATETIME;
```

**SQLite CHECK Constraint Note**:

When using `ADD COLUMN` with a CHECK constraint in SQLite, existing rows are **not re-validated** against the new constraint. The constraint only applies to future INSERT and UPDATE operations. After running this migration, you should verify that legacy data complies with the allowed `validation_status` domain values.

**Recommended Verification**:

```sql
-- Verify no invalid status values exist in existing data
SELECT COUNT(*) FROM tickets
WHERE validation_status NOT IN ('valid', 'invalid', 'expired', 'revoked');

-- If invalid values are found, backfill with default
UPDATE tickets
SET validation_status = 'valid'
WHERE validation_status IS NULL
   OR validation_status NOT IN ('valid', 'invalid', 'expired', 'revoked');
```

**Migration Best Practices**:

1. Run verification query after migration deployment
2. Backfill any non-compliant values with sensible defaults
3. Add migration rollback procedure if schema changes are complex
4. Test migration on staging database before production deployment

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

**HTTP Status Code Semantics**:

- **400 Bad Request**: Malformed token format or invalid input structure
- **401 Unauthorized**: Invalid or expired token (authentication failure)
- **404 Not Found**: Ticket does not exist in database
- **409 Conflict**: Ticket locked due to maximum scans exceeded (conflict state)
- **410 Gone**: Event has permanently ended (resource is gone forever)
- **423 Locked**: Ticket temporarily locked (may be unlocked later)
- **429 Too Many Requests**: Rate limit exceeded (IP or ticket-based)
- **503 Service Unavailable**: Service temporarily unavailable

**Status Code Usage Guidelines**:

- Use **400** for validation errors where the client sent invalid data
- Use **401** when authentication fails (token expired, invalid signature)
- Use **404** when the resource (ticket) doesn't exist
- Use **409** for conflict states that may be permanent (max scans reached)
- Use **410** specifically for event expiry (permanent, cannot be recovered)
- Use **423** for temporary locks that may be lifted (e.g., cooldown periods)
- Use **429** for rate limiting to signal client should retry later

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
- Existing tickets get default validation_status: 'valid'
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