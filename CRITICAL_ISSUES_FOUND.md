# Critical Issues Found in Ticket Purchase Flow

## Executive Summary
A comprehensive analysis of the ticket purchase flow from checkout to registration reveals several critical issues, potential race conditions, and areas needing attention. While most critical bugs have been fixed in recent commits, some important improvements remain.

## Flow Overview
1. **Checkout Creation** → 2. **Stripe Payment** → 3. **Webhook/Success Handler** → 4. **Email Sending** → 5. **Registration Page**

---

## 🔴 CRITICAL ISSUES (Already Fixed)

### 1. ✅ SQL Column Mismatch in batch.js
**Location:** `/api/registration/batch.js:178-179`
```javascript
// WRONG - Non-existent columns
SELECT stripe_payment_intent, customer_email FROM tickets
```
**Issue:** Querying non-existent columns `stripe_payment_intent` and `customer_email`
**Fix Applied:** Changed to use `transaction_id` and `attendee_email`

### 2. ✅ Registration URL Format Mismatch
**Location:** Multiple files
- API returns: `/api/registration?token=`
- Frontend expects: `/register-tickets?token=`
**Fix Applied:** Standardized to query parameter format

### 3. ✅ BigInt Conversion Error
**Location:** `/lib/ticket-email-service-brevo.js:167`
**Issue:** Cannot mix BigInt with regular numbers in division
**Fix Applied:** Wrapped with `Number()` conversion

---

## 🟡 IMPORTANT ISSUES (Need Attention)

### 1. ⚠️ Duplicate Ticket Creation Risk
**Location:** Both webhook AND checkout-success create tickets
- `/api/payments/stripe-webhook.js:74-201` - Creates tickets
- `/api/payments/checkout-success.js:276-627` - Also creates tickets

**Impact:** Potential for duplicate tickets if both handlers run
**Recommendation:** Use idempotency checks or single source of truth

### 2. ⚠️ Success Page Redirect Issue
**Location:** `/api/payments/create-checkout-session.js:179`
```javascript
success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`
```
**Issue:** Redirects to `/success` but should be `/pages/core/success.html`
**Impact:** Users may see 404 after successful payment

### 3. ⚠️ Race Condition in Service Initialization
**Multiple Services:** All async services use lazy initialization
**Risk:** Concurrent requests may trigger multiple initializations
**Current Mitigation:** Promise-based singleton pattern (correctly implemented)

### 4. ⚠️ Email Sending Reliability
**Location:** Multiple endpoints
- Brevo API calls have 5-second timeout
- Failed emails go to retry queue
- BUT: No background job to process retry queue
**Impact:** Failed emails may never be sent

### 5. ⚠️ Missing Column in batch.js Query
**Location:** `/api/registration/batch.js:178`
```javascript
SELECT customer_email FROM tickets  // This column doesn't exist
```
**Actual Column:** Should query from transactions table or use `attendee_email`

---

## 🟢 GOOD PRACTICES OBSERVED

### 1. ✅ Proper Transaction Handling
- Using database transactions for atomicity
- Turso batch operations for performance
- Proper rollback on errors

### 2. ✅ Security Measures
- Input sanitization against XSS
- Rate limiting (3 attempts per 15 minutes)
- JWT token validation
- Webhook signature verification

### 3. ✅ Audit Logging
- Comprehensive audit trail for all operations
- Non-blocking audit writes
- Financial event logging for compliance

### 4. ✅ Error Handling
- Graceful degradation when services fail
- Proper error messages to users
- Detailed logging for debugging

---

## 🔵 POTENTIAL IMPROVEMENTS

### 1. Email Retry Processing
**Need:** Background job to process `email_retry_queue` table
```javascript
// Suggested cron job or scheduled function
async function processEmailRetryQueue() {
  const pending = await db.execute(
    "SELECT * FROM email_retry_queue WHERE status = 'pending' AND next_retry_at <= datetime('now')"
  );
  // Process each pending email
}
```

### 2. Deduplication Strategy
**Issue:** Both webhook and checkout-success can create tickets
**Solution Options:**
- Option A: Only create tickets in webhook (most reliable)
- Option B: Check existence before creation in both places
- Option C: Use database constraints to prevent duplicates

### 3. Registration Deadline Enforcement
**Current:** 72-hour deadline set but not strictly enforced everywhere
**Improvement:** Consistent deadline checking across all registration endpoints

### 4. Order Number Generation
**Current:** Generates order number in multiple places
**Better:** Single source of truth for order number generation

---

## 📊 Data Flow Analysis

### Successful Payment Flow:
1. **Stripe Checkout Session** created with `customer_creation: 'always'`
2. **User pays** → Stripe redirects to `/success?session_id=`
3. **Two parallel processes:**
   - Webhook receives `checkout.session.completed`
   - Success page calls `/api/payments/checkout-success`
4. **Both attempt to:**
   - Create transaction record
   - Generate tickets
   - Send Brevo email
5. **Idempotency relies on:**
   - Checking existing transaction by session_id
   - Database constraints on unique fields

### Email Flow:
1. **Stripe** sends automatic receipt (via `customer_creation: 'always'`)
2. **Brevo** sends registration invitation with token
3. **On failure:** Queued to `email_retry_queue`
4. **Missing:** Processor for retry queue

---

## 🚨 IMMEDIATE ACTIONS RECOMMENDED

1. **Fix success URL redirect** in create-checkout-session.js
2. **Implement email retry processor** (cron job or scheduled function)
3. **Choose single source** for ticket creation (webhook OR success handler)
4. **Fix batch.js** to not query non-existent `customer_email` from tickets
5. **Add monitoring** for failed email sends and retry queue growth

---

## 🔍 Testing Recommendations

### Critical Test Scenarios:
1. **Concurrent requests** to checkout-success with same session_id
2. **Webhook retry** from Stripe (ensure idempotency)
3. **Email failure** and retry queue processing
4. **Registration after 72-hour deadline**
5. **Batch registration** with mixed valid/invalid tickets
6. **Network timeout** during Brevo email send

### Load Testing:
- Multiple users completing checkout simultaneously
- Stripe webhook retries under load
- Database connection pool exhaustion
- Email service rate limiting

---

## 📝 Code Quality Observations

### Positive:
- Good use of TypeScript-like JSDoc comments
- Comprehensive error messages
- Proper async/await usage
- Transaction rollback on failures

### Areas for Improvement:
- Some duplicate code between webhook and checkout-success
- Complex nested try-catch blocks could be simplified
- Magic numbers (72 hours, 5 seconds) should be config constants
- Some SQL queries could use prepared statements

---

## 🎯 Conclusion

The ticket purchase flow is largely functional with proper security and audit measures in place. The critical SQL bugs have been fixed, but attention is needed for:
1. Preventing duplicate ticket creation
2. Processing failed email retries
3. Fixing the success page redirect URL
4. Ensuring all SQL queries reference correct columns

The system shows good architectural patterns with room for optimization in email reliability and deduplication strategies.