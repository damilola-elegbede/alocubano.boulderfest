# Email Service Integration

A comprehensive email service for A Lo Cubano Boulder Fest payment system with SendGrid integration, PDF ticket generation, and typography-forward email templates.

## Features

### ✅ Core Email Service (`service.js`)
- **SendGrid Integration** with proper API key handling
- **Receipt emails** with order details and ticket attachments
- **Payment failure notifications** with retry links
- **Refund confirmation emails** with processing details
- **Exponential backoff retry logic** for failed sends
- **Email delivery tracking** and status monitoring

### ✅ PDF Ticket Generator (`pdf-generator.js`)
- **Professional ticket design** with festival branding
- **QR code generation** with security checksums
- **Typography-forward design** using festival fonts
- **Multiple ticket formats** (single tickets, bundles)
- **Security features** (watermarks, validation codes)
- **Ticket validation system** for venue entry

### ✅ HTML Email Templates
- **Receipt confirmation** template with festival branding
- **Payment failure** notification template
- **Refund confirmation** template
- **Typography-forward design** matching website
- **Responsive design** for all devices
- **Multi-language support** ready (English/Spanish)

### ✅ Template Engine (`template-engine.js`)
- **Handlebars integration** with custom helpers
- **Dynamic data injection** with personalization
- **Multi-language support** (English/Spanish)
- **Template caching** for performance
- **Custom helpers** for dates, currency, translations
- **Festival-specific helpers** for branding consistency

### ✅ Integration Layer (`index.js`)
- **Unified API** for all email functionality
- **Bulk email support** for marketing campaigns
- **Health checking** and monitoring
- **Error handling** with comprehensive logging
- **Service coordination** between components

## Quick Start

### Installation

```bash
# Install required dependencies
npm install @sendgrid/mail handlebars pdfkit qrcode
```

### Environment Variables

```bash
# Required
SENDGRID_API_KEY=your_sendgrid_api_key_here
SENDGRID_FROM_EMAIL=noreply@alocubanoboulderfest.com

# Optional
SENDGRID_FROM_NAME="A Lo Cubano Boulder Fest"
FESTIVAL_EMAIL=alocubanoboulderfest@gmail.com
FESTIVAL_URL=https://alocubanoboulderfest.com
TICKET_SECRET=your_secure_ticket_secret_here
```

### Basic Usage

```javascript
const emailService = require('./lib/email');

// Initialize the service
await emailService.initialize();

// Send receipt email with tickets
const orderData = {
  orderId: 'ALB-2026-001',
  customerName: 'Maria Rodriguez',
  customerEmail: 'maria@example.com',
  amount: 299.99,
  paymentMethod: 'Credit Card',
  createdAt: new Date().toISOString(),
  tickets: [
    { ticketId: 'TKT-001', type: 'Festival Pass', price: 149.99 },
    { ticketId: 'TKT-002', type: 'Workshop Only', price: 149.99 }
  ]
};

await emailService.sendReceiptEmail(orderData);
```

## File Structure

```
lib/email/
├── index.js                          # Main integration entry point
├── service.js                        # Core email service with SendGrid
├── pdf-generator.js                  # PDF ticket generation
├── template-engine.js                # Handlebars template system
├── config.js                         # Configuration settings
├── examples.js                       # Usage examples
├── README.md                         # This documentation
└── templates/
    ├── receipt.hbs                   # Receipt email template
    ├── payment-failure.hbs           # Payment failure template
    ├── refund-confirmation.hbs       # Refund confirmation template
    └── partials/
        ├── header.hbs                # Email header partial
        └── footer.hbs                # Email footer partial
```

## API Reference

### Core Methods

#### `sendReceiptEmail(orderData)`
Sends a receipt email with ticket attachments.

```javascript
await emailService.sendReceiptEmail({
  orderId: 'ALB-2026-001',
  customerName: 'Customer Name',
  customerEmail: 'customer@example.com',
  amount: 299.99,
  paymentMethod: 'Credit Card',
  createdAt: '2024-01-01T12:00:00Z',
  tickets: [
    { ticketId: 'TKT-001', type: 'Festival Pass', price: 149.99 }
  ]
});
```

#### `sendPaymentFailureEmail(orderData, failureReason)`
Sends a payment failure notification with retry link.

```javascript
await emailService.sendPaymentFailureEmail(
  orderData,
  'Your card was declined. Please try a different payment method.'
);
```

#### `sendRefundConfirmationEmail(orderData, refundData)`
Sends a refund confirmation email.

```javascript
await emailService.sendRefundConfirmationEmail(
  orderData,
  {
    refundId: 'REF-001',
    amount: 299.99,
    refundDate: '2024-01-02T12:00:00Z'
  }
);
```

#### `generateTicketPDF(ticketData, orderData)`
Generates a single PDF ticket.

```javascript
const pdfBuffer = await emailService.generateTicketPDF(
  { ticketId: 'TKT-001', type: 'Festival Pass' },
  orderData
);
```

#### `generateTicketBundle(tickets, orderData)`
Generates multiple tickets in a single PDF.

```javascript
const pdfBuffer = await emailService.generateTicketBundle(
  [
    { ticketId: 'TKT-001', type: 'Festival Pass' },
    { ticketId: 'TKT-002', type: 'Workshop Only' }
  ],
  orderData
);
```

### Utility Methods

#### `validateTicketQR(qrData)`
Validates QR code data from scanned tickets.

#### `healthCheck()`
Returns the health status of all email services.

#### `getStats()`
Returns service statistics and template information.

## Email Templates

### Design Features

- **Typography-forward design** using Bebas Neue and Open Sans fonts
- **Festival branding** with Cuban-inspired colors and gradients
- **Responsive layout** optimized for all devices
- **Accessibility features** with proper contrast and alt text
- **Dark mode support** for better user experience

### Template Variables

All templates support these variables:

- `customerName` - Customer's name
- `customerEmail` - Customer's email address
- `orderId` - Order/transaction ID
- `amount` - Payment amount
- `transactionDate` - Date of transaction
- `paymentMethod` - Payment method used
- `tickets` - Array of ticket objects
- `festival` - Festival information object

### Custom Handlebars Helpers

- `{{formatDate date 'long'}}` - Format dates
- `{{formatCurrency amount 'USD'}}` - Format currency
- `{{t 'key' 'lang'}}` - Translate text
- `{{spanishPhrase 'greeting'}}` - Cuban Spanish phrases
- `{{festivalDates}}` - Festival dates
- `{{festivalVenue}}` - Venue information

## PDF Ticket Features

### Security Features

- **QR codes** with encrypted validation data
- **Security checksums** to prevent tampering
- **Watermarks** for authenticity
- **Generation timestamps** for audit trails
- **Expiration dates** built into QR codes

### Design Elements

- **Festival branding** with typography-forward design
- **Professional layout** suitable for printing
- **QR code positioning** optimized for scanning
- **Important information** clearly displayed
- **Spanish phrases** for cultural authenticity

### QR Code Data Structure

```json
{
  "version": "1.0",
  "ticketId": "TKT-001",
  "orderId": "ALB-2026-001",
  "customerEmail": "customer@example.com",
  "ticketType": "Festival Pass",
  "eventDate": "2026-05-15",
  "venue": "Avalon Ballroom",
  "festivalName": "A Lo Cubano Boulder Fest",
  "checksum": "security_hash",
  "generated": "2024-01-01T12:00:00Z",
  "validUntil": "2026-05-18T23:59:59Z"
}
```

## Integration with Payment System

### Webhook Integration

```javascript
// In your webhook handler
const emailService = require('./lib/email');

// Payment success webhook
app.post('/webhooks/payment-success', async (req, res) => {
  try {
    const paymentData = req.body;
    
    // Send receipt email
    await emailService.sendReceiptEmail({
      orderId: paymentData.orderId,
      customerName: paymentData.customerName,
      customerEmail: paymentData.customerEmail,
      amount: paymentData.amount,
      paymentMethod: paymentData.paymentMethod,
      createdAt: paymentData.createdAt,
      tickets: paymentData.tickets
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send receipt email:', error);
    res.status(500).json({ error: 'Email send failed' });
  }
});

// Payment failure webhook
app.post('/webhooks/payment-failed', async (req, res) => {
  try {
    const { paymentData, error } = req.body;
    
    await emailService.sendPaymentFailureEmail(
      paymentData,
      error.message
    );
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Failed to send failure email:', error);
    res.status(500).json({ error: 'Email send failed' });
  }
});
```

## Performance Considerations

### Email Sending

- **Retry logic** with exponential backoff
- **Rate limiting** to comply with SendGrid limits
- **Batch processing** for bulk emails
- **Connection pooling** for efficiency

### Template Processing

- **Template caching** to avoid recompilation
- **Partial templates** for reusable components
- **Minified HTML** for faster loading
- **Optimized images** and assets

### PDF Generation

- **Efficient rendering** with PDFKit
- **QR code caching** for repeated uses
- **Memory management** for large batches
- **Parallel processing** for multiple tickets

## Error Handling

### Retry Strategy

- **Exponential backoff** for transient failures
- **Circuit breaker** for persistent failures
- **Fallback templates** for template errors
- **Dead letter queue** for failed emails

### Logging and Monitoring

- **Structured logging** with correlation IDs
- **Performance metrics** tracking
- **Error rate monitoring** and alerting
- **Health check endpoints**

## Security

### Email Security

- **Input validation** and sanitization
- **HTML content filtering** to prevent XSS
- **Rate limiting** to prevent abuse
- **Secure headers** in email content

### Ticket Security

- **Cryptographic checksums** for validation
- **Time-based expiration** of QR codes
- **Secure random generation** for ticket IDs
- **Audit logging** for ticket generation

## Testing

Run the examples to test all functionality:

```bash
node lib/email/examples.js
```

### Test Coverage

- **Unit tests** for all core functions
- **Integration tests** with SendGrid
- **Template rendering tests**
- **PDF generation tests**
- **QR code validation tests**

## Deployment

### Production Setup

1. **Environment variables** properly configured
2. **SendGrid account** with sufficient quota
3. **Domain authentication** for better deliverability
4. **SSL certificates** for secure connections
5. **Monitoring** and alerting configured

### Scaling Considerations

- **Horizontal scaling** with multiple instances
- **Queue-based processing** for high volume
- **Template CDN** for faster loading
- **Database connection pooling**

## Support

For questions or issues with the email service:

- **Email**: alocubanoboulderfest@gmail.com
- **Documentation**: Check the examples.js file
- **Configuration**: Review config.js settings
- **Health Check**: Use the built-in health check endpoint

## License

Part of the A Lo Cubano Boulder Fest payment system.