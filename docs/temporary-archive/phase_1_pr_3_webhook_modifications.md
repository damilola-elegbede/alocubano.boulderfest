# Phase 1 PR 3: Webhook Modifications for Universal Registration

## Overview
- **PRD Reference**: [prd.md](./prd.md) Section: Functional Requirements
- **Requirements**: REQ-FUNC-001, REQ-FUNC-002, REQ-FUNC-004, REQ-DB-004
- **Dependencies**: Phase 1 PR 1 (database), Phase 1 PR 2 (security)
- **Duration**: 1 day

## Tasks

### Task_1_3_01: Modify Stripe Webhook for Universal Registration
- **Assignee**: backend-engineer
- **Execution**: Depends on PR 1 and PR 2
- **Duration**: 3-4 hours
- **PRD Requirements**: REQ-FUNC-001, REQ-FUNC-004
- **Technical Details**:
  - Modify `/api/payments/stripe-webhook.js`
  - Remove conditional logic (single vs multiple tickets)
  - Parse Stripe customer_name into first/last name
  - Create all tickets with pending registration status
  - Set 72-hour registration deadline for all tickets
  - Generate registration token for transaction
  - Send registration email immediately
- **Acceptance Criteria**:
  - All purchases trigger registration flow
  - Customer name parsed intelligently
  - Registration deadline set correctly (72 hours)
  - Token generated and stored
  - Email sent successfully
- **Testing**:
  - Test with single ticket purchase
  - Test with multiple ticket purchase
  - Test name parsing variations
  - Test email delivery
- **PRD Validation**: Implements universal registration per REQ-FUNC-001

```javascript
// Enhanced api/payments/stripe-webhook.js
import { getDatabase } from '../lib/database.js';
import { RegistrationTokenService } from '../lib/registration-token-service.js';
import { getTicketEmailService } from '../lib/ticket-email-service-brevo.js';
import { scheduleRegistrationReminders } from '../lib/reminder-scheduler.js';

// Helper to parse Stripe's single name field
function parseCustomerName(stripeCustomerName) {
  if (!stripeCustomerName) {
    return { firstName: 'Guest', lastName: 'Attendee' };
  }
  
  const parts = stripeCustomerName.trim().split(/\s+/);
  
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  } else if (parts.length === 2) {
    return { firstName: parts[0], lastName: parts[1] };
  } else {
    // Multiple parts - everything except last is first name
    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return { firstName, lastName };
  }
}

async function handleCheckoutCompleted(session) {
  const db = await getDatabase();
  const tokenService = new RegistrationTokenService();
  const emailService = getTicketEmailService();
  
  try {
    // Start transaction
    await db.execute('BEGIN IMMEDIATE');
    
    // Create transaction record (existing code)
    const transaction = await createTransaction(session);
    
    // Parse customer name for default values
    const { firstName, lastName } = parseCustomerName(
      session.customer_details?.name || 'Guest'
    );
    
    // Calculate registration deadline (72 hours from now)
    const now = new Date();
    const registrationDeadline = new Date(now.getTime() + (72 * 60 * 60 * 1000));
    
    // Create tickets with pending registration status
    const tickets = [];
    const lineItems = session.line_items?.data || [];
    
    for (const item of lineItems) {
      const quantity = item.quantity || 1;
      
      for (let i = 0; i < quantity; i++) {
        const ticketId = generateTicketId();
        
        // Create ticket with pending registration
        await db.execute({
          sql: `INSERT INTO tickets (
            ticket_id, transaction_id, ticket_type, event_id,
            event_date, price_cents, 
            registration_status, registration_deadline,
            status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            ticketId,
            transaction.id,
            item.price?.lookup_key || 'general',
            'boulder-fest-2026',
            '2026-05-15',
            item.amount_total || 0,
            'pending', // All tickets start pending
            registrationDeadline.toISOString(),
            'valid',
            now.toISOString()
          ]
        });
        
        // Schedule reminders for this ticket
        await scheduleRegistrationReminders(ticketId, registrationDeadline);
        
        tickets.push({
          id: ticketId,
          type: item.price?.lookup_key || 'general'
        });
      }
    }
    
    // Generate registration token
    const registrationToken = await tokenService.createToken(transaction.id);
    
    // Send registration invitation email
    await emailService.sendRegistrationInvitation({
      transactionId: transaction.id,
      customerEmail: session.customer_details?.email,
      customerName: session.customer_details?.name || 'Guest',
      ticketCount: tickets.length,
      registrationToken,
      registrationDeadline,
      tickets
    });
    
    // Log email sent
    await db.execute({
      sql: `INSERT INTO registration_emails (
        ticket_id, transaction_id, email_type, 
        recipient_email, sent_at
      ) VALUES (?, ?, ?, ?, ?)`,
      args: [
        tickets[0].id, // Associate with first ticket
        transaction.id,
        'registration_invitation',
        session.customer_details?.email,
        now.toISOString()
      ]
    });
    
    // Commit transaction
    await db.execute('COMMIT');
    
    console.log(`Universal registration initiated for transaction ${transaction.id}`);
    console.log(`${tickets.length} tickets created with pending status`);
    console.log(`Registration deadline: ${registrationDeadline.toISOString()}`);
    
  } catch (error) {
    await db.execute('ROLLBACK');
    console.error('Failed to process checkout with registration:', error);
    throw error;
  }
}
```

### Task_1_3_02: Create Reminder Scheduling Service
- **Assignee**: backend-engineer
- **Execution**: Independent
- **Duration**: 3 hours
- **PRD Requirements**: REQ-FUNC-003, REQ-DB-002
- **Technical Details**:
  - Create `/api/lib/reminder-scheduler.js`
  - Schedule 4 reminders per ticket (72hr, 48hr, 24hr, 2hr)
  - Store reminders in registration_reminders table
  - Calculate reminder times from deadline
  - Handle timezone considerations
- **Acceptance Criteria**:
  - All 4 reminders scheduled correctly
  - Reminder times calculated from deadline
  - Database records created successfully
  - Duplicate reminders prevented
- **Testing**:
  - Verify reminder scheduling logic
  - Test database insertion
  - Test duplicate prevention
  - Test timezone handling
- **PRD Validation**: Implements reminder system per REQ-FUNC-003

```javascript
// api/lib/reminder-scheduler.js
import { getDatabase } from './database.js';

export class ReminderScheduler {
  constructor() {
    this.reminderTypes = [
      { type: '72hr', hoursBeforeDeadline: 72 },
      { type: '48hr', hoursBeforeDeadline: 48 },
      { type: '24hr', hoursBeforeDeadline: 24 },
      { type: 'final', hoursBeforeDeadline: 2 }
    ];
  }
  
  async scheduleRemindersForTicket(ticketId, registrationDeadline) {
    const db = await getDatabase();
    const reminders = [];
    
    for (const reminder of this.reminderTypes) {
      const scheduledAt = new Date(registrationDeadline);
      scheduledAt.setHours(
        scheduledAt.getHours() - reminder.hoursBeforeDeadline
      );
      
      // Only schedule if time hasn't passed
      if (scheduledAt > new Date()) {
        reminders.push({
          ticketId,
          type: reminder.type,
          scheduledAt: scheduledAt.toISOString()
        });
      }
    }
    
    // Insert reminders (ignore duplicates)
    for (const reminder of reminders) {
      try {
        await db.execute({
          sql: `INSERT INTO registration_reminders (
            ticket_id, reminder_type, scheduled_at, status
          ) VALUES (?, ?, ?, 'scheduled')`,
          args: [reminder.ticketId, reminder.type, reminder.scheduledAt]
        });
      } catch (error) {
        // Ignore unique constraint violations (duplicates)
        if (!error.message.includes('UNIQUE')) {
          throw error;
        }
      }
    }
    
    return reminders.length;
  }
  
  async cancelRemindersForTicket(ticketId) {
    const db = await getDatabase();
    
    const result = await db.execute({
      sql: `UPDATE registration_reminders 
            SET status = 'cancelled' 
            WHERE ticket_id = ? 
            AND status = 'scheduled'`,
      args: [ticketId]
    });
    
    return result.rowsAffected;
  }
  
  async getPendingReminders(limit = 100) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    
    const result = await db.execute({
      sql: `SELECT r.*, t.transaction_id, t.attendee_email,
                   tx.customer_email, tx.customer_name
            FROM registration_reminders r
            JOIN tickets t ON r.ticket_id = t.ticket_id
            JOIN transactions tx ON t.transaction_id = tx.id
            WHERE r.status = 'scheduled'
            AND r.scheduled_at <= ?
            AND t.registration_status = 'pending'
            ORDER BY r.scheduled_at ASC
            LIMIT ?`,
      args: [now, limit]
    });
    
    return result.rows;
  }
  
  async markReminderSent(reminderId, success = true) {
    const db = await getDatabase();
    const now = new Date().toISOString();
    
    await db.execute({
      sql: `UPDATE registration_reminders 
            SET status = ?, sent_at = ?
            WHERE id = ?`,
      args: [success ? 'sent' : 'failed', now, reminderId]
    });
  }
}

// Export singleton instance
let schedulerInstance;
export function getReminderScheduler() {
  if (!schedulerInstance) {
    schedulerInstance = new ReminderScheduler();
  }
  return schedulerInstance;
}

// Helper function for webhook
export async function scheduleRegistrationReminders(ticketId, deadline) {
  const scheduler = getReminderScheduler();
  return await scheduler.scheduleRemindersForTicket(ticketId, deadline);
}
```

### Task_1_3_03: Implement Ticket ID Generation Service
- **Assignee**: backend-engineer
- **Execution**: Independent
- **Duration**: 2 hours
- **PRD Requirements**: REQ-FUNC-002, REQ-DB-004
- **Technical Details**:
  - Create `/api/lib/ticket-id-generator.js`
  - Generate unique ticket IDs (TKT-XXXXXXXXX format)
  - Use cryptographically secure random generation
  - Ensure uniqueness through database check
  - Support for batch generation
- **Acceptance Criteria**:
  - IDs follow TKT-XXXXXXXXX format
  - IDs are globally unique
  - Generation is cryptographically secure
  - Batch generation efficient
- **Testing**:
  - Test ID uniqueness
  - Test format compliance
  - Test batch generation
  - Test collision handling
- **PRD Validation**: Supports ticket tracking per REQ-FUNC-002

```javascript
// api/lib/ticket-id-generator.js
import crypto from 'crypto';
import { getDatabase } from './database.js';

export class TicketIdGenerator {
  constructor() {
    this.prefix = 'TKT';
    this.idLength = 9;
    this.charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  }
  
  generateId() {
    const randomBytes = crypto.randomBytes(Math.ceil(this.idLength * 3/4));
    let id = '';
    
    for (let i = 0; i < this.idLength; i++) {
      const byte = randomBytes[i % randomBytes.length];
      id += this.charset[byte % this.charset.length];
    }
    
    return `${this.prefix}-${id}`;
  }
  
  async generateUniqueId(maxAttempts = 10) {
    const db = await getDatabase();
    
    for (let i = 0; i < maxAttempts; i++) {
      const id = this.generateId();
      
      // Check uniqueness
      const result = await db.execute({
        sql: 'SELECT COUNT(*) as count FROM tickets WHERE ticket_id = ?',
        args: [id]
      });
      
      if (result.rows[0].count === 0) {
        return id;
      }
    }
    
    throw new Error('Failed to generate unique ticket ID after maximum attempts');
  }
  
  async generateBatch(count) {
    const ids = new Set();
    const db = await getDatabase();
    
    // Generate more than needed to account for potential collisions
    const generateCount = Math.ceil(count * 1.2);
    
    for (let i = 0; i < generateCount && ids.size < count; i++) {
      ids.add(this.generateId());
    }
    
    // Check uniqueness in batch
    const idArray = Array.from(ids);
    const placeholders = idArray.map(() => '?').join(',');
    
    const result = await db.execute({
      sql: `SELECT ticket_id FROM tickets WHERE ticket_id IN (${placeholders})`,
      args: idArray
    });
    
    // Remove any that already exist
    const existing = new Set(result.rows.map(r => r.ticket_id));
    const unique = idArray.filter(id => !existing.has(id));
    
    // Generate more if needed
    while (unique.length < count) {
      const newId = await this.generateUniqueId();
      unique.push(newId);
    }
    
    return unique.slice(0, count);
  }
}

// Export singleton instance
let generatorInstance;
export function getTicketIdGenerator() {
  if (!generatorInstance) {
    generatorInstance = new TicketIdGenerator();
  }
  return generatorInstance;
}

// Helper function for webhook
export function generateTicketId() {
  const generator = getTicketIdGenerator();
  return generator.generateUniqueId();
}
```

## Success Criteria
- Webhook processes all purchases with registration flow
- Customer names parsed correctly into first/last
- Registration deadlines set to 72 hours
- All tickets created with pending status
- Reminders scheduled for each ticket
- Registration emails sent immediately
- All PRD functional requirements satisfied

## Testing Checklist
- [ ] Single ticket purchases trigger registration
- [ ] Multiple ticket purchases trigger registration
- [ ] Name parsing handles various formats correctly
- [ ] Registration deadline is exactly 72 hours
- [ ] All 4 reminders scheduled per ticket
- [ ] Registration token generated and stored
- [ ] Email sent with correct content
- [ ] Database transaction maintains consistency

## Integration Testing
- [ ] Webhook → Token Service integration
- [ ] Webhook → Email Service integration
- [ ] Webhook → Reminder Scheduler integration
- [ ] Database transaction rollback on failure
- [ ] Error handling and logging complete

## Notes
- Test with various Stripe customer name formats
- Ensure database transaction atomicity
- Monitor email delivery success rates
- Consider adding webhook replay capability