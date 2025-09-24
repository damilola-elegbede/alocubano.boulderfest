# URGENT: Set REGISTRATION_SECRET in Vercel

The payment flow is failing because the `REGISTRATION_SECRET` environment variable is not set in Vercel.

## Quick Fix Instructions

1. **Generate the secret** (run this locally):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

2. **Add to Vercel Dashboard**:
   - Go to: https://vercel.com/dashboard
   - Select your project: `alocubano-boulderfest`
   - Go to Settings → Environment Variables
   - Add new variable:
     - **Name**: `REGISTRATION_SECRET`
     - **Value**: [paste the 64-character hex string from step 1]
     - **Environment**: Select all (Production, Preview, Development)
   - Click "Save"

3. **Redeploy** (automatic after adding env var, or manually):
   - Go to Deployments tab
   - Click "..." on latest deployment
   - Select "Redeploy"

## Verify It's Working

After deployment, test the payment flow:
1. Go to /tickets
2. Add tickets to cart
3. Complete test payment
4. You should see the success page with "Complete Registration" button

## Other Required Environment Variables

Make sure these are also set in Vercel:
- `STRIPE_SECRET_KEY` - Your Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `TURSO_DATABASE_URL` - Database connection URL
- `TURSO_AUTH_TOKEN` - Database auth token
- `ADMIN_PASSWORD` - Bcrypt hashed admin password
- `ADMIN_SECRET` - JWT secret for admin auth (32+ chars)

## Troubleshooting

If still getting 500 errors after setting the env var:
1. Check Vercel Function Logs for specific error
2. Ensure the value is exactly 64 characters
3. Make sure there are no quotes around the value
4. Try redeploying from Vercel dashboard