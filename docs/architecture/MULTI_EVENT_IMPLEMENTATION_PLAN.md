# Multi-Event Architecture Implementation Plan

## Overview

This document provides the detailed implementation plan for transforming the A Lo Cubano Boulder Fest admin portal from single-event to multi-event architecture. This plan follows the design specified in `MULTI_EVENT_ARCHITECTURE.md`.

## Implementation Phases

### Phase 1: Database Foundation (Days 1-3)

#### Day 1: Database Migration
- [ ] Run migration `20_multi_event_support.sql`
- [ ] Verify tables created successfully
- [ ] Confirm default event populated
- [ ] Test foreign key relationships

```bash
# Run migration
npm run migrate:up

# Verify in database
sqlite3 data/development.db
.tables
SELECT * FROM events;
SELECT COUNT(*) FROM tickets WHERE event_id IS NOT NULL;
```

#### Day 2: API Foundation
- [ ] Create `/api/events/index.js` endpoint
- [ ] Create `/api/events/[eventId].js` endpoint
- [ ] Add event validation middleware
- [ ] Implement event access control

#### Day 3: Testing Infrastructure
- [ ] Write unit tests for event APIs
- [ ] Create test fixtures for multiple events
- [ ] Set up E2E test scenarios

### Phase 2: Event Context Layer (Days 4-7)

#### Day 4: Event Context Manager
- [ ] Create `/js/admin/EventContextManager.js`
- [ ] Implement event storage/retrieval
- [ ] Add event switching logic
- [ ] Create event cache system

#### Day 5: API Integration
- [ ] Update `/lib/event-middleware.js`
- [ ] Add event context to all admin endpoints
- [ ] Implement backward compatibility layer
- [ ] Add event validation to APIs

#### Day 6: Event Selector Component
- [ ] Create `/js/admin/EventSelector.js`
- [ ] Build UI component HTML/CSS
- [ ] Implement search/filter functionality
- [ ] Add keyboard navigation

#### Day 7: Integration Testing
- [ ] Test event switching
- [ ] Verify data isolation
- [ ] Check context persistence
- [ ] Performance benchmarking

### Phase 3: Admin Portal Updates (Days 8-12)

#### Day 8: Dashboard Updates
- [ ] Update `/pages/admin/dashboard.html`
- [ ] Modify dashboard API for event filtering
- [ ] Add event selector to UI
- [ ] Update statistics queries

#### Day 9: Analytics Updates
- [ ] Update `/pages/admin/analytics.html`
- [ ] Add event comparison views
- [ ] Update chart data sources
- [ ] Implement cross-event analytics

#### Day 10: Check-in Scanner
- [ ] Update `/pages/admin/checkin.html`
- [ ] Add event selection to scanner
- [ ] Update validation logic
- [ ] Add event-specific QR codes

#### Day 11: Registration Management
- [ ] Update registration list views
- [ ] Add event filtering to search
- [ ] Update export functionality
- [ ] Add bulk operations

#### Day 12: End-to-End Testing
- [ ] Complete workflow testing
- [ ] Cross-browser testing
- [ ] Performance validation
- [ ] Security audit

### Phase 4: Advanced Features (Days 13-15)

#### Day 13: Event Management UI
- [ ] Create event creation form
- [ ] Add event editing interface
- [ ] Implement event cloning
- [ ] Add event archival

#### Day 14: Reporting & Analytics
- [ ] Cross-event comparison dashboard
- [ ] Historical trend analysis
- [ ] Revenue forecasting
- [ ] Capacity planning tools

#### Day 15: Documentation & Training
- [ ] Update user documentation
- [ ] Create admin training guide
- [ ] Record demo videos
- [ ] Prepare rollout plan

## Technical Implementation Details

### File Structure

```
/api/
  /events/
    index.js          # List/create events
    [eventId].js      # Get/update/delete event
    duplicate.js      # Clone event
    settings.js       # Event settings management
  /lib/
    event-middleware.js   # Event context injection
    event-validator.js    # Event validation rules
    event-access.js       # Access control

/js/admin/
  EventContextManager.js  # Core event context
  EventSelector.js        # UI component
  EventComparison.js      # Comparison views
  EventCreator.js         # Event creation form

/css/admin/
  event-selector.css      # Component styles
  event-management.css    # Management UI styles

/migrations/
  20_multi_event_support.sql  # Database migration
```

### Code Examples

#### Event Middleware Implementation

```javascript
// /lib/event-middleware.js
export async function withEventContext(handler) {
  return async (req, res) => {
    try {
      // Extract event ID from multiple sources
      const eventId = req.query.event_id || 
                     req.headers['x-event-id'] || 
                     req.body?.event_id;
      
      if (!eventId) {
        // Get default event if none specified
        const defaultEvent = await getDefaultEvent();
        req.eventContext = defaultEvent;
      } else {
        // Validate and load event
        const event = await validateAndLoadEvent(eventId, req.user);
        req.eventContext = event;
      }
      
      // Add event context to response headers
      res.setHeader('X-Event-Name', req.eventContext.name);
      res.setHeader('X-Event-Type', req.eventContext.type);
      
      // Call the actual handler
      return handler(req, res);
    } catch (error) {
      if (error.code === 'EVENT_NOT_FOUND') {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (error.code === 'EVENT_ACCESS_DENIED') {
        return res.status(403).json({ error: 'Access denied to this event' });
      }
      throw error;
    }
  };
}

async function getDefaultEvent() {
  const db = await getDatabaseClient();
  const result = await db.execute(`
    SELECT * FROM events 
    WHERE status IN ('active', 'upcoming')
    ORDER BY 
      CASE status 
        WHEN 'active' THEN 1 
        WHEN 'upcoming' THEN 2 
      END,
      start_date ASC
    LIMIT 1
  `);
  
  if (!result.rows[0]) {
    throw new Error('No default event available');
  }
  
  return result.rows[0];
}

async function validateAndLoadEvent(eventId, user) {
  const db = await getDatabaseClient();
  
  // Load event
  const eventResult = await db.execute({
    sql: 'SELECT * FROM events WHERE id = ?',
    args: [eventId]
  });
  
  if (!eventResult.rows[0]) {
    const error = new Error('Event not found');
    error.code = 'EVENT_NOT_FOUND';
    throw error;
  }
  
  const event = eventResult.rows[0];
  
  // Check access control
  const accessResult = await db.execute({
    sql: `
      SELECT role FROM event_access 
      WHERE event_id = ? AND user_email = ?
    `,
    args: [eventId, user.email]
  });
  
  // If no specific access and event is not public, deny
  if (!accessResult.rows[0] && !event.is_visible) {
    const error = new Error('Access denied');
    error.code = 'EVENT_ACCESS_DENIED';
    throw error;
  }
  
  return event;
}
```

#### Updated Dashboard API

```javascript
// /api/admin/dashboard.js
import { withEventContext } from '../lib/event-middleware.js';

async function handler(req, res) {
  const db = await getDatabaseClient();
  const eventId = req.eventContext.id;
  
  // Get event-specific statistics
  const stats = await db.execute({
    sql: `
      SELECT 
        (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND status = 'valid') as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND checked_in_at IS NOT NULL) as checked_in,
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets WHERE event_id = ?) as total_orders,
        (SELECT SUM(amount_cents) / 100.0 FROM transactions WHERE event_id = ? AND status = 'completed') as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND ticket_type LIKE '%workshop%') as workshop_tickets,
        (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND ticket_type LIKE '%vip%') as vip_tickets,
        (SELECT COUNT(*) FROM tickets WHERE event_id = ? AND date(created_at) = date('now')) as today_sales
    `,
    args: [eventId, eventId, eventId, eventId, eventId, eventId, eventId]
  });
  
  // Get recent registrations for this event
  const recentRegistrations = await db.execute({
    sql: `
      SELECT 
        t.ticket_id,
        t.attendee_first_name || ' ' || t.attendee_last_name as attendee_name,
        t.attendee_email,
        t.ticket_type,
        t.created_at,
        tr.transaction_id
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      WHERE t.event_id = ?
      ORDER BY t.created_at DESC
      LIMIT 10
    `,
    args: [eventId]
  });
  
  res.status(200).json({
    event: {
      id: req.eventContext.id,
      name: req.eventContext.name,
      type: req.eventContext.type,
      status: req.eventContext.status
    },
    stats: stats.rows[0],
    recentRegistrations: recentRegistrations.rows,
    timestamp: new Date().toISOString()
  });
}

export default withSecurityHeaders(authService.requireAuth(withEventContext(handler)));
```

#### Event Selector Integration

```javascript
// /js/admin/dashboard.js
import EventSelector from './EventSelector.js';
import EventContextManager from './EventContextManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize event context
  const contextManager = EventContextManager;
  await contextManager.initialize();
  
  // Render event selector
  const selector = new EventSelector();
  await selector.render('event-selector-container');
  
  // Listen for event changes
  window.addEventListener('eventChanged', async (e) => {
    console.log('Event changed to:', e.detail.event);
    // Reload dashboard data
    await loadDashboardData();
  });
  
  // Initial load
  await loadDashboardData();
});

async function loadDashboardData() {
  try {
    // The event context is automatically included by EventContextManager
    const response = await fetch('/api/admin/dashboard');
    const data = await response.json();
    
    // Update UI with event-specific data
    updateDashboardUI(data);
  } catch (error) {
    console.error('Failed to load dashboard:', error);
  }
}
```

## Testing Strategy

### Unit Tests

```javascript
// tests/event-context.test.js
describe('Event Context Management', () => {
  test('loads default event when none specified', async () => {
    const req = { query: {}, headers: {} };
    const res = { setHeader: jest.fn() };
    
    await withEventContext(mockHandler)(req, res);
    
    expect(req.eventContext).toBeDefined();
    expect(req.eventContext.status).toMatch(/active|upcoming/);
  });
  
  test('validates event access', async () => {
    const req = { 
      query: { event_id: 999 },
      user: { email: 'unauthorized@test.com' }
    };
    const res = { 
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    
    await withEventContext(mockHandler)(req, res);
    
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
```

### Integration Tests

```javascript
// tests/multi-event-integration.test.js
describe('Multi-Event Integration', () => {
  test('data isolation between events', async () => {
    // Create two events
    const event1 = await createTestEvent({ name: 'Event 1' });
    const event2 = await createTestEvent({ name: 'Event 2' });
    
    // Create tickets for each
    await createTestTicket({ event_id: event1.id });
    await createTestTicket({ event_id: event2.id });
    
    // Query event 1 dashboard
    const response1 = await fetch(`/api/admin/dashboard?event_id=${event1.id}`);
    const data1 = await response1.json();
    
    // Query event 2 dashboard
    const response2 = await fetch(`/api/admin/dashboard?event_id=${event2.id}`);
    const data2 = await response2.json();
    
    // Verify isolation
    expect(data1.stats.total_tickets).toBe(1);
    expect(data2.stats.total_tickets).toBe(1);
  });
});
```

### E2E Tests

```javascript
// tests/e2e/multi-event.test.js
describe('Multi-Event E2E', () => {
  test('admin can switch between events', async () => {
    await page.goto('/admin/dashboard');
    await page.waitForSelector('.event-selector');
    
    // Check current event
    const currentEvent = await page.textContent('.event-name');
    expect(currentEvent).toBeTruthy();
    
    // Open selector
    await page.click('.event-selector-trigger');
    await page.waitForSelector('.event-selector-menu');
    
    // Switch to different event
    await page.click('[data-event-id="2"]');
    
    // Verify switch
    await page.waitForFunction(
      text => document.querySelector('.event-name').textContent !== text,
      currentEvent
    );
    
    const newEvent = await page.textContent('.event-name');
    expect(newEvent).not.toBe(currentEvent);
    
    // Verify persistence
    await page.reload();
    const persistedEvent = await page.textContent('.event-name');
    expect(persistedEvent).toBe(newEvent);
  });
});
```

## Rollout Plan

### Stage 1: Development Environment (Day 1-15)
- Complete implementation
- Internal testing
- Bug fixes and optimization

### Stage 2: Staging Deployment (Day 16-17)
- Deploy to staging environment
- Admin team testing
- Feedback collection

### Stage 3: Production Soft Launch (Day 18-19)
- Deploy with feature flag disabled
- Enable for select admin users
- Monitor for issues

### Stage 4: Full Production (Day 20)
- Enable for all admin users
- Monitor performance
- Gather feedback

## Rollback Plan

If issues arise, rollback strategy:

1. **Disable Feature Flag**: Turn off multi-event UI
2. **Revert API Changes**: Use backward compatibility mode
3. **Database Rollback**: Events remain but unused
4. **Full Revert**: If critical, restore from backup

```bash
# Disable multi-event feature
echo "ENABLE_MULTI_EVENT=false" >> .env.local

# Use single-event mode
npm run migrate:down -- 20_multi_event_support
```

## Performance Considerations

### Query Optimization

```sql
-- Add composite indexes for common queries
CREATE INDEX idx_tickets_event_status ON tickets(event_id, status);
CREATE INDEX idx_tickets_event_created ON tickets(event_id, created_at);
CREATE INDEX idx_transactions_event_status ON transactions(event_id, status);

-- Optimize event statistics view
CREATE INDEX idx_tickets_event_type ON tickets(event_id, ticket_type);
CREATE INDEX idx_tickets_event_checkin ON tickets(event_id, checked_in_at);
```

### Caching Strategy

```javascript
// Implement Redis caching for event data
const CACHE_TTL = 300; // 5 minutes

async function getCachedEventStats(eventId) {
  const cacheKey = `event:${eventId}:stats`;
  
  // Try cache first
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Load from database
  const stats = await loadEventStats(eventId);
  
  // Cache for next time
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(stats));
  
  return stats;
}
```

## Monitoring & Metrics

### Key Metrics to Track

- Event switch time (target: <100ms)
- Dashboard load time per event (target: <500ms)
- Cross-event query performance (target: <2s)
- Cache hit ratio (target: >80%)
- Error rate by event operation

### Monitoring Implementation

```javascript
// Add performance tracking
class PerformanceMonitor {
  trackEventSwitch(fromEvent, toEvent, duration) {
    this.send('event.switch', {
      from: fromEvent?.id,
      to: toEvent.id,
      duration,
      timestamp: Date.now()
    });
  }
  
  trackAPICall(endpoint, eventId, duration) {
    this.send('api.call', {
      endpoint,
      eventId,
      duration,
      timestamp: Date.now()
    });
  }
}
```

## Security Considerations

### Access Control Validation

```javascript
// Strict access control checks
async function validateEventAccess(userId, eventId, requiredRole = 'viewer') {
  const access = await db.execute({
    sql: `
      SELECT role FROM event_access 
      WHERE user_email = ? AND event_id = ?
    `,
    args: [userId, eventId]
  });
  
  if (!access.rows[0]) {
    throw new ForbiddenError('No access to this event');
  }
  
  const roleHierarchy = { viewer: 1, manager: 2, admin: 3 };
  if (roleHierarchy[access.rows[0].role] < roleHierarchy[requiredRole]) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  return true;
}
```

### Audit Logging

```javascript
// Comprehensive audit logging
async function logEventAction(action, details) {
  await db.execute({
    sql: `
      INSERT INTO event_audit_log 
      (event_id, action, entity_type, entity_id, user_email, ip_address, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    args: [
      details.eventId,
      action,
      details.entityType,
      details.entityId,
      details.userEmail,
      details.ipAddress,
      JSON.stringify(details.metadata)
    ]
  });
}
```

## Success Criteria

- [ ] All admin pages show event selector
- [ ] Event switching completes in <100ms
- [ ] Data correctly isolated per event
- [ ] No performance degradation vs single-event
- [ ] Zero data leakage between events
- [ ] Audit trail captures all event operations
- [ ] Admin team successfully trained
- [ ] Documentation complete and accurate

## Contact & Support

- Technical Lead: System Architect
- Project Manager: Admin Portal Team
- Support Channel: #multi-event-support
- Documentation: `/docs/architecture/`

## Appendix

### SQL Migration Rollback

```sql
-- Rollback script if needed
-- Remove event foreign keys (careful - this is destructive)
ALTER TABLE tickets DROP COLUMN event_id;
ALTER TABLE transactions DROP COLUMN event_id;
ALTER TABLE newsletter_subscribers DROP COLUMN event_id;

-- Drop event-related tables
DROP TABLE IF EXISTS event_audit_log;
DROP TABLE IF EXISTS event_access;
DROP TABLE IF EXISTS event_settings;
DROP TABLE IF EXISTS events;

-- Drop views
DROP VIEW IF EXISTS event_statistics;
DROP VIEW IF EXISTS active_events;
```

### Environment Variables

```bash
# .env.local additions
ENABLE_MULTI_EVENT=true
DEFAULT_EVENT_SLUG=boulderfest-2026
EVENT_CACHE_TTL=300
MAX_EVENTS_PER_PAGE=50
```

### Feature Flags

```javascript
// Feature flag configuration
const FEATURES = {
  MULTI_EVENT: process.env.ENABLE_MULTI_EVENT === 'true',
  EVENT_COMPARISON: process.env.ENABLE_EVENT_COMPARISON === 'true',
  EVENT_CLONING: process.env.ENABLE_EVENT_CLONING === 'true',
  CROSS_EVENT_ANALYTICS: process.env.ENABLE_CROSS_EVENT_ANALYTICS === 'true'
};
```