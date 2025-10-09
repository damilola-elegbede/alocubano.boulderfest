# Architecture Diagrams

Visual system architecture documentation for A Lo Cubano Boulder Fest.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Payment Flow Diagram](#payment-flow-diagram)
3. [Ticket Lifecycle Diagram](#ticket-lifecycle-diagram)
4. [Database Schema (ERD)](#database-schema-erd)
5. [Authentication Flows](#authentication-flows)
6. [Service Layer Architecture](#service-layer-architecture)
7. [Theme System Architecture](#theme-system-architecture)

## System Architecture Overview

```mermaid
graph TB
    subgraph "Client Layer"
        Browser[Browser/Mobile]
        SW[Service Worker]
        LC[localStorage Cache]
    end

    subgraph "Frontend (Vanilla JS)"
        Pages[HTML Pages]
        Cart[Cart Manager]
        Theme[Theme Manager]
        Gallery[Virtual Gallery]
        QR[QR Cache Manager]
    end

    subgraph "Vercel Edge Network"
        CDN[CDN/Static Assets]
        Functions[Serverless Functions]
    end

    subgraph "API Layer (68 endpoints)"
        Payment[Payment APIs]
        Ticket[Ticket APIs]
        Email[Email APIs]
        Admin[Admin APIs]
        Registration[Registration APIs]
        Gallery_API[Gallery APIs]
    end

    subgraph "Service Layer (121 services)"
        DB[Database Service]
        Stripe_Svc[Stripe Service]
        Brevo_Svc[Brevo Service]
        QR_Svc[QR Generation]
        Wallet_Svc[Wallet Service]
        Ticket_Svc[Ticket Service]
        Audit_Svc[Audit Service]
    end

    subgraph "External Services"
        Stripe[Stripe API]
        Brevo[Brevo Email API]
        GoogleDrive[Google Drive API]
        AppleWallet[Apple Wallet]
        GoogleWallet[Google Wallet]
    end

    subgraph "Data Layer"
        Turso[(Turso SQLite)]
        Migrations[Migrations System]
    end

    Browser --> Pages
    Browser --> SW
    Browser --> LC
    Pages --> Cart
    Pages --> Theme
    Pages --> Gallery
    Pages --> QR

    Cart --> Functions
    Gallery --> Functions
    QR --> Functions

    CDN --> Pages
    Functions --> Payment
    Functions --> Ticket
    Functions --> Email
    Functions --> Admin
    Functions --> Registration
    Functions --> Gallery_API

    Payment --> DB
    Payment --> Stripe_Svc
    Ticket --> Ticket_Svc
    Email --> Brevo_Svc
    Admin --> DB
    Registration --> DB
    Gallery_API --> DB

    DB --> Turso
    Stripe_Svc --> Stripe
    Brevo_Svc --> Brevo
    Gallery_API --> GoogleDrive
    Ticket_Svc --> QR_Svc
    Ticket_Svc --> Wallet_Svc
    Ticket_Svc --> Audit_Svc
    Wallet_Svc --> AppleWallet
    Wallet_Svc --> GoogleWallet

    Migrations --> Turso
```

**Key Architectural Decisions:**

- **Serverless-First**: All backend logic runs on Vercel serverless functions
- **Vanilla JavaScript**: Zero framework dependencies on frontend
- **Async Singleton Pattern**: All services use Promise-based lazy initialization
- **Direct Database Access**: Services use `getDatabaseClient()` for consistency
- **Edge Caching**: Static assets served via Vercel CDN
- **Progressive Enhancement**: Service Worker for offline capabilities

## Payment Flow Diagram

```mermaid
sequenceDiagram
    actor User
    participant Cart as Shopping Cart
    participant Payment as Payment Selector
    participant API as Create Checkout API
    participant Stripe as Stripe Checkout
    participant Webhook as Stripe Webhook
    participant TicketSvc as Ticket Creation Service
    participant DB as Database
    participant Email as Email Service
    participant Reminder as Reminder Scheduler

    User->>Cart: Add Tickets/Donations
    Cart->>Cart: Calculate Totals
    User->>Cart: Proceed to Checkout
    Cart->>Payment: Show Payment Selector
    Payment->>User: Select Payment Method
    User->>Payment: Choose Stripe

    Payment->>API: POST /api/payments/create-checkout-session
    API->>API: Create Temp Reservation
    API->>Stripe: Create Session (with metadata)
    Stripe-->>API: Session ID + URL
    API-->>Payment: Checkout URL
    Payment->>Stripe: Redirect to Stripe Checkout

    User->>Stripe: Complete Payment
    Stripe->>Webhook: POST checkout.session.completed

    Webhook->>Webhook: Verify Signature
    Webhook->>Stripe: Expand Session (line_items, payment_method)
    Stripe-->>Webhook: Full Session Data

    Webhook->>TicketSvc: createOrRetrieveTickets(session, paymentData)

    alt Transaction Exists
        TicketSvc->>DB: Check Transaction by Session ID
        DB-->>TicketSvc: Existing Transaction
        alt Tickets Exist
            TicketSvc->>DB: Get Tickets
            DB-->>TicketSvc: Existing Tickets
            TicketSvc-->>Webhook: {created: false}
        else No Tickets
            TicketSvc->>TicketSvc: Create Tickets for Transaction
            TicketSvc->>DB: Batch Insert Tickets
            TicketSvc->>Email: Send Confirmation
            TicketSvc->>Reminder: Schedule Registration Reminders
            TicketSvc-->>Webhook: {created: true}
        end
    else New Transaction
        TicketSvc->>DB: Create Transaction
        TicketSvc->>DB: Parse Metadata & Validate
        TicketSvc->>DB: Calculate Registration Deadline
        TicketSvc->>DB: Batch Insert Tickets
        TicketSvc->>DB: Update sold_count
        TicketSvc->>Email: Send Confirmation Email
        TicketSvc->>Reminder: Schedule Registration Reminders
        TicketSvc-->>Webhook: {created: true}
    end

    Webhook-->>Stripe: 200 OK

    par Email & Registration
        Email->>User: Order Confirmation (Tickets + Donations)
        Reminder->>DB: Insert Reminder Schedule
    end
```

**Payment Flow Key Points:**

1. **Idempotency**: `createOrRetrieveTickets()` handles webhook retries safely
2. **Metadata Validation**: Stripe metadata validated against database state (security)
3. **Atomic Operations**: Batch database operations ensure consistency
4. **Payment Method Tracking**: Card details stored for receipts
5. **Dual Processing**: Both webhook and checkout-success use same service
6. **Reservation Fulfillment**: Temporary reservations converted to tickets
7. **Registration Deadlines**: Calculated based on event timing (7 days before, with fallbacks)

## Ticket Lifecycle Diagram

```mermaid
stateDiagram-v2
    [*] --> Reserved: Add to Cart
    Reserved --> Pending: Payment Completed
    Reserved --> Expired: Session Timeout
    Expired --> [*]

    state Pending {
        [*] --> UnregisteredPending: Ticket Created
        UnregisteredPending --> RegisteredPending: Complete Registration
    }

    Pending --> Active: Event Date Approaches

    state Active {
        [*] --> ValidActive: Ready for Use
        ValidActive --> ScannedActive: QR Scanned at Entry
        ScannedActive --> ValidActive: Re-entry Allowed
    }

    Active --> Used: Event Completed
    Pending --> Cancelled: Refund Issued
    Active --> Cancelled: Refund Issued

    Used --> [*]
    Cancelled --> [*]

    state "Wallet Integration" as Wallet {
        ValidActive --> AppleWallet: Generate .pkpass
        ValidActive --> GoogleWallet: Generate Pass URL
        AppleWallet --> QRValidation: Scan QR at Event
        GoogleWallet --> QRValidation: Scan QR at Event
    }

    QRValidation --> ScannedActive

    note right of Pending
        Registration Reminders:
        - Immediate (1 hour)
        - 24 hours
        - 72 hours
        - Final (7 days before event)
    end note

    note right of Active
        QR Code Features:
        - JWT Authentication
        - 7-day Client Cache
        - 24-hour HTTP Cache
        - Offline Support
    end note
```

**Ticket Status Fields:**

- **status** (User-facing):
  - `valid`: Ticket active and usable
  - `flagged_for_review`: Validation failed (security)
  - `used`: Event completed
  - `cancelled`: Refunded
  - `transferred`: Ownership changed

- **registration_status** (Internal):
  - `pending`: Awaiting registration
  - `completed`: Registration finished
  - `overdue`: Deadline passed

**Key Lifecycle Events:**

1. **Purchase → Pending**: Webhook creates tickets with registration deadline
2. **Registration**: User completes attendee information (name, email, dietary needs)
3. **Reminders**: Automated emails at 1hr, 24hr, 72hr, 7 days before event
4. **Activation**: Tickets become active as event date approaches
5. **Wallet Pass Generation**: Apple/Google wallet passes with QR codes
6. **QR Validation**: Entry scanning with JWT verification
7. **Completion**: Ticket marked as used after event

## Database Schema (ERD)

```mermaid
erDiagram
    EVENTS ||--o{ TICKET_TYPES : has
    TICKET_TYPES ||--o{ TICKETS : sold_as
    TRANSACTIONS ||--o{ TICKETS : contains
    TRANSACTIONS ||--o{ DONATIONS : includes
    TRANSACTIONS ||--o{ REMINDER_SCHEDULE : has
    REMINDER_SCHEDULE ||--o{ REMINDER_EXECUTION_LOG : tracks

    EVENTS {
        INTEGER id PK
        TEXT name
        TEXT slug
        TIMESTAMP start_date
        TIMESTAMP end_date
        TEXT status
        TIMESTAMP created_at
    }

    TICKET_TYPES {
        TEXT id PK
        INTEGER event_id FK
        TEXT name
        TEXT description
        INTEGER price_cents
        INTEGER max_quantity
        INTEGER sold_count
        INTEGER test_sold_count
        TEXT status
        TEXT event_date
        TEXT event_time
        TIMESTAMP created_at
    }

    TRANSACTIONS {
        INTEGER id PK
        TEXT uuid UK
        TEXT order_number UK
        TEXT stripe_session_id UK
        TEXT stripe_payment_intent
        TEXT purchaser_email
        TEXT purchaser_name
        INTEGER total_amount_cents
        TEXT currency
        TEXT status
        TEXT registration_token UK
        INTEGER reminder_sent_count
        TIMESTAMP last_reminder_sent_at
        TIMESTAMP next_reminder_at
        TIMESTAMP registration_completed_at
        TEXT card_brand
        TEXT card_last4
        TEXT payment_wallet
        TIMESTAMP created_at
    }

    TICKETS {
        INTEGER id PK
        TEXT ticket_id UK
        INTEGER transaction_id FK
        TEXT ticket_type FK
        TEXT ticket_type_id FK
        INTEGER event_id FK
        TEXT event_date
        TEXT event_time
        INTEGER price_cents
        TEXT attendee_first_name
        TEXT attendee_last_name
        TEXT attendee_email
        TEXT registration_status
        TIMESTAMP registration_deadline
        TEXT status
        TEXT qr_token UK
        INTEGER scan_count
        TEXT ticket_metadata
        INTEGER is_test
        TIMESTAMP created_at
        TIMESTAMP updated_at
    }

    DONATIONS {
        INTEGER id PK
        INTEGER transaction_id FK
        DECIMAL amount
        TEXT status
        TIMESTAMP created_at
    }

    REMINDER_SCHEDULE {
        INTEGER id PK
        INTEGER transaction_id FK
        TEXT reminder_type
        TIMESTAMP scheduled_for
        TEXT status
        INTEGER execution_count
        TIMESTAMP last_executed_at
        TIMESTAMP created_at
    }

    REMINDER_EXECUTION_LOG {
        INTEGER id PK
        INTEGER reminder_schedule_id FK
        TEXT status
        TEXT error_message
        TIMESTAMP executed_at
    }

    NEWSLETTER_SUBSCRIBERS {
        INTEGER id PK
        TEXT email UK
        TEXT first_name
        TEXT last_name
        TEXT source
        TIMESTAMP subscribed_at
        TIMESTAMP unsubscribed_at
    }

    MIGRATIONS {
        INTEGER id PK
        TEXT filename UK
        TEXT checksum
        TIMESTAMP executed_at
    }

    AUDIT_LOG {
        INTEGER id PK
        TEXT request_id
        TEXT action
        TEXT target_type
        TEXT target_id
        TEXT severity
        JSONB metadata
        TIMESTAMP timestamp
    }

    PAYMENT_EVENTS {
        INTEGER id PK
        TEXT stripe_event_id UK
        TEXT event_type
        TEXT payment_intent_id
        INTEGER transaction_id FK
        TEXT status
        JSONB event_data
        TEXT error_message
        TIMESTAMP created_at
    }
```

**Schema Design Principles:**

1. **Normalization**: 3NF compliance for data integrity
2. **UUIDs for External IDs**: Transactions use UUID for public references
3. **Cents Storage**: All prices stored as integers to avoid floating point issues
4. **Status Tracking**: Comprehensive status fields for workflow management
5. **JSONB Metadata**: Flexible metadata storage for extensibility
6. **Audit Trail**: Complete audit logging for compliance
7. **Idempotency**: Unique constraints prevent duplicate processing

**Critical Indexes:**

- `transactions.stripe_session_id` (UNIQUE)
- `transactions.order_number` (UNIQUE)
- `transactions.registration_token` (UNIQUE)
- `tickets.ticket_id` (UNIQUE)
- `tickets.qr_token` (UNIQUE)
- `tickets.transaction_id` (FK index)
- `reminder_schedule.transaction_id, scheduled_for` (Cron query optimization)

## Authentication Flows

### Admin Authentication

```mermaid
sequenceDiagram
    actor Admin
    participant LoginPage as Admin Login Page
    participant API as /api/admin/login
    participant bcrypt as bcrypt
    participant JWT as JWT Service
    participant DB as Database

    Admin->>LoginPage: Enter Password
    LoginPage->>API: POST {password}

    API->>bcrypt: Compare(password, ADMIN_PASSWORD)
    bcrypt-->>API: Match Result

    alt Password Valid
        API->>JWT: Create Token (24h expiry)
        JWT-->>API: JWT Token
        API->>DB: Log Audit Event
        API-->>LoginPage: {success: true, token}
        LoginPage->>LoginPage: Store Token (httpOnly cookie)
        LoginPage->>Admin: Redirect to Dashboard
    else Password Invalid
        API->>DB: Log Failed Attempt
        API-->>LoginPage: {success: false}
        LoginPage->>Admin: Show Error
    end
```

### QR Code Authentication

```mermaid
sequenceDiagram
    actor User
    participant Email as Email Template
    participant QR as /api/qr/generate
    participant JWT as JWT Service
    participant Cache as QR Cache Manager
    participant SW as Service Worker

    Email->>User: Display QR Code <img src="...?token=jwt">
    User->>QR: GET /api/qr/generate?token=jwt

    QR->>JWT: Verify Token
    JWT-->>QR: {valid: true, ticketId}

    alt Valid Token
        QR->>QR: Generate QR Code PNG
        QR->>Cache: Set HTTP Cache (24h)
        QR-->>User: PNG Image + Cache Headers
        User->>SW: Cache QR Code (7 days)
        SW-->>User: Cached for Offline
    else Invalid/Expired Token
        QR-->>User: 401 Unauthorized
    end
```

### Wallet Pass Authentication

```mermaid
sequenceDiagram
    actor User
    participant Button as Add to Wallet Button
    participant API as /api/tickets/apple-wallet/[id]
    participant JWT as JWT Service
    participant DB as Database
    participant Wallet as Apple/Google Wallet

    User->>Button: Click "Add to Wallet"
    Button->>API: GET with Auth Header

    API->>JWT: Verify Wallet Token
    JWT-->>API: {valid: true, ticketId}

    API->>DB: Get Ticket Details
    DB-->>API: Ticket Data

    alt Apple Wallet
        API->>API: Generate .pkpass (signed)
        API-->>User: Binary .pkpass file
        User->>Wallet: Import Pass
    else Google Wallet
        API->>API: Create Signed JWT
        API-->>User: {url: "https://pay.google.com/..."}
        User->>Wallet: Open URL
    end
```

**Authentication Security Features:**

1. **Admin**: bcrypt password hashing + JWT sessions (24h)
2. **QR Codes**: JWT tokens with ticket ID + expiry
3. **Wallet Passes**: Separate JWT tokens for pass generation
4. **Registration Tokens**: UUID-based tokens for batch registration
5. **Audit Logging**: All authentication attempts logged
6. **Rate Limiting**: Protection against brute force attacks

## Service Layer Architecture

```mermaid
graph TB
    subgraph "Service Layer Pattern"
        API[API Handler]
        Service[Async Service]
        DB[Database Client]

        API -->|await ensureInitialized| Service
        Service -->|await getDatabaseClient| DB

        Service -->|initialized = true| Cache[Instance Cache]
        Service -->|initializationPromise| Promise[Promise Cache]
    end

    subgraph "Core Services (121 total)"
        DatabaseSvc[Database Service<br/>Turso Connection Pooling]
        TransactionSvc[Transaction Service<br/>Order Management]
        TicketSvc[Ticket Service<br/>Ticket Operations]
        EmailSvc[Email Service<br/>Brevo Integration]
        StripeSvc[Stripe Service<br/>Payment Processing]
        AuditSvc[Audit Service<br/>Compliance Logging]
        ReminderSvc[Reminder Service<br/>Automated Emails]
        QRSvc[QR Service<br/>Code Generation]
        WalletSvc[Wallet Service<br/>Pass Generation]
        SecuritySvc[Security Service<br/>Fraud Detection]
    end

    subgraph "Service Communication"
        TicketCreationSvc[Ticket Creation Service]

        TicketCreationSvc -->|uses| TransactionSvc
        TicketCreationSvc -->|uses| TicketSvc
        TicketCreationSvc -->|uses| EmailSvc
        TicketCreationSvc -->|uses| ReminderSvc
        TicketCreationSvc -->|uses| AuditSvc
        TicketCreationSvc -->|uses| SecuritySvc
    end

    subgraph "Error Handling"
        Retry[Retry Logic<br/>Exponential Backoff]
        CircuitBreaker[Circuit Breaker<br/>Service Protection]
        Timeout[Timeout Protection<br/>15s default]
    end

    Service --> Retry
    Service --> CircuitBreaker
    Service --> Timeout
```

**Promise-Based Lazy Singleton Pattern:**

```javascript
class AsyncService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    // Fast path: already initialized
    if (this.initialized && this.instance) {
      return this.instance;
    }

    // Wait for in-progress initialization
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Enable retry
      throw error;
    }
  }
}
```

**Service Layer Benefits:**

1. **Race Condition Prevention**: Single initialization per service
2. **Connection Pooling**: Reuses database connections
3. **Error Recovery**: Failed initializations can retry
4. **Serverless Optimization**: Connection recycling for Vercel
5. **Testability**: Services can be mocked and reset
6. **Observability**: Centralized logging and monitoring

## Theme System Architecture

```mermaid
graph TB
    subgraph "Theme Detection"
        PageLoad[Page Load]
        PathCheck{Is Admin Page?}

        PageLoad --> PathCheck
    end

    subgraph "Admin Pages (Always Dark)"
        PathCheck -->|Yes| ForceDark[Force Dark Theme]
        ForceDark --> ApplyDark[Apply data-theme='dark']
        ApplyDark --> NoToggle[Hide Theme Toggle]
    end

    subgraph "Main Site (User Controlled)"
        PathCheck -->|No| CheckStorage[Check localStorage]

        CheckStorage --> UserPref{User Preference?}

        UserPref -->|system| DetectSystem[Detect OS Preference]
        UserPref -->|light| ApplyLight[Apply Light Theme]
        UserPref -->|dark| ApplyDarkMain[Apply Dark Theme]

        DetectSystem -->|prefers-color-scheme: dark| ApplyDarkMain
        DetectSystem -->|prefers-color-scheme: light| ApplyLight

        ApplyLight --> ShowToggle[Show Theme Toggle]
        ApplyDarkMain --> ShowToggle
    end

    subgraph "Performance Optimization"
        ShowToggle --> CacheDOM[Cache DOM References]
        CacheDOM --> RAF[RequestAnimationFrame]
        RAF --> Debounce[Debounce Storage Access]
    end

    subgraph "System Preference Monitoring"
        MediaQuery[matchMedia Listener]
        MediaQuery -->|OS theme changes| CheckUserPref{User Pref = system?}
        CheckUserPref -->|Yes| DetectSystem
        CheckUserPref -->|No| DoNothing[Keep User Preference]
    end

    subgraph "Events"
        ApplyDark --> EmitEvent[Emit 'themechange']
        ApplyLight --> EmitEvent
        ApplyDarkMain --> EmitEvent
        EmitEvent --> Components[Update Components]
    end
```

**Theme System Features:**

1. **Hybrid Approach**: Admin always dark, main site user-controlled
2. **FOUC Prevention**: Synchronous theme application on load
3. **Performance Caching**: DOM references and storage cached
4. **System Integration**: Respects OS dark mode preference
5. **Accessibility**: ARIA attributes and keyboard support
6. **Component Integration**: Custom events for theme changes

**CSS Variable System:**

```css
:root {
  /* Light theme (default) */
  --color-text-primary: #1a1a1a;
  --color-background: #ffffff;
  --color-blue: #5b6bb5;
}

[data-theme="dark"] {
  /* Dark theme overrides */
  --color-text-primary: #e5e5e5;
  --color-background: #0a0a0a;
  --color-blue: #7a8fd5;
}
```

**Performance Metrics:**

- Theme application: < 5ms (synchronous)
- Storage access: Cached for 100ms
- Theme toggle: < 20ms (RAF batching)
- System change detection: Event-driven (no polling)

## Data Flow Patterns

### Cart to Checkout Flow

```mermaid
graph LR
    subgraph "Client State"
        Cart[Cart Manager<br/>localStorage]
        CartState[Cart State<br/>{tickets, donations, totals}]
    end

    subgraph "Checkout Process"
        Selector[Payment Selector]
        CreateSession[Create Checkout API]
        Stripe[Stripe Checkout]
    end

    subgraph "Server Processing"
        Webhook[Stripe Webhook]
        TicketCreation[Ticket Creation Service]
        Database[(Database)]
    end

    Cart --> CartState
    CartState -->|User clicks checkout| Selector
    Selector -->|User selects payment| CreateSession
    CreateSession -->|Create session with metadata| Stripe
    Stripe -->|User completes payment| Webhook
    Webhook -->|Verify & process| TicketCreation
    TicketCreation -->|Atomic operations| Database
    Database -->|Confirmation email| User[User Email]
```

### Gallery Virtual Scrolling

```mermaid
graph TB
    subgraph "Frontend"
        Viewport[Visible Viewport]
        VirtualList[Virtual List Manager]
        IO[Intersection Observer]
    end

    subgraph "API Layer"
        GalleryAPI[/api/gallery]
        Cache[HTTP Cache 24h]
    end

    subgraph "Backend"
        DriveService[Google Drive Service]
        Drive[Google Drive API]
    end

    Viewport --> IO
    IO -->|Items entering viewport| VirtualList
    VirtualList -->|Load more| GalleryAPI
    GalleryAPI --> Cache
    Cache -->|Cache miss| DriveService
    DriveService -->|Fetch images| Drive
    Drive -->|Image metadata| DriveService
    DriveService -->|Cached response| GalleryAPI
    GalleryAPI -->|Images batch| VirtualList
    VirtualList -->|Render visible items| Viewport
```

**Virtual Scrolling Performance:**

- Render only visible items (20-30 at a time)
- Intersection Observer for lazy loading
- Progressive image loading (AVIF → WebP → JPEG)
- Google Drive CDN for image delivery
- 24-hour HTTP cache for metadata
- 1000+ images with smooth scrolling

## Notes on Architecture

**Why Vanilla JavaScript?**

- Zero framework overhead (faster load times)
- Direct browser API access (Service Worker, Intersection Observer)
- Simpler deployment (no build tools for frontend)
- Long-term stability (no framework version migrations)
- Smaller bundle size (critical for mobile)

**Why Serverless?**

- Auto-scaling for ticket sales spikes
- Pay-per-execution pricing
- Zero DevOps maintenance
- Global edge network (Vercel)
- Instant deployments

**Why Turso (LibSQL)?**

- SQLite compatibility (local development)
- Edge replication (low latency)
- Built-in connection pooling
- Cost-effective for read-heavy workloads
- Full SQL feature set

**Security Considerations:**

- Stripe metadata validation against database
- JWT authentication for QR codes and wallets
- bcrypt password hashing for admin
- HMAC signature validation for webhooks
- Parameterized queries (SQL injection prevention)
- Rate limiting on all public endpoints
- Comprehensive audit logging
