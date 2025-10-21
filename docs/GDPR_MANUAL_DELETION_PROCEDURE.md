# GDPR Manual Data Deletion Procedure

**Version**: 1.0
**Last Updated**: 2025-01-20
**Owner**: Festival Operations Team

---

## Overview

This document outlines the manual process for handling GDPR data deletion requests from customers. While the backend code supports automated deletion (`lib/gdpr-compliance-service.js`), we currently process requests manually via email.

## Legal Requirements

- **Response Time**: Must respond within **30 days** of receiving request
- **Applicable Law**: GDPR Article 17 (Right to Erasure)
- **Geographic Scope**: All customers, regardless of location
- **Retention Exceptions**: Financial records must be kept for **7 years** for tax compliance

---

## Customer Request Process

### How Customers Request Deletion

Customers can email: **alocubanoboulderfest@gmail.com**

**Email Template for Customers:**
```
Subject: GDPR Data Deletion Request

I would like to request deletion of my personal data under GDPR Article 17.

My details:
- Email used for ticket purchase: [email]
- Ticket ID (if known): [ticket ID]
- Purchase date (approximate): [date]

Signature: [Full Name]
```

---

## Admin Processing Steps

### Step 1: Verify Customer Identity

**Timeline**: Within 2 business days

1. Reply to customer email acknowledging receipt
2. Request verification if needed:
   - Last 4 digits of payment card
   - Order confirmation number
   - Approximate purchase date

**Email Template - Acknowledgement:**
```
Subject: Re: GDPR Data Deletion Request

Dear [Name],

We have received your data deletion request dated [date].

To process your request, please confirm:
- Email used for purchase: [email from request]
- Last 4 digits of payment method: ____
- Approximate purchase date: ____

We will process your request within 30 days as required by GDPR.

Best regards,
A Lo Cubano Boulder Fest Team
```

### Step 2: Check Retention Obligations

**Before deleting, verify:**

```sql
-- Check if financial records are less than 7 years old
SELECT
    t.transaction_id,
    t.customer_email,
    t.created_at,
    (julianday('now') - julianday(t.created_at)) / 365.25 as years_old
FROM transactions t
WHERE t.customer_email = 'customer@example.com';
```

**If transaction is < 7 years old:**
- Do NOT delete financial records (legal requirement)
- Only anonymize personal identifiers
- Inform customer of partial deletion

### Step 3: Execute Data Deletion

**Timeline**: Within 25 days of receipt

#### Option A: Full Deletion (No Financial Records or >7 Years Old)

```sql
-- Log into Turso database
turso db shell [your-database-name]

-- Verify records exist
SELECT * FROM registrations WHERE email = 'customer@example.com';
SELECT * FROM transactions WHERE customer_email = 'customer@example.com';

-- Delete registration data
UPDATE registrations
SET first_name = 'ERASED',
    last_name = 'ERASED',
    email = 'erased@deleted.local',
    phone_number = NULL,
    accessibility_needs = NULL,
    notes = NULL
WHERE email = 'customer@example.com';

-- Verify deletion
SELECT * FROM registrations WHERE first_name = 'ERASED' AND last_name = 'ERASED';
```

#### Option B: Partial Deletion (Financial Records Must Be Kept)

```sql
-- Anonymize personal data but keep financial records intact
UPDATE registrations
SET first_name = 'ERASED',
    last_name = 'ERASED',
    email = 'erased@deleted.local',
    phone_number = NULL,
    accessibility_needs = NULL,
    notes = NULL
WHERE email = 'customer@example.com';

-- Anonymize transaction customer info (keep financial data)
UPDATE transactions
SET customer_email = 'erased@deleted.local',
    order_data = json_set(
        order_data,
        '$.customerName', 'ERASED',
        '$.customerEmail', 'erased@deleted.local'
    )
WHERE customer_email = 'customer@example.com';

-- Financial amounts, dates, and transaction IDs remain for tax compliance
```

### Step 4: Document the Deletion

**Create audit record:**

1. Save email thread to: `gdpr-requests/[YYYY-MM]/[ticket-id]-deletion.txt`
2. Record in spreadsheet:
   - Date received
   - Customer email
   - Ticket ID
   - Date processed
   - Type (full/partial)
   - Processed by (your name)

### Step 5: Confirm with Customer

**Timeline**: Within 30 days of receipt

**Email Template - Full Deletion:**
```
Subject: Your GDPR Data Deletion Request - Completed

Dear [Name],

Your data deletion request has been processed successfully.

What was deleted:
✓ Name (first and last)
✓ Email address
✓ Phone number
✓ Accessibility needs
✓ Any notes or comments

Your personal data has been permanently erased from our systems as of [date].

If you have any questions, please contact us at alocubanoboulderfest@gmail.com.

Best regards,
A Lo Cubano Boulder Fest Team
```

**Email Template - Partial Deletion:**
```
Subject: Your GDPR Data Deletion Request - Partially Completed

Dear [Name],

Your data deletion request has been processed.

What was deleted:
✓ Name (anonymized to "ERASED")
✓ Email address (anonymized)
✓ Phone number
✓ Accessibility needs
✓ Any notes or comments

What was retained (legal requirement):
⚠ Financial transaction records (amount, date, transaction ID)
⚠ Reason: Tax law requires we retain financial records for 7 years

These records contain no personally identifiable information and will be
automatically deleted after the 7-year retention period on [date].

If you have any questions, please contact us at alocubanoboulderfest@gmail.com.

Best regards,
A Lo Cubano Boulder Fest Team
```

---

## Quick Reference SQL Commands

### Find Customer Data
```sql
-- Find all registrations for an email
SELECT * FROM registrations WHERE email = 'customer@example.com';

-- Find all transactions for an email
SELECT * FROM transactions WHERE customer_email = 'customer@example.com';

-- Find by ticket ID
SELECT * FROM registrations WHERE ticket_id = 'TICKET_12345';
```

### Anonymize Personal Data
```sql
-- Registration data (use customer email)
UPDATE registrations
SET first_name = 'ERASED',
    last_name = 'ERASED',
    email = 'erased@deleted.local',
    phone_number = NULL,
    accessibility_needs = NULL,
    notes = NULL
WHERE email = 'customer@example.com';

-- Transaction data (if no retention obligations)
UPDATE transactions
SET customer_email = 'erased@deleted.local'
WHERE customer_email = 'customer@example.com';
```

### Verify Deletion
```sql
-- Should return records with ERASED values
SELECT * FROM registrations WHERE email = 'erased@deleted.local';

-- Original email should return no results
SELECT * FROM registrations WHERE email = 'customer@example.com';
```

---

## Database Access

### Turso CLI Method
```bash
# Install Turso CLI (if not already installed)
curl -sSfL https://get.tur.so/install.sh | bash

# Login
turso auth login

# List databases
turso db list

# Connect to shell
turso db shell [database-name]

# Run SQL commands interactively
```

### Turso Dashboard Method
1. Go to https://turso.tech/app
2. Select your database
3. Click "SQL Editor" tab
4. Run SQL commands
5. Click "Run" to execute

---

## Troubleshooting

### Error: "No rows updated"
**Cause**: Email address doesn't match exactly (case sensitivity, spaces)

**Solution**:
```sql
-- Find with case-insensitive search
SELECT * FROM registrations WHERE LOWER(email) = LOWER('Customer@Example.com');

-- Use the exact email from results
```

### Error: "FOREIGN KEY constraint failed"
**Cause**: Trying to delete records with dependencies

**Solution**: Use UPDATE to anonymize instead of DELETE

### Customer Says "I Want Everything Deleted"
**Response**: Explain legal requirements
- Financial records legally required for 7 years
- All personal identifiers removed
- No way to link records back to them

---

## Compliance Checklist

Before marking a deletion request as complete:

- [ ] Customer identity verified
- [ ] Checked retention obligations (7-year rule)
- [ ] Executed SQL deletion/anonymization
- [ ] Verified records updated (email = 'erased@deleted.local')
- [ ] Documented in audit log/spreadsheet
- [ ] Responded to customer within 30 days
- [ ] Saved email thread to gdpr-requests folder

---

## Future Automation

The backend code (`lib/gdpr-compliance-service.js`) supports automated deletion. If manual processing becomes burdensome, consider implementing:

1. **Self-service portal**: `/data-request` page for customers
2. **Admin dashboard**: `/admin/gdpr-requests` to process requests
3. **Automated emails**: Confirmation and completion notifications
4. **Audit trail**: Automatic logging of all deletions

Estimated implementation: 4-6 hours

---

## Questions or Issues

Contact: **alocubanoboulderfest@gmail.com**

**This procedure must be followed for all deletion requests to ensure GDPR compliance.**
