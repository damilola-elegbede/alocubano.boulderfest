import { getDatabaseClient } from "../lib/database.js";
import ticketService from "../lib/ticket-service.js";
import ticketEmailService from "../lib/ticket-email-service.js";

async function createTestTransaction() {
  const db = await getDatabaseClient();

  console.log("=== Creating Test Transaction with Tickets ===\n");

  // Create a test transaction with line items
  const transactionId = `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

  const orderDetails = {
    line_items: [
      {
        description: "Weekend Pass Ticket",
        quantity: 2,
        amount_total: 15000, // $150.00 each
        price: {
          unit_amount: 15000,
          lookup_key: "weekend-pass", // Ensures deterministic ticket type mapping
          product: {
            id: "prod_test_weekend",
            name: "Weekend Pass",
            metadata: {
              event_id: "boulder-fest-2026", // Match production webhook structure
              event_date: "2026-05-15",
            },
          },
        },
      },
      {
        description: "Beginner Workshop Ticket",
        quantity: 1,
        amount_total: 5000, // $50.00
        price: {
          unit_amount: 5000,
          lookup_key: "workshop-beginner", // Ensures deterministic ticket type mapping
          product: {
            id: "prod_test_workshop",
            name: "Beginner Workshop",
            metadata: {
              event_id: "boulder-fest-2026", // Match production webhook structure
              event_date: "2026-05-15",
              level: "beginner",
            },
          },
        },
      },
    ],
  };

  // Insert transaction
  const result = await db.execute({
    sql: `INSERT INTO transactions (
      uuid, order_type, order_details, total_amount, currency,
      customer_email, customer_name, payment_method, status,
      fulfillment_status, paid_at, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      transactionId,
      "tickets",
      JSON.stringify(orderDetails),
      35000, // $350.00 total
      "USD",
      "test.customer@example.com",
      "Jane Smith",
      "stripe_checkout",
      "paid",
      "pending",
      new Date().toISOString(),
      "test-script",
    ],
  });

  console.log(`Created transaction: ${transactionId}`);
  console.log(`Customer: Jane Smith (test.customer@example.com)`);
  console.log(`Total: $350.00`);
  console.log(`Line Items: 3 items (2 weekend passes + 1 workshop)\n`);

  // Get the created transaction
  const txResult = await db.execute({
    sql: "SELECT * FROM transactions WHERE uuid = ?",
    args: [transactionId],
  });

  const transaction = txResult.rows[0];

  // Create tickets
  console.log("Creating tickets...");
  const tickets = await ticketService.createTicketsFromTransaction(
    transaction,
    orderDetails.line_items,
  );

  console.log(`\nCreated ${tickets.length} tickets:`);
  tickets.forEach((ticket) => {
    console.log(`  - ${ticket.ticket_id}: ${ticket.ticket_type}`);
    console.log(
      `    Attendee: ${ticket.attendee_first_name} ${ticket.attendee_last_name}`,
    );
    console.log(`    Price: $${(ticket.price_cents / 100).toFixed(2)}`);
  });

  // Send confirmation email (will just log for now)
  console.log("\nSending confirmation email...");
  await ticketEmailService.sendTicketConfirmation(transaction);

  console.log("\n=== Test Transaction Created Successfully ===");
  console.log(`\nYou can now:`);
  console.log(
    `1. Visit http://localhost:8080/my-tickets?email=test.customer@example.com`,
  );
  console.log(
    `2. Test the API: curl "http://localhost:8080/api/tickets?email=test.customer@example.com"`,
  );
  console.log(
    `3. View specific ticket: curl "http://localhost:8080/api/tickets?ticket_id=${tickets[0].ticket_id}"`,
  );

  process.exit(0);
}

createTestTransaction().catch((error) => {
  console.error("Failed to create test transaction:", error);
  process.exit(1);
});
