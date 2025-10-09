# System Architecture Overview

Comprehensive narrative explanation of A Lo Cubano Boulder Fest system architecture.

## Table of Contents

1. [Architecture Philosophy](#architecture-philosophy)
2. [Component Interactions](#component-interactions)
3. [Data Flow Patterns](#data-flow-patterns)
4. [Caching Strategy](#caching-strategy)
5. [Security Architecture](#security-architecture)
6. [Performance Considerations](#performance-considerations)

## Architecture Philosophy

### Why Vanilla JavaScript (No Framework)

The decision to build the frontend with vanilla JavaScript instead of React, Vue, or other frameworks was deliberate and strategic:

**Performance Benefits:**

- **Zero Framework Overhead**: No 100KB+ framework bundle to download
- **Faster Initial Load**: Critical for mobile users on slow connections
- **Direct Browser APIs**: Native access to Service Worker, Intersection Observer, Cache API
- **Smaller Total Bundle**: ~50KB total JavaScript vs. 300KB+ with frameworks

**Maintainability Benefits:**

- **No Breaking Changes**: Browser APIs are backward compatible
- **No Version Migrations**: Avoid framework upgrade cycles
- **Simpler Debugging**: Chrome DevTools work directly with source code
- **Lower Learning Curve**: Standard JavaScript patterns

**Progressive Enhancement:**

The vanilla JavaScript approach enables aggressive progressive enhancement:

```javascript
// Service Worker for offline support
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Virtual scrolling with Intersection Observer
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    // Load images as they enter viewport
  });
}

// LocalStorage for cart persistence
if ('localStorage' in window) {
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
}
```

### Serverless-First Approach

Vercel serverless functions power the entire backend with significant advantages:

**Operational Benefits:**

- **Zero Server Management**: No SSH, no OS updates, no security patches
- **Auto-Scaling**: Handles ticket sale spikes automatically
- **Global Edge Network**: Functions run close to users worldwide
- **Instant Deployments**: Git push → Production in ~2 minutes

**Cost Benefits:**

- **Pay Per Execution**: No idle server costs
- **Free Tier Generous**: 100GB-hours free per month
- **No Database Server Costs**: Turso handles database infrastructure

**Developer Experience:**

```javascript
// Simple API endpoint - no Express boilerplate
export default async function handler(req, res) {
  const client = await getDatabaseClient();
  const tickets = await client.execute('SELECT * FROM tickets');
  res.json({ tickets: tickets.rows });
}
```

### Async Singleton Pattern for Services

All services use the Promise-Based Lazy Singleton pattern to prevent race conditions in serverless environments:

**The Problem:**

Serverless functions can receive concurrent requests before initialization completes:

```javascript
// ❌ RACE CONDITION: Two requests initialize simultaneously
class BadService {
  async initialize() {
    this.db = await createDatabaseConnection(); // Called twice!
  }
}
```

**The Solution:**

Promise-based singleton ensures single initialization:

```javascript
// ✅ SAFE: Only one initialization, all requests wait
class DatabaseService {
  constructor() {
    this.instance = null;
    this.initialized = false;
    this.initializationPromise = null;
  }

  async ensureInitialized() {
    if (this.initialized && this.instance) {
      return this.instance; // Fast path for subsequent calls
    }

    if (this.initializationPromise) {
      return this.initializationPromise; // Wait for in-progress init
    }

    this.initializationPromise = this._performInitialization();

    try {
      return await this.initializationPromise;
    } catch (error) {
      this.initializationPromise = null; // Allow retry on failure
      throw error;
    }
  }
}
```

**Real-World Example from database.js:**

```javascript
export async function getDatabaseClient() {
  // Return cached client if available and valid
  if (cachedClient) {
    try {
      await cachedClient.execute("SELECT 1");
      return cachedClient;
    } catch (error) {
      cachedClient = null; // Connection died, recreate
    }
  }

  // If already creating, wait for that promise
  if (clientCreationPromise) {
    return clientCreationPromise;
  }

  // Create new client
  clientCreationPromise = createDirectDatabaseClient();

  try {
    cachedClient = await clientCreationPromise;
    return cachedClient;
  } catch (error) {
    clientCreationPromise = null; // Clear on error for retry
    throw error;
  }
}
```

### Progressive Enhancement Strategy

The application works without JavaScript, then enhances with JS features:

**Base HTML (No JS Required):**

- Static pages render server-side
- Forms work with standard POST
- Links work without JavaScript

**JavaScript Enhancement Layers:**

1. **Cart Management**: localStorage for persistence
2. **Virtual Scrolling**: Intersection Observer for performance
3. **Service Worker**: Offline QR code access
4. **Theme System**: Respects OS dark mode preference
5. **Payment Integration**: Stripe Elements for security

This approach ensures accessibility and resilience.

## Component Interactions

### Frontend-to-API Communication Patterns

The frontend uses a modular service pattern for API calls:

**Cart Manager → Payment APIs:**

```javascript
// Cart state managed client-side
class CartManager {
  async checkout() {
    const items = this.getState().tickets;

    // API call via payment handler
    const session = await createCheckoutSession({
      items: Object.values(items).map(ticket => ({
        ticketType: ticket.ticketType,
        quantity: ticket.quantity,
        price: ticket.price
      }))
    });

    // Redirect to Stripe
    window.location.href = session.url;
  }
}
```

**Gallery → Google Drive APIs:**

```javascript
// Virtual gallery with lazy loading
class VirtualGallery {
  async loadPhotos(year, offset, limit) {
    const response = await fetch(
      `/api/gallery?year=${year}&offset=${offset}&limit=${limit}`
    );
    const data = await response.json();

    // Update virtual list with new photos
    this.virtualList.append(data.photos);
  }
}
```

**QR Cache Manager → QR Generation API:**

```javascript
// Dual-layer caching for QR codes
class QRCacheManager {
  async getQRCode(token) {
    // Layer 1: Check localStorage (7-day cache)
    const cached = this.getCachedImage(token);
    if (cached && !this.isExpired(cached)) {
      return cached.dataUrl;
    }

    // Layer 2: Fetch from API (24-hour HTTP cache)
    const response = await fetch(`/api/qr/generate?token=${token}`);
    const blob = await response.blob();
    const dataUrl = await this.blobToDataUrl(blob);

    // Store in localStorage for future use
    this.cacheImage(token, dataUrl);

    return dataUrl;
  }
}
```

### Service Layer Responsibilities

Services encapsulate business logic and external integrations:

**Database Service:**

- Connection pooling and recycling
- Transaction management
- Query execution with retry logic
- Health monitoring

**Stripe Service:**

- Checkout session creation
- Webhook signature validation
- Payment intent management
- Refund processing

**Brevo Service:**

- Email template rendering
- Contact list management
- Transactional email sending
- Webhook event processing

**Ticket Service:**

- QR code generation with JWT
- Wallet pass creation (Apple/Google)
- Registration management
- Validation logic

**Audit Service:**

- Financial event logging
- Security alert tracking
- Compliance trail
- Performance monitoring

### Database Access Patterns

All services use `getDatabaseClient()` for consistent database access:

**Direct Client Access (Recommended):**

```javascript
import { getDatabaseClient } from './lib/database.js';

export default async function handler(req, res) {
  const db = await getDatabaseClient();

  // Execute query directly
  const result = await db.execute({
    sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
    args: [transactionId]
  });

  res.json({ tickets: result.rows });
}
```

**Batch Operations for Atomicity:**

```javascript
// Multiple operations in single transaction
async function createTicketsForTransaction(session, transaction) {
  const db = await getDatabaseClient();

  const operations = [];

  // Update sold_count first (critical for availability)
  operations.push({
    sql: 'UPDATE ticket_types SET sold_count = sold_count + ? WHERE id = ?',
    args: [quantity, ticketTypeId]
  });

  // Insert tickets atomically
  for (const ticketData of tickets) {
    operations.push({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, price_cents,
        registration_status, registration_deadline, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        ticketData.id,
        transaction.id,
        ticketData.type,
        ticketData.price,
        'pending',
        deadlineISO,
        nowISO
      ]
    });
  }

  // Execute all operations atomically
  await db.batch(operations);
}
```

**Connection Recycling (Serverless Optimization):**

```javascript
// Database service automatically recycles stale connections
class DatabaseService {
  async ensureInitialized() {
    const connectionAge = Date.now() - this.lastActivity;

    // Recycle connections older than 3 minutes
    if (connectionAge > this.connectionMaxAge) {
      await this._recycleConnection();
    }

    return this.client;
  }
}
```

### External API Integration Strategies

**Google Drive Integration:**

```javascript
// Gallery service with caching
class GoogleDriveService {
  async listPhotos(year) {
    // Check cache first (24-hour TTL)
    const cached = this.cache.get(`photos_${year}`);
    if (cached) return cached;

    // Fetch from Google Drive API
    const response = await this.drive.files.list({
      q: `'${this.folderId}' in parents AND name contains '${year}'`,
      fields: 'files(id, name, thumbnailLink, webViewLink)',
      orderBy: 'name'
    });

    // Cache for 24 hours
    this.cache.set(`photos_${year}`, response.data.files, 86400);

    return response.data.files;
  }
}
```

**Stripe Integration with Idempotency:**

```javascript
// Webhook handler with idempotent ticket creation
export default async function stripeWebhook(req, res) {
  const event = stripe.webhooks.constructEvent(
    rawBody,
    signature,
    webhookSecret
  );

  // Log event first for idempotency
  const logResult = await paymentEventLogger.logStripeEvent(event);

  if (logResult.status === 'already_processed') {
    return res.json({ received: true, status: 'duplicate' });
  }

  // Process event
  const result = await createOrRetrieveTickets(session);

  // Return success - tickets created or already existed
  return res.json({
    received: true,
    status: result.created ? 'created' : 'already_exists'
  });
}
```

**Brevo Email Integration:**

```javascript
// Email service with test mode support
class BrevoService {
  async sendTransactionalEmail(emailData) {
    // Use mock responses in test mode
    if (this.isTestMode) {
      return this.getMockResponse('/smtp/email', { method: 'POST' });
    }

    // Send real email in production
    const response = await fetch(`${this.baseUrl}/smtp/email`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        to: emailData.to,
        templateId: emailData.templateId,
        params: emailData.params
      })
    });

    return response.json();
  }
}
```

## Data Flow Patterns

### Ticket Purchase Flow

Complete flow from cart to ticket generation:

**Step 1: Cart Management**

```javascript
// User adds ticket to cart
cartManager.addTicket({
  ticketType: 'full-pass',
  quantity: 2,
  price: 12000, // Cents
  name: 'Full Weekend Pass',
  eventId: 1
});

// Cart state persisted to localStorage
localStorage.setItem('cart', JSON.stringify(cartState));
```

**Step 2: Checkout Session Creation**

```javascript
// Payment API creates Stripe session with metadata
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [
    {
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Full Weekend Pass',
          metadata: {
            ticket_type: 'full-pass',
            event_id: '1',
            event_date: '2026-05-15'
          }
        },
        unit_amount: 6000 // Per ticket
      },
      quantity: 2
    }
  ],
  success_url: `${process.env.SITE_URL}/api/payments/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${process.env.SITE_URL}/tickets`
});
```

**Step 3: Webhook Processing**

```javascript
// Stripe webhook triggers ticket creation
async function handleCheckoutCompleted(session) {
  // Expand session to get line items and payment method
  const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items', 'line_items.data.price.product', 'payment_intent.payment_method']
  });

  // Idempotent ticket creation
  const result = await createOrRetrieveTickets(fullSession, paymentMethodData);

  // Send confirmation email
  await emailService.sendTicketConfirmation(result.transaction);

  // Schedule registration reminders
  await scheduleRegistrationReminders(
    result.transaction.id,
    registrationDeadline
  );

  return result;
}
```

**Step 4: Database Operations**

```javascript
// Atomic ticket creation with sold_count update
async function createTicketsForTransaction(session, transaction) {
  const operations = [];

  // Update sold_count BEFORE inserting tickets
  operations.push({
    sql: `UPDATE ticket_types
          SET sold_count = sold_count + ?
          WHERE id = ? AND (sold_count + ? <= max_quantity OR max_quantity IS NULL)`,
    args: [quantity, ticketTypeId, quantity]
  });

  // Insert tickets
  for (const ticket of tickets) {
    operations.push({
      sql: `INSERT INTO tickets (
        ticket_id, transaction_id, ticket_type, price_cents,
        registration_status, registration_deadline, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [ticketId, transaction.id, ticketType, price, 'pending', deadline, 'valid', now]
    });
  }

  // Execute atomically
  await db.batch(operations);
}
```

### Donation Flow

Donations are processed alongside tickets in mixed purchases:

**Step 1: Cart with Donations**

```javascript
// User adds both tickets and donation
cartManager.addTicket({ ticketType: 'friday', quantity: 1, price: 4000 });
cartManager.addDonation({ amount: 5000, id: generateId() });

// Cart state includes both types
const cartState = {
  tickets: { friday: { /* ... */ } },
  donations: [{ amount: 5000, id: 'donation_123' }],
  totals: { total: 9000 }
};
```

**Step 2: Stripe Session Creation**

```javascript
// Create line items for both tickets and donations
const lineItems = [
  // Ticket item
  {
    price_data: { /* ticket data */ },
    quantity: 1
  },
  // Donation item
  {
    price_data: {
      currency: 'usd',
      product_data: {
        name: 'Donation',
        metadata: { type: 'donation', donation_category: 'general' }
      },
      unit_amount: 5000
    },
    quantity: 1
  }
];
```

**Step 3: Webhook Processing**

```javascript
// Webhook creates both tickets and donation records
for (const item of session.line_items.data) {
  const meta = item.price.product.metadata;

  if (meta.type === 'donation') {
    // Create donation record
    await db.execute({
      sql: `INSERT INTO donations (transaction_id, amount, status, created_at)
            VALUES (?, ?, ?, ?)`,
      args: [transaction.id, item.amount_total, 'completed', now]
    });
  } else {
    // Create ticket record
    // ... ticket creation logic
  }
}
```

**Step 4: Email Confirmation**

```javascript
// Email includes donation acknowledgment
const emailData = {
  to: transaction.purchaser_email,
  templateId: PURCHASER_CONFIRMATION_TEMPLATE_ID,
  params: {
    order_number: transaction.order_number,
    tickets: ticketDetails,
    donation_count: donations.length,
    donation_total: donations.reduce((sum, d) => sum + d.amount, 0),
    thank_you_message: getTieredThankYouMessage(totalDonation)
  }
};
```

### Registration Flow

Multi-ticket registration with automated reminders:

**Step 1: Registration Email**

User receives email with registration link:

```javascript
// Email template includes registration URL
const registrationUrl = `${process.env.SITE_URL}/registration/${transaction.registration_token}`;
```

**Step 2: Registration Page**

```javascript
// Page loads all tickets for transaction
const response = await fetch(`/api/registration/${token}`);
const { tickets } = await response.json();

// Display form for each unregistered ticket
tickets.forEach(ticket => {
  if (ticket.registration_status === 'pending') {
    showRegistrationForm(ticket);
  }
});
```

**Step 3: Batch Registration**

```javascript
// Submit all registrations at once
const registrations = tickets.map(ticket => ({
  ticketId: ticket.id,
  name: formData.get(`name_${ticket.id}`),
  email: formData.get(`email_${ticket.id}`),
  dietaryRestrictions: formData.get(`dietary_${ticket.id}`)
}));

await fetch('/api/registration/batch', {
  method: 'POST',
  body: JSON.stringify({ token, registrations })
});
```

**Step 4: Reminder System**

```javascript
// Reminders scheduled at ticket creation
await scheduleRegistrationReminders(
  transaction.id,
  registrationDeadline,
  isTestTransaction
);

// Cron job processes reminders
async function processReminders() {
  const dueReminders = await db.execute({
    sql: `SELECT * FROM reminder_schedule
          WHERE status = 'pending'
          AND scheduled_for <= datetime('now')
          ORDER BY scheduled_for ASC
          LIMIT 100`
  });

  for (const reminder of dueReminders.rows) {
    await sendReminderEmail(reminder);
    await markReminderComplete(reminder.id);
  }
}
```

### Gallery Image Loading

Virtual scrolling with progressive image loading:

**Step 1: Initial Load**

```javascript
// Load first batch of images
const initialPhotos = await fetch('/api/gallery?year=2025&limit=30&offset=0');
virtualList.render(initialPhotos);
```

**Step 2: Intersection Observer**

```javascript
// Detect when user scrolls near end
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting && entry.target === lastElement) {
      loadMorePhotos();
    }
  });
});

observer.observe(lastElement);
```

**Step 3: Progressive Loading**

```javascript
// Load images in progressive quality
async function loadImage(photo) {
  const img = new Image();

  // Try AVIF first (smallest)
  img.src = photo.thumbnailUrl + '&format=avif';

  img.onerror = () => {
    // Fallback to WebP
    img.src = photo.thumbnailUrl + '&format=webp';

    img.onerror = () => {
      // Final fallback to JPEG
      img.src = photo.thumbnailUrl;
    };
  };

  return img;
}
```

**Step 4: Google Drive Caching**

```javascript
// Backend caches Drive API responses
class GoogleDriveService {
  async listPhotos(year) {
    const cacheKey = `photos_${year}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 86400000) {
      return cached.data; // 24-hour cache
    }

    const photos = await this.drive.files.list({ /* ... */ });

    this.cache.set(cacheKey, {
      data: photos,
      timestamp: Date.now()
    });

    return photos;
  }
}
```

## Caching Strategy

### QR Code Dual-Layer Caching

The QR code system implements two independent cache layers:

**Layer 1: HTTP Cache (Server-Side, 24 hours)**

```javascript
// API endpoint sets HTTP cache headers
export default async function handler(req, res) {
  const qrImage = await generateQRCode(token);

  // Cache in browser and CDN for 24 hours
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Type', 'image/png');
  res.send(qrImage);
}
```

**Layer 2: Client Cache (Client-Side, 7 days)**

```javascript
// QR Cache Manager handles client-side caching
class QRCacheManager {
  async getQRCode(token) {
    const cacheKey = `qr_${token}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      const data = JSON.parse(cached);
      const age = Date.now() - data.timestamp;

      // 7-day cache
      if (age < 7 * 24 * 60 * 60 * 1000) {
        return data.dataUrl;
      }
    }

    // Fetch from API (uses HTTP cache if available)
    const response = await fetch(`/api/qr/generate?token=${token}`);
    const blob = await response.blob();
    const dataUrl = await this.blobToDataUrl(blob);

    // Store in localStorage
    localStorage.setItem(cacheKey, JSON.stringify({
      dataUrl,
      timestamp: Date.now()
    }));

    return dataUrl;
  }
}
```

**Service Worker Cache (Offline Support)**

```javascript
// Service Worker caches QR codes for offline access
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/qr/generate')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          return cached; // Serve from cache
        }

        // Fetch and cache for future
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open('qr-codes-v1').then(cache => {
            cache.put(event.request, clone);
          });
          return response;
        });
      })
    );
  }
});
```

### Database Query Caching

**Connection Pooling:**

```javascript
// Turso client maintains connection pool
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 45, // Sync every 45 seconds
  maxIdleConnections: 2,
  keepAlive: false // Disable in serverless
});
```

**Query Result Caching (Read-Heavy Endpoints):**

```javascript
// Gallery API caches Google Drive results
let cachedGalleryPhotos = null;
let cacheTimestamp = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export default async function handler(req, res) {
  const now = Date.now();

  if (cachedGalleryPhotos && (now - cacheTimestamp) < CACHE_TTL) {
    return res.json(cachedGalleryPhotos);
  }

  const photos = await driveService.listPhotos();

  cachedGalleryPhotos = photos;
  cacheTimestamp = now;

  res.json(photos);
}
```

### Static Asset Caching

**Vercel CDN Configuration:**

```json
{
  "headers": [
    {
      "source": "/images/:path*",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/css/:path*",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    }
  ]
}
```

### Cache Invalidation Strategies

**Manual Invalidation:**

```javascript
// Admin can clear QR cache
export default async function handler(req, res) {
  if (!isAdmin(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  // Clear server-side cache
  cachedQRCodes.clear();

  // Instruct clients to clear cache (via API response)
  res.json({
    success: true,
    message: 'QR cache cleared',
    clientAction: 'clearLocalStorage'
  });
}
```

**Automatic Cache Busting:**

```html
<!-- CSS/JS files include hash in filename -->
<link rel="stylesheet" href="/css/main.abc123.css">
<script src="/js/cart.def456.js"></script>
```

## Security Architecture

### Admin Authentication (bcrypt + JWT)

**Password Hashing:**

```javascript
// Admin password stored as bcrypt hash
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // Already hashed

// Login verification
export default async function handler(req, res) {
  const { password } = req.body;

  const isValid = await bcrypt.compare(password, ADMIN_PASSWORD);

  if (!isValid) {
    await auditService.logDataChange({
      action: 'ADMIN_LOGIN_FAILED',
      severity: 'warning',
      metadata: { ip: req.headers['x-forwarded-for'] }
    });

    return res.status(401).json({ success: false });
  }

  // Generate JWT token (24-hour expiry)
  const token = jwt.sign(
    { role: 'admin', timestamp: Date.now() },
    process.env.ADMIN_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ success: true, token });
}
```

**JWT Session Management:**

```javascript
// Middleware validates JWT on admin endpoints
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, process.env.ADMIN_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid token' });
  }
}
```

### CSRF Protection

**Token-Based CSRF Protection:**

```javascript
// Generate CSRF token on form load
function generateCSRFToken() {
  const token = crypto.randomBytes(32).toString('hex');
  sessionStorage.setItem('csrfToken', token);
  return token;
}

// Validate CSRF token on form submission
function validateCSRFToken(req) {
  const sessionToken = req.headers['x-csrf-token'];
  const formToken = req.body.csrfToken;

  if (!sessionToken || sessionToken !== formToken) {
    throw new Error('CSRF validation failed');
  }
}
```

### Rate Limiting

**QR Code Generation Rate Limit:**

```javascript
// Rate limit: 10 requests per minute per IP
const rateLimitMap = new Map();

export default async function handler(req, res) {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const maxRequests = 10;

  const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs };

  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }

  record.count++;

  if (record.count > maxRequests) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      retryAfter: Math.ceil((record.resetTime - now) / 1000)
    });
  }

  rateLimitMap.set(ip, record);

  // Process request
  // ...
}
```

### Input Validation

**SQL Injection Prevention:**

```javascript
// ✅ SAFE: Parameterized queries
const result = await db.execute({
  sql: 'SELECT * FROM tickets WHERE transaction_id = ?',
  args: [transactionId] // Parameters properly escaped
});

// ❌ DANGEROUS: String concatenation
const result = await db.execute(
  `SELECT * FROM tickets WHERE transaction_id = '${transactionId}'`
);
```

**XSS Protection:**

```javascript
// Sanitize user input before rendering
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Use when inserting user content
element.textContent = userInput; // ✅ Safe (no HTML)
element.innerHTML = escapeHtml(userInput); // ✅ Safe (escaped)
element.innerHTML = userInput; // ❌ XSS vulnerability
```

### Fraud Detection

**Stripe Metadata Validation:**

```javascript
// Webhook validates Stripe metadata against database
async function validateStripeMetadata(lineItem, ticketType) {
  const errors = [];

  // Validation 1: Ticket type exists
  const dbTicket = await db.execute({
    sql: 'SELECT * FROM ticket_types WHERE id = ?',
    args: [ticketType]
  });

  if (!dbTicket.rows.length) {
    errors.push(`Ticket type ${ticketType} not found`);
  }

  // Validation 2: Status is available
  if (dbTicket.rows[0].status !== 'available') {
    errors.push(`Ticket type ${ticketType} not available`);
  }

  // Validation 3: Price matches
  const expectedPrice = dbTicket.rows[0].price_cents * quantity;
  if (Math.abs(lineItem.amount_total - expectedPrice) > 1) {
    errors.push(`Price mismatch: expected ${expectedPrice}, got ${lineItem.amount_total}`);
  }

  // Validation 4: Quantity available
  const available = dbTicket.rows[0].max_quantity - dbTicket.rows[0].sold_count;
  if (quantity > available) {
    errors.push(`Insufficient quantity: requested ${quantity}, available ${available}`);
  }

  if (errors.length > 0) {
    // Log security alert
    await securityAlertService.triggerAlert({
      alertType: 'webhook_metadata_tampering',
      severity: 'critical',
      evidence: { errors, lineItem, ticketType }
    });

    // Flag ticket for review instead of blocking
    return { valid: false, errors };
  }

  return { valid: true };
}
```

### Circuit Breakers

**Service Protection:**

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async execute(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}

// Usage in service
const emailCircuitBreaker = new CircuitBreaker(5, 60000);

async function sendEmail(data) {
  return emailCircuitBreaker.execute(async () => {
    return await brevoService.sendTransactionalEmail(data);
  });
}
```

## Performance Considerations

### Response Time Targets

The application maintains strict performance targets:

| Endpoint Type | Target | Strategy |
|---------------|--------|----------|
| Health checks | < 50ms | Cached connection validation |
| Database reads | < 100ms | Indexed queries, connection pooling |
| Database writes | < 200ms | Batch operations, async processing |
| QR generation | < 150ms | PNG optimization, HTTP caching |
| Wallet passes | < 300ms | Pre-generated certificates |
| External API calls | < 1000ms | Timeout protection, retry logic |

**Achieving Targets:**

```javascript
// Health check with cached validation
let lastHealthCheck = { result: null, timestamp: 0 };

export default async function handler(req, res) {
  const now = Date.now();

  // Use cached result if < 30s old
  if (lastHealthCheck.result && (now - lastHealthCheck.timestamp) < 30000) {
    return res.json(lastHealthCheck.result);
  }

  // Perform health check with timeout
  const healthResult = await Promise.race([
    performHealthCheck(),
    timeout(5000) // 5s timeout
  ]);

  lastHealthCheck = { result: healthResult, timestamp: now };
  res.json(healthResult);
}
```

### Database Connection Pooling

**Turso Configuration:**

```javascript
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
  intMode: 'number', // Avoid BigInt serialization issues
  syncInterval: 45, // Sync every 45 seconds
  connectTimeout: 8000, // 8s connection timeout
  requestTimeout: 12000, // 12s query timeout
  maxIdleConnections: 2, // Minimal idle in serverless
  keepAlive: false // Disable keep-alive in serverless
});
```

**Connection Recycling:**

```javascript
// Recycle connections older than 3 minutes
class DatabaseService {
  async ensureInitialized() {
    const connectionAge = Date.now() - this.lastActivity;

    if (connectionAge > 180000) { // 3 minutes
      await this._recycleConnection();
    }

    this.lastActivity = Date.now();
    return this.client;
  }

  async _recycleConnection() {
    if (this.client && typeof this.client.close === 'function') {
      await this.client.close();
    }

    this.client = null;
    this.initialized = false;
    this.initializationPromise = null;
  }
}
```

### API Response Time Targets (<100ms)

**Query Optimization:**

```javascript
// Use indexes for fast lookups
await db.execute({
  sql: `SELECT * FROM tickets
        WHERE qr_token = ? -- Indexed column
        LIMIT 1`,
  args: [qrToken]
});

// Avoid full table scans
// ❌ Slow: WHERE LOWER(email) = ?
// ✅ Fast: WHERE email = ? (exact match with index)
```

**Batch Operations:**

```javascript
// Single batch operation instead of multiple round trips
const operations = tickets.map(ticket => ({
  sql: 'INSERT INTO tickets (...) VALUES (...)',
  args: [ticket.id, ticket.type, /* ... */]
}));

await db.batch(operations); // Single network round-trip
```

### Virtual Scrolling for 1000+ Images

**Intersection Observer Implementation:**

```javascript
class VirtualGallery {
  constructor(container) {
    this.container = container;
    this.photos = [];
    this.visibleRange = { start: 0, end: 30 };
    this.itemHeight = 300;

    // Create Intersection Observer
    this.observer = new IntersectionObserver(
      entries => this.handleIntersection(entries),
      { rootMargin: '500px' } // Load 500px ahead
    );
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const index = parseInt(img.dataset.index);

        // Load image if not already loaded
        if (!img.src) {
          this.loadImage(img, this.photos[index]);
        }

        // Load more photos if near end
        if (index > this.photos.length - 10) {
          this.loadMorePhotos();
        }
      }
    });
  }

  async loadImage(img, photo) {
    // Progressive image loading
    img.src = photo.thumbnailUrl;
    img.loading = 'lazy'; // Native lazy loading
    img.decoding = 'async'; // Async image decode
  }
}
```

**Performance Metrics:**

- Initial load: 30 images (~1-2s)
- Scroll to 1000 images: No lag (virtual rendering)
- Memory usage: ~50MB (only visible images in DOM)
- Network: Progressive loading (load as needed)

### Progressive Image Loading (AVIF → WebP → JPEG)

```javascript
async function loadImageProgressive(photo) {
  const img = new Image();

  // Try modern formats first (smallest)
  const formats = [
    { format: 'avif', size: '~60% smaller' },
    { format: 'webp', size: '~30% smaller' },
    { format: 'jpeg', size: 'baseline' }
  ];

  for (const { format } of formats) {
    try {
      await new Promise((resolve, reject) => {
        const testImg = new Image();
        testImg.onload = resolve;
        testImg.onerror = reject;
        testImg.src = `${photo.url}?format=${format}`;
      });

      // Format supported, use it
      img.src = `${photo.url}?format=${format}`;
      return img;
    } catch {
      // Format not supported, try next
      continue;
    }
  }

  // Final fallback to original
  img.src = photo.url;
  return img;
}
```

### Browser Cache (24-hour for Static Assets)

**Cache Headers Configuration:**

```javascript
// API endpoint sets appropriate cache headers
export default async function handler(req, res) {
  const isStaticAsset = req.url.match(/\.(jpg|png|css|js|woff2)$/);

  if (isStaticAsset) {
    // Immutable cache for versioned assets
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.url.includes('/api/qr/generate')) {
    // 24-hour cache for QR codes
    res.setHeader('Cache-Control', 'public, max-age=86400');
  } else {
    // No cache for dynamic content
    res.setHeader('Cache-Control', 'no-store');
  }

  // ... handle request
}
```

### Monitoring and Observability

**Performance Tracking:**

```javascript
// Automatic performance marks in theme system
performance.mark('theme-start');
applyTheme();
performance.mark('theme-end');
performance.measure('theme-change', 'theme-start', 'theme-end');

// Retrieve performance data
const measures = performance.getEntriesByType('measure');
const themeChanges = measures.filter(m => m.name === 'theme-change');
console.log('Average theme change:', themeChanges.reduce((sum, m) => sum + m.duration, 0) / themeChanges.length);
```

**Audit Logging:**

```javascript
// All critical operations logged
await auditService.logFinancialEvent({
  action: 'PAYMENT_SUCCESSFUL',
  amountCents: 12000,
  transactionReference: transaction.uuid,
  metadata: {
    stripe_session_id: session.id,
    customer_email: session.customer_details.email
  }
});
```

## Cross-References

- [Architecture Diagrams](DIAGRAMS.md) - Visual system architecture
- [API Documentation](/docs/api/README.md) - Complete API reference
- [Theme System Guide](/docs/THEME_SYSTEM.md) - Theme implementation details
- [Donations System](/docs/DONATIONS_SYSTEM.md) - Donation processing
- [Bootstrap System](/docs/BOOTSTRAP_SYSTEM.md) - Database initialization
- [Testing Architecture](/docs/testing/TEST_ARCHITECTURE.md) - Test strategy
