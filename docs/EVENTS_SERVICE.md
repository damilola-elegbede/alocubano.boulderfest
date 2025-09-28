# Events Management Service

## Overview

The Events Management Service is a comprehensive singleton service that serves as the single source of truth for event data across the A Lo Cubano Boulder Fest application. It replaces all hardcoded event display maps and provides cached access to event information with automatic initialization.

## Architecture

### Service Location
- **Service**: `/js/lib/events-service.js`
- **API Endpoint**: `/api/events/list.js`
- **Test Page**: `/test-events-browser.html` (development only)

### Key Features

1. **Singleton Pattern**: Single instance across the application
2. **Automatic Initialization**: Lazy loading on first use
3. **Performance Optimized**: 5-minute cache with validation
4. **Fallback Support**: Hardcoded fallback data if API fails
5. **Legacy Migration**: Supports old event identifier formats
6. **Test Event Support**: Special handling for test events (ID -1, -2)

## Usage

### Basic Import and Usage

```javascript
import eventsService from '/js/lib/events-service.js';

// Get event by ID
const event = await eventsService.getEventById(1);

// Get event display name
const displayName = await eventsService.getEventName(1);

// Get event by slug
const event = await eventsService.getEventBySlug('boulderfest-2026');

// Get all events
const events = await eventsService.getAllEvents();
```

### API Methods

#### Core Methods

```javascript
// Load events from API (automatically called)
await eventsService.loadEvents()

// Get event by integer ID
const event = await eventsService.getEventById(1)

// Get event by slug (for migration support)
const event = await eventsService.getEventBySlug('boulderfest-2026')

// Get display name for an event ID
const name = await eventsService.getEventName(1)

// Get all cached events
const events = await eventsService.getAllEvents()
```

#### Cache Management

```javascript
// Clear cache and force reload
eventsService.clearCache()

// Get cache statistics
const stats = eventsService.getCacheStats()

// Check if cache is valid
const isValid = eventsService.isCacheValid()
```

#### Migration Helpers

```javascript
// Migrate legacy event identifiers
const newId = await eventsService.migrateLegacyEventId('weekender-2025-11')
```

## API Endpoint

### GET /api/events/list

Returns all events with comprehensive metadata.

#### Response Format

```json
{
  "success": true,
  "events": [
    {
      "id": 1,
      "slug": "boulderfest-2026",
      "name": "A Lo Cubano Boulder Fest 2026",
      "displayName": "Boulder Fest 2026 Tickets",
      "type": "festival",
      "status": "upcoming",
      "description": "The premier Cuban salsa festival in Boulder",
      "venue": {
        "name": "Avalon Ballroom",
        "address": "6185 Arapahoe Road",
        "city": "Boulder",
        "state": "CO",
        "zip": "80303"
      },
      "dates": {
        "start": "2026-05-15",
        "end": "2026-05-17",
        "year": 2026
      },
      "capacity": {
        "max": 500,
        "earlyBirdEnd": "2026-03-01",
        "regularPriceStart": "2026-04-01"
      },
      "display": {
        "order": 1,
        "featured": true,
        "visible": true
      },
      "timestamps": {
        "created": "2024-01-01T00:00:00.000Z",
        "updated": "2024-01-01T00:00:00.000Z"
      },
      "config": {
        "ticket_types": ["full-pass", "day-pass"],
        "features": {
          "workshops": true,
          "performances": true
        }
      }
    }
  ],
  "meta": {
    "total": 4,
    "database": 2,
    "test": 2,
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Event Data Structure

### Core Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | Integer | Unique event identifier |
| `slug` | String | URL-friendly event identifier |
| `name` | String | Full event name |
| `displayName` | String | Cart/UI display name |
| `type` | String | Event type (festival, weekender, workshop, special) |
| `status` | String | Event status (draft, upcoming, active, completed, cancelled) |

### Venue Information

```javascript
event.venue = {
  name: "Avalon Ballroom",
  address: "6185 Arapahoe Road",
  city: "Boulder",
  state: "CO",
  zip: "80303"
}
```

### Date Information

```javascript
event.dates = {
  start: "2026-05-15",
  end: "2026-05-17",
  year: 2026
}
```

### Display Configuration

```javascript
event.display = {
  order: 1,          // Sort order
  featured: true,    // Featured event flag
  visible: true      // Publicly visible
}
```

## Test Events

The service includes special test events for development and testing:

### Test Weekender (ID: -1)
- **Slug**: `test-weekender`
- **Display Name**: `[TEST] Weekender Tickets`
- **Type**: `weekender`

### Test Festival (ID: -2)
- **Slug**: `test-festival`
- **Display Name**: `[TEST] Festival Tickets`
- **Type**: `festival`

## Legacy Migration

The service supports migration from old event identifier formats:

### Supported Legacy Mappings

| Legacy ID | Current Slug | Current ID |
|-----------|--------------|------------|
| `weekender-2025-11` | `2025-11-weekender` | 2 |
| `boulderfest-2025` | `boulderfest-2026` | 1 |
| `alocubano-boulderfest-2026` | `boulderfest-2026` | 1 |
| `november-2025-weekender` | `2025-11-weekender` | 2 |
| `Test Weekender` | `test-weekender` | -1 |
| `Test Festival` | `test-festival` | -2 |

### Migration Example

```javascript
// Migrate legacy identifier
const legacyId = 'weekender-2025-11';
const currentId = await eventsService.migrateLegacyEventId(legacyId);
// Returns: 2

// Get the current event
const event = await eventsService.getEventById(currentId);
// Returns: November 2025 Weekender event object
```

## Integration Examples

### Floating Cart Integration

```javascript
import eventsService from '/js/lib/events-service.js';

// Replace hardcoded event display map
async function getEventDisplayName(eventId) {
    try {
        // Handle numeric IDs
        if (typeof eventId === 'number' || /^-?\d+$/.test(eventId)) {
            const numericId = typeof eventId === 'number' ? eventId : parseInt(eventId);
            return await eventsService.getEventName(numericId);
        } else {
            // Handle string identifiers (slugs or legacy names)
            const event = await eventsService.getEventBySlug(eventId);
            if (event) {
                return event.displayName;
            }

            // Try migration for legacy identifiers
            const migratedId = await eventsService.migrateLegacyEventId(eventId);
            if (migratedId) {
                return await eventsService.getEventName(migratedId);
            }
        }

        return 'A Lo Cubano Tickets'; // Fallback
    } catch (error) {
        console.error('Failed to get event display name:', error);
        return 'A Lo Cubano Tickets';
    }
}
```

### Admin Dashboard Integration

```javascript
// Load all events for admin management
const events = await eventsService.getAllEvents();

// Filter by type
const festivals = events.filter(e => e.type === 'festival');
const weekenders = events.filter(e => e.type === 'weekender');

// Get upcoming events
const upcoming = events.filter(e => e.status === 'upcoming');
```

## Performance Considerations

### Caching Strategy

- **Cache Duration**: 5 minutes
- **Cache Validation**: Timestamp-based
- **Fallback Data**: Hardcoded events if API fails
- **Memory Usage**: Minimal (Map-based storage)

### Optimization Features

- **Lazy Loading**: Only initializes when first used
- **Promise Caching**: Prevents concurrent initialization
- **Error Recovery**: Fallback to hardcoded data
- **Retry Logic**: Clears failed initialization attempts

## Debugging

### Browser Console

```javascript
// Access service globally
window.eventsService

// Debug current state
window.debugEvents()

// Manual operations
eventsService.clearCache()
eventsService.getCacheStats()
```

### Test Page

Visit `/test-events-browser.html` in development to:

- Test API endpoint
- Verify service initialization
- Test event lookups
- Check display name generation
- View cache statistics

## Error Handling

### Common Error Scenarios

1. **API Unavailable**: Falls back to hardcoded events
2. **Network Timeout**: Retries with cached initialization promise
3. **Invalid Event ID**: Returns `null` gracefully
4. **Legacy Migration Failed**: Returns `null` with warning

### Error Recovery

```javascript
try {
    const event = await eventsService.getEventById(999);
    if (!event) {
        console.warn('Event not found');
        // Handle gracefully
    }
} catch (error) {
    console.error('Service error:', error);
    // Use fallback logic
}
```

## Future Enhancements

### Planned Features

1. **Real-time Updates**: WebSocket integration for live updates
2. **Event Subscriptions**: Subscribe to specific event changes
3. **Advanced Filtering**: Complex query support
4. **Event Relationships**: Parent/child event support
5. **Multi-language**: Internationalization support

### Database Integration

The service is designed to scale with the database schema:

- **Events Table**: Direct mapping to database structure
- **Event Settings**: Additional configuration support
- **Event Access**: Role-based access control ready

## Security Considerations

- **Public API**: Only returns publicly visible events
- **Input Validation**: Sanitizes all input parameters
- **Error Disclosure**: Minimal error information in production
- **Rate Limiting**: Relies on application-level rate limiting

## Testing

### Unit Tests

```bash
# Run events service tests
npm test -- --grep "events service"
```

### Integration Tests

```bash
# Test with database
npm run test:integration -- --grep "events"
```

### Browser Testing

1. Visit `/test-events-browser.html`
2. Run all test functions
3. Verify API responses
4. Check error handling

## Migration Guide

### From Hardcoded Maps

**Before:**
```javascript
const eventDisplayMap = {
    'weekender-2025-11': 'November 2025 Weekender Tickets',
    'boulderfest-2026': 'Boulder Fest 2026 Tickets'
};

function getEventDisplayName(eventId) {
    return eventDisplayMap[eventId] || 'A Lo Cubano Tickets';
}
```

**After:**
```javascript
import eventsService from '/js/lib/events-service.js';

async function getEventDisplayName(eventId) {
    try {
        if (typeof eventId === 'number') {
            return await eventsService.getEventName(eventId);
        } else {
            const event = await eventsService.getEventBySlug(eventId);
            return event ? event.displayName : 'A Lo Cubano Tickets';
        }
    } catch (error) {
        console.error('Failed to get event display name:', error);
        return 'A Lo Cubano Tickets';
    }
}
```

### Synchronous to Asynchronous

When migrating from synchronous hardcoded maps to the asynchronous service:

1. **Add async/await**: All service calls are asynchronous
2. **Handle Errors**: Wrap in try-catch blocks
3. **Provide Fallbacks**: Use fallback display names
4. **Update Callers**: Ensure calling functions handle async

## Support

### Debugging Commands

```javascript
// Service status
eventsService.getCacheStats()

// Clear and reload
eventsService.clearCache()
await eventsService.ensureInitialized()

// Test specific event
await eventsService.getEventById(1)
```

### Common Issues

1. **Service Not Initialized**: Call `ensureInitialized()` first
2. **API Endpoint 404**: Check `/api/events/list` exists
3. **Cache Stale**: Use `clearCache()` to force refresh
4. **Legacy ID Not Found**: Check migration mappings

For additional support, check the test page or review service debug output in the browser console.