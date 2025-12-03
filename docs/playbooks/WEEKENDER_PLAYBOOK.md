# Weekender Event Creation Playbook

This playbook provides step-by-step instructions for creating a new Weekender event (1-2 day intimate workshop events).

---

## Required User Inputs

Before starting, gather the following information:

| Input | Example | Required | Notes |
|-------|---------|----------|-------|
| **Year** | `2026` | Yes | Event year |
| **Month** | `03` (March) | Yes | 2-digit month, determines naming |
| **Event Date** | `2026-03-14` | Yes | Usually single day |
| **End Date** | `2026-03-14` | Yes | Same as start for single-day |
| **Event Start Time** | `13:00` | Yes | When workshops begin |
| **Featured Artist** | "Steven Messina" | No | Guest instructor name |
| **Artist Image** | `steven-messina.png` | No | Featured artist photo |
| **Hero Image** | `weekender-2026-03-hero.jpg` | Yes | Event hero/banner image |
| **Full Pass Price** | `6500` (cents = $65) | Yes | Online full pass price |
| **Single Class Price** | `2500` (cents = $25) | Yes | Single class price |
| **Door Price** | `7500` (cents = $75) | No | In-person/door price |
| **Early Bird Deadline** | `2026-01-15` | No | When early pricing ends |
| **Max Capacity** | `200` | No | Defaults to 200 |
| **Pasito.fun Link** | URL | No | External event listing |
| **Facebook Event Link** | URL | No | Facebook event page |

**Derived values (auto-generated from inputs):**
- Event ID: Next available positive integer
- Slug: `weekender-{year}-{month}`
- Directory: `weekender-{year}-{month}`
- Ticket IDs: `weekender-{year}-{month}-{type}`
- Month Name: Derived from month number (03 → "March")
- Display order: 2 (secondary featured)

---

## Phase 1: Database Configuration

### Step 1.1: Add Event to bootstrap.json

**File:** `config/bootstrap.json`

Add new event object to the `events` array:

```json
{
  "id": 5,
  "name": "March Salsa Weekender 2026",
  "slug": "weekender-2026-03",
  "type": "weekender",
  "status": "upcoming",
  "description": "An intimate weekend of Cuban salsa workshops and social dancing in the heart of Boulder.",
  "venue_name": "Avalon Ballroom",
  "venue_address": "6185 Arapahoe Road",
  "venue_city": "Boulder",
  "venue_state": "CO",
  "venue_zip": "80303",
  "start_date": "2026-03-14",
  "end_date": "2026-03-14",
  "max_capacity": 200,
  "early_bird_end_date": "2026-01-15",
  "regular_price_start_date": "2026-02-01",
  "display_order": 2,
  "is_featured": true,
  "is_visible": true
}
```

**Weekender-specific:**
- `type`: Always `"weekender"`
- `max_capacity`: Typically 200 (smaller than festival)
- `start_date` and `end_date`: Often same date for single-day events
- Slug format: `weekender-YYYY-MM`

### Step 1.2: Add Ticket Types

**File:** `config/bootstrap.json`

Add to the `ticket_types` array:

```json
[
  {
    "id": "weekender-2026-03-full",
    "event_id": 5,
    "name": "Full Pass",
    "description": "Full weekend access to workshops and socials",
    "event_date": "2026-03-14",
    "event_time": "13:00",
    "price_cents": 6500,
    "status": "available",
    "display_order": 1
  },
  {
    "id": "weekender-2026-03-class",
    "event_id": 5,
    "name": "Single Class",
    "description": "Access to one workshop session",
    "event_date": "2026-03-14",
    "event_time": "13:00",
    "price_cents": 2500,
    "status": "available",
    "display_order": 2
  },
  {
    "id": "weekender-2026-03-full-in-person",
    "event_id": 5,
    "name": "Full Pass - In Person",
    "description": "Full weekend access (in-person purchase)",
    "event_date": "2026-03-14",
    "event_time": "13:00",
    "price_cents": 7500,
    "status": "available",
    "display_order": 3
  }
]
```

**Weekender ticket types:**
- Full Pass (online price)
- Single Class
- Full Pass - In Person (door price, typically higher)

---

## Phase 2: Routing Configuration

### Step 2.1: Add Route Rewrites

**File:** `vercel.json`

Add to the `rewrites` array:

```json
{
  "source": "/weekender-2026-03",
  "destination": "/pages/events/weekender-2026-03/index"
},
{
  "source": "/weekender-2026-03/(artists|schedule|gallery)",
  "destination": "/pages/events/weekender-2026-03/$1"
}
```

---

## Phase 3: Event Pages

### Template Sources

**IMPORTANT:** All new weekender pages MUST be created by copying existing templates to maintain consistency.

| Page Type | Template Source |
|-----------|-----------------|
| index.html | `pages/events/weekender-2025-11/index.html` |
| artists.html | `pages/events/weekender-2025-11/artists.html` |
| schedule.html | `pages/events/weekender-2025-11/schedule.html` |
| gallery.html | `pages/events/weekender-2025-11/gallery.html` |

### Step 3.1: Create Event Directory

```bash
mkdir -p pages/events/weekender-2026-03
```

### Step 3.2: Copy and Customize index.html

**Template:** `pages/events/weekender-2025-11/index.html`
**Target:** `pages/events/weekender-2026-03/index.html`

Copy the template, then find and replace:

| Find | Replace With |
|------|-------------|
| `weekender-2025-11` | `weekender-2026-03` |
| `November 2025` | `March 2026` |
| `November 8, 2025` | `March 14, 2026` |
| `2025-11-08` | `2026-03-14` |
| `NOVEMBER 2025 WEEKENDER` | `MARCH 2026 WEEKENDER` |
| Hero image path | `/images/hero/weekender-2026-03-hero.jpg` |
| Featured artist name | New artist name (if different) |
| Featured artist image | `/images/artists/{new-artist}.png` |
| Pasito.fun link | New event link |
| Facebook link | New event link |

**Key sections to verify after copy:**
- `<title>` tag: "March 2026 Weekender - A Lo Cubano"
- `<meta name="description">` content
- Hero image `<img src="...">`
- Event subnav links (`/weekender-2026-03`, `/weekender-2026-03/artists`, etc.)
- Main heading with featured artist: "Featuring [Artist Name]!"
- Featured artist section (image + description)
- "When and Where" section with correct date/time
- External links (Pasito.fun, Facebook)
- Footer text ("MARCH 2026 WEEKENDER")
- Navigation dropdown (add March 2026 entry)

### Step 3.3: Copy and Customize artists.html

**Template:** `pages/events/weekender-2025-11/artists.html`
**Target:** `pages/events/weekender-2026-03/artists.html`

Same find/replace pattern. Update featured artist bio and image.

### Step 3.4: Copy and Customize schedule.html

**Template:** `pages/events/weekender-2025-11/schedule.html`
**Target:** `pages/events/weekender-2026-03/schedule.html`

Same find/replace pattern. Update workshop schedule times and descriptions.

### Step 3.5: Copy and Customize gallery.html

**Template:** `pages/events/weekender-2025-11/gallery.html`
**Target:** `pages/events/weekender-2026-03/gallery.html`

Same find/replace pattern. Gallery can initially show shared A Lo Cubano photos.

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

**Navigation dropdown structure:**

Add under "Weekenders" category:

```html
<li class="dropdown-category" role="group">
  <span class="dropdown-category-title" role="presentation">Weekenders</span>
  <ul class="dropdown-submenu">
    <li>
      <a
        href="/weekender-2026-03"
        class="dropdown-link"
        role="menuitem"
        data-event="weekender-2026-03"
        data-event-status="upcoming"
        >March 2026</a
      >
    </li>
    <li>
      <a
        href="/weekender-2025-11"
        class="dropdown-link"
        role="menuitem"
        data-event="weekender-2025-11"
        data-event-status="current"
        >November 2025</a
      >
    </li>
  </ul>
</li>
```

**Status values:**
- `upcoming` - Future event
- `current` - Currently active/most relevant
- `past` - Completed event (optional, can be removed from nav)

---

## Phase 5: Tickets Page

### Step 5.1: Add Weekender Section

**File:** `pages/core/tickets.html`

Add new event section with ticket cards:

```html
<!-- March 2026 Weekender Section -->
<div class="event-section" data-event-id="5">
  <div class="event-section-header" data-event-id="5">
    <h2 class="event-title">March 2026 Weekender</h2>
    <div class="event-details">
      <span class="event-dates">March 14, 2026</span>
      <span class="event-venue">Avalon Ballroom, Boulder, CO</span>
    </div>
  </div>

  <div class="ticket-options-grid" data-event-id="5">
    <!-- Full Pass -->
    <div class="ticket-card"
         data-ticket-id="weekender-2026-03-full"
         data-event-id="5"
         data-price="65.00"
         data-name="Full Pass"
         data-venue="Avalon Ballroom"
         data-ticket-status="available">
      <!-- Card content -->
    </div>

    <!-- Single Class -->
    <div class="ticket-card"
         data-ticket-id="weekender-2026-03-class"
         data-event-id="5"
         data-price="25.00"
         data-name="Single Class"
         data-venue="Avalon Ballroom"
         data-ticket-status="available">
      <!-- Card content -->
    </div>

    <!-- Full Pass - In Person -->
    <div class="ticket-card"
         data-ticket-id="weekender-2026-03-full-in-person"
         data-event-id="5"
         data-price="75.00"
         data-name="Full Pass - In Person"
         data-venue="Avalon Ballroom"
         data-ticket-status="available">
      <!-- Card content -->
    </div>
  </div>
</div>
```

**Important data attributes:**
- `data-event-id` - Must match bootstrap.json event ID
- `data-ticket-id` - Must match bootstrap.json ticket type ID
- `data-ticket-status` - `coming-soon`, `available`, `unavailable`, `sold-out`

---

## Phase 6: Frontend Service Updates

### Step 6.1: Update events-service.js Fallback

**File:** `js/lib/events-service.js`

Add to `_loadFallbackEvents()` fallback array:

```javascript
{
    id: 5,
    slug: 'weekender-2026-03',
    name: 'March Salsa Weekender 2026',
    displayName: 'March 2026 Weekender Tickets',
    type: 'weekender',
    status: 'upcoming',
    description: 'An intimate weekend of Cuban salsa workshops',
    venue: {
        name: 'Avalon Ballroom',
        address: '6185 Arapahoe Road',
        city: 'Boulder',
        state: 'CO',
        zip: '80303'
    },
    dates: {
        start: '2026-03-14',
        end: '2026-03-14',
        year: 2026
    }
}
```

---

## Phase 7: Assets

### Step 7.1: Add Hero Image

**File:** `images/hero/weekender-2026-03-hero.jpg`

Requirements:
- High resolution (recommended: 1920x1080 or larger)
- Landscape orientation
- Cuban salsa/workshop theme
- Will be cropped with `object-position: top center`

### Step 7.2: Add Featured Artist Image (if applicable)

**File:** `images/artists/{artist-name}.png`

Requirements:
- Square or portrait orientation
- Professional photo
- PNG with transparent background preferred

---

## Verification Checklist

After completing all phases:

- [ ] Bootstrap.json has correct event with unique ID
- [ ] Bootstrap.json has all 3 ticket types with matching event_id
- [ ] vercel.json has rewrites for event slug and subpages
- [ ] Event directory created: `pages/events/weekender-{year}-{month}/`
- [ ] All 4 event pages created and customized:
  - [ ] index.html
  - [ ] artists.html
  - [ ] schedule.html
  - [ ] gallery.html
- [ ] All pages have correct:
  - [ ] Title and meta description
  - [ ] Hero image path
  - [ ] Event subnav links
  - [ ] Featured artist section (if applicable)
  - [ ] When and Where section with correct date/time
  - [ ] External links (Pasito.fun, Facebook)
  - [ ] Footer text
- [ ] Navigation dropdown updated in ALL 20+ pages
- [ ] Tickets page has event section with correct data-event-id
- [ ] Ticket cards have matching data-ticket-id values
- [ ] events-service.js fallback data includes new event
- [ ] Hero image uploaded to `images/hero/`
- [ ] Artist image uploaded to `images/artists/` (if applicable)
- [ ] Run `npm run lint` - no errors
- [ ] Run `npm test` - tests pass
- [ ] Deploy to preview and verify:
  - [ ] Event page loads at `/weekender-{year}-{month}`
  - [ ] Subpages load (`/artists`, `/schedule`, `/gallery`)
  - [ ] Navigation dropdown shows event
  - [ ] Tickets page shows event section
  - [ ] Admin dashboard shows event in selector

---

## Quick Reference: Files to Modify

| Step | File | Action |
|------|------|--------|
| 1.1 | `config/bootstrap.json` | Add event object |
| 1.2 | `config/bootstrap.json` | Add 3 ticket types |
| 2.1 | `vercel.json` | Add 2 rewrites |
| 3.x | `pages/events/weekender-{year}-{month}/` | Create 4 HTML files |
| 4.1 | 20+ HTML files | Update navigation dropdown |
| 5.1 | `pages/core/tickets.html` | Add event section |
| 6.1 | `js/lib/events-service.js` | Add fallback data |
| 7.1 | `images/hero/` | Add hero image |
| 7.2 | `images/artists/` | Add artist image (optional) |

---

## Phase 8: Archive Previous Weekender (when needed)

As monthly Weekender events accumulate, archive past events to keep navigation clean.

### Step 8.1: Update Previous Event Status

**File:** `config/bootstrap.json`

Update completed weekender event:

```json
{
  "id": 3,
  "name": "November Salsa Weekender 2025",
  "status": "completed",
  "is_featured": false,
  "is_visible": true,
  "display_order": 5
}
```

**When to archive:**
- After 2-3 newer weekender events have been created
- When navigation dropdown becomes cluttered
- Keep most recent 2-3 weekenders visible in navigation

### Step 8.2: Update Navigation Dropdown

Remove older weekenders from navigation or move to a "Past Events" section:

```html
<!-- Keep only recent 2-3 weekenders in main navigation -->
<li class="dropdown-category" role="group">
  <span class="dropdown-category-title" role="presentation">Weekenders</span>
  <ul class="dropdown-submenu">
    <li>
      <a href="/weekender-2026-03" class="dropdown-link" data-event-status="current">March 2026</a>
    </li>
    <li>
      <a href="/weekender-2025-11" class="dropdown-link" data-event-status="past">November 2025</a>
    </li>
    <!-- Older events removed from nav but pages still accessible -->
  </ul>
</li>
```

**Note:** Event pages remain accessible via direct URL even after navigation removal.

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
| Event ID | Positive integer | `5` |
| Slug | `weekender-YYYY-MM` | `weekender-2026-03` |
| Directory | `weekender-YYYY-MM` | `weekender-2026-03` |
| Ticket ID | `weekender-YYYY-MM-{type}` | `weekender-2026-03-full` |
| Hero Image | `weekender-YYYY-MM-hero.jpg` | `weekender-2026-03-hero.jpg` |
| Display Name | "{Month} YYYY Weekender Tickets" | "March 2026 Weekender Tickets" |

---

## Month Number to Name Mapping

| Number | Month Name |
|--------|------------|
| 01 | January |
| 02 | February |
| 03 | March |
| 04 | April |
| 05 | May |
| 06 | June |
| 07 | July |
| 08 | August |
| 09 | September |
| 10 | October |
| 11 | November |
| 12 | December |
