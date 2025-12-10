# Code Standards

This document defines coding standards and best practices for the A Lo Cubano Boulder Fest codebase.

## Empty String Handling

### The Problem with `|| null`

The pattern `value || null` is problematic because it converts ALL falsy values to null:

```javascript
// These all become null silently
const phone = "";           // Empty form field -> null
const phone = "   ";        // Whitespace only -> null
const phone = undefined;    // Missing field -> null
const phone = null;         // Explicit null -> null
const phone = 0;            // Zero (falsy) -> null
```

This can hide bugs by silently discarding data that should be validated or logged.

### Real-World Bug Scenarios

1. **User submits form with empty phone field**
   - Form validation passes (phone is optional)
   - `phone || null` converts `""` to `null`
   - Database stores `null`
   - Admin sees "no phone provided" - can't distinguish "user left blank" vs "system error"

2. **Stripe webhook has empty `payment_intent`**
   - `session.payment_intent || null` converts `""` to `null`
   - Transaction saved without payment reference
   - Reconciliation fails silently

3. **Audit log with empty `adminUser`**
   - `adminUser || null` stores `null`
   - Security audit can't identify who performed action
   - Compliance violation hidden

### Correct Patterns

Use utility functions from `lib/value-utils.js`:

```javascript
import { optionalField, requiredField, coalesce } from '../lib/value-utils.js';

// For optional fields - trims whitespace, converts empty to null
optionalField(value)

// For required fields - same as optionalField but logs warning when empty
requiredField(value, 'fieldName')

// For selecting first non-empty value from alternatives
coalesce(primaryValue, fallbackValue, secondFallback)
```

### Examples

```javascript
// BEFORE (hides empty strings)
firstName: data.firstName || null,
phone: customerInfo.phone || null,
paymentIntent: session.payment_intent || null,

// AFTER (explicit handling)
firstName: optionalField(data.firstName),
phone: optionalField(customerInfo.phone),
paymentIntent: optionalField(session.payment_intent),

// For required audit fields
adminUser: requiredField(req.admin?.id, 'adminUser'),
sessionId: requiredField(session.id, 'sessionId'),

// For multiple fallback values
email: coalesce(session.customer_details?.email, session.customer_email),
```

### When `|| null` IS Acceptable

The following uses of `|| null` are legitimate and should NOT be converted:

1. **Environment variable defaults**
   ```javascript
   process.env.VAR || null  // Env vars are either set or undefined, not ""
   ```

2. **Cache/Map lookups**
   ```javascript
   cache.get(key) || null      // Cache miss returns undefined, not ""
   myMap.get(id) || null       // Map.get returns undefined for missing keys
   ```

3. **Database row lookups**
   ```javascript
   result.rows[0] || null      // Missing row is undefined, not ""
   ```

4. **Optional chaining on objects (not strings)**
   ```javascript
   obj?.nested?.value || null  // Deep property access, not string data
   ```

5. **Test mocks**
   ```javascript
   vi.fn((key) => storage[key] || null)  // Mimicking storage behavior
   ```

### Available Utilities

#### `optionalField(value, fieldName?)`
Normalizes a value for optional fields:
- Trims strings
- Converts empty strings to null
- Passes through null/undefined as null
- Preserves other falsy values (0, false)

```javascript
optionalField("")           // null
optionalField("  ")         // null (whitespace trimmed)
optionalField("hello")      // "hello"
optionalField(0)            // 0 (preserved)
optionalField(false)        // false (preserved)
optionalField(undefined)    // null
```

#### `requiredField(value, fieldName)`
Same as `optionalField` but logs a warning when the value is empty:

```javascript
requiredField("", "email")  // null, logs warning: "[value-utils] Required field is empty: email"
requiredField("a@b.c", "email")  // "a@b.c"
```

#### `coalesce(...values)`
Returns the first non-empty value:

```javascript
coalesce("", null, "default")  // "default"
coalesce("  ", "fallback")     // "fallback" (whitespace is empty)
coalesce("hello", "world")     // "hello"
coalesce(0, 1)                 // 0 (zero is NOT empty)
```

#### `isEmpty(value)` / `isNotEmpty(value)`
Check if a value is considered "empty":

```javascript
isEmpty("")        // true
isEmpty("  ")      // true (whitespace only)
isEmpty(null)      // true
isEmpty(undefined) // true
isEmpty(0)         // false (zero is NOT empty)
isEmpty(false)     // false (false is NOT empty)
```

#### `normalizeFields(obj, fields)`
Normalize multiple fields at once:

```javascript
const normalized = normalizeFields(data, ['firstName', 'lastName', 'phone']);
// Each specified field is passed through optionalField()
```

### Frontend Usage

For frontend code, use the browser version:

```javascript
import { optionalField } from '/js/lib/value-utils.js';
```

The frontend version has the same API but without server-side logging.

## Summary

| Pattern | When to Use |
|---------|-------------|
| `optionalField(value)` | User input, form data, optional fields |
| `requiredField(value, name)` | Audit trails, compliance data, required fields |
| `coalesce(v1, v2, ...)` | Multiple fallback values |
| `value \|\| null` | Environment vars, cache lookups, database rows |
