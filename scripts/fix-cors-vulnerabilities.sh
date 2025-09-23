#!/bin/bash

# Fix CORS Vulnerabilities Script
# Replaces wildcard CORS headers with secure implementation

PROJECT_ROOT="/Users/damilola/Documents/Projects/alocubano.boulderfest"

echo "🔧 Fixing CORS vulnerabilities..."

# List of files to fix
FILES=(
  "api/image-proxy/[fileId].js"
  "api/performance-final.js"
  "api/payments/create-payment-intent.js"
  "api/payments/checkout-cancel.js"
  "api/payments/checkout-success.js"
  "api/performance-metrics.js"
  "api/gallery/years.js"
  "api/admin/test-cart.js"
  "api/admin/verify-session.js"
  "api/performance.js"
  "api/google-drive-health.js"
  "api/featured-photos.js"
  "api/example-cached-endpoint.js"
  "api/performance-critical.js"
  "api/email/unsubscribe.js"
)

for file in "${FILES[@]}"; do
  filepath="$PROJECT_ROOT/$file"
  echo "Processing: $file"
  
  if [ -f "$filepath" ]; then
    # Check if file already has secure CORS import
    if ! grep -q "setSecureCorsHeaders" "$filepath"; then
      # Add import if it doesn't exist
      if ! grep -q "cors-config" "$filepath"; then
        sed -i '' '1a\
import { setSecureCorsHeaders } from '\''../lib/cors-config.js'\'';
' "$filepath"
      fi
    fi
    
    # Replace wildcard CORS
    sed -i '' 's/res\.setHeader('\''Access-Control-Allow-Origin'\'', '\''\*'\'')/setSecureCorsHeaders(req, res)/g' "$filepath"
    
    echo "  ✅ Fixed: $file"
  else
    echo "  ⚠️  File not found: $file"
  fi
done

echo "🏁 CORS vulnerability fixes complete!"
