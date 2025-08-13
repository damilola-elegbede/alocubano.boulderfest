# Brevo Webhook Configuration Guide

## Overview

This guide walks you through setting up Brevo (formerly SendinBlue) webhooks for the A Lo Cubano Boulder Fest application. Webhooks allow Brevo to notify your application about email events in real-time.

## Prerequisites

- Brevo account with API access
- Deployed application URL (or ngrok for local testing)
- Access to Brevo dashboard

## Environment Variables

You need two BREVO environment variables configured:

```bash
BREVO_API_KEY=your_api_key_here
BREVO_NEWSLETTER_LIST_ID=2
```

✅ These have been added to your `.env.local` file.

## Step-by-Step Webhook Configuration

### 1. Access Brevo Dashboard

1. Log in to your Brevo account at https://app.brevo.com
2. Navigate to **Transactional** → **Settings** → **Webhook**
   - Or directly: https://app.brevo.com/settings/webhook

### 2. Create a New Webhook

Click **"Create a webhook"** and configure:

#### Webhook URL

```
Production: https://alocubanoboulderfest.com/api/email/brevo-webhook
Local Testing: https://alocubanoboulderfest.ngrok.io/api/email/brevo-webhook
```

#### Events to Track

Select the following events for comprehensive tracking:

**Essential Events:**

- ✅ **Hard Bounce** - Email permanently failed
- ✅ **Soft Bounce** - Temporary delivery failure
- ✅ **Delivered** - Email successfully delivered
- ✅ **Spam** - Email marked as spam
- ✅ **Unsubscribed** - User unsubscribed from list

**Optional Events (for analytics):**

- ✅ **Opened** - Email was opened
- ✅ **Clicked** - Link in email was clicked
- ✅ **Invalid Email** - Email address is invalid

### 3. Save and Activate

After selecting your events, click **"Create"** or **"Save"** to activate the webhook.

**Note:** Brevo does not currently support custom webhook secrets or signature verification. The webhook will start receiving events immediately after activation.

### 4. Webhook Endpoint Details

Your webhook endpoint is located at:

```
/api/email/brevo-webhook
```

**What it does:**

- Processes email events:
  - Updates subscriber status for bounces/unsubscribes
  - Logs email events for analytics
  - Handles spam complaints
  - Tracks delivery status

### 5. Test the Webhook

#### Using Brevo's Test Feature

1. In the webhook configuration, click **"Test"**
2. Select a test event type
3. Click **"Send test webhook"**
4. Check your application logs for successful processing

#### Local Testing with ngrok

```bash
# Start your local server
npm start

# Your webhook will be available at:
# https://alocubanoboulderfest.ngrok.io/api/email/brevo-webhook
```

#### Verify Webhook is Working

```bash
# Check recent webhook logs
curl http://localhost:3000/api/admin/webhook-logs

# Test webhook manually
curl -X POST http://localhost:3000/api/email/brevo-webhook \
  -H "Content-Type: application/json" \
  -d '{
    "event": "delivered",
    "email": "test@example.com",
    "date": "2024-01-11T10:00:00Z",
    "ts": 1704967200,
    "message-id": "<test@example.com>",
    "tag": "newsletter"
  }'
```

### 6. Webhook Event Handling

Your application handles these events:

| Event          | Action                  | Database Update                                 |
| -------------- | ----------------------- | ----------------------------------------------- |
| `delivered`    | Log successful delivery | Update last_email_sent timestamp                |
| `hard_bounce`  | Mark email as invalid   | Set status to 'bounced', increment bounce_count |
| `soft_bounce`  | Track temporary failure | Increment bounce_count                          |
| `spam`         | Handle spam complaint   | Set status to 'spam_complaint'                  |
| `unsubscribed` | Process unsubscribe     | Set status to 'unsubscribed'                    |
| `opened`       | Track engagement        | Log open event                                  |
| `clicked`      | Track link clicks       | Log click event with link data                  |

### 7. Security Considerations

While Brevo doesn't support custom webhook secrets, your implementation includes:

- **HTTPS Only**: Always use HTTPS in production for encrypted communication
- **Request Validation**: Validates that required fields are present
- **Event Type Validation**: Only processes known event types
- **Error Handling**: Gracefully handles malformed requests

Note: Since Brevo doesn't provide signature verification, ensure your webhook URL is not publicly advertised to prevent abuse.

### 8. Monitoring & Debugging

#### Check Webhook Status

```bash
# View recent webhook events
SELECT * FROM email_events
ORDER BY created_at DESC
LIMIT 10;

# Check failed webhooks
SELECT * FROM email_events
WHERE status = 'failed'
ORDER BY created_at DESC;
```

#### Common Issues & Solutions

| Issue              | Solution                                   |
| ------------------ | ------------------------------------------ |
| 404 Not Found      | Verify webhook URL is correct and deployed |
| 500 Internal Error | Check application logs for database errors |
| No events received | Verify webhook is enabled in Brevo         |
| Invalid JSON       | Check Brevo is sending proper JSON format  |

### 9. Production Checklist

Before going live:

- [ ] Webhook URL uses HTTPS
- [ ] Database can handle webhook volume
- [ ] Error logging is configured
- [ ] Rate limiting is in place (if needed)
- [ ] Webhook URL is not publicly advertised

### 10. GitHub Secrets for CI/CD

Add these to GitHub Secrets for automated testing:

```
BREVO_API_KEY=your_api_key
BREVO_NEWSLETTER_LIST_ID=2
```

## API Response Format

Successful webhook processing returns:

```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "event": "delivered",
  "email": "user@example.com"
}
```

## Testing Commands

```bash
# Test webhook endpoint is accessible
curl -I https://alocubanoboulderfest.com/api/email/brevo-webhook

# Send test webhook (requires valid signature)
npm run test:webhook

# Check webhook processing
npm run logs:webhook
```

## Support

- Brevo Documentation: https://developers.brevo.com/docs/webhooks
- Brevo Support: https://help.brevo.com
- Application Issues: alocubanoboulderfest@gmail.com

---

Last Updated: January 11, 2025
