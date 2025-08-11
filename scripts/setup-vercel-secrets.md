# Vercel Secrets Setup Guide

## Required GitHub Secrets

To enable staging deployments, you need to configure the following GitHub repository secrets:

### 1. VERCEL_TOKEN

- Go to [Vercel Dashboard → Settings → Tokens](https://vercel.com/account/tokens)
- Create a new token with "Full Account" scope
- Copy the token and add it as a GitHub secret

### 2. VERCEL_ORG_ID

- Go to [Vercel Dashboard → Settings → General](https://vercel.com/account)
- Copy your "Team ID" (for personal accounts, this is your user ID)
- Add it as a GitHub secret

### 3. VERCEL_PROJECT_ID

- Go to your project in Vercel Dashboard
- Go to Settings → General
- Copy the "Project ID"
- Add it as a GitHub secret

## Adding GitHub Secrets

1. Go to your GitHub repository
2. Click Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add each secret with the exact name (case-sensitive)

## GitHub CLI Method

If you have the GitHub CLI installed and authenticated:

```bash
# Set your values here
VERCEL_TOKEN="your-vercel-token"
VERCEL_ORG_ID="your-org-id"
VERCEL_PROJECT_ID="your-project-id"

# Add the secrets
gh secret set VERCEL_TOKEN --body "$VERCEL_TOKEN"
gh secret set VERCEL_ORG_ID --body "$VERCEL_ORG_ID"
gh secret set VERCEL_PROJECT_ID --body "$VERCEL_PROJECT_ID"
```

## Verification

Once configured, the staging deployment workflow should work correctly. You can test it by:

1. Creating a new feature branch
2. Making a commit and pushing
3. Opening a pull request against main branch

The workflow will automatically create a preview deployment and comment on the PR with the preview URL.
