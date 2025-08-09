import { getDatabase } from "../api/lib/database.js";
import ticketService from "../api/lib/ticket-service.js";

async function testTickets() {
  const db = getDatabase();

  console.log("=== Testing Ticket Generation System ===\n");

  // Get a recent transaction
  const result = await db.execute(`
    SELECT * FROM transactions 
    WHERE status IN ('completed', 'paid') 
    ORDER BY created_at DESC 
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    console.log("No transactions found. Create a test purchase first.");
    console.log("\nTo create a test purchase:");
    console.log("1. Run: npm start");
    console.log("2. Visit: http://localhost:8080/tickets");
    console.log("3. Complete a test purchase with card: 4242 4242 4242 4242");
    process.exit(1);
  }

  const transaction = result.rows[0];
  console.log(`Testing with transaction: ${transaction.uuid}`);
  console.log(
    `Customer: ${transaction.customer_name} (${transaction.customer_email})`,
  );
  console.log(`Amount: $${(transaction.total_amount / 100).toFixed(2)}`);
  console.log(`Status: ${transaction.status}\n`);

  // Check for existing tickets
  const existingTickets = await ticketService.getTransactionTickets(
    transaction.id,
  );

  if (existingTickets.length > 0) {
    console.log(`Found ${existingTickets.length} existing tickets:`);
    existingTickets.forEach((ticket) => {
      console.log(
        `  - ${ticket.ticket_id}: ${ticket.ticket_type} (${ticket.status})`,
      );
      console.log(
        `    Attendee: ${ticket.attendee_first_name} ${ticket.attendee_last_name}`,
      );
    });
  } else {
    console.log("No tickets found for this transaction. Creating tickets...\n");

    // Parse line items from order data
    let orderData = {};
    let lineItems = [];

    try {
      orderData = JSON.parse(transaction.order_details || "{}");
      lineItems = orderData.line_items || [];
    } catch (error) {
      console.error("Error parsing order details JSON:", error);
      console.log("Invalid order_details:", transaction.order_details);
      lineItems = [];
    }

    if (lineItems.length === 0) {
      console.log("No line items found in transaction order data.");
      console.log(
        "This may be an older transaction. Skipping ticket creation.",
      );
    } else {
      console.log(`Found ${lineItems.length} line items:`);
      lineItems.forEach((item) => {
        console.log(
          `  - ${item.description}: $${(item.amount_total / 100).toFixed(2)} x ${item.quantity || 1}`,
        );
      });

      console.log("\nCreating tickets...");
      const tickets = await ticketService.createTicketsFromTransaction(
        transaction,
        lineItems,
      );

      console.log(`\nCreated ${tickets.length} tickets:`);
      tickets.forEach((ticket) => {
        console.log(`  - ${ticket.ticket_id}: ${ticket.ticket_type}`);
        console.log(
          `    Attendee: ${ticket.attendee_first_name} ${ticket.attendee_last_name}`,
        );
        console.log(`    Event Date: ${ticket.event_date || "N/A"}`);
      });
    }
  }

  // Test ticket lookup by email
  console.log(`\n=== Testing Email Lookup ===`);
  const emailTickets = await ticketService.getTicketsByEmail(
    transaction.customer_email,
  );
  console.log(
    `Total tickets for ${transaction.customer_email}: ${emailTickets.length}`,
  );

  if (emailTickets.length > 0) {
    console.log("\nTickets by type:");
    const ticketTypes = {};
    emailTickets.forEach((ticket) => {
      ticketTypes[ticket.ticket_type] =
        (ticketTypes[ticket.ticket_type] || 0) + 1;
    });
    Object.entries(ticketTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }

  // Test ticket ID generation
  console.log("\n=== Testing Ticket ID Generation ===");
  for (let i = 0; i < 5; i++) {
    const ticketId = ticketService.generateTicketId();
    console.log(`  Generated ID ${i + 1}: ${ticketId}`);
  }

  // Test ticket type extraction
  console.log("\n=== Testing Ticket Type Extraction ===");
  const testItems = [
    { description: "VIP Weekend Pass" },
    { description: "Friday Night Social Dance" },
    { description: "Beginner Workshop - Salsa Basics" },
    { description: "General Admission Ticket" },
    { description: "Donation to Support Festival" },
  ];

  testItems.forEach((item) => {
    const isTicket = ticketService.isTicketItem(item);
    const ticketType = ticketService.extractTicketType(item);
    console.log(`  "${item.description}"`);
    console.log(`    Is ticket: ${isTicket}`);
    console.log(`    Type: ${ticketType}`);
  });

  console.log("\n=== Test Complete ===");
  console.log("\nNext steps:");
  console.log(
    `1. Visit http://localhost:8080/my-tickets?email=${encodeURIComponent(transaction.customer_email)}`,
  );
  console.log("2. Check the ticket portal displays correctly");
  console.log(
    '3. Test the API directly: curl "http://localhost:8080/api/tickets?email=' +
      encodeURIComponent(transaction.customer_email) +
      '"',
  );

  process.exit(0);
}

testTickets().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
