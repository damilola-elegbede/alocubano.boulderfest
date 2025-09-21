# Bootstrap Configuration Examples

Quick reference and examples for the A Lo Cubano Boulder Fest bootstrap system configuration files.

## Table of Contents

- [Configuration Templates](#configuration-templates)
- [Event Configuration Examples](#event-configuration-examples)
- [Settings Examples](#settings-examples)
- [Ticket Type Examples](#ticket-type-examples)
- [Validation Checklists](#validation-checklists)

## Configuration Templates

### Basic Event Template

```json
{
  "version": "1.0",
  "environment": "production",
  "metadata": {
    "created": "2025-01-18T00:00:00Z",
    "description": "Production bootstrap data for A Lo Cubano Boulder Fest"
  },
  "events": [
    {
      "slug": "event-slug-2025",
      "name": "Event Name 2025",
      "type": "festival",
      "status": "upcoming",
      "description": "Event description here",
      "venue": {
        "name": "Venue Name",
        "address": "123 Main Street",
        "city": "Boulder",
        "state": "CO",
        "zip": "80301"
      },
      "dates": {
        "start": "2025-06-15",
        "end": "2025-06-17",
        "early_bird_end": "2025-04-01",
        "regular_price_start": "2025-05-01"
      },
      "capacity": 300,
      "display_order": 1,
      "is_featured": true,
      "is_visible": true,
      "settings": {},
      "ticket_types": []
    }
  ],
  "admin_access": {
    "email": "${ADMIN_EMAIL}",
    "role": "admin",
    "events": ["*"],
    "granted_by": "bootstrap"
  },
  "defaults": {
    "settings": {}
  }
}
```

## Event Configuration Examples

### Festival Event (Multi-Day)

```json
{
  "slug": "boulderfest-2026",
  "name": "A Lo Cubano Boulder Fest 2026",
  "type": "festival",
  "status": "upcoming",
  "description": "The premier Cuban salsa festival in Boulder, featuring world-class instructors, live music, and three nights of social dancing.",
  "venue": {
    "name": "Avalon Ballroom",
    "address": "6185 Arapahoe Road",
    "city": "Boulder",
    "state": "CO",
    "zip": "80303"
  },
  "dates": {
    "start": "2026-05-15",
    "end": "2026-05-17",
    "early_bird_end": "2026-03-01",
    "regular_price_start": "2026-04-01"
  },
  "capacity": 500,
  "display_order": 1,
  "is_featured": true,
  "is_visible": true
}
```

### Weekender Event (Short Form)

```json
{
  "slug": "weekender-2025-11",
  "name": "November Salsa Weekender 2025",
  "type": "weekender",
  "status": "upcoming",
  "description": "An intimate weekend of Cuban salsa workshops and social dancing in the heart of Boulder.",
  "venue": {
    "name": "Boulder Theater",
    "address": "2032 14th Street",
    "city": "Boulder",
    "state": "CO",
    "zip": "80302"
  },
  "dates": {
    "start": "2025-11-08",
    "end": "2025-11-09",
    "early_bird_end": "2025-09-15",
    "regular_price_start": "2025-10-01"
  },
  "capacity": 200,
  "display_order": 2,
  "is_featured": true,
  "is_visible": true
}
```

### Workshop Event (Single Focus)

```json
{
  "slug": "masters-workshop-2025",
  "name": "Masters Workshop Series 2025",
  "type": "workshop",
  "status": "upcoming",
  "description": "Intensive workshops with master instructors focusing on advanced Cuban salsa techniques.",
  "venue": {
    "name": "Dance Studio Boulder",
    "address": "789 Workshop Ave",
    "city": "Boulder",
    "state": "CO",
    "zip": "80301"
  },
  "dates": {
    "start": "2025-08-20",
    "end": "2025-08-20",
    "early_bird_end": "2025-07-01",
    "regular_price_start": "2025-07-15"
  },
  "capacity": 50,
  "display_order": 3,
  "is_featured": false,
  "is_visible": true
}
```

## Settings Examples

### Production Settings (Full Features)

```json
"settings": {
  "payment": {
    "stripe_enabled": true,
    "processing_fee_percentage": 2.9,
    "processing_fee_fixed": 0.30,
    "tax_enabled": false,
    "tax_rate": 0,
    "currency": "usd",
    "payment_methods": ["card", "link"]
  },
  "registration": {
    "deadline_days": 3,
    "reminder_days": [30, 14, 7, 3, 1],
    "allow_transfer": true,
    "allow_name_change": true,
    "require_phone": true,
    "require_emergency_contact": true,
    "required_fields": ["first_name", "last_name", "email", "phone", "emergency_contact"],
    "optional_fields": ["dietary_restrictions", "dance_level", "accommodation_needs"],
    "confirmation_required": false,
    "waitlist_enabled": true
  },
  "email": {
    "confirmation_enabled": true,
    "reminder_enabled": true,
    "from_name": "A Lo Cubano Boulder Fest",
    "reply_to": "alocubanoboulderfest@gmail.com",
    "support_email": "alocubanoboulderfest@gmail.com",
    "template_style": "default",
    "include_calendar_attachment": true,
    "include_qr_code": true
  },
  "wallet": {
    "passes_enabled": true,
    "apple_enabled": true,
    "google_enabled": true,
    "update_enabled": true,
    "location_trigger": true,
    "location_radius_miles": 1,
    "auto_update": true,
    "pass_type": "eventTicket",
    "barcode_format": "QR"
  },
  "checkin": {
    "qr_enabled": true,
    "manual_enabled": true,
    "multiple_allowed": true,
    "scan_limit": 10,
    "time_window_hours": 4,
    "early_checkin_hours": 2,
    "late_checkin_allowed": true,
    "require_id": false,
    "collect_signature": false,
    "print_badge": false
  },
  "discounts": {
    "early_bird_percentage": 20,
    "group_minimum": 5,
    "group_percentage": 10,
    "student_discount": 15,
    "member_discount": 10,
    "promo_codes_enabled": true
  },
  "features": {
    "workshops": true,
    "performances": true,
    "social_dancing": true,
    "live_music": true,
    "competitions": false,
    "vendor_booths": true,
    "photo_gallery": true,
    "live_streaming": false
  }
}
```

### Preview Settings (Limited Features)

```json
"settings": {
  "payment": {
    "stripe_enabled": true,
    "processing_fee_percentage": 2.9,
    "processing_fee_fixed": 0.30,
    "tax_enabled": false,
    "tax_rate": 0,
    "currency": "usd",
    "payment_methods": ["card"]
  },
  "registration": {
    "deadline_days": 1,
    "reminder_days": [7, 3, 1],
    "allow_transfer": true,
    "allow_name_change": true,
    "require_phone": false,
    "require_emergency_contact": false,
    "required_fields": ["first_name", "last_name", "email"],
    "optional_fields": ["phone", "dance_level"],
    "confirmation_required": false,
    "waitlist_enabled": true
  },
  "email": {
    "confirmation_enabled": true,
    "reminder_enabled": false,
    "from_name": "Test Festival",
    "reply_to": "test@example.com",
    "support_email": "test@example.com",
    "template_style": "default",
    "include_calendar_attachment": false,
    "include_qr_code": true
  },
  "wallet": {
    "passes_enabled": false,
    "apple_enabled": false,
    "google_enabled": false
  },
  "features": {
    "workshops": true,
    "performances": true,
    "social_dancing": true,
    "live_music": false,
    "competitions": false,
    "vendor_booths": false,
    "photo_gallery": false,
    "live_streaming": false
  }
}
```

### Development Settings (Minimal Features)

```json
"settings": {
  "payment": {
    "stripe_enabled": false,
    "processing_fee_percentage": 0,
    "processing_fee_fixed": 0,
    "currency": "usd"
  },
  "registration": {
    "deadline_days": 0,
    "reminder_days": [1],
    "allow_transfer": true,
    "allow_name_change": true,
    "require_phone": false,
    "require_emergency_contact": false,
    "required_fields": ["first_name", "last_name", "email"],
    "optional_fields": [],
    "confirmation_required": false,
    "waitlist_enabled": false
  },
  "email": {
    "confirmation_enabled": false,
    "reminder_enabled": false,
    "from_name": "Dev Festival",
    "reply_to": "dev@localhost",
    "support_email": "dev@localhost"
  },
  "wallet": {
    "passes_enabled": false
  },
  "features": {
    "workshops": true,
    "performances": false,
    "social_dancing": true,
    "live_music": false
  }
}
```

## Ticket Type Examples

### Festival Full Pass (Premium)

```json
{
  "code": "regular-full",
  "name": "Regular Full Pass",
  "description": "All workshops, performances, and social dancing for the entire festival",
  "category": "pass",
  "includes": ["workshops", "performances", "socials"],
  "valid_days": ["friday", "saturday", "sunday"],
  "pricing": {
    "regular": 125,
    "door": 140
  },
  "availability": {
    "max_quantity": 250,
    "min_purchase": 1,
    "max_purchase": 6,
    "sales_start": "2026-03-01",
    "sales_end": "2026-05-15"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 1,
    "color": "#3498DB",
    "icon": "ticket",
    "featured": true,
    "visible": true
  }
}
```

### Early Bird Special

```json
{
  "code": "early-bird-full",
  "name": "Early Bird Full Pass",
  "description": "All workshops, performances, and social dancing - Save $25! Limited time offer.",
  "category": "pass",
  "includes": ["workshops", "performances", "socials"],
  "valid_days": ["friday", "saturday", "sunday"],
  "pricing": {
    "early_bird": 100
  },
  "availability": {
    "max_quantity": 200,
    "min_purchase": 1,
    "max_purchase": 6,
    "sales_start": "2025-12-01",
    "sales_end": "2026-03-01"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 1,
    "color": "#E74C3C",
    "icon": "star",
    "featured": true,
    "visible": true
  }
}
```

### Single Day Pass

```json
{
  "code": "saturday-pass",
  "name": "Saturday Pass",
  "description": "Saturday workshops, live performances, and social dancing",
  "category": "pass",
  "includes": ["workshops", "performances", "socials"],
  "valid_days": ["saturday"],
  "pricing": {
    "regular": 85,
    "door": 95
  },
  "availability": {
    "max_quantity": 200,
    "min_purchase": 1,
    "max_purchase": 4,
    "sales_start": "2025-12-01",
    "sales_end": "2026-05-16"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 4,
    "color": "#F39C12",
    "icon": "calendar",
    "featured": false,
    "visible": true
  }
}
```

### Social Dancing Only

```json
{
  "code": "saturday-social",
  "name": "Saturday Social Only",
  "description": "Saturday evening social dancing with live band performance",
  "category": "social",
  "includes": ["socials", "performances"],
  "valid_days": ["saturday"],
  "pricing": {
    "regular": 25,
    "door": 30
  },
  "availability": {
    "max_quantity": 120,
    "min_purchase": 1,
    "max_purchase": 2,
    "sales_start": "2025-12-01",
    "sales_end": "2026-05-16"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 7,
    "color": "#E67E22",
    "icon": "music",
    "featured": false,
    "visible": true
  }
}
```

### Free Development Ticket

```json
{
  "code": "dev-free-pass",
  "name": "Dev Free Pass",
  "description": "Free development ticket for testing",
  "category": "pass",
  "includes": ["workshops", "socials"],
  "valid_days": ["saturday", "sunday"],
  "pricing": {
    "regular": 0,
    "door": 0
  },
  "availability": {
    "max_quantity": 20,
    "min_purchase": 1,
    "max_purchase": 5,
    "sales_start": "2025-01-01",
    "sales_end": "2025-04-12"
  },
  "restrictions": {
    "age_minimum": null,
    "requires_audition": false,
    "requires_partner": false,
    "level_requirement": null
  },
  "display": {
    "order": 1,
    "color": "#28A745",
    "icon": "ticket",
    "featured": true,
    "visible": true
  }
}
```

## Validation Checklists

### Pre-Deployment Checklist

#### Event Configuration

- [ ] **Unique slug**: No duplicate slugs across events
- [ ] **Valid dates**: start_date < end_date, valid ISO format
- [ ] **Capacity**: Positive integer, realistic for venue
- [ ] **Venue information**: Complete address information
- [ ] **Display properties**: Appropriate order and visibility flags

#### Ticket Type Configuration

- [ ] **Unique codes**: No duplicate codes within event
- [ ] **Valid pricing**: Non-negative numbers for all tiers
- [ ] **Date logic**: sales_start <= early_bird_end <= regular_price_start <= sales_end
- [ ] **Quantity limits**: max_quantity >= min_purchase
- [ ] **Availability windows**: Logical start and end dates

#### Settings Configuration

- [ ] **Payment settings**: Valid currency, reasonable fees
- [ ] **Email settings**: Valid email addresses, appropriate flags
- [ ] **Registration settings**: Logical deadlines and requirements
- [ ] **Feature flags**: Consistent with event type and capabilities

### JSON Validation Commands

```bash
# Validate JSON syntax
jq . bootstrap/production.json
jq . bootstrap/preview.json
jq . bootstrap/development.json

# Check for required fields
jq '.events[] | select(.slug == null or .name == null)' bootstrap/production.json

# Validate date formats
jq '.events[] | .dates | to_entries[] | select(.value | strptime("%Y-%m-%d") | not)' bootstrap/production.json

# Check for duplicate slugs
jq '.events | group_by(.slug) | map(select(length > 1))' bootstrap/production.json

# Validate ticket type codes
jq '.events[] | .ticket_types | group_by(.code) | map(select(length > 1))' bootstrap/production.json
```

### Configuration Testing

```bash
# Test configuration loading
NODE_ENV=development npm run bootstrap:test
VERCEL_ENV=preview npm run bootstrap:test
VERCEL_ENV=production npm run bootstrap:test

# Validate complete bootstrap process
npm run bootstrap:local

# Check structure integrity
npm run verify-structure
```

This reference guide provides practical examples and validation tools for managing bootstrap configurations across all environments. Use these templates as starting points and customize them for specific events and requirements.