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

Add new event object to the `events` array.

**Event ID:** Always use MAX existing ID + 1 (never fill gaps). Run:
```bash
grep '"id":' config/bootstrap.json | grep -v '"-' | sort -t: -k2 -n | tail -1
```

**Event name format:** Suggested format is `"{Month} Salsa Weekender {YEAR}"` but can be customized (e.g., "Spring Salsa Intensive 2026" or "Cuban Dance Weekend 2026"). Keep it descriptive and consistent with branding.

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

Add to the `rewrites` array, **placing entries near other weekender rewrites**:

```json
{
  "source": "/weekender-{YEAR}-{MONTH}",
  "destination": "/pages/events/weekender-{YEAR}-{MONTH}/index"
},
{
  "source": "/weekender-{YEAR}-{MONTH}/(artists|schedule|gallery)",
  "destination": "/pages/events/weekender-{YEAR}-{MONTH}/$1"
}
```

**Replace `{YEAR}` and `{MONTH}` with actual values (e.g., `2026` and `03`).**

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

Copy the template, then find and replace using YOUR event's actual values:

| Find | Replace With |
|------|-------------|
| `weekender-{PREV_YEAR}-{PREV_MONTH}` | `weekender-{YOUR_YEAR}-{YOUR_MONTH}` |
| `{Prev Month Name} {PREV_YEAR}` | `{Your Month Name} {YOUR_YEAR}` |
| `{Prev Full Date}` (e.g., "November 8, 2025") | `{Your Full Date}` (e.g., "April 11, 2026") |
| `{PREV_ISO_DATE}` (e.g., "2025-11-08") | `{YOUR_ISO_DATE}` (e.g., "2026-04-11") |
| `{PREV MONTH UPPER} {PREV_YEAR} WEEKENDER` | `{YOUR MONTH UPPER} {YOUR_YEAR} WEEKENDER` |
| Hero image path | `/images/hero/weekender-{YOUR_YEAR}-{YOUR_MONTH}-hero.jpg` |
| Featured artist name | New artist name (or remove section if no artist) |
| Featured artist image | `/images/artists/{new-artist}.png` (or remove if no artist) |
| Pasito.fun link | New event link (or remove if none) |
| Facebook link | New event link (or remove if none) |

**Example for April 2026 Weekender:**
| Find | Replace With |
|------|-------------|
| `weekender-2025-11` | `weekender-2026-04` |
| `November 2025` | `April 2026` |
| `November 8, 2025` | `April 11, 2026` |
| `2025-11-08` | `2026-04-11` |
| `NOVEMBER 2025 WEEKENDER` | `APRIL 2026 WEEKENDER` |

**Recommended approach:** Use `sed` for bulk replacement:
```bash
cd pages/events/weekender-{YOUR_YEAR}-{YOUR_MONTH}
sed -i '' 's/weekender-2025-11/weekender-2026-04/g' *.html
sed -i '' 's/November 2025/April 2026/g' *.html
sed -i '' 's/November 8, 2025/April 11, 2026/g' *.html
# Then manually update artist/external links
```

**Key sections to verify after copy:**
- `<title>` tag: "{Month} {YEAR} Weekender - A Lo Cubano"
- `<meta name="description">` content
- Hero image `<img src="...">`
- Event subnav links (`/weekender-{YEAR}-{MONTH}`, etc.)
- Main heading with featured artist: "Featuring [Artist Name]!" (or update if no artist)
- Featured artist section (image + description)
- "When and Where" section with correct date/time
- External links (Pasito.fun, Facebook)
- Footer text ("{MONTH UPPER} {YEAR} WEEKENDER")
- Navigation dropdown (add new entry)

### Handling Events WITHOUT a Featured Artist

If the weekender has no featured guest artist:

**Option A: Remove featured artist section entirely**
```html
<!-- DELETE this entire section -->
<section class="featured-artist">
  ...
</section>
```

**Option B: Replace with generic content**
```html
<section class="workshop-highlights">
  <h2>Workshop Highlights</h2>
  <p>Join our talented local instructors for an afternoon of Cuban salsa workshops,
     covering technique, partner work, and styling.</p>
</section>
```

**Update the main heading:**
```html
<!-- FROM: -->
<h1>Featuring Carlos Rodriguez!</h1>

<!-- TO: -->
<h1>Cuban Salsa Workshops & Social</h1>
```

**Update the meta description** to not mention a specific artist.

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

**Ordering rule:** Newer events appear FIRST (top of submenu). When adding April 2026, place it ABOVE March 2026 in the dropdown.

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

**File:** `images/hero/weekender-{YEAR}-{MONTH}-hero.jpg`

**Requirements:**
- **Dimensions:** 1920x1080 minimum (larger is fine, will be scaled)
- **Orientation:** Landscape (wider than tall)
- **Theme:** Cuban salsa/workshop imagery
- **Cropping:** Will be cropped with `object-position: top center` - keep important content in upper portion
- **Format:** JPEG preferred for photos (smaller file size than PNG)

**Optimization (REQUIRED before upload):**
```bash
# Check current file size
ls -lh images/hero/weekender-{YEAR}-{MONTH}-hero.jpg

# Target: Under 500KB for fast loading
# If too large, compress with sips:
sips -s format jpeg -s formatOptions 80 input.jpg --out images/hero/weekender-{YEAR}-{MONTH}-hero.jpg

# Or use online tool: squoosh.app, tinypng.com
```

**File size limits:**
- Hero images: < 500KB (ideally < 300KB)
- Artist images: < 200KB each

### Step 7.2: Add Featured Artist Image (if applicable)

**File:** `images/artists/{artist-name-lowercase}.png`

**Requirements:**
- **Dimensions:** 400x400 minimum (square or portrait)
- **Format:** PNG preferred (supports transparency), JPEG acceptable
- **Naming:** Use lowercase with hyphens (e.g., `carlos-rodriguez.png`)

**Convert from other formats if needed:**
```bash
# Convert JPG to PNG
sips -s format png input.jpg --out images/artists/artist-name.png

# Resize if too large
sips -Z 800 images/artists/artist-name.png  # Max dimension 800px

# Compress if over 200KB
# Use squoosh.app or tinypng.com for PNG compression
```

---

## Phase 8: Rollback (if needed)

If deployment fails or issues are discovered after deployment, rollback in reverse order.

### When to Rollback

- Deployment verification fails
- Critical bugs discovered after deployment
- Incorrect event configuration detected
- Need to make major changes and restart

### Rollback Steps

**Execute in this order:**

1. **Revert bootstrap.json** - Remove event and ticket type entries
   ```bash
   git checkout HEAD~1 -- config/bootstrap.json
   # OR manually delete the event and ticket_types entries
   ```

2. **Revert vercel.json** - Remove rewrites
   ```bash
   git checkout HEAD~1 -- vercel.json
   # OR manually delete the rewrite rules for the weekender
   ```

3. **Delete event pages directory**
   ```bash
   rm -rf pages/events/weekender-{YEAR}-{MONTH}/
   ```

4. **Revert navigation dropdown updates**
   ```bash
   # Use git to revert all modified HTML files
   git checkout HEAD~1 -- pages/core/*.html
   git checkout HEAD~1 -- pages/events/*/index.html pages/events/*/artists.html
   git checkout HEAD~1 -- pages/events/*/schedule.html pages/events/*/gallery.html
   ```

5. **Revert tickets.html** - Remove event section
   ```bash
   git checkout HEAD~1 -- pages/core/tickets.html
   # OR manually delete the event section
   ```

6. **Revert events-service.js** - Remove fallback data
   ```bash
   git checkout HEAD~1 -- js/lib/events-service.js
   # OR manually delete the fallback event entry
   ```

7. **Delete uploaded images**
   ```bash
   rm -f images/hero/weekender-{YEAR}-{MONTH}-hero.jpg
   rm -f images/artists/{artist-name}.png
   ```

### Quick Rollback Commands

**For uncommitted changes:**
```bash
git checkout -- .
git clean -fd  # Remove untracked files/directories
```

**For committed changes:**
```bash
# Revert the last commit
git revert HEAD

# Revert a specific commit
git revert <commit-hash>

# Revert multiple commits
git revert HEAD~3..HEAD
```

**Verification after rollback:**
```bash
npm run lint     # Check for syntax errors
npm test         # Run tests
git status       # Verify clean state
```

---

## Phase 9: Archive Previous Weekender

As monthly Weekender events accumulate, archive past events to keep navigation clean.

**When to archive:** Archive a weekender when ALL of these are true:
1. The event has COMPLETED (end_date has passed)
2. At least 3 newer weekenders exist
3. The event is more than 6 months old
4. Navigation dropdown has 4+ weekender entries

### Step 9.1: Update Previous Event Status

**File:** `config/bootstrap.json`

Update completed weekender event:

```json
{
  "id": 3,
  "name": "November Salsa Weekender 2025",
  "status": "completed",
  "is_featured": false,
  "is_visible": false,
  "display_order": 5
}
```

**Archival checklist:**
- [ ] Event end_date has passed (status should be "completed")
- [ ] At least 3 newer weekender events exist
- [ ] Event is more than 6 months old
- [ ] Navigation dropdown has 4+ weekender entries

### Step 9.2: Update Navigation Dropdown

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

### Step 9.3: Update display_order Values

Adjust display_order for remaining events to maintain proper sorting:

```json
{
  "id": 5,
  "name": "March Salsa Weekender 2026",
  "display_order": 2,
  "is_featured": true,
  "is_visible": true
}
```

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
- [ ] Archival guidance documented for future cleanup (Phase 9)

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
| 8.x | Various | Rollback steps (if needed) |
| 9.x | `config/bootstrap.json`, navigation | Archive previous event |

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

---

## Appendix A: Advanced Scenarios

### A.1: Custom Venue (Non-Avalon Ballroom)

If the weekender uses a different venue:

**Step 1: Update bootstrap.json event object:**
```json
{
  "venue_name": "Dairy Arts Center",
  "venue_address": "2590 Walnut Street",
  "venue_city": "Boulder",
  "venue_state": "CO",
  "venue_zip": "80302"
}
```

**Step 2: Update all venue references in event pages:**
```bash
# Find all Avalon references
grep -r "Avalon" pages/events/weekender-{YEAR}-{MONTH}/ --include="*.html"

# Replace venue name
sed -i '' 's/Avalon Ballroom/Dairy Arts Center/g' pages/events/weekender-{YEAR}-{MONTH}/*.html
sed -i '' 's/6185 Arapahoe Road/2590 Walnut Street/g' pages/events/weekender-{YEAR}-{MONTH}/*.html
```

**Step 3: Update tickets.html venue references:**
- `data-venue` attribute on ticket cards
- `.venue-name` element content

**Step 4: Update events-service.js fallback:**
```javascript
venue: {
    name: 'Dairy Arts Center',
    address: '2590 Walnut Street',
    city: 'Boulder',
    state: 'CO',
    zip: '80302'
}
```

---

### A.2: Two-Day Weekender

If the weekender spans 2 days (e.g., Saturday-Sunday):

**Step 1: Set different start_date and end_date in bootstrap.json:**
```json
{
  "start_date": "2026-08-08",
  "end_date": "2026-08-09"
}
```

**Step 2: Consider additional ticket types:**
```json
{
  "id": "weekender-2026-08-saturday",
  "name": "Saturday Only",
  "event_date": "2026-08-08",
  "price_cents": 4500
},
{
  "id": "weekender-2026-08-sunday",
  "name": "Sunday Only",
  "event_date": "2026-08-09",
  "price_cents": 4500
}
```

**Step 3: Update tickets.html** to show date range: "August 8-9, 2026"

**Step 4: Update schedule.html** with both days' schedules.

---

### A.3: Custom Event Name (Non-Standard Naming)

If using a custom name like "Holiday Salsa Social" instead of "December Weekender":

**Naming consistency:**
- **Slug:** Keep standard format: `weekender-2026-12` (for routing consistency)
- **Directory:** Keep standard: `weekender-2026-12/`
- **Display name:** Use custom: "Holiday Salsa Social 2026"
- **Event name in bootstrap.json:** Use custom: "Holiday Salsa Social 2026"

**Update these locations with custom name:**
- bootstrap.json `name` field
- Event page titles and headings
- Navigation dropdown display text
- Tickets page section title
- events-service.js `name` and `displayName`

**Keep standard slug for:**
- URL paths (/weekender-2026-12)
- vercel.json rewrites
- Ticket IDs (weekender-2026-12-full)
- Directory naming

---

### A.4: No External Links (Pasito.fun, Facebook)

If the weekender has no external event listings:

**Option A: Remove the entire "More Info" section:**
```html
<!-- DELETE this entire section from index.html -->
<section class="more-info-section">
  <h2>More Info</h2>
  <div class="external-links">
    <a href="https://pasito.fun/...">View on Pasito.fun</a>
    <a href="https://facebook.com/...">Facebook Event</a>
  </div>
</section>
```

**Option B: Keep section with different content:**
```html
<section class="more-info-section">
  <h2>More Info</h2>
  <p>Check back here for updates and announcements!</p>
  <p>Questions? Contact us at <a href="mailto:alocubanoboulderfest@gmail.com">alocubanoboulderfest@gmail.com</a></p>
</section>
```

---

### A.5: Multiple Featured Artists

If the weekender has 2-3 featured artists instead of one:

**Update index.html featured section:**
```html
<section class="featured-artists">
  <h2>Featured Instructors</h2>
  <div class="artists-grid">
    <div class="artist-feature">
      <img src="/images/artists/artist-1.png" alt="Artist 1">
      <h3>Artist Name 1</h3>
      <p>Bio text...</p>
    </div>
    <div class="artist-feature">
      <img src="/images/artists/artist-2.png" alt="Artist 2">
      <h3>Artist Name 2</h3>
      <p>Bio text...</p>
    </div>
    <div class="artist-feature">
      <img src="/images/artists/artist-3.png" alt="Artist 3">
      <h3>Artist Name 3</h3>
      <p>Bio text...</p>
    </div>
  </div>
</section>
```

**Update main heading:**
```html
<!-- FROM: -->
<h1>Featuring Carlos Rodriguez!</h1>

<!-- TO: -->
<h1>Featuring World-Class Instructors!</h1>
```

**Upload all artist images** to `images/artists/`.

---

### A.6: Troubleshooting Lint/Test Failures

If `npm run lint` fails:
```bash
# See specific errors
npm run lint 2>&1 | head -50

# Common fixes:
# - HTML validation errors: Check for missing closing tags
# - ESLint errors: Check for unused variables, missing semicolons
# - Markdown lint: Check heading hierarchy

# Run specific linter
npx htmlhint pages/events/weekender-{YEAR}-{MONTH}/*.html
npx eslint js/lib/events-service.js
```

If `npm test` fails:
```bash
# Run specific test file
npm test -- tests/unit/specific-test.test.js

# Common fixes:
# - Update expected values in tests if event IDs changed
# - Check bootstrap.json is valid JSON
# - Verify ticket IDs match between bootstrap.json and tests
```

**Don't bypass with --no-verify.** Fix the issues instead.
