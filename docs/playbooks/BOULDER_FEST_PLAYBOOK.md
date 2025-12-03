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
- `id`: Use next available positive integer (check existing max ID + 1)
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

Add to the `rewrites` array:

```json
{
  "source": "/boulder-fest-2027",
  "destination": "/pages/events/boulder-fest-2027/index"
},
{
  "source": "/boulder-fest-2027/(artists|schedule|gallery)",
  "destination": "/pages/events/boulder-fest-2027/$1"
}
```

### Step 2.2: Add Redirects (optional convenience redirects)

**File:** `vercel.json`

Add to the `redirects` array:

```json
{
  "source": "/2027-artists",
  "destination": "/boulder-fest-2027/artists",
  "permanent": true
},
{
  "source": "/2027-schedule",
  "destination": "/boulder-fest-2027/schedule",
  "permanent": true
},
{
  "source": "/2027-gallery",
  "destination": "/boulder-fest-2027/gallery",
  "permanent": true
},
{
  "source": "/boulder-fest-2027/tickets",
  "destination": "/tickets",
  "permanent": true
}
```

---

## Phase 3: Event Pages

### Template Sources

**IMPORTANT:** All new event pages MUST be created by copying existing templates to maintain consistency.

| Page Type | Template Source |
|-----------|-----------------|
| index.html | `pages/events/boulder-fest-2026/index.html` |
| artists.html | `pages/events/boulder-fest-2026/artists.html` |
| schedule.html | `pages/events/boulder-fest-2026/schedule.html` |
| gallery.html | `pages/events/boulder-fest-2026/gallery.html` |

### Step 3.1: Create Event Directory

```bash
mkdir -p pages/events/boulder-fest-2027
```

### Step 3.2: Copy and Customize index.html

**Template:** `pages/events/boulder-fest-2026/index.html`
**Target:** `pages/events/boulder-fest-2027/index.html`

Copy the template, then find and replace:

| Find | Replace With |
|------|-------------|
| `boulder-fest-2026` | `boulder-fest-2027` |
| `Boulder Fest 2026` | `Boulder Fest 2027` |
| `2026` (in dates) | `2027` |
| `May 15-17, 2026` | `May 14-16, 2027` |
| `2026-05-15` | `2027-05-14` |
| `2026-05-16` | `2027-05-15` |
| `2026-05-17` | `2027-05-16` |
| Hero image path | `/images/hero/boulder-fest-2027-hero.jpg` |

**Case-sensitivity note:** Be careful when replacing year values—the slug `boulder-fest-2026` uses lowercase, while display text `Boulder Fest 2026` uses title case. Use case-sensitive find/replace or perform multiple passes to avoid partial matches.

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

Core pages:
- `pages/core/home.html`
- `pages/core/about.html`
- `pages/core/tickets.html`
- `pages/core/donations.html`
- `pages/core/contact.html`
- `pages/core/checkout.html`
- `pages/core/failure.html`

Event pages (all 4 files in each directory):
- `pages/events/boulder-fest-2025/`
- `pages/events/boulder-fest-2026/`
- `pages/events/weekender-2025-11/`
- All new event pages

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

---

## Phase 5: Tickets Page

### Step 5.1: Add Event Section to tickets.html

**File:** `pages/core/tickets.html`

Add new event section with ticket cards:

```html
<!-- Boulder Fest 2027 Section -->
<div class="event-section" data-event-id="4">
  <div class="event-section-header" data-event-id="4">
    <h2 class="event-title">Boulder Fest 2027</h2>
    <div class="event-details">
      <span class="event-dates">May 14-16, 2027</span>
      <span class="event-venue">Avalon Ballroom, Boulder, CO</span>
    </div>
  </div>

  <div class="ticket-options-grid" data-event-id="4">
    <!-- Early Bird Full Pass -->
    <div class="ticket-card"
         data-ticket-id="boulderfest-2027-early-bird-full"
         data-event-id="4"
         data-price="TBD"
         data-name="Early Bird Full Pass"
         data-venue="Avalon Ballroom"
         data-ticket-status="coming-soon">
      <!-- Card content -->
    </div>

    <!-- Full Festival Pass -->
    <div class="ticket-card"
         data-ticket-id="boulderfest-2027-regular-full"
         data-event-id="4"
         data-price="TBD"
         data-name="Full Festival Pass"
         data-venue="Avalon Ballroom"
         data-ticket-status="coming-soon">
      <!-- Card content -->
    </div>

    <!-- Day Passes: Friday, Saturday, Sunday -->
    <!-- Similar structure for each -->
  </div>
</div>
```

**Important data attributes:**
- `data-event-id` - Must match bootstrap.json event ID
- `data-ticket-id` - Must match bootstrap.json ticket type ID
- `data-ticket-status` - `coming-soon`, `available`, `unavailable`, `sold-out`

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

**File:** `images/hero/boulder-fest-2027-hero.jpg`

Requirements:
- High resolution (recommended: 1920x1080 or larger)
- Landscape orientation
- Cuban salsa/festival theme
- Will be cropped with `object-position: top center`

### Step 7.2: Artist Images (when available)

**Directory:** `images/artists/`

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

Add to EVENT_CONFIG if custom date logic needed:

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

### Step 9.1: Update Previous Event Status

**File:** `config/bootstrap.json`

Update previous year's event:

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
