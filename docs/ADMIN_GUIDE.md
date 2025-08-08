# Admin Dashboard Guide

## Quick Start

### Setting Your Own Password

1. **Generate your password hash:**
   ```bash
   node scripts/generate-admin-password.js
   ```
   - Enter your desired password when prompted
   - Confirm the password
   - Copy the generated configuration

2. **Add to `.env.local`:**
   ```env
   # Admin Dashboard Configuration
   ADMIN_PASSWORD=$2a$10$[your-generated-hash]
   ADMIN_SECRET=[your-generated-secret]
   ADMIN_SESSION_DURATION=3600000  # 1 hour in milliseconds
   ADMIN_MAX_LOGIN_ATTEMPTS=5
   ```

3. **Login:**
   - Navigate to: `http://localhost:8080/pages/admin/login.html`
   - Enter your password (the one you typed, not the hash!)
   - No username needed - it's a single admin system

## Configuration Options

### Session Duration (in milliseconds!)

| Duration | Value | Configuration |
|----------|-------|--------------|
| 30 minutes | 1,800,000 | `ADMIN_SESSION_DURATION=1800000` |
| 1 hour (default) | 3,600,000 | `ADMIN_SESSION_DURATION=3600000` |
| 2 hours | 7,200,000 | `ADMIN_SESSION_DURATION=7200000` |
| 4 hours | 14,400,000 | `ADMIN_SESSION_DURATION=14400000` |
| 8 hours | 28,800,000 | `ADMIN_SESSION_DURATION=28800000` |
| 24 hours | 86,400,000 | `ADMIN_SESSION_DURATION=86400000` |

### Login Security

- **Max attempts:** 5 (configurable via `ADMIN_MAX_LOGIN_ATTEMPTS`)
- **Lockout duration:** 30 minutes after max attempts exceeded
- **Session storage:** HTTP-only secure cookies
- **Token type:** JWT with HMAC-SHA256 signature

## Dashboard Features

### Statistics Overview
- Total tickets sold
- Check-in count and percentage
- Total revenue
- Order count
- Ticket type breakdown
- Apple/Google Wallet adoption rates

### Registration Management
- **Search:** By name, email, or ticket ID
- **Filter:** By status (valid/cancelled) or check-in status
- **Actions:** Manual check-in, undo check-in
- **Export:** Download filtered results as CSV

### Check-In Process
1. Search for attendee by name, email, or ticket ID
2. Click "Check In" button next to their registration
3. Status updates to "Checked In" immediately
4. Can undo check-in if needed

## Security Best Practices

### For Development
- Use a simple password for testing
- Never commit `.env.local` to git
- Session duration can be longer (8-24 hours)

### For Production
1. **Generate strong password:**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Use a password manager

2. **Secure environment:**
   ```bash
   # Generate production password hash
   node scripts/generate-admin-password.js
   ```

3. **Add to Vercel/production environment:**
   - Set shorter session duration (1-2 hours)
   - Use different password than development
   - Rotate session secret periodically

4. **Monitor access:**
   - Admin logins are logged in `payment_events` table
   - Review logs regularly for unauthorized attempts

## Authentication Flow

1. **No Username Required**
   - System uses single admin account
   - Just password authentication
   - Internally identified as 'admin'

2. **Session Management**
   - Sessions expire after configured duration
   - Activity doesn't extend session (fixed duration)
   - Must re-login after expiration

3. **API Access**
   - Session cookie for web access
   - Bearer token for API calls
   - Same authentication for both

## Troubleshooting

### "Invalid password" error
- Check you're using the password, not the hash
- Verify `.env.local` has correct `ADMIN_PASSWORD` hash
- Try regenerating with `node scripts/generate-admin-password.js`

### Session expires too quickly
- Increase `ADMIN_SESSION_DURATION` (remember: milliseconds!)
- Example for 4 hours: `ADMIN_SESSION_DURATION=14400000`

### Can't access dashboard after login
- Check browser cookies are enabled
- Verify `ADMIN_SECRET` is at least 32 characters
- Check browser console for errors

### Locked out after failed attempts
- Wait 30 minutes for automatic unlock
- Or restart the server to clear attempt tracking
- Consider increasing `ADMIN_MAX_LOGIN_ATTEMPTS`

## API Endpoints

All admin endpoints require authentication:

- `POST /api/admin/login` - Login (returns session)
- `DELETE /api/admin/login` - Logout
- `GET /api/admin/dashboard` - Dashboard statistics
- `GET /api/admin/registrations` - Search/list registrations
- `PUT /api/admin/registrations` - Update registration (check-in, etc.)

## Database Schema

Check-in fields added to tickets table:
- `checked_in_at` - Timestamp of check-in
- `checked_in_by` - Admin ID who performed check-in

Admin actions logged in `payment_events` table with event types:
- `admin_login` - Login events
- `admin_checkin` - Manual check-ins
- `admin_undo_checkin` - Undo check-ins
- `admin_export` - Data exports