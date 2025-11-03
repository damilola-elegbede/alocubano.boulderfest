# Google Sheets Export - Enhanced Features

## Overview

The Google Sheets integration has been enhanced with advanced filtering, sorting, and analytics capabilities. This document describes the new features and how to use them.

## What's New

### 1. Native Google Sheets Filters & Sorting

Three key data sheets now have enhanced usability:
- **All Registrations** (16 columns)
- **Check-in Status** (8 columns)
- **Daily Sales** (4 columns)

#### Features Added:
- **Filter buttons** on all column headers
- **Data validation dropdowns** for categorical columns
- **Default sorting** optimized for each sheet
- **Frozen headers** and first column for easier navigation

### 2. Analytics Pivot Sheets

Four new dedicated sheets provide pre-computed analytics:
- **Pivot: Revenue Analysis**
- **Pivot: Attendance Tracking**
- **Pivot: Wallet Adoption**
- **Pivot: Customer Behavior**

These sheets auto-update on every sync with aggregated insights.

### 3. Payment Method Column

The "All Registrations" sheet now includes a **Payment Method** column showing:
- Stripe
- PayPal
- Venmo
- Cash
- Card Terminal
- Comp

---

## Sheet Details

### All Registrations (Enhanced)

**New columns:** 17 (was 16)
- Added: Payment Method

**Filters & Validation:**
- Status: dropdown (valid, cancelled, transferred)
- Checked In: dropdown (Yes, No)
- Wallet Pass Type: dropdown (Apple Wallet, Google Wallet, None)
- Has Wallet Pass: dropdown (Yes, No)
- Payment Method: dropdown (Stripe, PayPal, Venmo, Cash, Card Terminal, Comp)

**Default Sort:** Purchase Date DESC (newest first)

**Frozen:** Row 1 (headers) + Column A (Ticket ID)

---

### Check-in Status (Enhanced)

**Filters & Validation:**
- Checked In?: dropdown (Yes, No)
- Pass Delivery: dropdown (Apple Wallet, Google Wallet, Email/QR Code)

**Default Sort:** Check-in Time DESC (most recent first)

**Frozen:** Row 1 (headers) + Column A (Ticket ID)

---

### Daily Sales (Enhanced)

**Filters:** Enabled on all 4 columns

**Default Sort:** Date ASC (oldest to newest for time series)

**Frozen:** Row 1 (headers) + Column A (Date)

---

### Pivot: Revenue Analysis

Pre-computed revenue analytics updated on every sync:

#### Table 1: Revenue by Ticket Type
| Ticket Type | Total Revenue | Tickets Sold | Avg Price |
|-------------|---------------|--------------|-----------|
| Weekend Pass| $5,000.00     | 50           | $100.00   |
| VIP Pass    | $1,500.00     | 10           | $150.00   |

#### Table 2: Revenue by Payment Method
| Payment Method | Total Revenue | Transactions | % of Total |
|----------------|---------------|--------------|------------|
| Stripe         | $3,000.00     | 30           | 60.0%      |
| PayPal         | $2,000.00     | 20           | 40.0%      |

#### Table 3: Revenue Over Time (Monthly)
| Month   | Revenue    | Tickets Sold |
|---------|------------|--------------|
| 2026-01 | $5,000.00  | 50           |
| 2026-02 | $7,500.00  | 75           |

**Use Cases:**
- Identify top-selling ticket types
- Analyze payment processor performance
- Track revenue trends over time

---

### Pivot: Attendance Tracking

Pre-computed attendance analytics:

#### Table 1: Check-ins by Ticket Type
| Ticket Type  | Total Sold | Checked In | Not Checked In | Check-in % |
|--------------|------------|------------|----------------|------------|
| Weekend Pass | 100        | 75         | 25             | 75.0%      |
| VIP Pass     | 20         | 18         | 2              | 90.0%      |

#### Table 2: Check-ins by Event Date
| Event Date | Total Tickets | Checked In | Check-in % |
|------------|---------------|------------|------------|
| 05/15/2026 | 150           | 120        | 80.0%      |
| 05/16/2026 | 200           | 180        | 90.0%      |

#### Table 3: Check-in Timeline (by hour)
| Hour  | Check-ins |
|-------|-----------|
| 18:00 | 45        |
| 19:00 | 68        |
| 20:00 | 52        |

**Use Cases:**
- Monitor check-in rates by ticket type
- Track attendance by event date
- Identify peak check-in times for staffing

---

### Pivot: Wallet Adoption

Digital wallet usage analytics:

#### Table 1: Wallet Type Distribution
| Wallet Type   | Count | % of Total |
|---------------|-------|------------|
| Apple Wallet  | 50    | 50.0%      |
| Google Wallet | 30    | 30.0%      |
| No Wallet     | 20    | 20.0%      |

#### Table 2: Wallet Adoption Over Time (Weekly)
| Week    | Total Tickets | With Wallet | Adoption % |
|---------|---------------|-------------|------------|
| 2026-W01| 100           | 80          | 80.0%      |
| 2026-W02| 150           | 135         | 90.0%      |

#### Table 3: Wallet Adoption by Ticket Type
| Ticket Type  | Total Tickets | With Wallet | Adoption % |
|--------------|---------------|-------------|------------|
| Weekend Pass | 100           | 80          | 80.0%      |
| VIP Pass     | 50            | 45          | 90.0%      |

**Use Cases:**
- Track digital wallet adoption trends
- Compare adoption rates across ticket types
- Measure impact of wallet pass campaigns

---

### Pivot: Customer Behavior

Purchase pattern analytics:

#### Table 1: Tickets per Order
| Tickets per Order | Number of Orders | Avg Order Value |
|-------------------|------------------|-----------------|
| 1 ticket          | 50               | $100.00         |
| 2 tickets         | 30               | $180.00         |
| 3 tickets         | 15               | $270.00         |

#### Table 2: Purchase Day Patterns
| Day of Week | Orders | Avg Order Value | Total Revenue |
|-------------|--------|-----------------|---------------|
| Monday      | 10     | $120.00         | $1,200.00     |
| Friday      | 40     | $135.00         | $5,400.00     |
| Saturday    | 25     | $125.00         | $3,125.00     |

#### Table 3: Top Ticket Type Combinations (Multi-Ticket Orders)
| Order Number | Ticket Types                        | Total Tickets | Order Value |
|--------------|-------------------------------------|---------------|-------------|
| ORD-001      | Weekend Pass, Beginner Workshop     | 2             | $150.00     |
| ORD-002      | VIP Pass, Advanced Workshop         | 2             | $200.00     |

**Use Cases:**
- Understand typical order sizes
- Identify best days for promotions
- Discover popular ticket combinations for bundling

---

## How to Use Filters

### Accessing Filters

1. Open your Google Sheet
2. Navigate to any of the enhanced sheets (All Registrations, Check-in Status, Daily Sales)
3. Click the filter icon (funnel) in any column header

### Using Dropdowns

Columns with data validation have dropdown arrows:
- Click the arrow to see predefined options
- Select one or more values
- Values not in the dropdown can still be typed manually (non-strict validation)

### Filtering Multiple Columns

Filters work together - you can filter by multiple columns simultaneously:
- Example: Show only "valid" tickets that are "not checked in" and paid via "Stripe"

### Clearing Filters

- Click the filter icon and select "Clear" for a specific column
- Or: Data → Remove filter to clear all filters

---

## How Sorting Works

### Default Sorts

Each enhanced sheet has an optimized default sort:
- **All Registrations:** Newest purchases first (Purchase Date DESC)
- **Check-in Status:** Most recent check-ins first (Check-in Time DESC)
- **Daily Sales:** Oldest to newest for time series analysis (Date ASC)

### Custom Sorting

To sort by a different column:
1. Click the column header
2. Data → Sort sheet by column [X]
3. Choose ascending or descending

**Note:** Custom sorts are temporary and will reset to default on next sync.

---

## Sync Frequency & Timing

### Automatic Sync

- **Schedule:** Every 6 hours
- **Times:** 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM (Mountain Time)
- **Duration:** ~30-45 seconds

### Manual Sync

Trigger a sync from the admin dashboard:
1. Go to Admin Dashboard
2. Click "Sync to Sheets" button
3. Wait for success confirmation (~30-45 seconds)

### What Happens During Sync

1. All 6 data sheets are updated with latest data
2. Filters and sorting are refreshed
3. 4 pivot sheets are recalculated with new aggregations
4. Data validation dropdowns are updated

**Important:** Any manual edits in Google Sheets will be overwritten during sync.

---

## Tips & Best Practices

### Performance

- **Large datasets:** Filters and sorts are optimized by Google Sheets - no performance impact on sync
- **API quota:** Enhanced features use ~15-17 API requests per sync (well within Google's 100/100s limit)

### Data Integrity

- **Read-only use:** Treat the synced sheets as read-only
- **Analysis:** Create new sheets or tabs for custom calculations that reference the synced data
- **Backups:** Google Sheets auto-saves version history (File → Version history)

### Advanced Usage

#### Creating Charts from Pivot Data

1. Select data range in any pivot sheet
2. Insert → Chart
3. Customize chart type and styling
4. Place on dashboard tab for easy viewing

#### Linking to Other Sheets

You can reference synced data in other sheets:
```
='All Registrations'!A2:Q1000
```

#### Creating Custom Aggregations

Use Google Sheets formulas to create additional insights:
```
=COUNTIF('All Registrations'!I:I, "valid")
=SUMIF('All Registrations'!M:M, ">100")
```

---

## Troubleshooting

### Filters Not Showing

**Problem:** Filter buttons don't appear after sync

**Solution:**
- Refresh the sheet (Cmd+R or Ctrl+R)
- Check that you're on the correct sheet (All Registrations, Check-in Status, or Daily Sales)
- Verify sync completed successfully (check admin dashboard)

### Dropdowns Empty

**Problem:** Data validation dropdowns show no options

**Solution:**
- Trigger a manual sync from admin dashboard
- Check that data exists in the database
- Verify Google Sheets API permissions

### Pivot Tables Not Updating

**Problem:** Pivot sheets show old or empty data

**Solution:**
- Check that database has data for the relevant metrics
- Trigger manual sync
- Verify no errors in admin dashboard sync logs

### Sort Order Resets

**Problem:** Custom sort order changes back to default

**Solution:**
- This is expected behavior - sorts reset on each sync
- To maintain custom sort: Copy data to a new sheet and sort there
- Or: Adjust default sort in `lib/google-sheets-service.js` (requires code change)

---

## Technical Details

### File Locations

- **Service:** `lib/google-sheets-service.js`
- **Tests:** `tests/unit/lib/google-sheets-service.test.js`
- **API Endpoints:**
  - Manual sync: `api/sheets/sync.js`
  - Scheduled sync: `api/sheets/scheduled-sync.js`

### Methods

- `setupFiltersAndSorting()` - Applies filters, sorting, and data validation
- `setupPivotTables()` - Orchestrates all pivot sheet updates
- `setupRevenuePivots(db)` - Creates revenue analysis data
- `setupAttendancePivots(db)` - Creates attendance tracking data
- `setupWalletPivots(db)` - Creates wallet adoption data
- `setupCustomerBehaviorPivots(db)` - Creates customer behavior data

### Configuration

**Environment Variables:**
```bash
GOOGLE_SHEET_ID=<your-sheet-id>
GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL=<service-account-email>
GOOGLE_SHEETS_PRIVATE_KEY=<base64-private-key>
SHEETS_TIMEZONE=America/Denver  # Default timezone for date formatting
```

---

## FAQ

### Q: Can I edit the synced data directly in Google Sheets?

**A:** You can, but changes will be overwritten on the next sync. For persistent changes, update the database through the admin panel.

### Q: Why are my custom formulas disappearing?

**A:** The sync replaces sheet data completely. Put custom formulas in separate sheets that reference the synced data.

### Q: Can I change which columns have dropdowns?

**A:** Yes, but requires code changes in `lib/google-sheets-service.js` in the `setupFiltersAndSorting()` method's `dataValidations` array.

### Q: How do I add more pivot tables?

**A:** Modify the relevant pivot setup method (e.g., `setupRevenuePivots()`) to add more queries and data rows.

### Q: Will this work with my existing Google Sheet?

**A:** Yes! The sync will create any missing sheets and preserve existing data during the first sync.

### Q: What if I delete a sheet by accident?

**A:** Run a manual sync from the admin dashboard - missing sheets are automatically recreated with their structure.

---

## Support

For issues or questions:
- Check the [main CLAUDE.md documentation](/CLAUDE.md)
- Review [INSTALLATION.md](/INSTALLATION.md) for setup instructions
- Contact: alocubanoboulderfest@gmail.com

---

**Last Updated:** January 2025
**Version:** 1.0.0 (Enhanced Features Release)
