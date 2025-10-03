# Donations System

## Overview

The donations system provides integrated donation collection alongside ticket purchases, with comprehensive tracking, analytics, and email acknowledgment. Donors can contribute flexible amounts through the same cart and checkout flow as ticket purchases.

## Architecture

### System Components

```text
┌─────────────────────────────────────────────────────────────┐
│                    Donations Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. User Interface (pages/core/donations.html)               │
│     ├── Preset amounts ($5, $10, $20, $50)                   │
│     ├── Custom amount input                                  │
│     └── Add to cart button                                   │
│                                                              │
│  2. Cart Integration (js/donation-selection.js)              │
│     ├── Validate donation amount                            │
│     ├── Create cart item                                    │
│     └── Add to floating cart                                │
│                                                              │
│  3. Payment Processing (api/payments/)                       │
│     ├── Create Stripe Checkout Session                      │
│     ├── Process donation with tickets                       │
│     └── Handle webhook confirmation                         │
│                                                              │
│  4. Transaction Recording (lib/transaction-service.js)       │
│     ├── Create transaction record                           │
│     ├── Record donation items                               │
│     └── Track donation metadata                             │
│                                                              │
│  5. Email Confirmation (lib/ticket-email-service-brevo.js)   │
│     ├── Include donation in receipt                         │
│     ├── Acknowledgment message                              │
│     └── Tax receipt information                             │
│                                                              │
│  6. Admin Dashboard (pages/admin/donations.html)             │
│     ├── View all donations                                   │
│     ├── Filter by date, amount, status                       │
│     └── Analytics and reporting                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Features

### User-Facing Features

#### 1. Flexible Donation Amounts

**Preset Amounts**:
- $5 - Community Supporter
- $10 - Festival Friend
- $20 - Dance Enthusiast
- $50 - Cultural Patron

**Custom Amounts**:
- Minimum: $1.00
- Maximum: $10,000.00
- Validation for reasonable amounts
- Real-time validation feedback

#### 2. Cart Integration

Donations integrate seamlessly with ticket purchases:

```javascript
// Donation item structure
{
  id: "donation-{timestamp}",
  type: "donation",
  ticketType: "donation",
  name: "Donation",
  price: amount, // in dollars
  quantity: 1,
  isDonation: true
}
```

**Cart Behavior**:
- Donations appear with "Donation" label
- Can be combined with ticket purchases
- Support multiple donations in single order
- Processed through same Stripe checkout

#### 3. Email Acknowledgment

Donation confirmations include:
- Thank you message in order confirmation
- Donation amount and date
- Tax receipt information (if applicable)
- Festival impact statement

**Email Template Fields**:
```javascript
{
  hasDonations: boolean,
  donationCount: number,
  donationTotal: string, // formatted currency
  donationMessage: string
}
```

### Admin Features

#### 1. Donations Dashboard

**Location**: `/admin/donations`

**Features**:
- View all donations in chronological order
- Filter by date range, amount, status
- Search by donor email or transaction ID
- Export donations for reporting

**API Endpoint**: `GET /api/admin/donations`

**Query Parameters**:
```javascript
{
  startDate: "YYYY-MM-DD", // Optional
  endDate: "YYYY-MM-DD",   // Optional
  minAmount: number,        // Optional
  maxAmount: number,        // Optional
  status: "completed|pending|refunded" // Optional
}
```

**Response**:
```json
{
  "donations": [
    {
      "id": 123,
      "transaction_id": 456,
      "order_number": "ALO-2026-0042",
      "amount": 50.00,
      "donor_email": "donor@example.com",
      "donor_name": "Jane Doe",
      "created_at": "2026-01-15T10:30:00Z",
      "created_at_mt": "Jan 15, 2026, 3:30 AM MST",
      "status": "completed",
      "payment_method": "card",
      "stripe_payment_intent": "pi_xxx"
    }
  ],
  "summary": {
    "total_amount": 1250.00,
    "count": 25,
    "average_amount": 50.00,
    "largest_donation": 500.00,
    "smallest_donation": 5.00
  }
}
```

#### 2. Analytics

**Dashboard Metrics**:
- Total donations (all-time)
- Donations this month
- Average donation amount
- Donor count
- Donation distribution by amount

**Reporting**:
- Monthly donation reports
- Donor acknowledgment lists
- Tax receipt preparation data
- Festival funding impact

## Database Schema

### Donations Table

```sql
CREATE TABLE donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',
  donor_email TEXT,
  donor_name TEXT,
  message TEXT,
  is_anonymous BOOLEAN DEFAULT FALSE,
  is_tax_deductible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE INDEX idx_donations_transaction ON donations(transaction_id);
CREATE INDEX idx_donations_email ON donations(donor_email);
CREATE INDEX idx_donations_created ON donations(created_at);
CREATE INDEX idx_donations_status ON donations(status);
```

### Transaction Items

Donations are also recorded in `transaction_items`:

```sql
INSERT INTO transaction_items (
  transaction_id,
  ticket_type_id,
  quantity,
  price_cents,
  item_type
) VALUES (
  ?,
  NULL, -- No ticket type for donations
  1,
  ? * 100, -- Convert dollars to cents
  'donation'
);
```

## Implementation Details

### Frontend (js/donation-selection.js)

```javascript
class DonationSelection {
  constructor(cartManager) {
    this.cartManager = cartManager;
    this.initializeEventListeners();
  }

  addDonation(amount) {
    // Validate amount
    if (amount < 1 || amount > 10000) {
      throw new Error('Invalid donation amount');
    }

    // Create donation item
    const donationItem = {
      id: `donation-${Date.now()}`,
      type: 'donation',
      ticketType: 'donation',
      name: 'Donation',
      price: amount,
      quantity: 1,
      isDonation: true
    };

    // Add to cart
    this.cartManager.addItem(donationItem);
  }
}
```

### Backend (api/admin/donations.js)

```javascript
export default async function handler(req, res) {
  // Verify admin authentication
  const session = await verifyAdminSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Get database client
  const client = await getDatabaseClient();

  // Query donations with transaction info
  const donations = await client.execute(`
    SELECT
      d.*,
      t.order_number,
      t.customer_email as donor_email,
      t.stripe_payment_intent
    FROM donations d
    JOIN transactions t ON d.transaction_id = t.id
    WHERE t.created_at >= ? AND t.created_at <= ?
    ORDER BY d.created_at DESC
  `, [startDate, endDate]);

  // Calculate summary statistics
  const summary = {
    total_amount: donations.rows.reduce((sum, d) => sum + d.amount, 0),
    count: donations.rows.length,
    average_amount: donations.rows.length > 0
      ? donations.rows.reduce((sum, d) => sum + d.amount, 0) / donations.rows.length
      : 0
  };

  res.json({ donations: donations.rows, summary });
}
```

### Email Templates (lib/ticket-email-service-brevo.js)

```javascript
prepareDonationData(transaction, tickets) {
  const donations = tickets.filter(t => t.isDonation);

  if (donations.length === 0) {
    return {
      hasDonations: false,
      donationCount: 0,
      donationTotal: '$0.00'
    };
  }

  const donationTotal = donations.reduce((sum, d) => sum + d.price, 0);

  return {
    hasDonations: true,
    donationCount: donations.length,
    donationTotal: `$${donationTotal.toFixed(2)}`,
    donationMessage: this.getDonationThankYouMessage(donationTotal)
  };
}

getDonationThankYouMessage(amount) {
  if (amount >= 100) {
    return "Your extraordinary generosity helps us bring authentic Cuban culture to our community!";
  } else if (amount >= 50) {
    return "Thank you for your wonderful support of Cuban salsa culture!";
  } else {
    return "Every donation helps us celebrate and share Cuban salsa!";
  }
}
```

## Configuration

### Environment Variables

No additional environment variables required - donations use existing Stripe configuration.

### Stripe Configuration

Donations use the same Stripe setup as ticket purchases:
- Same Stripe account and API keys
- Same webhook endpoint
- Same checkout session flow
- Same tax and receipt handling

## Security Considerations

### Validation

**Amount Validation**:
- Minimum: $1.00
- Maximum: $10,000.00
- Server-side validation in addition to client-side
- Protection against negative amounts

**Request Validation**:
- CSRF token validation
- Admin authentication for dashboard
- Rate limiting on donation submissions

### Fraud Prevention

**Stripe Features**:
- Radar fraud detection
- 3D Secure for large donations
- Blocked card database
- Velocity checks

**Internal Monitoring**:
- Track unusual donation patterns
- Alert on large or suspicious donations
- Review anonymous donations
- Monitor refund requests

## Testing

### Unit Tests

```javascript
describe('Donation System', () => {
  it('validates donation amounts', () => {
    expect(() => addDonation(0)).toThrow();
    expect(() => addDonation(-5)).toThrow();
    expect(() => addDonation(15000)).toThrow();
    expect(() => addDonation(25)).not.toThrow();
  });

  it('creates donation cart items correctly', () => {
    const item = createDonationItem(50);
    expect(item.type).toBe('donation');
    expect(item.price).toBe(50);
    expect(item.isDonation).toBe(true);
  });
});
```

### E2E Tests

```javascript
test('complete donation flow', async ({ page }) => {
  await page.goto('/donations');
  await page.click('[data-amount="25"]');
  await expect(page.locator('.cart-count')).toHaveText('1');

  // Continue through checkout
  await page.click('.checkout-button');
  // ... complete Stripe checkout

  // Verify email includes donation
  const email = await getLastEmail();
  expect(email.body).toContain('Thank you for your donation');
});
```

## Future Enhancements

### Planned Features

1. **Recurring Donations**
   - Monthly recurring support
   - Stripe subscription integration
   - Donor management dashboard

2. **Donor Recognition**
   - Public donor wall (with permission)
   - Donor tiers and benefits
   - Commemorative acknowledgments

3. **Campaign Support**
   - Specific fundraising campaigns
   - Goal tracking and progress bars
   - Campaign-specific messaging

4. **Enhanced Reporting**
   - Tax receipt generation
   - Annual donor statements
   - Impact reporting for donors

## Troubleshooting

### Common Issues

**Issue**: Donation not appearing in cart
- **Cause**: Amount validation failure
- **Solution**: Check amount is between $1 and $10,000

**Issue**: Donation not recorded in database
- **Cause**: Transaction creation failure
- **Solution**: Check transaction service logs for errors

**Issue**: Email doesn't include donation acknowledgment
- **Cause**: Email template data not prepared correctly
- **Solution**: Verify `hasDonations` flag is set in email data

## Support

For donations system issues:
- Check admin dashboard for transaction status
- Review Stripe dashboard for payment details
- Check email service logs for delivery issues
- Contact: alocubanoboulderfest@gmail.com

## Related Documentation

- [Payment Processing](PAYMENT_FLOW.md) - Complete payment architecture
- [Email System](EMAIL_SYSTEM.md) - Email template and delivery system
- [Admin Dashboard](ADMIN_DASHBOARD.md) - Admin panel features
- [API Documentation](api/README.md) - Complete API reference
