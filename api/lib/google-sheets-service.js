import { google } from "googleapis";
import { getDatabaseClient } from "./database.js";

export class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    // Support both new GOOGLE_SHEETS_* and legacy GOOGLE_* environment variables
    this.sheetId = process.env.GOOGLE_SHEETS_SHEET_ID || process.env.GOOGLE_SHEET_ID;

    if (!this.sheetId) {
      throw new Error("GOOGLE_SHEETS_SHEET_ID or GOOGLE_SHEET_ID environment variable is required");
    }
  }

  /**
   * Initialize Google Sheets client
   */
  async initialize() {
    if (this.sheets) return;
    
    // In test environment, check if we should skip initialization
    if (process.env.NODE_ENV === 'test' && !process.env.GOOGLE_SHEETS_MOCK_ENABLED) {
      console.log('Skipping Google Sheets initialization in test environment');
      return;
    }

    try {
      // Create auth client (using Sheets-specific env vars with fallback to legacy vars)
      const serviceAccountEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY;
      
      if (!serviceAccountEmail || !privateKey) {
        console.warn("Google Sheets credentials not fully configured, service will be disabled");
        return; // Graceful degradation
      }
      
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: serviceAccountEmail,
          private_key: privateKey?.replace(
            /\\n/g,
            "\n",
          ),
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      // Create sheets client
      this.sheets = google.sheets({ version: "v4", auth: this.auth });

      console.log("Google Sheets client initialized");
    } catch (error) {
      console.error("Failed to initialize Google Sheets:", error);
      throw error;
    }
  }

  /**
   * Create or update sheet structure
   */
  async setupSheets() {
    await this.initialize();
    
    // Graceful handling if service is not initialized
    if (!this.sheets) {
      console.warn('Google Sheets API not available, skipping setup');
      return false;
    }

    const sheets = [
      {
        name: "Overview",
        headers: ["Metric", "Value", "Last Updated"],
      },
      {
        name: "All Registrations",
        headers: [
          "Ticket ID",
          "Order Number",
          "First Name",
          "Last Name",
          "Email",
          "Phone",
          "Ticket Type",
          "Event Date",
          "Status",
          "Checked In",
          "Check-in Time",
          "Purchase Date",
          "Price",
          "Purchaser Email",
          "Wallet Source",
          "QR Access Method",
        ],
      },
      {
        name: "Check-in Status",
        headers: [
          "Ticket ID",
          "Name",
          "Email",
          "Ticket Type",
          "Checked In?",
          "Check-in Time",
          "Checked By",
          "Wallet Source",
        ],
      },
      {
        name: "Summary by Type",
        headers: ["Ticket Type", "Total Sold", "Checked In", "Revenue"],
      },
      {
        name: "Daily Sales",
        headers: ["Date", "Tickets Sold", "Revenue", "Running Total"],
      },
      {
        name: "Wallet Analytics",
        headers: [
          "Date",
          "Total Check-ins",
          "Wallet Check-ins",
          "QR Check-ins",
          "Wallet Adoption %",
          "JWT Tokens",
          "Traditional QR",
        ],
      },
    ];

    // Get existing sheets
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.sheetId,
    });

    const existingSheets = spreadsheet.data.sheets.map(
      (s) => s.properties.title,
    );

    // Create missing sheets
    const requests = [];
    for (const sheet of sheets) {
      if (!existingSheets.includes(sheet.name)) {
        requests.push({
          addSheet: {
            properties: {
              title: sheet.name,
              gridProperties: {
                frozenRowCount: 1,
              },
            },
          },
        });
      }
    }

    if (requests.length > 0) {
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.sheetId,
        requestBody: { requests },
      });
    }

    // Set headers for each sheet
    for (const sheet of sheets) {
      await this.updateSheetData(sheet.name, [sheet.headers], "A1");
    }

    return true;
  }

  /**
   * Update sheet data
   */
  async updateSheetData(sheetName, values, range = "A1") {
    await this.initialize();
    
    // Graceful handling if service is not initialized
    if (!this.sheets) {
      console.warn('Google Sheets API not available, skipping update');
      return;
    }

    const fullRange = `${sheetName}!${range}`;

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.sheetId,
      range: fullRange,
      valueInputOption: "RAW",
      requestBody: { values },
    });
  }

  /**
   * Clear and update entire sheet
   */
  async replaceSheetData(sheetName, values) {
    await this.initialize();
    
    // Graceful handling if service is not initialized
    if (!this.sheets) {
      console.warn('Google Sheets API not available, skipping replace');
      return;
    }

    // Clear existing data (keep headers)
    await this.sheets.spreadsheets.values.clear({
      spreadsheetId: this.sheetId,
      range: `${sheetName}!A2:Z`,
    });

    // Update with new data
    if (values.length > 0) {
      await this.updateSheetData(sheetName, values, "A2");
    }
  }

  /**
   * Sync all data from database to sheets
   */
  async syncAllData() {
    // Check if service is properly initialized
    if (!this.sheets && process.env.NODE_ENV !== 'test') {
      console.warn('Google Sheets service not initialized, skipping sync');
      return { success: false, message: 'Service not initialized' };
    }
    
    const db = await getDatabaseClient();
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: process.env.SHEETS_TIMEZONE || "America/Denver",
    });

    try {
      console.log("Starting Google Sheets sync...");

      // 1. Update Overview
      await this.syncOverview(db, timestamp);

      // 2. Update All Registrations
      await this.syncRegistrations(db);

      // 3. Update Check-in Status
      await this.syncCheckinStatus(db);

      // 4. Update Summary by Type
      await this.syncSummaryByType(db);

      // 5. Update Daily Sales
      await this.syncDailySales(db);

      // 6. Update Wallet Analytics
      await this.syncWalletAnalytics(db);

      console.log("Google Sheets sync completed");
      return { success: true, timestamp };
    } catch (error) {
      console.error("Google Sheets sync failed:", error);
      throw error;
    }
  }

  /**
   * Sync overview statistics
   */
  async syncOverview(db, timestamp) {
    const stats = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM tickets WHERE status = 'valid') as total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE checked_in_at IS NOT NULL) as checked_in,
        (SELECT COUNT(DISTINCT transaction_id) FROM tickets) as total_orders,
        (SELECT SUM(total_amount) / 100.0 FROM transactions WHERE status = 'completed') as total_revenue,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%workshop%') as workshop_tickets,
        (SELECT COUNT(*) FROM tickets WHERE ticket_type LIKE '%vip%') as vip_tickets
    `);

    const data = stats.rows[0] || {};

    // Get wallet statistics (columns may not exist yet)
    let walletStats;
    try {
      walletStats = await db.execute(`
        SELECT 
          COUNT(CASE WHEN wallet_source IS NOT NULL THEN 1 END) as wallet_checkins,
          COUNT(CASE WHEN qr_access_method = 'wallet' THEN 1 END) as wallet_access,
          COUNT(CASE WHEN qr_access_method = 'qr_code' THEN 1 END) as qr_access
        FROM tickets WHERE checked_in_at IS NOT NULL
      `);
    } catch (e) {
      // Columns don't exist yet - use default values
      walletStats = {
        rows: [{ wallet_checkins: 0, wallet_access: 0, qr_access: 0 }],
      };
    }

    const walletData = walletStats.rows[0] || {};
    const checkedIn = data.checked_in || 0;
    const totalTickets = data.total_tickets || 0;
    const walletAdoption =
      checkedIn > 0
        ? Math.round(((walletData.wallet_checkins || 0) / checkedIn) * 100)
        : 0;

    const overviewData = [
      ["Total Tickets Sold", totalTickets, timestamp],
      ["Tickets Checked In", checkedIn, timestamp],
      [
        "Check-in Percentage",
        `${totalTickets > 0 ? Math.round((checkedIn / totalTickets) * 100) : 0}%`,
        timestamp,
      ],
      ["Total Orders", data.total_orders || 0, timestamp],
      ["Total Revenue", `$${(data.total_revenue || 0).toFixed(2)}`, timestamp],
      ["Workshop Tickets", data.workshop_tickets || 0, timestamp],
      ["VIP Tickets", data.vip_tickets || 0, timestamp],
      ["Wallet Check-ins", walletData.wallet_checkins || 0, timestamp],
      ["Wallet Adoption Rate", `${walletAdoption}%`, timestamp],
      ["Last Sync", timestamp, ""],
    ];

    await this.replaceSheetData("Overview", overviewData);
  }

  /**
   * Sync all registrations
   */
  async syncRegistrations(db) {
    const registrations = await db.execute(`
      SELECT 
        t.ticket_id,
        tr.uuid as order_number,
        t.attendee_first_name,
        t.attendee_last_name,
        t.attendee_email,
        t.attendee_phone,
        t.ticket_type,
        t.event_date,
        t.status,
        CASE WHEN t.checked_in_at IS NOT NULL THEN 'Yes' ELSE 'No' END as checked_in,
        t.checked_in_at,
        t.created_at as purchase_date,
        t.price_cents / 100.0 as price,
        tr.customer_email as purchaser_email,
        NULL as wallet_source,
        NULL as qr_access_method
      FROM tickets t
      JOIN transactions tr ON t.transaction_id = tr.id
      ORDER BY t.created_at DESC
    `);

    const data = (registrations.rows || []).map((row) => [
      row.ticket_id,
      row.order_number,
      row.attendee_first_name || "",
      row.attendee_last_name || "",
      row.attendee_email || "",
      row.attendee_phone || "",
      this.formatTicketType(row.ticket_type),
      this.formatDate(row.event_date),
      row.status,
      row.checked_in,
      this.formatDateTime(row.checked_in_at),
      this.formatDateTime(row.purchase_date),
      `$${(row.price || 0).toFixed(2)}`,
      row.purchaser_email || "",
      row.wallet_source || "N/A",
      row.qr_access_method || "N/A",
    ]);

    await this.replaceSheetData("All Registrations", data);
  }

  /**
   * Sync check-in status
   */
  async syncCheckinStatus(db) {
    const checkins = await db.execute(`
      SELECT 
        ticket_id,
        attendee_first_name || ' ' || attendee_last_name as name,
        attendee_email,
        ticket_type,
        CASE WHEN checked_in_at IS NOT NULL THEN 'Yes' ELSE 'No' END as checked_in,
        checked_in_at,
        checked_in_by,
        NULL as wallet_source
      FROM tickets
      WHERE status = 'valid'
      ORDER BY checked_in_at DESC NULLS LAST, ticket_id
    `);

    const data = (checkins.rows || []).map((row) => [
      row.ticket_id,
      (row.name && typeof row.name === 'string' ? row.name.trim() : row.name) || "N/A",
      row.attendee_email || "",
      this.formatTicketType(row.ticket_type),
      row.checked_in,
      this.formatDateTime(row.checked_in_at),
      row.checked_in_by || "",
      row.wallet_source || "N/A",
    ]);

    await this.replaceSheetData("Check-in Status", data);
  }

  /**
   * Sync summary by ticket type
   */
  async syncSummaryByType(db) {
    const summary = await db.execute(`
      SELECT 
        ticket_type,
        COUNT(*) as total_sold,
        COUNT(CASE WHEN checked_in_at IS NOT NULL THEN 1 END) as checked_in,
        SUM(price_cents) / 100.0 as revenue
      FROM tickets
      WHERE status = 'valid'
      GROUP BY ticket_type
      ORDER BY total_sold DESC
    `);

    const data = (summary.rows || []).map((row) => [
      this.formatTicketType(row.ticket_type),
      row.total_sold,
      row.checked_in,
      `$${(row.revenue || 0).toFixed(2)}`,
    ]);

    await this.replaceSheetData("Summary by Type", data);
  }

  /**
   * Sync daily sales
   */
  async syncDailySales(db) {
    const sales = await db.execute(`
      SELECT 
        date(created_at) as sale_date,
        COUNT(*) as tickets_sold,
        SUM(price_cents) / 100.0 as revenue
      FROM tickets
      WHERE status = 'valid'
      GROUP BY date(created_at)
      ORDER BY sale_date DESC
    `);

    let runningTotal = 0;
    const data = (sales.rows || [])
      .reverse()
      .map((row) => {
        runningTotal += row.revenue || 0;
        return [
          this.formatDate(row.sale_date),
          row.tickets_sold,
          `$${(row.revenue || 0).toFixed(2)}`,
          `$${runningTotal.toFixed(2)}`,
        ];
      })
      .reverse();

    await this.replaceSheetData("Daily Sales", data);
  }

  /**
   * Sync wallet analytics
   */
  async syncWalletAnalytics(db) {
    // For now, return empty data since wallet columns don't exist yet
    const analytics = { rows: [] };

    try {
      // Try to get wallet analytics if columns exist
      const result = await db.execute(`
        SELECT 
          date(checked_in_at) as checkin_date,
          COUNT(*) as total_checkins,
          COUNT(CASE WHEN wallet_source IS NOT NULL THEN 1 END) as wallet_checkins,
          COUNT(CASE WHEN wallet_source IS NULL THEN 1 END) as qr_checkins,
          COUNT(CASE WHEN qr_access_method = 'wallet' THEN 1 END) as jwt_tokens,
          COUNT(CASE WHEN qr_access_method = 'qr_code' THEN 1 END) as traditional_qr
        FROM tickets
        WHERE checked_in_at IS NOT NULL
        GROUP BY date(checked_in_at)
        ORDER BY checkin_date DESC
      `);
      analytics.rows = result.rows || [];
    } catch (e) {
      // Columns don't exist, use fallback query
      const result = await db.execute(`
        SELECT 
          date(checked_in_at) as checkin_date,
          COUNT(*) as total_checkins,
          0 as wallet_checkins,
          COUNT(*) as qr_checkins,
          0 as jwt_tokens,
          0 as traditional_qr
        FROM tickets
        WHERE checked_in_at IS NOT NULL
        GROUP BY date(checked_in_at)
        ORDER BY checkin_date DESC
      `);
      analytics.rows = result.rows || [];
    }

    const data = (analytics.rows || []).map((row) => {
      const totalCheckins = row.total_checkins || 0;
      const walletCheckins = row.wallet_checkins || 0;
      const walletAdoption =
        totalCheckins > 0
          ? Math.round((walletCheckins / totalCheckins) * 100)
          : 0;

      return [
        this.formatDate(row.checkin_date),
        totalCheckins,
        walletCheckins,
        row.qr_checkins || 0,
        `${walletAdoption}%`,
        row.jwt_tokens || 0,
        row.traditional_qr || 0,
      ];
    });

    await this.replaceSheetData("Wallet Analytics", data);
  }

  /**
   * Format ticket type for display
   */
  formatTicketType(type) {
    const typeMap = {
      "vip-pass": "VIP Pass",
      "weekend-pass": "Weekend Pass",
      "friday-pass": "Friday Pass",
      "saturday-pass": "Saturday Pass",
      "sunday-pass": "Sunday Pass",
      "workshop-beginner": "Beginner Workshop",
      "workshop-intermediate": "Intermediate Workshop",
      "workshop-advanced": "Advanced Workshop",
      workshop: "Workshop",
      "social-dance": "Social Dance",
      "general-admission": "General Admission",
    };

    return typeMap[type] || type || "Unknown";
  }

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return "";

    try {
      // Parse the date string and create a date at noon to avoid timezone shifts
      const date = new Date(dateStr + "T12:00:00");
      return date.toLocaleDateString("en-US", {
        timeZone: process.env.SHEETS_TIMEZONE || "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (error) {
      return dateStr;
    }
  }

  /**
   * Format datetime for display
   */
  formatDateTime(dateTimeStr) {
    if (!dateTimeStr) return "";

    try {
      const date = new Date(dateTimeStr);
      return date.toLocaleString("en-US", {
        timeZone: process.env.SHEETS_TIMEZONE || "America/Denver",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (error) {
      return dateTimeStr;
    }
  }

  /**
   * Apply formatting to sheet
   */
  async applyFormatting() {
    await this.initialize();
    
    // Graceful handling if service is not initialized
    if (!this.sheets) {
      console.warn('Google Sheets API not available, skipping formatting');
      return;
    }

    const requests = [
      // Bold headers
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: { bold: true },
              backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 },
            },
          },
          fields: "userEnteredFormat(textFormat,backgroundColor)",
        },
      },
      // Auto-resize columns
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: 0,
            dimension: "COLUMNS",
            startIndex: 0,
            endIndex: 20,
          },
        },
      },
    ];

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.sheetId,
      requestBody: { requests },
    });
  }
}

export default new GoogleSheetsService();
