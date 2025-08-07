# Google Wallet Pass Setup Guide

## Overview

This guide walks you through setting up Google Wallet passes for A Lo Cubano Boulder Fest tickets. The passes are designed to match the Apple Wallet passes with a clean, minimalist design using the Cuban flag colors.

## Design Specifications

- **Background**: White (#FFFFFF)
- **Text**: Black for most content
- **Labels**: Cuban flag red (#CE1126)
- **Ticket Type**: Cuban flag blue (#002868) in ALL CAPS
- **Logo**: Festival logo with watermark effect

## Prerequisites

1. Google Cloud Project with billing enabled
2. Google Wallet API enabled
3. Service Account with proper permissions
4. Verified merchant account

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Note your Project ID

## Step 2: Enable Google Wallet API

1. In Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Wallet API"
3. Click "Enable"

## Step 3: Create Service Account

1. Go to "IAM & Admin" → "Service Accounts"
2. Click "Create Service Account"
3. Name: `wallet-pass-generator`
4. Description: "Service account for generating Google Wallet passes"
5. Click "Create and Continue"
6. Grant role: "Google Wallet API Service Account"
7. Click "Continue" then "Done"

## Step 4: Generate Service Account Key

1. Click on the service account you created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose JSON format
5. Download the key file (keep it secure!)

## Step 5: Register as Google Wallet Issuer

1. Go to [Google Pay & Wallet Console](https://pay.google.com/business/console)
2. Sign in with your Google account
3. Click "Google Wallet API"
4. Follow the merchant verification process
5. Note your Issuer ID (looks like: 3388000000000000000)

## Step 6: Configure Environment Variables

Add to your `.env.local` file:

```bash
# Google Wallet Configuration
GOOGLE_WALLET_ISSUER_ID=3388000000000000000  # Your actual issuer ID
GOOGLE_WALLET_CLASS_ID=alocubano_tickets_2026

# Encode your service account JSON
# Run: cat path/to/service-account.json | base64
GOOGLE_WALLET_SERVICE_ACCOUNT=<base64-encoded-json>

# Optional: Base URL for images
WALLET_BASE_URL=https://www.alocubanoboulderfest.org
```

## Step 7: Encode Service Account JSON

```bash
# On macOS/Linux
cat ~/Downloads/service-account.json | base64 | tr -d '\n' > service-account-base64.txt

# Copy the contents of service-account-base64.txt to GOOGLE_WALLET_SERVICE_ACCOUNT
```

## Step 8: Test Pass Generation

```bash
# Start development server
npm start

# Test the endpoint
curl http://localhost:3000/api/wallet/google/TEST-TICKET-ID
```

## Step 9: Production Deployment

1. Add environment variables to Vercel:
   ```bash
   vercel env add GOOGLE_WALLET_ISSUER_ID
   vercel env add GOOGLE_WALLET_CLASS_ID
   vercel env add GOOGLE_WALLET_SERVICE_ACCOUNT
   ```

2. Deploy to production:
   ```bash
   vercel --prod
   ```

## API Endpoints

### Generate Google Wallet Pass
```
GET /api/wallet/google/{ticketId}
```

Returns:
```json
{
  "success": true,
  "saveUrl": "https://pay.google.com/gp/v/save/...",
  "objectId": "3388000000000000000.abc123"
}
```

### Generate Both Wallet Passes
```
GET /api/wallet/{ticketId}
```

Returns:
```json
{
  "ticketId": "TICKET-123",
  "apple": {
    "available": true,
    "downloadUrl": "/api/wallet/apple/TICKET-123"
  },
  "google": {
    "available": true,
    "saveUrl": "https://pay.google.com/gp/v/save/...",
    "objectId": "3388000000000000000.abc123"
  }
}
```

### Revoke Pass
```
DELETE /api/wallet/google/{ticketId}
```

## Pass Content Structure

The Google Wallet pass includes:

### Front of Pass
- **Event**: Boulder Fest 2026
- **Ticket Type**: VIP PASS (in blue, all caps)
- **Attendee**: John Doe
- **Dates**: May 15-17, 2026
- **Order**: Order number
- **QR Code**: For scanning at entrance

### Back of Pass
- **Venue**: Avalon Ballroom address
- **Ticket ID**: Unique identifier
- **Check-in Instructions**: Entry requirements
- **Support**: Contact information
- **Terms & Conditions**: Event policies

## Troubleshooting

### "Google Wallet is not configured"
- Verify all environment variables are set
- Check service account JSON is properly base64 encoded
- Ensure Google Wallet API is enabled

### "Invalid issuer ID"
- Verify your issuer ID in Google Pay & Wallet Console
- Ensure merchant account is verified

### "Authentication failed"
- Check service account has proper permissions
- Verify private key is correctly formatted
- Ensure project ID matches service account

### Pass doesn't appear correctly
- Images must be publicly accessible
- Check image URLs in pass definition
- Verify color codes are in correct format

## Design Assets

Place these images in `/public/images/`:
- `logo.png` - Festival logo (used for pass icon)
- `google-wallet-hero.png` - Optional hero image (currently not used for minimalist design)
- `google-wallet-wide-logo.png` - Wide logo for pass listing

## Security Notes

1. **Never commit service account keys** to version control
2. Store base64-encoded keys in environment variables
3. Use different service accounts for dev/staging/prod
4. Regularly rotate service account keys
5. Monitor API usage in Google Cloud Console

## Testing Checklist

- [ ] Pass can be generated for valid ticket
- [ ] QR code contains correct ticket ID
- [ ] Pass displays correct attendee name
- [ ] Ticket type shown in blue, all caps
- [ ] Labels appear in red
- [ ] White background, black text
- [ ] Pass can be added to Google Wallet
- [ ] Pass can be revoked when ticket is cancelled
- [ ] Location-based notifications work (optional)

## Additional Resources

- [Google Wallet API Documentation](https://developers.google.com/wallet)
- [Pass Class Reference](https://developers.google.com/wallet/tickets/events/rest/v1/eventticketclass)
- [Pass Object Reference](https://developers.google.com/wallet/tickets/events/rest/v1/eventticketobject)
- [JWT Creation Guide](https://developers.google.com/wallet/generic/web/prerequisites)