# Deployment Guide - A Lo Cubano Boulder Fest

## Overview
This is a static website that can be deployed to any static hosting service. The site is optimized for Vercel deployment but works with Netlify, GitHub Pages, or any web server.

## Pre-Deployment Checklist

- [ ] All pages load correctly locally
- [ ] Navigation works on all pages
- [ ] Images display properly
- [ ] Forms have correct mailto links
- [ ] Mobile responsive design verified
- [ ] No console errors in browser
- [ ] Google Drive API credentials configured (for gallery feature)
- [ ] Dependencies installed: `npm install`

## Vercel Deployment (Recommended)

### 1. Push to GitHub
```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 2. Import to Vercel
1. Go to [vercel.com](https://vercel.com)
2. Click "New Project"
3. Import your GitHub repository
4. **Framework Preset**: Other (or None)
5. **Build Command**: Leave empty (no build needed)
6. **Output Directory**: Leave as default
7. Click "Deploy"

### 3. Configuration
The `vercel.json` file handles:
- URL rewrites (clean URLs without .html)
- Routing to the typographic design pages
- Security headers
- Caching for assets
- Serverless function configuration for gallery API

### 4. Environment Variables
For the Google Drive gallery integration, you need to set up environment variables in Vercel:

1. Go to your project settings in Vercel
2. Navigate to "Environment Variables"
3. Add the following variables:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Your service account email
   - `GOOGLE_PRIVATE_KEY`: Your service account private key (include full key with line breaks)
   - `GOOGLE_PROJECT_ID`: Your Google Cloud project ID
   - `GOOGLE_DRIVE_FOLDER_ID`: The ID of your Google Drive folder (default: 1elqFy6HFf792_vGju8wYaEBJtLjQyOSq)

See `GOOGLE_DRIVE_SETUP.md` for detailed instructions on obtaining these values.

### 5. Custom Domain (Optional)
1. Go to project settings in Vercel
2. Navigate to "Domains"
3. Add your custom domain
4. Follow DNS configuration instructions

## Alternative Deployment Options

### Netlify
1. Drag and drop the project folder to Netlify
2. Or connect GitHub repository
3. No build settings needed

### GitHub Pages
1. Enable Pages in repository settings
2. Set source to main branch
3. Note: URLs will include .html extension

### Traditional Web Hosting
1. Upload all files via FTP
2. Ensure `/pages/typographic/home.html` is set as index
3. Configure .htaccess for clean URLs if needed

## Post-Deployment Testing

Run these checks after deployment:

1. **Home Page**: `https://yourdomain.com/`
2. **Direct Pages**: 
   - `/about`
   - `/artists`
   - `/schedule`
   - `/gallery`
   - `/tickets`
   - `/donations`
3. **Mobile Test**: Check on actual devices
4. **Form Test**: Click volunteer and ticket purchase buttons
5. **Performance**: Run Lighthouse audit

## Troubleshooting

### Pages Not Found
- Check vercel.json rewrites configuration
- Ensure all HTML files are in `/pages/typographic/`

### Styles Not Loading
- Verify CSS paths are relative (`../../css/`)
- Check file names match exactly (case-sensitive)

### Images Not Showing
- Confirm image paths are correct
- Check file extensions match references

### Forms Not Working
- Verify mailto links are properly formatted
- Test in different email clients

## Maintenance

### Updating Content
1. Edit HTML files in `/pages/typographic/`
2. Follow design patterns from Artists/Schedule pages
3. Test locally before deploying
4. Push to GitHub for automatic deployment

### Adding New Pages
1. Copy existing page as template
2. Update navigation in all pages
3. Add to vercel.json if needed
4. Follow spec documentation for design

## Performance Optimization

The site is already optimized with:
- Minimal CSS/JS
- Relative paths for all assets
- Clean semantic HTML
- Efficient font loading

## Support

For design questions, refer to:
- `/spec/README.md` - Design specifications
- `/.claude/claude.md` - Development guidelines
- Artists and Schedule pages as reference