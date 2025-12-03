# Boulder Fest Event Creation Playbook

This playbook provides step-by-step instructions for creating a new Boulder Fest event (annual 3-day festival).

---

## Required User Inputs

Before starting, gather the following information:

| Input | Example | Required | Notes |
|-------|---------|----------|-------|
| **Year** | `2027` | Yes | Determines slug, IDs, all naming |
| **Start Date** | `2027-05-14` | Yes | First day of festival (Friday) |
| **End Date** | `2027-05-16` | Yes | Last day of festival (Sunday) |
| **Early Bird Deadline** | `2027-03-01` | Yes | When early bird pricing ends |
| **Regular Price Start** | `2027-03-01` | Yes | When regular pricing begins |
| **Hero Image** | `boulder-fest-2027-hero.jpg` | Yes | Festival hero/banner image |
| **Featured Artists** | List of artist names | No | Can be added later |
| **Artist Images** | Image files per artist | No | Can be added later |
| **Ticket Pricing** | Price in cents per ticket type | No | Can use `null` for "coming-soon" |
| **Max Capacity** | `500` | No | Defaults to 500 |
| **Venue** | Name, address | No | Defaults to Avalon Ballroom |

**Derived values (auto-generated from inputs):**
- Event ID: Next available positive integer
- Slug: `boulderfest-{year}`
- Directory: `boulder-fest-{year}`
- Ticket IDs: `boulderfest-{year}-{type}`
- Display order: 1 (featured)

---

## Phase 1: Database Configuration

### Step 1.1: Add Event to bootstrap.json

**File:** `config/bootstrap.json`

Add new event object to the `events` array:

```json
{
  "id": 4,
  "name": "A Lo Cubano Boulder Fest 2027",
  "slug": "boulderfest-2027",
  "type": "festival",
  "status": "upcoming",
  "description": "The premier Cuban salsa festival in Boulder, featuring world-class instructors, live music, and three nights of social dancing.",
  "venue_name": "Avalon Ballroom",
  "venue_address": "6185 Arapahoe Road",
  "venue_city": "Boulder",
  "venue_state": "CO",
  "venue_zip": "80303",
  "start_date": "2027-05-14",
  "end_date": "2027-05-16",
  "max_capacity": 500,
  "early_bird_end_date": "2027-03-01",
  "regular_price_start_date": "2027-03-01",
  "display_order": 1,
  "is_featured": true,
  "is_visible": true
}
```

**Key decisions:**
- `id`: **Always use MAX existing ID + 1** (never fill gaps). Run: `grep '"id":' config/bootstrap.json | grep -v '"-' | sort -t: -k2 -n | tail -1` to find current max.
- `slug`: Format `boulderfest-YYYY`
- `type`: Always `"festival"` for Boulder Fest
- `status`: Start as `"upcoming"`, cron job auto-transitions to `"active"` on start_date
- `display_order`: Lower = higher priority (1 for current featured event)

### Step 1.2: Add Ticket Types to bootstrap.json

**File:** `config/bootstrap.json`

Add ticket types to the `ticket_types` array:

```json
[
  {
    "id": "boulderfest-2027-early-bird-full",
    "event_id": 4,
    "name": "Early Bird Full Pass",
    "description": "Special early pricing for full festival access",
    "event_date": "2027-05-14",
    "event_time": "18:00",
    "price_cents": null,
    "status": "coming-soon",
    "display_order": 1
  },
  {
    "id": "boulderfest-2027-regular-full",
    "event_id": 4,
    "name": "Full Festival Pass",
    "description": "Complete 3-day festival experience",
    "event_date": "2027-05-14",
    "event_time": "18:00",
    "price_cents": null,
    "status": "coming-soon",
    "display_order": 2
  },
  {
    "id": "boulderfest-2027-friday-pass",
    "event_id": 4,
    "name": "Friday Pass",
    "description": "Friday workshops and social dance",
    "event_date": "2027-05-14",
    "event_time": "16:00",
    "price_cents": null,
    "status": "coming-soon",
    "display_order": 3
  },
  {
    "id": "boulderfest-2027-saturday-pass",
    "event_id": 4,
    "name": "Saturday Pass",
    "description": "Saturday workshops and social dance",
    "event_date": "2027-05-15",
    "event_time": "11:00",
    "price_cents": null,
    "status": "coming-soon",
    "display_order": 4
  },
  {
    "id": "boulderfest-2027-sunday-pass",
    "event_id": 4,
    "name": "Sunday Pass",
    "description": "Sunday workshops and social dance",
    "event_date": "2027-05-16",
    "event_time": "11:00",
    "price_cents": null,
    "status": "coming-soon",
    "display_order": 5
  }
]
```

**Ticket ID format:** `{event-slug}-{ticket-type}`

**Status options:** `coming-soon` → `available` → `sold-out` → `closed`

---

## Phase 2: Routing Configuration

### Step 2.1: Add Route Rewrites to vercel.json

**File:** `vercel.json`

Add to the `rewrites` array, **placing entries near other boulder-fest rewrites** (after the boulder-fest-2026 entries):

```json
{
  "source": "/boulder-fest-{YEAR}",
  "destination": "/pages/events/boulder-fest-{YEAR}/index"
},
{
  "source": "/boulder-fest-{YEAR}/(artists|schedule|gallery)",
  "destination": "/pages/events/boulder-fest-{YEAR}/$1"
}
```

**Replace `{YEAR}` with actual year (e.g., `2027`).**

### Step 2.2: Add Redirects (optional convenience redirects)

**File:** `vercel.json`

Add to the `redirects` array (place near other boulder-fest redirects):

```json
{
  "source": "/{YEAR}-artists",
  "destination": "/boulder-fest-{YEAR}/artists",
  "permanent": true
},
{
  "source": "/{YEAR}-schedule",
  "destination": "/boulder-fest-{YEAR}/schedule",
  "permanent": true
},
{
  "source": "/{YEAR}-gallery",
  "destination": "/boulder-fest-{YEAR}/gallery",
  "permanent": true
},
{
  "source": "/boulder-fest-{YEAR}/tickets",
  "destination": "/tickets",
  "permanent": true
}
```

**Replace `{YEAR}` with actual year (e.g., `2027`).**

---

## Phase 3: Event Pages

### Template Sources

**IMPORTANT:** All new event pages MUST be created by copying existing templates to maintain consistency.

**Which template to use:**
- **Recommended:** Always copy from the **most recent year's** event (e.g., 2027 when creating 2028)
- **Reason:** Most recent templates have latest styling, navigation structure, and features
- **Exception:** If the most recent year has unusual customizations, use the previous year instead

| Page Type | Template Source (for 2027) |
|-----------|---------------------------|
| index.html | `pages/events/boulder-fest-2026/index.html` |
| artists.html | `pages/events/boulder-fest-2026/artists.html` |
| schedule.html | `pages/events/boulder-fest-2026/schedule.html` |
| gallery.html | `pages/events/boulder-fest-2026/gallery.html` |

**Template inheritance chain:** 2026 → 2027 → 2028 → ... (each copies from previous)

### Step 3.1: Create Event Directory

```bash
mkdir -p pages/events/boulder-fest-2027
```

### Step 3.2: Copy and Customize index.html

**Template:** `pages/events/boulder-fest-2026/index.html`
**Target:** `pages/events/boulder-fest-2027/index.html`

Copy the template, then find and replace using YOUR event's actual values:

| Find | Replace With |
|------|-------------|
| `boulder-fest-{PREV_YEAR}` | `boulder-fest-{YOUR_YEAR}` |
| `Boulder Fest {PREV_YEAR}` | `Boulder Fest {YOUR_YEAR}` |
| `{PREV_YEAR}` (in dates) | `{YOUR_YEAR}` |
| `{PREV_DATE_RANGE}` (e.g., "May 15-17, 2026") | `{YOUR_DATE_RANGE}` (e.g., "May 16-18, 2027") |
| `{PREV_START_DATE}` (e.g., "2026-05-15") | `{YOUR_START_DATE}` (e.g., "2027-05-16") |
| `{PREV_DAY2_DATE}` (e.g., "2026-05-16") | `{YOUR_DAY2_DATE}` (e.g., "2027-05-17") |
| `{PREV_END_DATE}` (e.g., "2026-05-17") | `{YOUR_END_DATE}` (e.g., "2027-05-18") |
| Hero image path | `/images/hero/boulder-fest-{YOUR_YEAR}-hero.jpg` |

**Example for Boulder Fest 2027 (May 16-18, 2027):**
| Find | Replace With |
|------|-------------|
| `boulder-fest-2026` | `boulder-fest-2027` |
| `Boulder Fest 2026` | `Boulder Fest 2027` |
| `May 15-17, 2026` | `May 16-18, 2027` |
| `2026-05-15` | `2027-05-16` |
| `2026-05-16` | `2027-05-17` |
| `2026-05-17` | `2027-05-18` |

**Case-sensitivity note:** Be careful when replacing year values—the slug `boulder-fest-2026` uses lowercase, while display text `Boulder Fest 2026` uses title case. Use case-sensitive find/replace or perform multiple passes to avoid partial matches.

**Recommended approach:** Use `sed` for bulk replacement:
```bash
cd pages/events/boulder-fest-{YOUR_YEAR}
sed -i '' 's/boulder-fest-2026/boulder-fest-2027/g' *.html
sed -i '' 's/Boulder Fest 2026/Boulder Fest 2027/g' *.html
# Then manually update specific dates
```

**Key sections to verify after copy:**
- `<title>` tag
- `<meta name="description">` content
- Hero image `<img src="...">`
- Event subnav links (`/boulder-fest-2027`, `/boulder-fest-2027/artists`, etc.)
- Main heading ("A Lo Cubano Boulder Fest 2027!")
- Date display ("MAY 14-16, 2027")
- Footer text ("BOULDER FEST 2027")
- Navigation dropdown (add 2027 entry)

### Step 3.3: Copy and Customize artists.html

**Template:** `pages/events/boulder-fest-2026/artists.html`
**Target:** `pages/events/boulder-fest-2027/artists.html`

Same find/replace pattern as index.html. Artist content can be placeholder initially:

```html
<p>Artists for Boulder Fest 2027 coming soon!</p>
```

### Step 3.4: Copy and Customize schedule.html

**Template:** `pages/events/boulder-fest-2026/schedule.html`
**Target:** `pages/events/boulder-fest-2027/schedule.html`

Same find/replace pattern. Schedule sections (Friday, Saturday, Sunday) can be placeholder:

```html
<p>Schedule for Boulder Fest 2027 coming soon!</p>
```

### Step 3.5: Copy and Customize gallery.html

**Template:** `pages/events/boulder-fest-2026/gallery.html`
**Target:** `pages/events/boulder-fest-2027/gallery.html`

Same find/replace pattern. Gallery can initially show shared A Lo Cubano photos or placeholder.

---

## Phase 4: Navigation Updates

### Step 4.1: Update Navigation Dropdown (ALL pages)

**Files to update (navigation dropdown appears in):**

**Discovery command:** Find all files with navigation:
```bash
grep -rl "dropdown-category" pages/ --include="*.html" | sort
```

**Complete file list (as of current codebase):**

Core pages (7 files):
- `pages/core/home.html`
- `pages/core/about.html`
- `pages/core/tickets.html`
- `pages/core/donations.html`
- `pages/core/contact.html`
- `pages/core/checkout.html`
- `pages/core/failure.html`

Additional core pages that MAY have navigation (verify):
- `pages/core/checkout-cancel.html`
- `pages/core/success.html`
- `pages/core/my-tickets.html`
- `pages/core/register-tickets.html`
- `pages/core/view-tickets.html`

Event pages (all 4 files in each directory):
- `pages/events/boulder-fest-2025/` (4 files)
- `pages/events/boulder-fest-2026/` (4 files)
- `pages/events/weekender-2025-11/` (4 files)
- All new event pages you create

**Total: ~20-25 files depending on which core pages have navigation.**

**Bulk update approach:**
```bash
# List all files needing updates
FILES=$(grep -rl "dropdown-category" pages/ --include="*.html")

# For each file, add the new event entry after existing Boulder Fest entries
for file in $FILES; do
  echo "Updating: $file"
  # Manual edit or use sed for pattern replacement
done
```

**Navigation dropdown structure to add:**

```html
<li class="dropdown-category" role="group">
  <span class="dropdown-category-title" role="presentation">Boulder Fest</span>
  <ul class="dropdown-submenu">
    <li>
      <a
        href="/boulder-fest-2027"
        class="dropdown-link"
        role="menuitem"
        data-event="boulder-fest-2027"
        data-event-status="upcoming"
        >2027 Festival</a
      >
    </li>
    <li>
      <a
        href="/boulder-fest-2026"
        class="dropdown-link"
        role="menuitem"
        data-event="boulder-fest-2026"
        data-event-status="current"
        >2026 Festival</a
      >
    </li>
    <!-- older festivals can be removed or marked as past -->
  </ul>
</li>
```

**Status values:**
- `upcoming` - Future event
- `current` - Currently active/most relevant
- `past` - Completed event (optional, can be removed from nav)

**Ordering rule:** Newer events appear FIRST (top of submenu). When adding Boulder Fest 2027, place it ABOVE Boulder Fest 2026 in the dropdown.

---

## Phase 5: Tickets Page

### Step 5.1: Add Event Section to tickets.html

**File:** `pages/core/tickets.html`

Add new event section with ticket cards.

**Recommended approach:** Copy an existing Boulder Fest event section from tickets.html, then find/replace the year and dates. This is faster and less error-prone than building from scratch.

```bash
# Extract Boulder Fest 2026 section as template
grep -n "data-event-id=\"3\"" pages/core/tickets.html | head -5  # Find section boundaries
```

**Full ticket card structure (copy this template for each ticket type):**

```html
<!-- Event Section Header -->
<h2 class="event-title" data-event-id="{EVENT_ID}">Boulder Fest {YEAR}</h2>
<p class="event-subtitle">May {START_DAY}-{END_DAY}, {YEAR} • Avalon Ballroom, Boulder, CO</p>

<div class="ticket-options-grid" data-event-id="{EVENT_ID}">

  <!-- Single Ticket Card (repeat for each ticket type) -->
  <div class="flip-card ticket-disabled" data-ticket-status="coming-soon" aria-disabled="true">
    <div class="flip-card-inner" style="pointer-events: none;">
      <!-- Front of card -->
      <div class="flip-card-front ticket-card vertical-design"
           data-ticket-id="boulderfest-{YEAR}-early-bird-full"
           data-ticket-type="boulderfest-{YEAR}-early-bird-full"
           data-event-id="{EVENT_ID}"
           data-price="0.00"
           data-name="Early Bird Full Pass"
           data-venue="Avalon Ballroom">

        <div class="ticket-status-banner coming-soon">
          <span class="sr-only">COMING SOON</span>
        </div>

        <div class="ticket-header">
          <div class="event-label">EVENT</div>
          <div class="event-name">A Lo Cubano Boulder Fest {YEAR}</div>
        </div>

        <div class="ticket-body">
          <div class="ticket-type-section">
            <div class="field-label">Ticket Type</div>
            <div class="ticket-type">EARLY BIRD FULL PASS</div>
            <div class="ticket-color-indicator" style="display: flex; justify-content: center; margin: 6px 0;">
              <span class="ticket-color-circle" style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: rgb(169, 169, 169);"></span>
            </div>
            <div class="ticket-price">TBA</div>
          </div>

          <div class="ticket-details">
            <div class="detail-row">
              <div class="field-label">Date</div>
              <div class="detail-value">May {START_DAY}-{END_DAY}, {YEAR}</div>
            </div>
          </div>

          <div class="ticket-footer">
            <div class="venue-section">
              <div class="field-label">Venue</div>
              <div class="venue-name">Avalon Ballroom</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Back of card -->
      <div class="flip-card-back">
        <div class="card-back-content">
          <h3>Early Bird Full Pass Details</h3>
          <p>Special early pricing for full festival access</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Repeat for: regular-full, friday-pass, saturday-pass, sunday-pass -->

</div>
```

**Important data attributes:**
- `data-event-id` - Must match bootstrap.json event ID (integer)
- `data-ticket-id` - Must match bootstrap.json ticket type ID (string)
- `data-ticket-type` - Same as data-ticket-id
- `data-ticket-status` - Controls visual state: `coming-soon`, `available`, `unavailable`, `sold-out`
- `data-price` - Price in dollars (e.g., "150.00") or "0.00" for TBA

**Status banner classes:**
- `coming-soon` - Gray banner, disabled
- `available` - No banner, clickable
- `unavailable` - Red banner, disabled
- `sold-out` - Red "SOLD OUT" banner, disabled

**Ticket colors by type (from bootstrap.json ticket_type_colors):**
- Full Pass / Early Bird: `rgb(169, 169, 169)` (silver)
- Friday: `rgb(255, 140, 0)` (orange)
- Saturday: `rgb(255, 215, 0)` (gold)
- Sunday: `rgb(30, 144, 255)` (blue)

---

## Phase 6: Frontend Service Updates

### Step 6.1: Update events-service.js Fallback Data

**File:** `js/lib/events-service.js`

Add to `_loadFallbackEvents()` fallback array:

```javascript
{
    id: 4,
    slug: 'boulderfest-2027',
    name: 'A Lo Cubano Boulder Fest 2027',
    displayName: 'Boulder Fest 2027 Tickets',
    type: 'festival',
    status: 'upcoming',
    description: 'The premier Cuban salsa festival in Boulder',
    venue: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Road',
        city: 'Boulder',
        state: 'CO',
        zip: '80303'
    },
    dates: {
        start: '2027-05-14',
        end: '2027-05-16',
        year: 2027
    }
}
```

---

## Phase 7: Assets

### Step 7.1: Add Hero Image

**File:** `images/hero/boulder-fest-{YEAR}-hero.jpg`

**Requirements:**
- **Dimensions:** 1920x1080 minimum (larger is fine, will be scaled)
- **Orientation:** Landscape (wider than tall)
- **Theme:** Cuban salsa/festival imagery
- **Cropping:** Will be cropped with `object-position: top center` - keep important content in upper portion
- **Format:** JPEG preferred for photos (smaller file size than PNG)

**Optimization (REQUIRED before upload):**
```bash
# Check current file size
ls -lh images/hero/boulder-fest-{YEAR}-hero.jpg

# Target: Under 500KB for fast loading
# If too large, compress with ImageMagick or sips:
sips -s format jpeg -s formatOptions 80 input.jpg --out images/hero/boulder-fest-{YEAR}-hero.jpg

# Or use online tool: squoosh.app, tinypng.com
```

**File size limits:**
- Hero images: < 500KB (ideally < 300KB)
- Artist images: < 200KB each

### Step 7.2: Artist Images (when available)

**Directory:** `images/artists/`

**Requirements:**
- **Dimensions:** 400x400 minimum (square or portrait)
- **Format:** PNG preferred (supports transparency), JPEG acceptable
- **Naming:** `{artist-name-lowercase}.png` (e.g., `marcela-dance.png`)

**Convert from other formats:**
```bash
# Convert JPG to PNG (if needed for consistency)
sips -s format png input.jpg --out images/artists/artist-name.png

# Resize if too large
sips -Z 800 images/artists/artist-name.png  # Max dimension 800px
```

Add artist images as they're confirmed.

---

## Phase 8: Optional Configuration

### Step 8.1: Update ticket-config.js (if needed)

**File:** `lib/ticket-config.js`

**When to use ticket-config.js:**
- When backend services need per-day date mappings (e.g., Friday/Saturday/Sunday passes)
- When ticket creation service needs explicit venue/address data beyond bootstrap.json
- For custom date logic in wallet passes or email templates

**When NOT needed:**
- If bootstrap.json provides all required event data
- For simple events without multi-day passes
- When frontend-only features are sufficient

**What breaks WITHOUT ticket-config.js entry:**
- ⚠️ Wallet passes may show generic dates instead of specific day (Friday/Saturday/Sunday)
- ⚠️ Email confirmations may lack detailed venue information
- ⚠️ Day-pass tickets won't have correct individual dates on the ticket

**What still works WITHOUT ticket-config.js:**
- ✅ Ticket purchasing and checkout
- ✅ Basic ticket display on tickets page
- ✅ Admin dashboard and check-in
- ✅ Event pages and navigation

**Recommendation:** For Boulder Fest (multi-day with day passes), ALWAYS add ticket-config.js entry.

Add to EVENT_CONFIG:

```javascript
"boulder-fest-2027": {
    name: "A Lo Cubano Boulder Fest 2027",
    startDate: "2027-05-14",
    endDate: "2027-05-16",
    venue: "Avalon Ballroom",
    address: "6185 Arapahoe Road, Boulder, CO 80303",
    dates: {
        friday: "2027-05-14",
        saturday: "2027-05-15",
        sunday: "2027-05-16",
    },
},
```

---

## Phase 9: Archive Previous Year

**When to archive:** Archive the previous year's event AFTER the new event is created AND the previous event has COMPLETED (end_date has passed). Do NOT archive an event that is still `upcoming` or `active`.

**Timing example:**
- Boulder Fest 2026 ends May 17, 2026
- Boulder Fest 2027 created in January 2027
- Archive Boulder Fest 2026 in January 2027 (after it has completed)

### Step 9.1: Update Previous Event Status

**File:** `config/bootstrap.json`

Update previous year's event (only after it has completed):

```json
{
  "id": 3,
  "name": "A Lo Cubano Boulder Fest 2026",
  "status": "completed",
  "is_featured": false,
  "is_visible": false,
  "display_order": 4
}
```

### Step 9.2: Update Navigation

Remove or de-emphasize previous year's event in navigation dropdowns.

---

## Verification Checklist

After completing all phases:

- [ ] Bootstrap.json has correct event with unique ID
- [ ] Bootstrap.json has all 5 ticket types with matching event_id
- [ ] vercel.json has rewrites for event slug and subpages
- [ ] vercel.json has optional redirects for convenience URLs
- [ ] Event directory created: `pages/events/boulder-fest-{year}/`
- [ ] All 4 event pages created and customized:
  - [ ] index.html
  - [ ] artists.html
  - [ ] schedule.html
  - [ ] gallery.html
- [ ] All pages have correct:
  - [ ] Title and meta description
  - [ ] Hero image path
  - [ ] Event subnav links
  - [ ] Footer text
- [ ] Navigation dropdown updated in ALL 20+ pages
- [ ] Tickets page has event section with correct data-event-id
- [ ] Ticket cards have matching data-ticket-id values
- [ ] events-service.js fallback data includes new event
- [ ] Hero image uploaded to `images/hero/`
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm test` - tests pass
- [ ] Deploy to preview and verify:
  - [ ] Event page loads at `/boulder-fest-{year}`
  - [ ] Subpages load (`/artists`, `/schedule`, `/gallery`)
  - [ ] Navigation dropdown shows event
  - [ ] Tickets page shows event section
  - [ ] Admin dashboard shows event in selector

### Rollback Steps (if deployment fails)

If deployment verification fails, rollback in reverse order:

1. **Revert bootstrap.json** - Remove event and ticket type entries
2. **Revert vercel.json** - Remove rewrites and redirects
3. **Delete event pages** - Remove `pages/events/boulder-fest-{year}/` directory
4. **Revert navigation** - Remove dropdown entries from all updated pages (use git)
5. **Revert tickets.html** - Remove event section
6. **Revert events-service.js** - Remove fallback data
7. **Delete assets** - Remove hero/artist images if uploaded

**Quick rollback:** `git checkout -- .` reverts all uncommitted changes. For committed changes, use `git revert <commit-hash>`.

---

## Quick Reference: Files to Modify

| Step | File | Action |
|------|------|--------|
| 1.1 | `config/bootstrap.json` | Add event object |
| 1.2 | `config/bootstrap.json` | Add 5 ticket types |
| 2.1 | `vercel.json` | Add 2 rewrites |
| 2.2 | `vercel.json` | Add 4 redirects (optional) |
| 3.x | `pages/events/boulder-fest-{year}/` | Create 4 HTML files |
| 4.1 | 20+ HTML files | Update navigation dropdown |
| 5.1 | `pages/core/tickets.html` | Add event section |
| 6.1 | `js/lib/events-service.js` | Add fallback data |
| 7.1 | `images/hero/` | Add hero image |
| 8.1 | `lib/ticket-config.js` | Add EVENT_CONFIG (optional) |
| 9.1 | `config/bootstrap.json` | Archive previous event |

---

## Event Status Lifecycle

```
draft → upcoming → active → completed → archived (optional)
```

**Automatic Transitions (via cron job `/api/cron/update-event-status`):**
- `upcoming → active`: When current_date >= start_date (hourly check)
- `active → completed`: When current_date > end_date (hourly check)
- Tickets auto-expire when event completes

**Manual Transitions:**
- Use `scripts/manage-event-lifecycle.js` for manual status changes
- Update bootstrap.json and redeploy for permanent changes

---

## Naming Conventions

| Item | Pattern | Example |
|------|---------|---------|
| Event ID | Positive integer | `4` |
| Slug | `boulderfest-YYYY` | `boulderfest-2027` |
| Directory | `boulder-fest-YYYY` | `boulder-fest-2027` |
| Ticket ID | `boulderfest-YYYY-{type}` | `boulderfest-2027-friday-pass` |
| Hero Image | `boulder-fest-YYYY-hero.jpg` | `boulder-fest-2027-hero.jpg` |
| Display Name | "Boulder Fest YYYY Tickets" | "Boulder Fest 2027 Tickets" |

---

## Appendix A: Advanced Scenarios

### A.1: Custom Venue (Non-Avalon Ballroom)

If the festival uses a different venue:

**Step 1: Update bootstrap.json event object:**
```json
{
  "venue_name": "Boulder Theater",
  "venue_address": "2032 14th Street",
  "venue_city": "Boulder",
  "venue_state": "CO",
  "venue_zip": "80302"
}
```

**Step 2: Update all venue references in event pages:**
```bash
# Find all Avalon references
grep -r "Avalon" pages/events/boulder-fest-{YEAR}/ --include="*.html"

# Replace venue name
sed -i '' 's/Avalon Ballroom/Boulder Theater/g' pages/events/boulder-fest-{YEAR}/*.html
sed -i '' 's/6185 Arapahoe Road/2032 14th Street/g' pages/events/boulder-fest-{YEAR}/*.html
```

**Step 3: Update tickets.html venue references:**
- `data-venue` attribute on ticket cards
- `.venue-name` element content

**Step 4: Update ticket-config.js:**
```javascript
"boulder-fest-{YEAR}": {
    venue: "Boulder Theater",
    address: "2032 14th Street, Boulder, CO 80302",
    // ... other config
}
```

**Step 5: Update events-service.js fallback:**
```javascript
venue: {
    name: 'Boulder Theater',
    address: '2032 14th Street',
    city: 'Boulder',
    state: 'CO',
    zip: '80302'
}
```

---

### A.2: 4-Day Festival (Variable Days)

If the festival is 4 days (e.g., Thursday-Sunday):

**Step 1: Add extra ticket type to bootstrap.json:**
```json
{
  "id": "boulderfest-{YEAR}-thursday-pass",
  "event_id": {EVENT_ID},
  "name": "Thursday Pass",
  "description": "Thursday workshops and social dance",
  "event_date": "{THURSDAY_DATE}",
  "event_time": "16:00",
  "price_cents": null,
  "status": "coming-soon",
  "display_order": 3
}
```
Adjust display_order for other day passes (Friday=4, Saturday=5, Sunday=6).

**Step 2: Add Thursday color to bootstrap.json ticket_type_colors (if not exists):**
```json
{
  "pattern": "thursday",
  "color_name": "Thursday",
  "color_rgb": "rgb(138, 43, 226)",
  "circle_emoji": "⬤",
  "display_order": 4,
  "description": "Blue-violet for Thursday passes"
}
```

**Step 3: Update schedule.html** to include Thursday section.

**Step 4: Update tickets.html** to include Thursday ticket card.

**Step 5: Update ticket-config.js** with Thursday date:
```javascript
dates: {
    thursday: "{YEAR}-05-16",
    friday: "{YEAR}-05-17",
    saturday: "{YEAR}-05-18",
    sunday: "{YEAR}-05-19",
}
```

---

### A.3: Immediately Available Tickets (Not Coming Soon)

If tickets are available immediately at launch:

**Step 1: Set status and price in bootstrap.json:**
```json
{
  "id": "boulderfest-{YEAR}-early-bird-full",
  "price_cents": 15000,
  "status": "available"
}
```

**Step 2: Update ticket card HTML in tickets.html:**
```html
<!-- Change wrapper class -->
<div class="flip-card" data-ticket-status="available" aria-disabled="false">
  <div class="flip-card-inner">
    <!-- Remove disabled banner, remove pointer-events: none -->
    <div class="flip-card-front ticket-card vertical-design"
         data-ticket-id="boulderfest-{YEAR}-early-bird-full"
         data-price="150.00"
         ...>
      <!-- NO status banner for available tickets -->
      ...
      <div class="ticket-price">$150.00</div>
      ...
    </div>
  </div>
</div>
```

**Key differences from coming-soon:**
- Remove `ticket-disabled` class from outer div
- Remove `style="pointer-events: none;"` from flip-card-inner
- Remove the `ticket-status-banner` div entirely
- Set `data-price` to actual dollar amount
- Update `.ticket-price` text content

---

### A.4: Partial Artist Roster

If some artists are confirmed and others TBD:

**In artists.html:**
```html
<!-- Confirmed artist -->
<div class="artist-card">
  <img src="/images/artists/marcela-dance.png" alt="Marcela">
  <h3>Marcela</h3>
  <p>World-renowned Cuban salsa instructor...</p>
</div>

<!-- TBD artist placeholder -->
<div class="artist-card artist-tbd">
  <div class="artist-placeholder">
    <span class="tbd-icon">?</span>
  </div>
  <h3>Guest Artist TBA</h3>
  <p>More instructors to be announced soon!</p>
</div>
```

**Update later:** When artist is confirmed, replace the TBD card with real content.

---

### A.5: Troubleshooting Lint/Test Failures

If `npm run lint` fails:
```bash
# See specific errors
npm run lint 2>&1 | head -50

# Common fixes:
# - HTML validation errors: Check for missing closing tags
# - ESLint errors: Check for unused variables, missing semicolons
# - Markdown lint: Check heading hierarchy
```

If `npm test` fails:
```bash
# Run specific test file
npm test -- tests/unit/specific-test.test.js

# Common fixes:
# - Update expected values in tests if event IDs changed
# - Check bootstrap.json is valid JSON
```

**Don't bypass with --no-verify.** Fix the issues instead.
