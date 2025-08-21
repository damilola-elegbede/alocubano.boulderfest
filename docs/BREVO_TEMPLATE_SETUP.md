# Brevo Email Template Setup

## Ticket Confirmation Email Template

This document describes the transactional email template required for the payment flow.

### Template ID: 2

The ticket confirmation template uses ID 2 in Brevo. If you need to use a different ID, update `BREVO_TICKET_CONFIRMATION_TEMPLATE_ID` in `.env.local`.

### Required Template Variables

The following variables will be passed from the payment webhook to the Brevo template:

```json
{
  "CUSTOMER_NAME": "string", // Customer's full name
  "TRANSACTION_ID": "string", // Unique transaction UUID
  "AMOUNT": "string", // Total amount (e.g., "150.00")
  "TICKET_COUNT": "number", // Number of tickets purchased
  "EVENT_DATES": "string", // "May 15-17, 2026"
  "VENUE_NAME": "string", // "Avalon Ballroom"
  "VENUE_ADDRESS": "string", // Full venue address
  "TICKET_LINK": "string", // Secure link to view tickets online
  "QR_CODE": "string", // QR code image URL or data URL
  "TICKET_DETAILS": "string" // HTML table with ticket details
}
```

### Template Structure

#### Subject Line

```
Your A Lo Cubano Boulder Fest Tickets - {{params.TRANSACTION_ID}}
```

#### Email Body (HTML)

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        padding: 20px;
      }
      .header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px;
        text-align: center;
        border-radius: 10px 10px 0 0;
      }
      .content {
        background: white;
        padding: 30px;
        border: 1px solid #e0e0e0;
        border-radius: 0 0 10px 10px;
      }
      .ticket-section {
        background: #f8f9fa;
        border: 2px solid #ce1126;
        border-radius: 12px;
        padding: 20px;
        margin: 20px 0;
      }
      .qr-container {
        text-align: center;
        margin: 20px 0;
        padding: 20px;
        background: white;
        border-radius: 8px;
      }
      .qr-code {
        width: 200px;
        height: 200px;
        padding: 10px;
        background: white;
        border: 1px solid #ddd;
      }
      .button {
        display: inline-block;
        padding: 12px 30px;
        background: #667eea;
        color: white;
        text-decoration: none;
        border-radius: 5px;
        margin: 20px 0;
      }
      .footer {
        text-align: center;
        padding: 20px;
        color: #666;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🎉 Your Tickets Are Confirmed!</h1>
        <p>A Lo Cubano Boulder Fest 2026</p>
      </div>

      <div class="content">
        <p>Hello {{params.CUSTOMER_NAME}},</p>

        <p>
          Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest
          are confirmed.
        </p>

        <h2>Order Details</h2>
        <p><strong>Order Number:</strong> {{params.TRANSACTION_ID}}</p>
        <p><strong>Total Amount:</strong> ${{params.AMOUNT}}</p>
        <p><strong>Number of Tickets:</strong> {{params.TICKET_COUNT}}</p>

        <div class="ticket-section">
          <h2>Your Tickets</h2>
          {{params.TICKET_DETAILS}}

          <div class="qr-container">
            <img src="{{params.QR_CODE}}" alt="QR Code" class="qr-code" />
            <p style="font-size: 14px; color: #666; margin-top: 10px;">
              Show this QR code at the event entrance
            </p>
          </div>
        </div>

        <h2>Event Information</h2>
        <p><strong>Venue:</strong> {{params.VENUE_NAME}}</p>
        <p><strong>Address:</strong> {{params.VENUE_ADDRESS}}</p>
        <p><strong>Dates:</strong> {{params.EVENT_DATES}}</p>

        <p style="text-align: center;">
          <a href="{{params.TICKET_LINK}}" class="button">
            View My Tickets Online
          </a>
        </p>

        <h2>What to Bring</h2>
        <ul>
          <li>Your ticket QR code (this email, mobile wallet, or printed)</li>
          <li>Valid photo ID (21+ event)</li>
          <li>Dancing shoes!</li>
        </ul>

        <h2>Add to Mobile Wallet</h2>
        <p>
          For easy access at the event, add your tickets to your phone's wallet:
        </p>
        <ul>
          <li>
            <a
              href="https://alocubanoboulderfest.com/api/tickets/apple-wallet/{{params.TRANSACTION_ID}}"
              >Add to Apple Wallet</a
            >
          </li>
          <li>
            <a
              href="https://alocubanoboulderfest.com/api/tickets/google-wallet/{{params.TRANSACTION_ID}}"
              >Add to Google Wallet</a
            >
          </li>
        </ul>

        <p>
          Questions? Reply to this email or contact us at
          alocubanoboulderfest@gmail.com
        </p>

        <p>We can't wait to see you on the dance floor!</p>

        <p>
          Warm regards,<br />
          The A Lo Cubano Team
        </p>
      </div>

      <div class="footer">
        <p>A Lo Cubano Boulder Fest | Boulder, Colorado</p>
        <p>© 2026 All rights reserved</p>
        <p>
          <a href="https://alocubanoboulderfest.com">Website</a> |
          <a href="https://www.instagram.com/alocubano.boulderfest/">Instagram</a>
        </p>
      </div>
    </div>
  </body>
</html>
```

### Email Body (Text Version)

```
Your Tickets Are Confirmed!
A Lo Cubano Boulder Fest 2026

Hello {{params.CUSTOMER_NAME}},

Thank you for your purchase! Your tickets for A Lo Cubano Boulder Fest are confirmed.

ORDER DETAILS
Order Number: {{params.TRANSACTION_ID}}
Total Amount: ${{params.AMOUNT}}
Number of Tickets: {{params.TICKET_COUNT}}

EVENT INFORMATION
Venue: {{params.VENUE_NAME}}
Address: {{params.VENUE_ADDRESS}}
Dates: {{params.EVENT_DATES}}

View your tickets online:
{{params.TICKET_LINK}}

WHAT TO BRING
- Your ticket QR code (this email, mobile wallet, or printed)
- Valid photo ID (21+ event)
- Dancing shoes!

Questions? Reply to this email or contact us at alocubanoboulderfest@gmail.com

We can't wait to see you on the dance floor!

Warm regards,
The A Lo Cubano Team
```

## Setting Up the Template in Brevo

1. Log in to your Brevo account
2. Navigate to **Transactional** → **Email Templates**
3. Click **Create a new template**
4. Choose **Design your template**
5. Set template name: "Ticket Confirmation"
6. Paste the HTML version in the HTML editor
7. Add the text version for non-HTML email clients
8. Save the template and note the **Template ID**
9. Update `.env.local` with: `BREVO_TICKET_CONFIRMATION_TEMPLATE_ID=<your_template_id>`

## Testing the Template

1. Use Brevo's test feature to send a test email with sample data
2. Verify all variables render correctly
3. Test the ticket link and wallet links
4. Check email rendering on different devices

## Fallback Behavior

If Brevo is unavailable or the template fails:

- The system logs the email details for manual sending
- Transaction and ticket data are preserved in the database
- Customer can still access tickets via the website

## Integration Flow

1. **Stripe Webhook** receives payment confirmation
2. **Transaction Service** creates transaction record
3. **Ticket Service** generates tickets with QR codes
4. **Ticket Email Service (Brevo)** sends confirmation:
   - Prepares template parameters
   - Calls Brevo API with template ID
   - Includes transaction and ticket details
   - Generates QR code URLs

## Environment Variables

Required in `.env.local`:

```bash
BREVO_API_KEY=your_api_key
BREVO_TICKET_CONFIRMATION_TEMPLATE_ID=2
BASE_URL=https://alocubanoboulderfest.com
EVENT_DATES_DISPLAY=May 15-17, 2026
VENUE_NAME=Avalon Ballroom
VENUE_ADDRESS=6185 Arapahoe Road, Boulder, CO 80303
```

## Security Considerations

- Access tokens are generated for secure ticket viewing
- QR codes include security tokens with expiration
- Email links are unique and time-limited
- Transaction IDs are UUIDs to prevent guessing

## Support

For issues with email delivery:

1. Check Brevo dashboard for delivery status
2. Verify API key and template ID in environment
3. Review webhook logs for errors
4. Contact Brevo support if needed
