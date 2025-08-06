#!/bin/bash

# Start ngrok for local Stripe testing with Apple Pay and Google Pay
# This creates an HTTPS tunnel that can be registered with Stripe

echo "🚀 Starting ngrok tunnel for Stripe wallet testing..."
echo ""
echo "Prerequisites:"
echo "1. Install ngrok: brew install ngrok/ngrok/ngrok"
echo "2. Start your local server: npm start"
echo ""
echo "Starting ngrok on port 3000..."
ngrok http 3000 --log=stdout

# After ngrok starts:
# 1. Copy the HTTPS URL (e.g., https://abc123.ngrok-free.app)
# 2. Go to Stripe Dashboard → Settings → Payment methods → Payment method domains
# 3. Add the ngrok domain (without https://)
# 4. Test Apple Pay/Google Pay using the ngrok URL