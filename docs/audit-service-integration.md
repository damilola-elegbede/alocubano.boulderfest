# Audit Service Integration Guide

The audit service framework provides comprehensive logging for security, compliance, and monitoring purposes. This guide shows how to integrate it with existing admin endpoints.

## Quick Start

### 1. Basic Admin Endpoint with Audit Logging

```javascript
// api/admin/example.js
import authService from '../../lib/auth-service.js';
import { withAdminAudit } from '../../lib/admin-audit-middleware.js';
import { withSecurityHeaders } from '../../lib/security-headers-serverless.js';

async function handler(req, res) {
  // Your existing endpoint logic
  res.json({ message: 'Admin operation completed' });
}

// Wrap with audit middleware and auth
export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler)
  )
);
```

### 2. High-Security Operations

For sensitive operations like user data management or financial transactions:

```javascript
// api/admin/sensitive-operation.js
import { withHighSecurityAudit } from '../../lib/admin-audit-middleware.js';
import authService from '../../lib/auth-service.js';

async function handler(req, res) {
  // Sensitive operation logic
  res.json({ result: 'success' });
}

export default authService.requireAuth(
  withHighSecurityAudit(handler, {
    logFullRequest: true,
    alertOnFailure: true
  })
);
```

### 3. Authentication Endpoints

For login/logout endpoints:

```javascript
// api/admin/login.js
import { withAuthAudit } from '../../lib/admin-audit-middleware.js';

async function handler(req, res) {
  // Login logic
}

export default withAuthAudit(handler, {
  logLoginAttempts: true,
  logFailedAttempts: true
});
```

## Manual Audit Logging

### Data Changes

```javascript
import auditService from '../../lib/audit-service.js';

// Log data modifications
await auditService.logDataChange({
  action: 'UPDATE',
  targetType: 'ticket',
  targetId: 'ticket_123',
  beforeValue: { status: 'pending', price: 45 },
  afterValue: { status: 'confirmed', price: 50 },
  changedFields: ['status', 'price'],
  adminUser: req.admin.id,
  sessionId: req.admin.sessionId,
  ipAddress: req.clientIP
});
```

### Financial Events

```javascript
// Log payment processing
await auditService.logFinancialEvent({
  action: 'PAYMENT_PROCESSED',
  amountCents: 5000,
  currency: 'USD',
  transactionReference: 'stripe_pi_1234',
  paymentStatus: 'succeeded',
  targetId: 'order_789',
  adminUser: req.admin.id
});
```

### GDPR Data Processing

```javascript
// Log data export for GDPR compliance
await auditService.logDataProcessing({
  action: 'DATA_EXPORT',
  dataSubjectId: 'user_123',
  dataType: 'personal_information',
  processingPurpose: 'user_data_request',
  legalBasis: 'legitimate_interest',
  adminUser: req.admin.id
});
```

### Configuration Changes

```javascript
// Log system configuration changes
await auditService.logConfigChange({
  action: 'UPDATE_TICKET_PRICE',
  configKey: 'early_bird_price',
  beforeValue: { price: 45 },
  afterValue: { price: 50 },
  adminUser: req.admin.id,
  sessionId: req.admin.sessionId,
  ipAddress: req.clientIP
});
```

## Querying Audit Logs

### Basic Query

```javascript
// Get recent admin actions
const auditLogs = await auditService.queryAuditLogs({
  eventType: 'admin_access',
  limit: 50,
  orderBy: 'created_at',
  orderDirection: 'DESC'
});
```

### Filtered Query

```javascript
// Get financial events for a specific admin
const financialAudits = await auditService.queryAuditLogs({
  eventType: 'financial_event',
  adminUser: 'admin_1',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  severity: 'warning'
});
```

### Audit Statistics

```javascript
// Get audit statistics for dashboard
const stats = await auditService.getAuditStats('24h');
console.log(stats);
// {
//   timeframe: '24h',
//   stats: [
//     {
//       event_type: 'admin_access',
//       severity: 'info',
//       count: 42,
//       unique_users: 3,
//       first_event: '2024-01-15T10:00:00Z',
//       last_event: '2024-01-15T18:30:00Z'
//     }
//   ]
// }
```

## Middleware Options

### withAdminAudit Options

```javascript
withAdminAudit(handler, {
  logBody: true,              // Log request body (default: true)
  logMetadata: true,          // Log request metadata (default: true)
  skipPaths: ['/health'],     // Skip certain paths
  skipMethods: ['OPTIONS'],   // Skip certain HTTP methods
  maxBodySize: 10000         // Max body size to log in bytes
})
```

### withAuthAudit Options

```javascript
withAuthAudit(handler, {
  logLoginAttempts: true,     // Log all login attempts
  logFailedAttempts: true,    // Log failed attempts
  logSessionEvents: true      // Log session events
})
```

### withHighSecurityAudit Options

```javascript
withHighSecurityAudit(handler, {
  requireExplicitAction: true, // Require explicit action logging
  logFullRequest: true,        // Log complete request details
  alertOnFailure: true         // Send alerts on failures
})
```

## Database Schema

The audit framework creates an `audit_logs` table with the following structure:

```sql
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,           -- Unique request identifier
  event_type TEXT NOT NULL,           -- 'admin_access', 'data_change', etc.
  action TEXT NOT NULL,               -- Specific action performed
  target_type TEXT,                   -- Type of target (user, ticket, etc.)
  target_id TEXT,                     -- ID of target
  admin_user TEXT,                    -- Admin performing action
  session_id TEXT,                    -- Session identifier

  -- Request context
  ip_address TEXT,
  user_agent TEXT,
  request_method TEXT,
  request_url TEXT,
  request_body TEXT,
  response_status INTEGER,
  response_time_ms INTEGER,

  -- Data changes
  before_value TEXT,                  -- JSON of data before change
  after_value TEXT,                   -- JSON of data after change
  changed_fields TEXT,                -- Array of changed field names

  -- Financial events
  amount_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  transaction_reference TEXT,
  payment_status TEXT,

  -- GDPR compliance
  data_subject_id TEXT,
  data_type TEXT,
  processing_purpose TEXT,
  legal_basis TEXT,
  retention_period TEXT,

  -- System configuration
  config_key TEXT,
  config_environment TEXT,

  -- Metadata
  metadata TEXT,                      -- JSON metadata
  error_message TEXT,
  severity TEXT DEFAULT 'info',       -- debug, info, warning, error, critical
  source_service TEXT DEFAULT 'festival-platform',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Best Practices

1. **Use Appropriate Middleware**: Choose the right middleware for your endpoint's security level
2. **Manual Logging for Business Logic**: Use manual audit logging for important business operations
3. **Sanitize Sensitive Data**: The service automatically sanitizes passwords, tokens, etc.
4. **Include Context**: Always provide admin user, session ID, and IP address when available
5. **Use Severity Levels**: Use appropriate severity levels (debug, info, warning, error, critical)
6. **Query Efficiently**: Use filters and pagination when querying large audit logs

## Integration Patterns

### Existing Admin Endpoints

To add audit logging to existing admin endpoints, simply wrap them:

```javascript
// Before
export default withSecurityHeaders(authService.requireAuth(handler));

// After
export default withSecurityHeaders(
  authService.requireAuth(
    withAdminAudit(handler)
  )
);
```

### Custom Audit Points

Add manual audit logging at critical business logic points:

```javascript
async function processRefund(ticketId, adminUser) {
  const ticket = await getTicket(ticketId);

  // Log the refund action
  await auditService.logFinancialEvent({
    action: 'REFUND_INITIATED',
    amountCents: ticket.price_cents,
    targetId: ticketId,
    adminUser: adminUser.id,
    metadata: { reason: 'customer_request' }
  });

  // Process refund...

  await auditService.logFinancialEvent({
    action: 'REFUND_COMPLETED',
    amountCents: ticket.price_cents,
    targetId: ticketId,
    adminUser: adminUser.id
  });
}
```

## Health Monitoring

Check audit service health:

```javascript
const health = await auditService.healthCheck();
console.log(health);
// {
//   status: 'healthy',
//   initialized: true,
//   database_connected: true,
//   total_logs: 1523,
//   timestamp: '2024-01-15T18:30:00Z'
// }
```