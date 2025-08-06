# Enabling Apple Pay and Google Pay in Stripe Checkout

## Why Apple Pay and Google Pay Aren't Showing

Apple Pay and Google Pay require specific configuration in your Stripe Dashboard. They won't appear automatically even though we've enabled them in the code.

## Requirements Checklist

### 1. Domain Registration (REQUIRED)
You must register your domain with Stripe for Apple Pay and Google Pay to work.

#### Steps to Register Your Domain:

1. **Go to Stripe Dashboard**
   - Log into your [Stripe Dashboard](https://dashboard.stripe.com)
   - Navigate to: **Settings → Payment methods → Payment method domains**
   - Or use direct link: https://dashboard.stripe.com/settings/payment_methods/domains

2. **Add Your Domains**
   You need to register ALL domains where payment will be processed:
   - `localhost` (for local testing)
   - `alocubano.boulderfest.com` (your production domain)
   - `www.alocubano.boulderfest.com` (if you use www)
   - Any Vercel preview domains you use (e.g., `*.vercel.app`)

3. **Verify Each Domain**
   - Click "Add a domain"
   - Enter your domain
   - Stripe will automatically verify it with Apple and Google
   - This process is usually instant

### 2. Enable Payment Methods in Dashboard

1. **Navigate to Payment Methods**
   - Go to: **Settings → Payment methods**
   - Or: https://dashboard.stripe.com/settings/payment_methods

2. **Enable Wallets**
   - Find the "Wallets" section
   - Enable:
     - ✅ Apple Pay
     - ✅ Google Pay
     - ✅ Link (already enabled in our code)

### 3. Testing Requirements

#### For Apple Pay Testing:
- **Device**: Must use Safari on Mac or iOS device
- **Wallet**: Must have at least one card added to Apple Wallet
- **Test Card**: In Stripe test mode, use: `4242 4242 4242 4242`

#### For Google Pay Testing:
- **Browser**: Must use Chrome browser
- **Wallet**: Must have at least one card added to Google Pay
- **Account**: Must be logged into Google account

### 4. Local Testing Setup

For localhost testing, Apple Pay and Google Pay have limitations:

1. **Apple Pay on localhost**:
   - Only works on Safari with macOS 12+ or iOS 15+
   - Must use HTTPS (even for localhost)
   - Consider using ngrok for HTTPS tunnel

2. **Google Pay on localhost**:
   - Works on Chrome
   - Should work with HTTP on localhost
   - Must have Google Pay set up in browser

## Quick Setup Script

Run these checks:

```bash
# 1. Check if your domain is accessible
curl -I https://alocubano.boulderfest.com

# 2. Test Stripe configuration
curl https://api.stripe.com/v1/payment_method_configurations \
  -u "YOUR_STRIPE_SECRET_KEY:"

# 3. For local HTTPS testing (optional)
# Install ngrok: brew install ngrok
# Run: ngrok http 3000
# Use the HTTPS URL provided by ngrok
```

## Troubleshooting

### Apple Pay Not Showing:
1. **Check Browser Console** for errors
2. **Verify Domain Registration** in Stripe Dashboard
3. **Ensure Using Safari** (won't show in Chrome/Firefox)
4. **Check Device Support**: Settings → Wallet & Apple Pay
5. **Clear Safari Cache**: Develop → Empty Caches

### Google Pay Not Showing:
1. **Check You're Using Chrome**
2. **Verify Google Account** is logged in
3. **Check Google Pay Setup**: pay.google.com
4. **Try Incognito Mode** to rule out extensions
5. **Check Console** for specific errors

### Both Not Showing:
1. **Domain Not Registered**: Most common issue
2. **Wrong Environment**: Ensure using correct Stripe keys
3. **Payment Method Not Enabled** in Stripe Dashboard
4. **Geographic Restrictions**: Some countries don't support these methods

## Testing with Real Devices

### iOS Testing (Apple Pay):
1. Open Safari on iPhone/iPad
2. Navigate to your checkout page
3. Apple Pay should appear if:
   - Domain is registered
   - Device has cards in Wallet
   - Using HTTPS

### Android Testing (Google Pay):
1. Open Chrome on Android
2. Navigate to your checkout page
3. Google Pay should appear if:
   - Domain is registered
   - Google Pay is set up
   - Using HTTPS

## Production Checklist

Before going live:
- [ ] Register production domain in Stripe Dashboard
- [ ] Enable Apple Pay in Stripe Dashboard
- [ ] Enable Google Pay in Stripe Dashboard
- [ ] Test on real iOS device (Apple Pay)
- [ ] Test on real Android device (Google Pay)
- [ ] Test on Desktop Safari (Apple Pay)
- [ ] Test on Desktop Chrome (Google Pay)
- [ ] Verify HTTPS certificate is valid
- [ ] Test with live Stripe keys (small amount)

## API Configuration (Already Done)

Our code already has the correct configuration:
```javascript
// In create-checkout-session.js
payment_method_types: ["card", "link"],
// Apple Pay and Google Pay are automatically included 
// when domains are registered and wallets enabled
```

## Support Resources

- [Stripe Apple Pay Docs](https://stripe.com/docs/apple-pay)
- [Stripe Google Pay Docs](https://stripe.com/docs/google-pay)
- [Domain Registration Guide](https://stripe.com/docs/payments/payment-methods/pmd-registration)
- [Testing Wallets](https://stripe.com/docs/testing#wallets)

## Contact Support

If still having issues after following these steps:
1. Contact Stripe Support with your account ID
2. Provide:
   - Domain you're trying to register
   - Browser/device you're testing on
   - Screenshot of Payment Methods settings
   - Any console errors

Remember: The most common issue is simply forgetting to register your domain in the Stripe Dashboard!