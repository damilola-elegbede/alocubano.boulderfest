# Phase 3.5: Mobile Wallet Integration

## Prerequisites from Phase 3

### Token Security Infrastructure
- ✅ Access Tokens implemented (long-lived, SHA-256 hashed)
- ✅ Action Tokens implemented (single-use, 30-min expiry)
- ✅ Validation Tokens implemented with QR codes
- ✅ HMAC-SHA256 signature generation for tokens
- ✅ Existing QR code generation from token-service.js

### Environment Variables
- ✅ VALIDATION_SECRET configured and secured
  - Used for generating HMAC-SHA256 signatures
  - Stored securely in environment configuration

## Mobile Wallet Integration Objectives

### 1. Existing Token Utilization
- Leverage current token-service.js for QR generation
- Use existing VALIDATION_SECRET for signature generation
- Maintain current security standards

### 2. Wallet Platform Support
- Apple Wallet integration
- Google Pay integration
- Potential PassKit compatibility

### 3. Token Adaptation
- Convert existing validation tokens to wallet-compatible formats
- Maintain cryptographic integrity during conversion
- Preserve existing security characteristics

### 4. User Experience Enhancements
- Seamless ticket transfer to mobile wallets
- One-click wallet addition
- Clear error handling for wallet import

## Implementation Details

### Apple Wallet Pass Generation
```javascript
import * as PKPass from 'passkit-generator';
import * as jwt from 'jsonwebtoken';

async function generateAppleWalletPass(ticketData, userProfile) {
  // Validate input data
  if (!ticketData || !userProfile) {
    throw new Error('Missing required ticket or user information');
  }

  // Generate cryptographically secure serial number
  const serialNumber = crypto.randomUUID();

  // Create Apple Wallet Pass with enhanced security
  const pass = await PKPass.generate({
    model: './templates/ticket-pass.pass',
    certificates: {
      wwdr: process.env.APPLE_WWDR_CERT,
      signerCert: process.env.APPLE_SIGNER_CERT,
      signerKey: process.env.APPLE_SIGNER_KEY,
      signerKeyPassphrase: process.env.APPLE_SIGNER_PASSPHRASE
    },
    overrides: {
      serialNumber: serialNumber,
      description: 'A Lo Cubano Boulder Fest Ticket',
      organizationName: 'A Lo Cubano Events',
      logoText: 'Boulder Fest 2026',
      relevantDate: ticketData.eventDate
    },
    // Dynamic pass data
    fields: {
      primaryFields: [
        { key: 'event', label: 'Event', value: ticketData.eventName }
      ],
      secondaryFields: [
        { key: 'name', label: 'Name', value: userProfile.fullName },
        { key: 'ticket-type', label: 'Type', value: ticketData.ticketType }
      ],
      auxiliaryFields: [
        { key: 'ticket-id', label: 'Ticket #', value: ticketData.ticketId }
      ]
    }
  });

  return { pass, serialNumber };
}
```

### Google Wallet JWT Token Generation
```javascript
import * as jwt from 'jsonwebtoken';

function generateGoogleWalletJWT(ticketData, userProfile) {
  // Validate input data
  if (!ticketData || !userProfile) {
    throw new Error('Missing required ticket or user information');
  }

  // JWT Payload with enhanced event ticket details
  const payload = {
    iss: process.env.GOOGLE_SERVICE_ACCOUNT,
    aud: 'google',
    typ: 'savetobuttonjwt',
    payload: {
      eventTicketClass: {
        id: `${process.env.ISSUER_ID}.${ticketData.ticketId}`,
        eventName: ticketData.eventName,
        venue: ticketData.venue,
        datesAndTimes: {
          start: ticketData.startDateTime,
          end: ticketData.endDateTime
        },
        ticketType: ticketData.ticketType
      },
      eventTicketObject: {
        id: `${process.env.ISSUER_ID}.${ticketData.ticketId}`,
        classId: `${process.env.ISSUER_ID}.${ticketData.eventName}`,
        state: 'active',
        holder: {
          name: userProfile.fullName,
          emailAddress: userProfile.email
        }
      }
    }
  };

  // Sign JWT with secure key
  const token = jwt.sign(payload, process.env.GOOGLE_PRIVATE_KEY, {
    algorithm: 'RS256',
    expiresIn: '1h'  // Short-lived token
  });

  return token;
}
```

### Integration Points
- Use existing `/api/tickets/validate.js` endpoint
- Extend token-service.js to support wallet formats
- Create new wallet-specific validation methods

## Timeline
- Wallet Platform Research: 1 week
- Integration Development: 3 weeks
- Testing and Refinement: 2 weeks

Total Estimated Time: 6 weeks

## Security Considerations
- Maintain existing token validation mechanisms
- Prevent token duplication or transfer
- Implement additional wallet-specific revocation methods
- Short-lived JWT tokens with strict validation
- Cryptographic signing of passes

## Success Criteria
- 100% compatibility with Apple Wallet and Google Pay
- Zero security regressions
- Smooth user experience for ticket wallet import
- Maintaining existing token security standards

## Potential Challenges
- Platform-specific wallet API limitations
- Varying mobile device support
- Maintaining cryptographic integrity during conversion

## Open Questions
- Specific wallet platform requirements
- Additional metadata needed for wallet tokens
- Performance impact of wallet token generation