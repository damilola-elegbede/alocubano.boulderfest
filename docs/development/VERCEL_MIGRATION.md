# Vercel CLI Migration Guide

## Overview

The A Lo Cubano Boulder Fest development server has been migrated to use Vercel CLI instead of simple HTTP servers, providing better alignment with our production deployment and improved developer experience.

## What Changed

### Before (Simple HTTP Server)

- Used `python3 -m http.server` or `npx http-server`
- No API support for serverless functions
- Limited to static file serving
- No environment variable support

### After (Vercel CLI)

- Uses `vercel dev` command
- Consistent with production environment
- Serverless functions in `/api` directory
- Automatic hot reloading for API changes
- Better TypeScript/JavaScript integration

## Migration Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Install Vercel CLI (if needed)

The start scripts will automatically install Vercel CLI globally if it's not found. Alternatively, you can install it manually:

```bash
npm install -g vercel
```

### 3. Start Development Server

```bash
# Using start script (recommended)
./scripts/start.sh

# Using npm script
npm run dev

# Direct Vercel command
vercel dev --listen 8000
```

## Backwards Compatibility

### Simple HTTP Server

For basic static file serving without API support:

```bash
npm run serve:simple
```

## Benefits of Vercel CLI

1. **Production Parity**: Development environment matches production exactly
2. **Serverless Functions**: API routes in `/api` work identically to production
3. **Hot Reloading**: Changes to API functions are reflected immediately
4. **Environment Variables**: `.env.local` is automatically loaded
5. **CORS Handling**: Automatic CORS configuration for development
6. **TypeScript Support**: Better integration with modern JavaScript tooling

## Troubleshooting

### Port Already in Use

If port 8000 is already in use:

```bash
# Use a different port
vercel dev --listen 3000
```

### Vercel CLI Not Found

If the automatic installation fails:

```bash
# Install globally
npm install -g vercel

# Or use npx (no installation needed)
npx vercel dev --listen 8000
```

### API Routes Not Working

Ensure your `.env.local` file contains all necessary environment variables:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_DRIVE_FOLDER_ID`

## Quick Reference

| Task                 | Old Command                   | New Command                |
| -------------------- | ----------------------------- | -------------------------- |
| Start dev server     | `python3 -m http.server 8000` | `npm run dev`              |
| Quick start          | `npx http-server -p 8000`     | `./scripts/start.sh`       |
| With specific port   | `python3 -m http.server 3000` | `vercel dev --listen 3000` |
| Simple static server | `python3 -m http.server`      | `npm run serve:simple`     |
| Production build     | N/A                           | `npm run build`            |

## Need Help?

If you encounter any issues with the migration:

1. Check that Node.js 18+ is installed: `node --version`
2. Ensure npm is up to date: `npm --version`
3. Try clearing node_modules: `rm -rf node_modules && npm install`
4. Check the Vercel CLI version: `vercel --version`
