# A Lo Cubano Admin Design System

## Clean, Professional Interface - No Emojis, Consistent Components

This document provides HTML templates and usage guidelines for implementing the unified admin design system across all A Lo Cubano Boulder Fest admin pages.

## Design Principles

- **No Emojis**: Clean, text-based navigation and headers
- **Consistent Visual Language**: Unified components across all pages
- **Professional Aesthetic**: Cuban color palette (Blue #5b6bb5, Red #cc2936)
- **Typography Hierarchy**: Bebas Neue for headings, clean sans-serif for body
- **Touch-Friendly**: 44px minimum touch targets
- **Accessible**: WCAG compliant with focus states and reduced motion support

## Color System

```css
/* Cuban Festival Colors */
--color-blue: #5b6bb5    /* Primary brand blue */
--color-red: #cc2936     /* Secondary brand red */
--color-black: #000000   /* Text primary */
--color-white: #ffffff   /* Background/inverse text */
```

## Component Library

### 1. Admin Header Component

Use this header structure on ALL admin pages:

```html
<header class="admin-header">
  <div class="admin-header-content">
    <div>
      <h1 class="admin-header-title">Dashboard</h1>
      <p class="admin-header-subtitle">A Lo Cubano Boulder Fest - Festival Management</p>
    </div>
    <div class="admin-header-actions">
      <button class="admin-btn admin-btn-primary">
        <span>Logout</span>
      </button>
    </div>
  </div>
</header>
```

### 2. Admin Navigation Component

Consistent navigation across all admin pages:

```html
<nav class="admin-navigation">
  <ul class="admin-nav-list">
    <li class="admin-nav-item">
      <a href="/admin" class="admin-nav-link">
        <span>Portal</span>
      </a>
    </li>
    <li class="admin-nav-item">
      <a href="/admin/dashboard" class="admin-nav-link active">
        <span>Dashboard</span>
      </a>
    </li>
    <li class="admin-nav-item">
      <a href="/admin/analytics" class="admin-nav-link">
        <span>Analytics</span>
      </a>
    </li>
    <li class="admin-nav-item">
      <a href="/admin/checkin" class="admin-nav-link">
        <span>Scanner</span>
      </a>
    </li>
  </ul>
</nav>
```

### 3. Status Indicator Component

Professional status indicators without emojis:

```html
<div class="admin-status-indicator">
  <span class="admin-status-dot"></span>
  <span>All Systems Operational</span>
</div>
```

### 4. Button System

Consistent button styling with multiple variants:

```html
<!-- Primary Action -->
<button class="admin-btn admin-btn-primary">
  <span>Primary Action</span>
</button>

<!-- Secondary Action -->
<button class="admin-btn admin-btn-secondary">
  <span>Secondary Action</span>
</button>

<!-- Ghost/Outline -->
<button class="admin-btn admin-btn-ghost">
  <span>Ghost Action</span>
</button>

<!-- Success Action -->
<button class="admin-btn admin-btn-success">
  <span>Success Action</span>
</button>

<!-- Small Size -->
<button class="admin-btn admin-btn-sm">
  <span>Small Button</span>
</button>

<!-- Large Size -->
<button class="admin-btn admin-btn-lg">
  <span>Large Button</span>
</button>

<!-- Loading State -->
<button class="admin-btn admin-btn-primary admin-btn-loading">
  <span>Loading...</span>
</button>
```

### 5. Card Components

Unified card system for different content types:

```html
<!-- Basic Card -->
<div class="admin-card">
  <div class="admin-card-header">
    <div>
      <h2 class="admin-card-title">Card Title</h2>
      <p class="admin-card-subtitle">Optional subtitle</p>
    </div>
    <div class="admin-card-actions">
      <button class="admin-btn admin-btn-sm">Action</button>
    </div>
  </div>
  <div class="admin-card-body">
    <!-- Card content -->
  </div>
</div>

<!-- Action Card (clickable) -->
<div class="admin-card admin-action-card" onclick="handleClick()">
  <div class="admin-card-header">
    <h2 class="admin-card-title">
      <span class="card-icon">D</span>
      <span>Dashboard</span>
    </h2>
  </div>
  <div class="admin-card-body">
    <p>Registration management, transactions, and system monitoring</p>
  </div>
</div>
```

### 6. Statistics Cards

Clean metrics display without emojis:

```html
<div class="admin-stat-card">
  <div class="stat-label">Total Tickets</div>
  <div class="stat-number">1,247</div>
  <div class="stat-change positive">↑ 12.5%</div>
</div>

<div class="admin-stat-card">
  <div class="stat-label">Revenue</div>
  <div class="stat-number">$24,890</div>
  <div class="stat-change negative">↓ 3.2%</div>
</div>
```

### 7. Data Tables

Professional, scannable tables:

```html
<table class="admin-table">
  <thead>
    <tr>
      <th>Ticket ID</th>
      <th>Name</th>
      <th>Email</th>
      <th>Status</th>
      <th>Actions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>ALB-2024-001</td>
      <td>John Smith</td>
      <td>john@example.com</td>
      <td>
        <span class="status-badge success">Active</span>
      </td>
      <td>
        <button class="admin-btn admin-btn-sm">Edit</button>
      </td>
    </tr>
  </tbody>
</table>
```

### 8. Status Badges

Clean status indicators:

```html
<span class="status-badge success">Active</span>
<span class="status-badge warning">Pending</span>
<span class="status-badge info">Processing</span>
<span class="status-badge error">Failed</span>
```

### 9. Grid Layouts

Responsive grid system:

```html
<!-- Auto-fit grid (recommended for stat cards) -->
<div class="admin-grid auto-fit">
  <div class="admin-stat-card">...</div>
  <div class="admin-stat-card">...</div>
  <div class="admin-stat-card">...</div>
</div>

<!-- Two column grid -->
<div class="admin-grid two-column">
  <div class="admin-card">...</div>
  <div class="admin-card">...</div>
</div>
```

## Page Templates

### 1. Admin Portal (index.html) - Clean Template

```html
<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Portal - A Lo Cubano Boulder Fest</title>
  
  <!-- CSS System -->
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/typography.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/admin-overrides.css">
  
  <script type="module" src="/js/theme-manager.js"></script>
</head>
<body class="admin-container">
  <!-- Unified Header -->
  <header class="admin-header">
    <div class="admin-header-content">
      <div>
        <h1 class="admin-header-title">Admin Portal</h1>
        <p class="admin-header-subtitle">A Lo Cubano Boulder Fest - Central Administration Hub</p>
      </div>
      <div class="admin-header-actions">
        <div class="admin-status-indicator">
          <span class="admin-status-dot"></span>
          <span id="status">All Systems Operational</span>
        </div>
        <button class="admin-btn admin-btn-primary" onclick="logout()">
          <span>Logout</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Quick Actions Section -->
  <div class="admin-card">
    <div class="admin-card-header">
      <h2 class="admin-card-title">Quick Actions</h2>
    </div>
    <div class="admin-card-body">
      <div class="admin-grid auto-fit">
        <button class="admin-btn admin-btn-primary" onclick="location.href='/admin/dashboard'">
          <span>Dashboard</span>
        </button>
        <button class="admin-btn admin-btn-secondary" onclick="location.href='/admin/analytics'">
          <span>Analytics</span>
        </button>
        <button class="admin-btn admin-btn-success" onclick="location.href='/admin/checkin'">
          <span>Scanner</span>
        </button>
        <button class="admin-btn admin-btn-ghost" onclick="syncToSheets()">
          <span>Sync Sheets</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Admin Sections -->
  <div class="admin-grid auto-fit">
    <!-- Dashboards & Analytics -->
    <div class="admin-card admin-action-card">
      <div class="admin-card-header">
        <h2 class="admin-card-title">
          <span class="card-icon">D</span>
          <span>Dashboards & Analytics</span>
        </h2>
      </div>
      <div class="admin-card-body">
        <p>Registration management, transactions, and comprehensive analytics</p>
        <div style="margin-top: var(--space-lg);">
          <a href="/admin/dashboard" class="admin-btn admin-btn-sm">Dashboard</a>
          <a href="/admin/analytics" class="admin-btn admin-btn-sm admin-btn-ghost">Analytics</a>
        </div>
      </div>
    </div>

    <!-- Authentication & Security -->
    <div class="admin-card admin-action-card">
      <div class="admin-card-header">
        <h2 class="admin-card-title">
          <span class="card-icon">S</span>
          <span>Authentication & Security</span>
        </h2>
      </div>
      <div class="admin-card-body">
        <p>Secure admin authentication and system monitoring</p>
        <div style="margin-top: var(--space-lg);">
          <button class="admin-btn admin-btn-sm" onclick="testMobileAuth()">Test Auth</button>
          <button class="admin-btn admin-btn-sm admin-btn-ghost" onclick="viewCSRFToken()">CSRF Status</button>
        </div>
      </div>
    </div>

    <!-- Data Management -->
    <div class="admin-card admin-action-card">
      <div class="admin-card-header">
        <h2 class="admin-card-title">
          <span class="card-icon">M</span>
          <span>Data Management</span>
        </h2>
      </div>
      <div class="admin-card-body">
        <p>Registration data, transaction history, and Google Sheets integration</p>
        <div style="margin-top: var(--space-lg);">
          <a href="/admin/dashboard#registrations" class="admin-btn admin-btn-sm">Registrations</a>
          <button class="admin-btn admin-btn-sm admin-btn-ghost" onclick="openGoogleSheets()">Sheets</button>
        </div>
      </div>
    </div>

    <!-- Tools & Utilities -->
    <div class="admin-card admin-action-card">
      <div class="admin-card-header">
        <h2 class="admin-card-title">
          <span class="card-icon">T</span>
          <span>Tools & Utilities</span>
        </h2>
      </div>
      <div class="admin-card-body">
        <p>Database health checks, cache management, and system utilities</p>
        <div style="margin-top: var(--space-lg);">
          <button class="admin-btn admin-btn-sm" onclick="testDatabase()">DB Health</button>
          <button class="admin-btn admin-btn-sm admin-btn-ghost" onclick="clearCache()">Clear Cache</button>
        </div>
      </div>
    </div>
  </div>

  <!-- API Endpoints Section -->
  <div class="admin-card">
    <div class="admin-card-header">
      <h2 class="admin-card-title">Available API Endpoints</h2>
    </div>
    <div class="admin-card-body">
      <div class="admin-grid auto-fit">
        <div class="endpoint-item">
          <span class="method">GET</span>
          <code>/api/admin/dashboard</code>
        </div>
        <div class="endpoint-item">
          <span class="method post">POST</span>
          <code>/api/admin/login</code>
        </div>
        <div class="endpoint-item">
          <span class="method">GET</span>
          <code>/api/admin/analytics</code>
        </div>
        <!-- More endpoints... -->
      </div>
    </div>
  </div>

  <script>
    // Your existing JavaScript functions
  </script>
</body>
</html>
```

### 2. Dashboard Template

```html
<body class="admin-container">
  <!-- Unified Header -->
  <header class="admin-header">
    <div class="admin-header-content">
      <div>
        <h1 class="admin-header-title">Admin Dashboard</h1>
        <p class="admin-header-subtitle">Festival Management & Analytics</p>
      </div>
      <div class="admin-header-actions">
        <button class="admin-btn admin-btn-ghost" onclick="location.href='/admin'">
          <span>Portal</span>
        </button>
        <button class="admin-btn admin-btn-ghost" onclick="location.href='/admin/analytics'">
          <span>Analytics</span>
        </button>
        <button class="admin-btn admin-btn-success" onclick="syncToSheets()">
          <span>Sync to Sheets</span>
        </button>
        <button class="admin-btn admin-btn-primary" onclick="logout()">
          <span>Logout</span>
        </button>
      </div>
    </div>
  </header>

  <!-- Statistics Grid -->
  <div class="admin-grid auto-fit" id="statsGrid">
    <!-- Stats cards will be populated here -->
  </div>

  <!-- Registrations Section -->
  <div class="admin-card">
    <div class="admin-card-header">
      <h2 class="admin-card-title">Registrations</h2>
      <div class="admin-card-actions">
        <button class="admin-btn admin-btn-sm" onclick="exportToCSV()">
          <span>Export CSV</span>
        </button>
      </div>
    </div>
    <div class="admin-card-body">
      <!-- Search and filters -->
      <div style="display: flex; gap: var(--space-md); margin-bottom: var(--space-lg); flex-wrap: wrap;">
        <input type="text" id="searchInput" class="form-input-type" placeholder="Search by name, email, or ticket ID..." style="flex: 1; min-width: 250px;" />
        <select id="statusFilter" class="form-input-type" style="min-width: 120px;">
          <option value="">All Status</option>
          <option value="valid">Valid</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button class="admin-btn" onclick="searchRegistrations()">
          <span>Search</span>
        </button>
      </div>
      
      <!-- Data table -->
      <div id="registrationsTable">
        <!-- Table content will be populated here -->
      </div>
    </div>
  </div>
</body>
```

## Usage Guidelines

### 1. Remove All Emojis
**BEFORE:**
```html
<h1>🎯 Admin Portal</h1>
<button>📊 Dashboard</button>
<span>⚡ Quick Actions</span>
```

**AFTER:**
```html
<h1 class="admin-header-title">Admin Portal</h1>
<button class="admin-btn">Dashboard</button>
<h2 class="admin-card-title">Quick Actions</h2>
```

### 2. Standardize Navigation
**BEFORE:**
```html
<div class="header-actions">
  <button onclick="location.href='/admin'">🎯 Portal</button>
  <button onclick="location.href='/admin/analytics'">📈 Analytics</button>
</div>
```

**AFTER:**
```html
<nav class="admin-navigation">
  <ul class="admin-nav-list">
    <li><a href="/admin" class="admin-nav-link">Portal</a></li>
    <li><a href="/admin/analytics" class="admin-nav-link">Analytics</a></li>
  </ul>
</nav>
```

### 3. Unify Card Components
**BEFORE:**
```html
<div class="section-card ticket-card">
  <h2><span class="icon">📊</span> Dashboards & Analytics</h2>
  <ul class="links-list">...</ul>
</div>
```

**AFTER:**
```html
<div class="admin-card admin-action-card">
  <div class="admin-card-header">
    <h2 class="admin-card-title">
      <span class="card-icon">D</span>
      <span>Dashboards & Analytics</span>
    </h2>
  </div>
  <div class="admin-card-body">...</div>
</div>
```

### 4. Consistent Button Usage
**BEFORE:**
```html
<a href="/admin/dashboard" class="action-btn form-button-type">📊 Dashboard</a>
<button class="btn btn-primary" onclick="logout()">Logout</button>
```

**AFTER:**
```html
<a href="/admin/dashboard" class="admin-btn admin-btn-primary">Dashboard</a>
<button class="admin-btn admin-btn-primary" onclick="logout()">Logout</button>
```

## Implementation Checklist

### Admin Portal (index.html)
- [ ] Replace emoji-heavy header with clean admin-header component
- [ ] Update all navigation links to use admin-nav-link classes
- [ ] Convert section cards to admin-action-card components
- [ ] Remove all emoji icons from titles and buttons
- [ ] Replace action-btn with admin-btn classes

### Dashboard (dashboard.html)
- [ ] Add consistent admin-header component
- [ ] Replace inline styles with admin-card components
- [ ] Update button classes to admin-btn system
- [ ] Ensure table uses admin-table classes
- [ ] Add admin-navigation component

### Analytics (analytics.html)
- [ ] Implement unified header across all pages
- [ ] Remove emoji icons from headers and navigation
- [ ] Update button styling to match admin-btn system
- [ ] Use admin-card for chart containers

### Login (login.html)
- [ ] Already clean - minimal changes needed
- [ ] Ensure button uses admin-btn-primary class
- [ ] Consistent with overall design system

### Check-in Scanner
- [ ] Add mobile-optimized admin-header
- [ ] Use admin-btn for all actions
- [ ] Maintain mobile-first approach

## Responsive Behavior

The design system is fully responsive:

- **Mobile (≤768px)**: Single column layout, full-width buttons, stacked navigation
- **Tablet (769px-1024px)**: Two-column grids, horizontal navigation
- **Desktop (≥1025px)**: Full grid layouts, optimized spacing

## Accessibility Features

- **Focus States**: 3px outline with proper contrast
- **Touch Targets**: Minimum 44px for mobile interactions
- **Screen Readers**: Semantic HTML with aria labels
- **High Contrast**: Enhanced borders and typography
- **Reduced Motion**: Respects user motion preferences

## Color Usage Guidelines

### Primary Actions
- Use `admin-btn-primary` (Blue #5b6bb5) for main actions like "Login", "Save"
- Use `admin-btn-secondary` (Red #cc2936) for secondary actions like "Cancel", "Delete"

### Status Colors
- Success: Green (#22c55e) for positive states
- Warning: Orange (#f59e0b) for attention states
- Error: Red (#cc2936) for error states
- Info: Blue (#5b6bb5) for informational states

### Text Hierarchy
- Primary text: Use existing color tokens
- Secondary text: Muted for descriptions
- Links: Blue for interactive elements

This design system ensures a professional, cohesive experience across all admin pages while maintaining the A Lo Cubano Cuban aesthetic and removing the excessive emoji usage.