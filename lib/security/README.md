# Security Audit Logging

## Overview

The audit logging system provides comprehensive tracking of security-related events across the application. It ensures accountability, helps with forensic analysis, and supports compliance requirements.

## Usage Examples

### Authentication Events

```javascript
import AuditLogger from './audit-logger.js';

// Successful login
await AuditLogger.log({
  eventType: 'USER_LOGIN',
  severity: AuditLogger.SEVERITY.INFO,
  context: {
    userId: user.id,
    username: user.username,
    ipAddress: req.ip
  }
});

// Failed login attempt
await AuditLogger.log({
  eventType: 'USER_LOGIN_FAILURE',
  severity: AuditLogger.SEVERITY.HIGH,
  success: false,
  context: {
    username: attemptedUsername,
    ipAddress: req.ip,
    reason: 'INVALID_CREDENTIALS'
  }
});
```

### Authorization Events

```javascript
// Unauthorized access attempt
await AuditLogger.log({
  eventType: 'UNAUTHORIZED_ACCESS',
  severity: AuditLogger.SEVERITY.CRITICAL,
  success: false,
  context: {
    userId: req.user?.id || 'UNAUTHENTICATED',
    resourceAttempted: '/admin/dashboard',
    ipAddress: req.ip
  }
});
```

### Data Modification Events

```javascript
// Ticket update event
await AuditLogger.log({
  eventType: 'TICKET_MODIFIED',
  severity: AuditLogger.SEVERITY.MEDIUM,
  context: {
    userId: admin.id,
    ticketId: ticket.id,
    changes: ['price', 'availability']
  }
});
```

## Retrieving Logs

```javascript
// Retrieve logs for forensic analysis
const logs = await AuditLogger.retrieveLogs({
  startDate: '2025-01-01',
  endDate: '2025-01-31',
  eventTypes: ['USER_LOGIN', 'UNAUTHORIZED_ACCESS'],
  severityLevels: [AuditLogger.SEVERITY.HIGH, AuditLogger.SEVERITY.CRITICAL],
  success: false
});
```

## Best Practices

1. Log all security-relevant events
2. Never log sensitive personal information
3. Use appropriate severity levels
4. Include context for investigative purposes
5. Regularly review and analyze logs

## Log Retention

- Logs are stored in the `logs/audit/` directory
- Maximum of 10 log files
- Logs are retained for 90 days
- Each log file is limited to 10MB

## Compliance

This logging system supports compliance requirements by providing:
- Tamper-evident logging
- Immutable log storage
- Detailed event tracking
- Ability to export logs for external SIEM systems