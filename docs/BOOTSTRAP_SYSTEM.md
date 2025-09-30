# Production Data Bootstrap System

Comprehensive documentation for the A Lo Cubano Boulder Fest production data bootstrap system.

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Operations Guide](#operations-guide)
- [Configuration Reference](#configuration-reference)
- [API Reference](#api-reference)
- [Troubleshooting Guide](#troubleshooting-guide)
- [Best Practices](#best-practices)
- [Environment Integration](#environment-integration)

## System Overview

The Bootstrap System is a production-grade data initialization framework that populates essential database records during Vercel deployments. It ensures consistent, reliable setup of events, settings, and administrative access across all environments.

### Key Features

- **Environment-Aware**: Automatically detects and configures for production, preview, or development
- **Idempotent Operations**: Safe to run multiple times without data corruption
- **Transactional Safety**: All-or-nothing operations with automatic rollback on failure
- **Comprehensive Validation**: Input validation, integrity checks, and dependency verification
- **Performance Optimized**: Batch operations and parallel processing for large datasets
- **Detailed Logging**: Comprehensive logging with colored output for debugging

### Design Principles

1. **Safety First**: All operations are designed to be safe and reversible
2. **Consistency**: Ensures identical setup across all deployment environments
3. **Reliability**: Robust error handling and recovery mechanisms
4. **Performance**: Optimized for speed with batch operations and transactions
5. **Observability**: Comprehensive logging and metrics for monitoring

## Architecture

### Component Overview

```text
Bootstrap System Architecture
├── scripts/bootstrap-vercel.js          # Main execution script
├── lib/bootstrap-helpers.js             # Core utilities and helpers
├── lib/bootstrap-database-helpers.js    # Advanced database operations
├── bootstrap/
│   ├── production.json                  # Production event configuration
│   ├── preview.json                     # Preview/staging configuration
│   └── development.json                 # Development configuration
└── Database Integration
    ├── lib/database.js                  # Database service integration
    └── migrations/                      # Database schema migrations
```

### Data Flow

The bootstrap system follows a structured workflow ensuring safe and reliable data initialization:

1. **Environment Detection** → Identifies deployment context (production/preview/development)
2. **Configuration Loading** → Loads environment-specific JSON configuration
3. **Database Connection** → Establishes secure database connection with validation
4. **Data Validation** → Validates configuration against schema requirements
5. **Event Creation** → Creates or updates events using safe upsert operations
6. **Settings Bootstrap** → Populates event settings using batch operations
7. **Admin Access Grant** → Establishes administrative access permissions
8. **Integrity Verification** → Comprehensive validation of bootstrap results
9. **Success Summary** → Detailed reporting of operations and statistics

### Core Classes

#### BootstrapSystem

The main orchestrator class that coordinates the entire bootstrap process.

**Key Responsibilities:**
- Environment detection and configuration loading
- Database connection management
- Data processing workflow coordination
- Error handling and recovery
- Statistics tracking and reporting

#### BootstrapDatabaseHelpers

Advanced database operations wrapper providing safety mechanisms for bootstrap operations.

**Key Features:**
- Safe batch insert operations with conflict resolution
- Transactional operations with automatic rollback
- Integrity verification and constraint checking
- Performance optimization for large datasets
- Comprehensive error handling and retry logic

## Operations Guide

### Environment-Specific Configurations

#### Production Environment

- **Configuration**: `bootstrap/production.json`
- **Purpose**: Real event data for live festival operations
- **Features**: Full payment processing, email notifications, wallet passes
- **Safety**: High validation standards, comprehensive error handling

Example production event configuration:
```json
{
  "slug": "boulderfest-2026",
  "name": "A Lo Cubano Boulder Fest 2026",
  "type": "festival",
  "status": "upcoming",
  "venue": {
    "name": "Avalon Ballroom",
    "address": "6185 Arapahoe Road",
    "city": "Boulder",
    "state": "CO"
  },
  "dates": {
    "start": "2026-05-15",
    "end": "2026-05-17",
    "early_bird_end": "2026-03-01"
  },
  "capacity": 500,
  "settings": {
    "payment": {
      "stripe_enabled": true,
      "processing_fee_percentage": 2.9,
      "currency": "usd"
    },
    "registration": {
      "deadline_days": 3,
      "allow_transfer": true,
      "waitlist_enabled": true
    }
  }
}
```

#### Preview Environment

- **Configuration**: `bootstrap/preview.json`
- **Purpose**: Staging environment for testing production-like scenarios
- **Features**: Limited payment processing, test notifications
- **Safety**: Medium validation standards, detailed logging

#### Development Environment

- **Configuration**: `bootstrap/development.json`
- **Purpose**: Local development and testing
- **Features**: Disabled external services, free tickets, minimal validation
- **Safety**: Relaxed validation, extensive debugging features

### Adding New Events

To add a new event to the system:

1. **Update Configuration File**:
   ```json
   {
     "events": [
       {
         "slug": "new-event-2025",
         "name": "New Event 2025",
         "type": "festival",
         "status": "upcoming",
         "description": "Event description",
         "venue": {
           "name": "Venue Name",
           "address": "123 Main St",
           "city": "Boulder",
           "state": "CO",
           "zip": "80301"
         },
         "dates": {
           "start": "2025-06-15",
           "end": "2025-06-17",
           "early_bird_end": "2025-04-01",
           "regular_price_start": "2025-05-01"
         },
         "capacity": 300,
         "display_order": 3,
         "is_featured": true,
         "is_visible": true,
         "settings": { /* settings configuration */ },
         "ticket_types": [ /* ticket type definitions */ ]
       }
     ]
   }
   ```

2. **Validate Configuration**:
   ```bash
   # Test configuration locally
   npm run bootstrap:local

   # Verify structure
   npm run verify-structure
   ```

3. **Deploy Changes**:
   ```bash
   # Preview deployment
   npm run vercel:preview

   # Production deployment
   git push origin main
   ```

### Modifying Event Settings

Event settings are deeply nested objects that control various aspects of event behavior:

#### Payment Settings

```json
"payment": {
  "stripe_enabled": true,
  "processing_fee_percentage": 2.9,
  "processing_fee_fixed": 0.30,
  "tax_enabled": false,
  "tax_rate": 0,
  "currency": "usd",
  "payment_methods": ["card", "link"]
}
```

#### Registration Settings

```json
"registration": {
  "deadline_days": 7,
  "reminder_days": [14, 7, 3, 1],
  "allow_transfer": true,
  "allow_name_change": true,
  "require_phone": true,
  "require_emergency_contact": false,
  "required_fields": ["first_name", "last_name", "email", "phone"],
  "optional_fields": ["dietary_restrictions", "dance_level"],
  "confirmation_required": false,
  "waitlist_enabled": true
}
```

#### Email Settings

```json
"email": {
  "confirmation_enabled": true,
  "reminder_enabled": true,
  "from_name": "A Lo Cubano Boulder Fest",
  "reply_to": "alocubanoboulderfest@gmail.com",
  "support_email": "alocubanoboulderfest@gmail.com",
  "template_style": "default",
  "include_calendar_attachment": true,
  "include_qr_code": true
}
```

### Adding Ticket Types

Ticket types define the different passes available for purchase:

```json
{
  "code": "weekend-pass",
  "name": "Weekend Pass",
  "description": "Full access to all workshops and social dancing",
  "category": "pass",
  "includes": ["workshops", "socials"],
  "valid_days": ["saturday", "sunday"],
  "pricing": {
    "early_bird": 80,
    "regular": 95,
    "door": 110
  },
  "availability": {
    "max_quantity": 150,
    "min_purchase": 1,
    "max_purchase": 4,
    "sales_start": "2025-07-01",
    "sales_end": "2025-11-08"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 1,
    "color": "#FF6B6B",
    "icon": "ticket",
    "featured": true,
    "visible": true
  }
}
```

### Environment Variable Configuration

Required environment variables for bootstrap operation:

#### Production & Preview

```bash
# Database (Required)
TURSO_DATABASE_URL=libsql://your-database-url
TURSO_AUTH_TOKEN=your-auth-token

# Admin Access (Optional)
ADMIN_EMAIL=admin@example.com

# Payment Integration (Production)
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...

# Email Integration (Production)
BREVO_API_KEY=your-brevo-api-key
BREVO_NEWSLETTER_LIST_ID=your-list-id
```

#### Development

```bash
# Database (Optional - uses SQLite if not provided)
TURSO_DATABASE_URL=libsql://your-dev-database-url
TURSO_AUTH_TOKEN=your-dev-auth-token

# Admin Access (Optional)
ADMIN_EMAIL=dev@localhost

# External services typically disabled in development
```

## Configuration Reference

### Schema Structure

#### Root Configuration Object

```typescript
interface BootstrapConfig {
  version: string;                    // Configuration version
  environment: string;                // Target environment
  metadata: {
    created: string;                  // ISO timestamp
    description: string;              // Configuration description
  };
  events: Event[];                    // Event definitions
  admin_access: AdminAccess;          // Admin access configuration
  defaults: DefaultSettings;          // Default settings for all events
}
```

#### Event Definition

```typescript
interface Event {
  slug: string;                       // Unique identifier
  name: string;                       // Display name
  type: 'festival' | 'weekender' | 'workshop' | 'special';
  status: 'draft' | 'upcoming' | 'active' | 'completed' | 'cancelled';
  description: string;                // Event description
  venue: Venue;                       // Venue information
  dates: EventDates;                  // Important dates
  capacity: number;                   // Maximum attendees
  display_order: number;              // Sort order
  is_featured: boolean;               // Featured event flag
  is_visible: boolean;                // Public visibility
  settings: EventSettings;            // Event-specific settings
  ticket_types: TicketType[];         // Available ticket types
}
```

### Event Settings Categories

**Payment Settings**
- Stripe configuration and processing fees
- Tax settings and currency options
- Payment method selection

**Registration Settings**
- Deadlines and reminder schedules
- Required/optional field configuration
- Transfer and modification policies
- Waitlist management

**Email Settings**
- Email service configuration
- Template and notification settings
- Attachment preferences

**Wallet Settings**
- Apple/Google Wallet configuration
- Pass generation and location features
- Update policies

**Check-in Settings**
- QR code and manual check-in options
- Scanning limitations and time windows
- Badge and signature requirements

**Discount Settings**
- Early bird and group discounts
- Student/member pricing
- Promo code management

**Feature Flags**
- Workshop and performance availability
- Social dancing and additional features
- Live streaming and gallery options

### Validation Rules

#### Event Validation

- **Required Fields**: slug, name, type, status
- **Valid Types**: festival, weekender, workshop, special
- **Valid Statuses**: draft, upcoming, active, completed, cancelled
- **Date Validation**: start_date < end_date, valid ISO format
- **Capacity**: Must be positive integer
- **Slug Format**: lowercase, alphanumeric with hyphens

#### Ticket Type Validation

- **Required Fields**: code, name, category, pricing
- **Code Format**: lowercase, alphanumeric with hyphens
- **Price Validation**: Non-negative numbers
- **Date Ranges**: sales_start <= sales_end
- **Quantity Limits**: max_quantity >= min_purchase

#### Setting Validation

- **Percentage Values**: 0-100 for discount percentages
- **Email Format**: Valid email addresses for admin access
- **Date Format**: ISO 8601 date strings
- **Currency Codes**: Valid 3-letter currency codes

## API Reference

### Main Bootstrap Classes

#### BootstrapSystem

Main orchestrator class for the bootstrap process.

##### Constructor

```javascript
new BootstrapSystem()
```

Creates a new bootstrap system instance with default configuration.

##### Key Methods

###### `async run()`

Executes the complete bootstrap process.

**Returns**: `Promise<number>` - Exit code (0 for success, 1 for failure)

**Example**:
```javascript
const bootstrap = new BootstrapSystem();
const exitCode = await bootstrap.run();
process.exit(exitCode);
```

###### `async bootstrapEvents()`

Creates or updates events from configuration.

**Features**:
- Idempotent operation (safe to run multiple times)
- Transactional execution
- Conflict resolution
- Batch processing for performance

###### `async bootstrapSettings()`

Creates event settings using batch operations.

**Features**:
- Deep merge of default and event-specific settings
- Flattened key-value storage
- Batch insert optimization
- Conflict handling with IGNORE strategy

###### `async verify()`

Performs comprehensive integrity verification.

**Verification Includes**:
- Table count validation
- Foreign key constraint checks
- Unique constraint verification
- Critical setting presence
- Upcoming event validation

#### BootstrapDatabaseHelpers

Advanced database operations for bootstrap system.

##### Key Methods

###### `async safeBatchInsert(table, columns, rows, options)`

Performs safe batch insert with conflict resolution.

**Parameters**:
- `table` (string): Target table name
- `columns` (Array<string>): Column names
- `rows` (Array<Array>): Row data arrays
- `options` (Object): Insert options

**Example**:
```javascript
const result = await helpers.safeBatchInsert(
  'event_settings',
  ['event_id', 'key', 'value'],
  [
    [1, 'payment.stripe_enabled', 'true'],
    [1, 'payment.currency', 'usd']
  ],
  { conflictAction: 'IGNORE' }
);

console.log(`Inserted: ${result.inserted}, Skipped: ${result.skipped}`);
```

###### `async safeTransaction(operation, options)`

Executes operation within safe transaction with automatic rollback.

**Example**:
```javascript
await helpers.safeTransaction(async (transaction) => {
  await transaction.execute('INSERT INTO events ...');
  await transaction.execute('INSERT INTO event_settings ...');
}, { timeoutMs: 60000 });
```

###### `async safeUpsert(table, data, conflictColumns, options)`

Performs safe upsert operation with conflict detection.

**Example**:
```javascript
const result = await helpers.safeUpsert(
  'events',
  { slug: 'festival-2025', name: 'Festival 2025', status: 'upcoming' },
  ['slug'],
  { updateOnConflict: false }
);

console.log(`Action: ${result.action}, ID: ${result.id}`);
```

### Helper Functions

#### Environment and Configuration

##### `detectEnvironment()`

Detects current deployment environment.

**Returns**: `string` - 'production', 'preview', or 'development'

**Logic**:
1. Check `VERCEL_ENV` environment variable
2. Fallback to `NODE_ENV`
3. Default to 'development'

##### `flattenSettings(obj, prefix)`

Flattens nested settings object to dot-notation.

**Example**:
```javascript
const settings = {
  payment: {
    stripe_enabled: true,
    currency: 'usd'
  }
};

const flattened = flattenSettings(settings);
// Result: {
//   'payment.stripe_enabled': 'true',
//   'payment.currency': 'usd'
// }
```

##### `validateRequiredEnvVars(environment)`

Validates required environment variables.

**Required Variables**:
- **Production**: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
- **Preview**: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
- **Development**: None (optional database connection)

## Troubleshooting Guide

### Common Issues and Solutions

#### Database Connection Failures

**Symptoms**:
- "Failed to connect to database" errors
- Timeout during database initialization
- Authentication failures

**Diagnosis**:
```bash
# Check environment variables
echo "Database URL: $TURSO_DATABASE_URL"
echo "Auth Token: ${TURSO_AUTH_TOKEN:0:10}..."

# Test database connection manually
node -e "
import { getDatabaseClient } from './lib/database.js';
getDatabaseClient().then(db =>
  db.execute('SELECT 1 as test')
).then(result =>
  console.log('✅ Database connection successful:', result)
).catch(error =>
  console.error('❌ Database connection failed:', error)
);
"
```

**Solutions**:
1. **Verify Environment Variables**:
   - Ensure TURSO_DATABASE_URL is set correctly
   - Verify TURSO_AUTH_TOKEN is valid and not expired
   - Check for whitespace or special characters in variables

2. **Network Issues**:
   - Test network connectivity to Turso endpoints
   - Check for firewall or proxy restrictions
   - Verify DNS resolution

3. **Authentication Problems**:
   - Regenerate auth token in Turso dashboard
   - Verify database permissions
   - Check token expiration

#### Configuration Loading Errors

**Symptoms**:
- "Configuration file not found" errors
- JSON parsing failures
- Environment mismatch errors

**Solutions**:
1. **Missing Configuration Files**:
   ```bash
   # Verify all required config files exist
   ls bootstrap/production.json bootstrap/preview.json bootstrap/development.json
   ```

2. **JSON Syntax Errors**:
   ```bash
   # Validate JSON syntax
   jq . bootstrap/production.json
   ```

3. **Environment Mismatch**:
   - Ensure configuration `environment` field matches detected environment
   - Verify VERCEL_ENV variable is set correctly

#### Bootstrap Data Conflicts

**Symptoms**:
- "Event already exists" warnings (expected)
- Unexpected data duplication
- Foreign key constraint violations

**Solutions**:
1. **Data Cleanup**:
   ```sql
   -- Remove duplicate events (keep latest)
   DELETE FROM events WHERE id NOT IN (
     SELECT MAX(id) FROM events GROUP BY slug
   );

   -- Clean orphaned settings
   DELETE FROM event_settings
   WHERE event_id NOT IN (SELECT id FROM events);
   ```

2. **Configuration Review**:
   - Verify unique slugs across all events
   - Check for duplicate ticket type codes
   - Validate foreign key references

#### Performance Issues

**Solutions**:
1. **Batch Size Optimization**:
   ```javascript
   // Reduce batch size for large datasets
   const result = await helpers.safeBatchInsert(
     'event_settings',
     columns,
     rows,
     { chunkSize: 50 } // Reduced from default 100
   );
   ```

2. **Memory Management**:
   ```bash
   # Increase Node.js memory limit
   NODE_OPTIONS='--max-old-space-size=4096' npm run bootstrap:local
   ```

3. **Transaction Timeout**:
   ```javascript
   // Increase transaction timeout
   await helpers.safeTransaction(async (tx) => {
     // operations
   }, { timeoutMs: 120000 }); // 2 minutes
   ```

### Error Recovery Procedures

#### Failed Bootstrap Recovery

If bootstrap fails mid-process:

1. **Identify Failure Point**:
   ```bash
   # Check bootstrap logs for specific error
   npm run bootstrap:local 2>&1 | tee bootstrap.log
   grep -i error bootstrap.log
   ```

2. **Database State Assessment**:
   ```sql
   -- Check partial data
   SELECT COUNT(*) FROM events;
   SELECT COUNT(*) FROM event_settings;
   SELECT COUNT(*) FROM event_access;
   ```

3. **Clean Recovery**:
   ```sql
   -- Option 1: Clean slate (development only)
   DELETE FROM event_access;
   DELETE FROM event_settings;
   DELETE FROM events;

   -- Option 2: Selective cleanup
   DELETE FROM events WHERE created_by = 'bootstrap';
   ```

4. **Re-run Bootstrap**:
   ```bash
   # After cleanup, re-run bootstrap
   npm run bootstrap:local
   ```

### Debugging Techniques

#### Enable Verbose Logging

```bash
# Set DEBUG environment variable
DEBUG=bootstrap* npm run bootstrap:local

# Enable database query logging
NODE_ENV=development DEBUG=database npm run bootstrap:local
```

#### Configuration Debugging

```javascript
// Add temporary debugging to bootstrap script
console.log('Loaded config:', JSON.stringify(config, null, 2));
console.log('Environment detected:', environment);
console.log('Database URL:', process.env.TURSO_DATABASE_URL?.substring(0, 20) + '...');
```

#### Performance Profiling

```bash
# Profile bootstrap execution
node --prof scripts/bootstrap-vercel.js
node --prof-process isolate-*.log > bootstrap-profile.txt
```

## Best Practices

### Configuration Management

#### Version Control

1. **Configuration Files**:
   - Always commit configuration files to version control
   - Use meaningful commit messages for configuration changes
   - Tag configuration versions for major releases

2. **Environment Separation**:
   - Maintain separate configurations for each environment
   - Never copy production data to development configurations
   - Use environment-specific defaults appropriately

3. **Change Management**:
   ```bash
   # Before making changes
   git checkout -b update-bootstrap-config

   # Make configuration changes
   # Test locally
   npm run bootstrap:local

   # Test on preview
   npm run vercel:preview

   # Create pull request for review
   ```

#### Configuration Validation

1. **Pre-deployment Validation**:
   ```bash
   # Validate JSON syntax
   find bootstrap/ -name "*.json" -exec jq . {} \;

   # Validate configuration schema
   npm run bootstrap:test
   ```

2. **Automated Testing**:
   ```javascript
   // Add configuration tests to test suite
   describe('Bootstrap Configuration', () => {
     test('all environments have valid JSON', () => {
       ['production', 'preview', 'development'].forEach(env => {
         expect(() => {
           JSON.parse(fs.readFileSync(`bootstrap/${env}.json`));
         }).not.toThrow();
       });
     });
   });
   ```

### Development Workflow

#### Local Development

1. **Environment Setup**:
   ```bash
   # Link to Vercel project
   vercel link

   # Pull environment variables from Vercel Dashboard
   vercel env pull

   # Verify .env.local was created
   ls -la .env.local
   ```

2. **Testing Changes**:
   ```bash
   # Test bootstrap locally
   npm run bootstrap:local

   # Run verification
   npm run verify-structure

   # Run full test suite
   npm test
   ```

#### Deployment Process

1. **Pre-deployment Checklist**:
   - [ ] Configuration validated locally
   - [ ] All tests passing
   - [ ] Database migrations up to date
   - [ ] Environment variables configured
   - [ ] Backup procedures verified

2. **Staged Deployment**:
   ```bash
   # Deploy to preview first
   git push origin feature-branch
   npm run vercel:preview

   # Validate preview deployment
   # Test bootstrap on preview environment

   # Deploy to production
   git checkout main
   git merge feature-branch
   git push origin main
   ```

### Security Considerations

#### Configuration Security

1. **Sensitive Data**:
   - Never commit production secrets to version control
   - Use environment variables for sensitive configuration
   - Implement proper secret rotation

2. **Access Control**:
   ```json
   {
     "admin_access": {
       "email": "${ADMIN_EMAIL}",    // Environment variable
       "role": "admin",              // Role-based access
       "events": ["*"],              // Scope control
       "granted_by": "bootstrap"     // Audit trail
     }
   }
   ```

3. **Environment Isolation**:
   - Separate credentials for each environment
   - Different database instances per environment
   - Isolated email and payment configurations

#### Data Protection

1. **Validation and Sanitization**:
   ```javascript
   // Validate all input data
   const validateEventData = (data) => {
     const errors = [];
     if (!data.slug?.match(/^[a-z0-9-]+$/)) {
       errors.push('Invalid slug format');
     }
     return errors;
   };
   ```

2. **SQL Injection Prevention**:
   ```javascript
   // Always use parameterized queries
   await db.execute({
     sql: 'INSERT INTO events (slug, name) VALUES (?, ?)',
     args: [slug, name]  // Parameterized values
   });
   ```

## Environment Integration

### Vercel Deployment Integration

The bootstrap system is tightly integrated with Vercel's deployment pipeline:

#### Build Process Integration

```json
{
  "scripts": {
    "build": "npm run migrate:vercel && npm run bootstrap:vercel && npm run verify-structure"
  }
}
```

**Build Phase Execution**:
1. Database migrations are applied first
2. Bootstrap system populates production data
3. Structure verification ensures deployment readiness

#### Environment Detection

The system automatically detects the deployment environment:

```javascript
function detectEnvironment() {
  // Priority: VERCEL_ENV > NODE_ENV > default
  return process.env.VERCEL_ENV ||
         (process.env.NODE_ENV === 'production' ? 'production' : 'development');
}
```

**Environment Mapping**:
- `VERCEL_ENV=production` → `bootstrap/production.json`
- `VERCEL_ENV=preview` → `bootstrap/preview.json`
- `VERCEL_ENV=development` → `bootstrap/development.json`

#### Database Integration

The bootstrap system leverages the existing database service:

```javascript
import { getDatabaseClient } from '../lib/database.js';

// Reuse existing database connection patterns
const db = await getDatabaseClient();
```

**Benefits**:
- Consistent connection management
- Shared configuration and error handling
- Integrated performance monitoring
- Unified logging and debugging

### Service Dependencies

#### External Service Configuration

The bootstrap system configures integration with external services:

**Payment Processing (Stripe)**:
- Configures payment methods per environment
- Sets processing fees and currency
- Enables/disables features based on environment

**Email Service (Brevo)**:
- Configures email templates and sending
- Sets up newsletter integration
- Manages notification preferences

**Wallet Services (Apple/Google)**:
- Configures pass generation
- Sets up location-based features
- Manages update policies

## Command Reference

### Available Bootstrap Commands

```bash
# Main bootstrap commands
npm run bootstrap:vercel        # Production bootstrap (Vercel build)
npm run bootstrap:local         # Local development bootstrap
npm run bootstrap:test          # Test bootstrap configuration
npm run bootstrap:test:enhanced # Enhanced bootstrap testing

# Related commands
npm run migrate:vercel          # Run migrations in Vercel build
npm run verify-structure        # Verify project structure
npm run verify-production-readiness  # Production readiness check
```

### Environment-Specific Testing

```bash
# Test specific environment configurations
NODE_ENV=development npm run bootstrap:test
VERCEL_ENV=preview npm run bootstrap:test
VERCEL_ENV=production npm run bootstrap:test
```

### Monitoring and Health Checks

```bash
# Health check endpoints
curl /api/health/check          # General application health
curl /api/health/database       # Database health status

# Bootstrap verification
npm run verify-production-readiness
```

This comprehensive documentation provides everything needed to understand, operate, troubleshoot, and maintain the production data bootstrap system for A Lo Cubano Boulder Fest. The system's robust design ensures reliable event setup across all deployment environments while maintaining safety, performance, and observability standards.