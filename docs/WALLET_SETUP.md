# Wallet Pass Configuration Guide

## Overview

The A Lo Cubano Boulder Fest platform supports both Apple Wallet and Google Wallet passes, allowing attendees to add their tickets directly to their mobile wallets. This guide covers the complete setup process, from certificate generation to testing and deployment.

## Architecture Overview

### Wallet Pass Flow

1. **Ticket Purchase** → Transaction created with unique ticket ID
2. **Pass Generation** → Dynamic pass creation with ticket details
3. **Wallet Integration** → Platform-specific pass delivery
4. **Pass Updates** → Real-time status updates and notifications

### Supported Platforms

- **Apple Wallet** (iOS): `.pkpass` files with certificate signing
- **Google Wallet** (Android): Web-based pass URLs with JWT authentication

## Apple Wallet Setup

### Prerequisites

- Apple Developer Account ($99/year)
- Pass Type ID certificate
- OpenSSL or similar certificate tools
- Access to Apple Developer Portal

### Step 1: Create Pass Type ID

1. **Login to Apple Developer Portal**
   - Navigate to [developer.apple.com](https://developer.apple.com)
   - Go to "Certificates, Identifiers & Profiles"

2. **Create New Identifier**
   ```
   Type: Pass Type IDs
   Description: A Lo Cubano Boulder Fest Tickets
   Identifier: pass.com.alocubano.boulderfest.tickets
   ```

3. **Enable Pass Type ID**
   - Select your new Pass Type ID
   - Click "Edit" and enable it

### Step 2: Generate Pass Certificate

1. **Create Certificate Signing Request (CSR)**
   ```bash
   # Generate private key
   openssl genrsa -out pass_private.key 2048

   # Create CSR
   openssl req -new -key pass_private.key -out pass.csr \
     -subj "/C=US/ST=Colorado/L=Boulder/O=A Lo Cubano Boulder Fest/CN=pass.com.alocubano.boulderfest.tickets"
   ```

2. **Upload CSR to Apple Developer Portal**
   - Go to "Certificates" section
   - Click "+" to create new certificate
   - Select "Pass Type ID Certificate"
   - Choose your Pass Type ID
   - Upload the `pass.csr` file

3. **Download and Install Certificate**
   ```bash
   # Download pass_certificate.cer from Apple
   # Convert to PEM format
   openssl x509 -inform der -in pass_certificate.cer -out pass_certificate.pem

   # Combine certificate and private key
   cat pass_certificate.pem pass_private.key > apple_pass_certificate.pem
   ```

### Step 3: Environment Configuration

Add these variables to your `.env.local`:

```bash
# Apple Wallet Configuration
APPLE_PASS_TYPE_ID=pass.com.alocubano.boulderfest.tickets
APPLE_TEAM_ID=YOUR_TEAM_ID
APPLE_PASS_KEY=base64_encoded_certificate_and_key

# Wallet Authentication
WALLET_AUTH_SECRET=your-32-character-secret-key
```

### Step 4: Certificate Encoding

```bash
# Base64 encode the certificate for environment variable
base64 -i apple_pass_certificate.pem -o apple_pass_certificate.base64

# Copy the base64 content to APPLE_PASS_KEY environment variable
cat apple_pass_certificate.base64
```

## Google Wallet Setup

### Prerequisites

- Google Cloud Platform account
- Google Wallet API access
- Service account with proper permissions

### Step 1: Enable Google Wallet API

1. **Create or Select GCP Project**
   ```bash
   gcloud projects create alocubano-wallet-passes
   gcloud config set project alocubano-wallet-passes
   ```

2. **Enable Required APIs**
   ```bash
   gcloud services enable walletobjects.googleapis.com
   gcloud services enable servicemanagement.googleapis.com
   ```

### Step 2: Create Service Account

1. **Create Service Account**
   ```bash
   gcloud iam service-accounts create wallet-pass-service \
     --description="Service account for Google Wallet passes" \
     --display-name="Wallet Pass Service"
   ```

2. **Grant Required Permissions**
   ```bash
   gcloud projects add-iam-policy-binding alocubano-wallet-passes \
     --member="serviceAccount:wallet-pass-service@alocubano-wallet-passes.iam.gserviceaccount.com" \
     --role="roles/walletobjects.admin"
   ```

3. **Generate Service Account Key**
   ```bash
   gcloud iam service-accounts keys create wallet-service-key.json \
     --iam-account=wallet-pass-service@alocubano-wallet-passes.iam.gserviceaccount.com
   ```

### Step 3: Environment Configuration

```bash
# Google Wallet Configuration
GOOGLE_WALLET_ISSUER_ID=your_issuer_id_from_google_wallet_console
GOOGLE_WALLET_APPLICATION_NAME=A Lo Cubano Boulder Fest
GOOGLE_WALLET_SERVICE_ACCOUNT_KEY=base64_encoded_service_account_json
```

### Step 4: Service Account Key Encoding

```bash
# Base64 encode the service account key
base64 -i wallet-service-key.json -o wallet-service-key.base64

# Copy to environment variable
cat wallet-service-key.base64
```

## Branding Image Requirements

### Image Specifications

Both wallet platforms require specific image assets for branding:

#### Apple Wallet Images

```
logo.png         - 160x50px   (320x100px @2x, 480x150px @3x)
logo@2x.png      - 320x100px
logo@3x.png      - 480x150px
icon.png         - 29x29px    (58x58px @2x, 87x87px @3x)
icon@2x.png      - 58x58px
icon@3x.png      - 87x87px
background.png   - 180x220px  (360x440px @2x, 540x660px @3x)
background@2x.png - 360x440px
background@3x.png - 540x660px
```

#### Google Wallet Images

```
hero_image.jpg   - 1032x336px minimum
logo.png         - 640x246px maximum
```

### Image Preparation

```bash
# Create images directory
mkdir -p public/images/wallet

# Optimize images for wallet passes
# Use ImageMagick or similar tool
convert festival_logo.png -resize 160x50 public/images/wallet/logo.png
convert festival_logo.png -resize 320x100 public/images/wallet/logo@2x.png
convert festival_logo.png -resize 480x150 public/images/wallet/logo@3x.png

convert festival_icon.png -resize 29x29 public/images/wallet/icon.png
convert festival_icon.png -resize 58x58 public/images/wallet/icon@2x.png
convert festival_icon.png -resize 87x87 public/images/wallet/icon@3x.png
```

### Image Configuration

Add image paths to wallet configuration:

```javascript
// Apple Wallet pass template
const passTemplate = {
  passTypeIdentifier: process.env.APPLE_PASS_TYPE_ID,
  teamIdentifier: process.env.APPLE_TEAM_ID,
  images: {
    logo: '/images/wallet/logo.png',
    icon: '/images/wallet/icon.png',
    background: '/images/wallet/background.png'
  }
};

// Google Wallet pass template
const googlePassTemplate = {
  heroImage: {
    sourceUri: {
      uri: 'https://yourdomain.com/images/wallet/hero_image.jpg'
    }
  },
  logo: {
    sourceUri: {
      uri: 'https://yourdomain.com/images/wallet/logo.png'
    }
  }
};
```

## Complete Environment Variables

### Required Variables

```bash
# Apple Wallet
APPLE_PASS_TYPE_ID=pass.com.alocubano.boulderfest.tickets
APPLE_TEAM_ID=YOUR_APPLE_TEAM_ID
APPLE_PASS_KEY=base64_encoded_certificate_and_private_key

# Google Wallet
GOOGLE_WALLET_ISSUER_ID=your_google_wallet_issuer_id
GOOGLE_WALLET_APPLICATION_NAME=A Lo Cubano Boulder Fest
GOOGLE_WALLET_SERVICE_ACCOUNT_KEY=base64_encoded_service_account_json

# Wallet Authentication (shared)
WALLET_AUTH_SECRET=minimum-32-character-secret-for-jwt-signing

# Optional: Wallet Pass Customization
WALLET_PASS_BACKGROUND_COLOR=#ce1126
WALLET_PASS_FOREGROUND_COLOR=#ffffff
WALLET_PASS_LABEL_COLOR=#002868
```

### Optional Variables

```bash
# Wallet Pass URLs (auto-detected if not set)
APPLE_WALLET_PASS_URL=https://yourdomain.com/api/tickets/apple-wallet
GOOGLE_WALLET_PASS_URL=https://yourdomain.com/api/tickets/google-wallet

# Debug settings
WALLET_DEBUG_MODE=true  # Enables verbose logging
WALLET_TEST_MODE=true   # Uses test certificates/keys
```

## Testing Wallet Passes

### Apple Wallet Testing

1. **Install iOS Simulator**
   ```bash
   # Install Xcode Command Line Tools
   xcode-select --install
   ```

2. **Test Pass Generation**
   ```bash
   # Generate test pass
   curl -X GET "http://localhost:3000/api/tickets/apple-wallet/TEST-TICKET-123" \
        -o test_ticket.pkpass

   # Validate pass structure
   unzip -l test_ticket.pkpass
   ```

3. **Pass Validation**
   ```bash
   # Check pass signature
   openssl smime -verify -in test_ticket.pkpass -inform DER \
     -CAfile AppleIncRootCertificate.cer -purpose any
   ```

### Google Wallet Testing

1. **Test Pass URL Generation**
   ```bash
   # Get Google Wallet URL
   curl -X GET "http://localhost:3000/api/tickets/google-wallet/TEST-TICKET-123"

   # Response should contain save URL
   {
     "url": "https://pay.google.com/gp/v/save/..."
   }
   ```

2. **Validate JWT Token**
   ```javascript
   // Decode the JWT payload
   const jwt = require('jsonwebtoken');
   const token = 'eyJhbGciOiJSUzI1NiIs...'; // From the save URL
   const decoded = jwt.decode(token);
   console.log('Pass data:', decoded);
   ```

### End-to-End Testing

```javascript
// Test complete wallet flow
describe('Wallet Pass Integration', () => {
  test('should generate Apple Wallet pass', async () => {
    const response = await fetch(`/api/tickets/apple-wallet/${ticketId}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/vnd.apple.pkpass');
  });

  test('should generate Google Wallet URL', async () => {
    const response = await fetch(`/api/tickets/google-wallet/${ticketId}`);
    const data = await response.json();
    expect(data.url).toContain('pay.google.com');
  });
});
```

## Troubleshooting

### Common Apple Wallet Issues

**Issue**: "Certificate verification failed"
```bash
# Verify certificate chain
openssl verify -CAfile AppleWWDRCA.cer pass_certificate.pem

# Check certificate expiration
openssl x509 -in pass_certificate.pem -text -noout | grep "Not After"
```

**Issue**: "Pass Type ID mismatch"
- Ensure `APPLE_PASS_TYPE_ID` matches the certificate
- Verify Pass Type ID is enabled in Apple Developer Portal

**Issue**: "Invalid signature"
```bash
# Re-generate certificate with correct private key
openssl pkcs12 -in certificate.p12 -out certificate.pem -nodes
```

### Common Google Wallet Issues

**Issue**: "Service account authentication failed"
```bash
# Test service account key
gcloud auth activate-service-account --key-file=wallet-service-key.json
gcloud auth list
```

**Issue**: "Issuer ID not found"
- Check Google Wallet Console for correct issuer ID
- Ensure API is enabled for your project

**Issue**: "JWT signing failed"
```javascript
// Verify service account key format
const serviceAccount = JSON.parse(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY);
console.log('Service account email:', serviceAccount.client_email);
```

### Debug Mode

Enable debug logging for wallet operations:

```bash
# Enable wallet debugging
WALLET_DEBUG_MODE=true
NODE_ENV=development

# Check logs for detailed error information
npm run vercel:dev
```

## Security Best Practices

### Certificate Management

1. **Secure Storage**
   - Store certificates in environment variables, not in code
   - Use base64 encoding for multi-line certificates
   - Rotate certificates before expiration

2. **Access Control**
   - Limit certificate access to production servers only
   - Use separate certificates for development/testing
   - Monitor certificate usage and expiration

### JWT Security

```javascript
// Secure JWT configuration
const jwtOptions = {
  algorithm: 'HS256',
  expiresIn: '1h',          // Short expiration for security
  issuer: 'alocubano.boulderfest',
  audience: 'wallet-pass'
};

// Sign pass tokens securely
const passToken = jwt.sign(ticketData, process.env.WALLET_AUTH_SECRET, jwtOptions);
```

### API Security

```javascript
// Validate requests for wallet passes
app.get('/api/tickets/apple-wallet/:ticketId', async (req, res) => {
  // Verify ticket ownership
  const ticket = await validateTicketAccess(req.params.ticketId, req.user);

  if (!ticket) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  // Generate pass with rate limiting
  const pass = await generateAppleWalletPass(ticket);
  res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
  res.send(pass);
});
```

## Performance Optimization

### Pass Caching

```javascript
// Cache generated passes to improve performance
const passCache = new Map();

async function getCachedPass(ticketId, platform) {
  const cacheKey = `${platform}-${ticketId}`;

  if (passCache.has(cacheKey)) {
    const cached = passCache.get(cacheKey);
    if (Date.now() - cached.timestamp < 3600000) { // 1 hour
      return cached.pass;
    }
  }

  const pass = await generatePass(ticketId, platform);
  passCache.set(cacheKey, {
    pass,
    timestamp: Date.now()
  });

  return pass;
}
```

### Image Optimization

```javascript
// Optimize images for wallet passes
const sharp = require('sharp');

async function optimizeWalletImage(inputPath, outputPath, width, height) {
  await sharp(inputPath)
    .resize(width, height, {
      fit: 'cover',
      position: 'center'
    })
    .png({
      quality: 80,
      progressive: true
    })
    .toFile(outputPath);
}
```

## Monitoring and Analytics

### Pass Generation Metrics

```javascript
// Track wallet pass usage
const passMetrics = {
  appleWalletGenerated: 0,
  googleWalletGenerated: 0,
  passErrors: 0,
  totalRequests: 0
};

function trackPassGeneration(platform, success) {
  passMetrics.totalRequests++;

  if (success) {
    if (platform === 'apple') {
      passMetrics.appleWalletGenerated++;
    } else if (platform === 'google') {
      passMetrics.googleWalletGenerated++;
    }
  } else {
    passMetrics.passErrors++;
  }
}
```

### Health Monitoring

```javascript
// Wallet service health check
app.get('/api/health/wallet', async (req, res) => {
  const health = {
    appleWallet: {
      certificate: !!process.env.APPLE_PASS_KEY,
      passTypeId: !!process.env.APPLE_PASS_TYPE_ID,
      teamId: !!process.env.APPLE_TEAM_ID
    },
    googleWallet: {
      serviceAccount: !!process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_KEY,
      issuerId: !!process.env.GOOGLE_WALLET_ISSUER_ID
    },
    status: 'healthy'
  };

  if (!health.appleWallet.certificate || !health.googleWallet.serviceAccount) {
    health.status = 'degraded';
  }

  res.json(health);
});
```

## Deployment Checklist

### Pre-Deployment

- [ ] Apple Developer certificates configured
- [ ] Google Wallet API enabled
- [ ] Environment variables set in production
- [ ] Images uploaded and optimized
- [ ] SSL certificates valid
- [ ] Domain configured for wallet pass URLs

### Testing

- [ ] Apple Wallet passes generate successfully
- [ ] Google Wallet URLs work correctly
- [ ] Pass images display properly
- [ ] QR codes scan correctly
- [ ] Pass updates work (if implemented)

### Production

- [ ] Certificate expiration monitoring setup
- [ ] Error logging and alerting configured
- [ ] Performance monitoring enabled
- [ ] Backup certificates stored securely
- [ ] Documentation updated

### Post-Deployment

- [ ] Monitor pass generation success rates
- [ ] Track user adoption of wallet passes
- [ ] Collect feedback on pass design and functionality
- [ ] Plan for certificate renewal process
- [ ] Review and optimize performance metrics