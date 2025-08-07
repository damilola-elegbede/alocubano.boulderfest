# Turso Database Setup Guide

This guide walks you through setting up Turso databases for the A Lo Cubano Boulder Fest project, including both development and production environments.

## Overview

Turso is a SQLite-compatible database that provides edge-distributed storage with zero-latency reads. Our project uses Turso for storing subscriber data, order information, and other application state.

## Prerequisites

- Node.js 18+ installed
- A GitHub account (for Turso authentication)
- Basic familiarity with command line tools

## Step 1: Install Turso CLI

Install the Turso CLI tool on your local machine:

### macOS
```bash
# Using Homebrew (recommended)
brew install turso

# Or using curl
curl -sSfL https://get.tur.so/install.sh | bash
```

### Linux
```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

### Windows
```powershell
# Using PowerShell
irm get.tur.so | iex
```

Verify installation:
```bash
turso --version
```

## Step 2: Create Turso Account

1. **Sign up for Turso** (if you don't have an account):
   ```bash
   turso auth signup
   ```
   This will open your browser to complete GitHub OAuth authentication.

2. **Login to existing account**:
   ```bash
   turso auth login
   ```

3. **Verify authentication**:
   ```bash
   turso auth whoami
   ```

## Step 3: Create Development Database

1. **Create your development database**:
   ```bash
   turso db create alocubano-dev
   ```

2. **Get the database URL**:
   ```bash
   turso db show alocubano-dev --url
   ```
   Copy this URL - you'll need it for `TURSO_DATABASE_URL`

3. **Create an auth token for development**:
   ```bash
   turso db tokens create alocubano-dev
   ```
   Copy this token - you'll need it for `TURSO_AUTH_TOKEN`

4. **Test the connection**:
   ```bash
   turso db shell alocubano-dev
   ```
   Type `.quit` to exit the shell.

## Step 4: Create Production Database

1. **Create your production database**:
   ```bash
   turso db create alocubano-prod
   ```

2. **Get the production database URL**:
   ```bash
   turso db show alocubano-prod --url
   ```

3. **Create an auth token for production**:
   ```bash
   turso db tokens create alocubano-prod
   ```

4. **Set up replication** (optional, for better global performance):
   ```bash
   # Add replicas in regions where your users are located
   turso db replicate alocubano-prod --region lax  # Los Angeles
   turso db replicate alocubano-prod --region fra  # Frankfurt
   ```

## Step 5: Configure Local Environment

1. **Copy the local environment template**:
   ```bash
   cp .env.local.template .env.local
   ```

2. **Edit `.env.local`** with your development database credentials:
   ```bash
   # Replace with your actual development values
   TURSO_DATABASE_URL=libsql://alocubano-dev-your-org.turso.io
   TURSO_AUTH_TOKEN=your_development_token_here
   ```

3. **Test the local configuration**:
   ```bash
   npm run test:db
   ```

## Step 6: Configure Vercel Production Environment

### Option A: Using Vercel CLI (Recommended)

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Link your project**:
   ```bash
   vercel link
   ```

4. **Set production environment variables**:
   ```bash
   # Set production database URL
   vercel env add TURSO_DATABASE_URL production
   # Paste: libsql://alocubano-prod-your-org.turso.io

   # Set production auth token
   vercel env add TURSO_AUTH_TOKEN production
   # Paste: your_production_token_here
   ```

### Option B: Using Vercel Dashboard

1. **Open your project** in the Vercel dashboard
2. **Go to Settings → Environment Variables**
3. **Add the following variables for Production**:
   - `TURSO_DATABASE_URL`: `libsql://alocubano-prod-your-org.turso.io`
   - `TURSO_AUTH_TOKEN`: `your_production_token_here`

## Step 7: Initialize Database Schema

1. **Run migrations locally** (against development database):
   ```bash
   npm run migrate
   ```

2. **Run migrations against production** (when ready to deploy):
   ```bash
   # Using Turso CLI directly
   turso db shell alocubano-prod < migrations/001_core_tables.sql
   ```

   Or create a migration script:
   ```bash
   npm run migrate:prod
   ```

## Step 8: Verify Setup

1. **Test local database connection**:
   ```bash
   # This should show "healthy" status
   npm run test:db
   ```

2. **Test production database** (via API endpoint):
   ```bash
   # After deploying to Vercel
   curl https://your-app.vercel.app/api/database-health
   ```

3. **Run the full test suite**:
   ```bash
   npm test
   ```

[... rest of the document remains the same ...]

## Troubleshooting

### Connection Issues

**Error: "TURSO_DATABASE_URL environment variable is required"**
- Ensure your `.env.local` file exists and contains `TURSO_DATABASE_URL`
- Check that the URL format is correct: `libsql://database-name-org.turso.io`

**Error: "Authentication failed"**
- Verify your `TURSO_AUTH_TOKEN` is correct
- Try creating a new token: `turso db tokens create your-database-name`
- Ensure the token corresponds to the correct database

[... rest of the document remains the same ...]

**Error: "Database connection failed in production"**
- Verify environment variables are set in Vercel dashboard
- Check that you're using the production database URL and token
- Ensure the production database has been initialized with schema

[... rest of the document remains the same ...]