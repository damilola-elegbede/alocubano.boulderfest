# Form Components Specification

## Overview

A Lo Cubano Boulder Fest employs a comprehensive form system that balances **typography-forward design** with **accessibility compliance** and **security considerations**. The form architecture supports volunteer applications, ticket purchases, and donation processing through a unified design language.

## Form Component Architecture

### Core Form Classes

The form system uses a two-tier architecture with base styles and typography-enhanced variants:

#### Base Form Components (`/css/forms.css` lines 3-57)
- `.form-group` - Container with `margin-bottom: var(--space-lg)`
- `.form-label` - Styled labels with uppercase typography
- `.form-input`, `.form-textarea`, `.form-select` - Unified input styling
- `.error-message` - Error state messaging
- `.form-success` - Success state container

#### Typography-Enhanced Components (`/css/forms.css` lines 58-125)
- `.form-grid-type` - Two-column grid layout (responsive)
- `.form-group-type` - Typography-focused grouping
- `.form-label-type` - Enhanced labels with letter-spacing
- `.form-input-type`, `.form-textarea-type` - Typography-specific styling
- `.checkbox-group-type` - Checkbox arrangement system

### Form Implementations

#### 1. Volunteer Application Form (`/pages/about.html` lines 337-422)

**Structure:**
```html
<form class="volunteer-form-typographic" id="volunteer-form" 
      onsubmit="handleVolunteerForm(event)" method="post">
    <h3 class="form-title text-mask">VOLUNTEER APPLICATION</h3>
    
    <div class="form-grid-type">
        <div class="form-group-type">
            <label class="form-label-type font-mono">FIRST NAME</label>
            <input type="text" class="form-input-type" placeholder="Your first name" required>
        </div>
        <div class="form-group-type">
            <label class="form-label-type font-mono">LAST NAME</label>
            <input type="text" class="form-input-type" placeholder="Your last name" required>
        </div>
    </div>
    
    <!-- Additional fields... -->
</form>
```

**Key Features:**
- Two-column responsive grid for name fields
- Checkbox groups for areas of interest and availability
- Typography-forward styling with monospace labels
- Textarea for motivation section
- Integrated error handling

#### 2. Donation Form (`/pages/donations.html` lines 75-153)

**Structure:**
```html
<form class="donation-form" id="donation-form" 
      onsubmit="handleDonationForm(event)" method="post" 
      novalidate role="form" aria-labelledby="donation-form-title">
    <fieldset class="form-section">
        <legend class="form-label-type font-mono">SELECT AMOUNT</legend>
        <div class="donation-amounts">
            <label class="donation-option">
                <input type="radio" name="amount" value="100" checked 
                       aria-label="Donate $100">
                <span class="amount-box">
                    <span class="text-display text-gradient">$100</span>
                </span>
            </label>
        </div>
    </fieldset>
</form>
```

**Key Features:**
- Radio button selection with visual amount boxes
- Conditional "other amount" input field
- Fieldset/legend structure for accessibility
- Progressive enhancement with JavaScript

#### 3. Ticket Purchase Form (`/pages/tickets.html` lines 136-208)

**Structure:**
```html
<form id="ticket-form" onsubmit="handleTicketForm(event)" method="post">
    <div class="ticket-group">
        <h3 class="font-mono">FULL FESTIVAL PASS</h3>
        <label>
            <input type="checkbox" name="full-pass" value="100" 
                   data-price="100">
            <span>Early Bird (before April 1st) - $100</span>
        </label>
    </div>
</form>
```

**Key Features:**
- Dynamic pricing calculation
- Checkbox groups with data attributes
- Real-time total updates
- Mutual exclusivity logic (full pass vs. day passes)

## Input Field Styling and Variants

### Basic Input Styling (`/css/forms.css` lines 17-26)

```css
.form-input,
.form-textarea,
.form-select {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-gray-300);
  background-color: var(--color-white);
  font-size: var(--font-size-base);
  transition: all var(--transition-base);
}
```

### Typography-Enhanced Styling (`/css/forms.css` lines 84-92)

```css
.form-input-type,
.form-textarea-type {
  width: 100%;
  padding: var(--space-md);
  font-family: var(--font-sans);
  font-size: var(--font-size-base);
  border: 1px solid var(--color-gray-300);
  background: var(--color-white);
  transition: border-color 0.2s ease;
}
```

### Focus States (`/css/forms.css` lines 28-34, 94-98)

**Base Focus:**
```css
.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-blue);
  box-shadow: 0 0 0 3px rgba(91, 107, 181, 0.1);
}
```

**Typography Focus:**
```css
.form-input-type:focus,
.form-textarea-type:focus {
  outline: none;
  border-color: var(--color-black);
}
```

## Validation Patterns and Error Handling

### HTML5 Validation Attributes

**Required Fields:**
- `required` attribute on essential inputs
- `minlength="2" maxlength="50"` for name fields (`/pages/donations.html` lines 124, 129)
- `type="email"` for email validation
- `type="tel"` for phone numbers
- `min="1"` for numeric inputs

**Example Implementation:**
```html
<input type="text" id="first-name" name="first-name" 
       class="form-input-type" required 
       autocomplete="given-name" 
       minlength="2" maxlength="50" 
       aria-describedby="first-name-error">
```

### Error State Styling (`/css/forms.css` lines 36-47)

```css
.form-input.error,
.form-textarea.error,
.form-select.error {
  border-color: var(--color-red);
}

.error-message {
  display: block;
  color: var(--color-red);
  font-size: var(--font-size-sm);
  margin-top: var(--space-xs);
}
```

### Accessibility-Enhanced Error Handling (`/css/forms.css` lines 244-249)

```css
.form-input[aria-invalid="true"],
.form-textarea[aria-invalid="true"],
.form-select[aria-invalid="true"] {
  border-color: var(--color-red);
  box-shadow: 0 0 0 3px rgba(204, 41, 54, 0.1);
}
```

### JavaScript Validation Pattern

Each form implements client-side validation with graceful degradation:

```javascript
function handleVolunteerForm(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // Collect and validate form data
    const name = formData.get('name') || '';
    const email = formData.get('email') || '';
    
    // Create structured email body
    const emailBody = `Volunteer Application - A Lo Cubano Boulder Fest
    
Name: ${name}
Email: ${email}
...`;
    
    // Secure mailto: handling
    const subject = encodeURIComponent('Volunteer Application');
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:alocubanoboulderfest@gmail.com?subject=${subject}&body=${body}`;
    
    window.location.href = mailtoUrl;
}
```

## Accessibility Compliance

### Semantic HTML Structure

**Form Roles and Labels:**
```html
<form role="form" aria-labelledby="donation-form-title">
    <h2 id="donation-form-title">MAKE A DONATION</h2>
    <fieldset class="form-section">
        <legend class="form-label-type font-mono">SELECT AMOUNT</legend>
        <!-- Radio options -->
    </fieldset>
</form>
```

**Input Associations:**
```html
<label class="form-label-type font-mono" for="first-name">FIRST NAME</label>
<input type="text" id="first-name" name="first-name" 
       class="form-input-type" required 
       autocomplete="given-name" 
       aria-describedby="first-name-error">
```

### ARIA Implementation

- `aria-label` for radio buttons: `aria-label="Donate $100"`
- `aria-describedby` linking inputs to error messages
- `role="form"` on form containers
- `aria-labelledby` connecting forms to titles
- `aria-invalid="true"` for error states

### Keyboard Navigation

All interactive elements support keyboard navigation:
- Tab order follows logical flow
- Focus indicators with `outline: 2px solid var(--color-blue)`
- Enter key submits forms
- Space bar toggles checkboxes/radio buttons

## Responsive Form Behavior

### Mobile Optimizations (`/css/mobile-overrides.css` lines 200-244)

**Form Layout:**
```css
@media (max-width: 768px) {
  .purchase-section {
    padding: var(--space-xl) !important;
    margin: 0 var(--space-md) var(--space-3xl) !important;
  }
  
  .form-grid-type {
    grid-template-columns: 1fr !important;
  }
}
```

**Touch-Optimized Inputs:**
```css
.purchase-section input[type="text"],
.purchase-section input[type="email"],
.purchase-section input[type="tel"],
.purchase-section input[type="number"] {
  padding: var(--space-md);
  font-size: var(--font-size-base);
  border-radius: 4px;
  touch-action: manipulation;
  min-height: 44px;
}
```

**iOS Zoom Prevention:**
```css
input[type="text"],
input[type="email"],
input[type="tel"],
input[type="number"] {
  font-size: 16px !important; /* Prevents iOS zoom */
}
```

### Desktop Layout

**Two-Column Grid (`/css/forms.css` lines 64-68):**
```css
.form-grid-type {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
  margin-bottom: var(--space-xl);
}
```

## Security Considerations

### Mailto Handling Pattern

All forms use secure mailto: URL generation with proper encoding:

```javascript
// Secure data collection
const formData = new FormData(form);
const name = formData.get('name') || '';
const email = formData.get('email') || '';

// Content sanitization through structured formatting
const emailBody = `Form Submission - A Lo Cubano Boulder Fest

Name: ${name}
Email: ${email}
...`;

// URL encoding prevents injection
const subject = encodeURIComponent('Form Subject');
const body = encodeURIComponent(emailBody);
const mailtoUrl = `mailto:alocubanoboulderfest@gmail.com?subject=${subject}&body=${body}`;
```

### Input Sanitization

- All form data collected through `FormData` API
- Server-side validation implied through structured email format
- No direct DOM manipulation with user input
- XSS prevention through proper encoding

### Data Validation

**Client-side:**
- HTML5 validation attributes
- JavaScript form validation
- Required field enforcement
- Type-specific validation (email, tel, number)

**Server-side:**
- Email-based processing eliminates direct server vulnerabilities
- Structured data format for consistent parsing
- Implicit validation through email client handling

## Submit Button and Interaction States

### Button Component Architecture (`/css/forms.css` lines 126-225)

**Base Button:**
```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-lg);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--font-size-sm);
  border: 2px solid transparent;
  transition: all var(--transition-base);
  cursor: pointer;
  text-decoration: none;
}
```

**Typography Button with Animation (`/css/forms.css` lines 178-214):**
```css
.form-button-type {
  position: relative;
  overflow: hidden;
  background: var(--color-black);
  color: var(--color-white);
  border: 2px solid var(--color-black);
  padding: var(--space-md) var(--space-xl);
  font-family: var(--font-code);
  font-size: var(--font-size-sm);
  letter-spacing: var(--letter-spacing-wide);
  text-transform: uppercase;
  transition: all var(--transition-base);
  cursor: pointer;
}

.form-button-type::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: var(--color-red);
  transition: left 0.3s ease;
  z-index: -1;
}

.form-button-type:hover::before {
  left: 0;
}
```

### Button Variants

**Primary Button:**
```css
.btn-primary {
  background-color: var(--color-blue);
  color: var(--color-white);
  border-color: var(--color-blue);
}
```

**Accent Button:**
```css
.btn-accent {
  background-color: var(--color-red);
  color: var(--color-white);
  border-color: var(--color-red);
}
```

**Volunteer Submit:**
```css
.volunteer-submit {
  width: 100%;
  background: var(--color-black);
  color: var(--color-white);
}

.volunteer-submit:hover {
  background: var(--color-red);
}
```

### Mobile Button Optimization (`/css/mobile-overrides.css` lines 236-244)

```css
.form-button-type {
  width: 100% !important;
  padding: var(--space-lg) !important;
  font-size: var(--font-size-base) !important;
  min-height: 48px;
  touch-action: manipulation;
  border-radius: 4px;
}
```

## Custom Form Elements

### Custom Checkbox (`/css/forms.css` lines 252-308)

```css
.custom-checkbox {
  position: relative;
  display: inline-block;
  cursor: pointer;
  padding-left: 25px;
  margin-bottom: 12px;
  font-size: var(--font-size-sm);
  user-select: none;
}

.custom-checkbox input {
  position: absolute;
  opacity: 0;
  cursor: pointer;
  height: 0;
  width: 0;
}

.custom-checkbox .checkmark {
  position: absolute;
  top: 0;
  left: 0;
  height: 20px;
  width: 20px;
  background-color: var(--color-white);
  border: 2px solid var(--color-gray-300);
  transition: all var(--transition-base);
}

.custom-checkbox input:checked ~ .checkmark {
  background-color: var(--color-blue);
  border-color: var(--color-blue);
}

.custom-checkbox .checkmark:after {
  left: 6px;
  top: 2px;
  width: 6px;
  height: 10px;
  border: solid var(--color-white);
  border-width: 0 3px 3px 0;
  transform: rotate(45deg);
}
```

### Typography Checkbox Groups (`/pages/about.html` lines 363-388)

```html
<div class="checkbox-group-type">
    <label class="checkbox-type">
        <input type="checkbox" name="area" value="setup">
        <span>Event Setup/Breakdown</span>
    </label>
    <label class="checkbox-type">
        <input type="checkbox" name="area" value="registration">
        <span>Registration Desk</span>
    </label>
</div>
```

## Design Tokens and Variables

### Form-Specific Design Tokens (`/css/base.css`)

**Colors:**
- `--color-black: #000000` - Primary form elements
- `--color-white: #FFFFFF` - Backgrounds
- `--color-blue: #5B6BB5` - Focus states, primary actions
- `--color-red: #CC2936` - Error states, accent actions
- `--color-gray-300: #BBBBBB` - Border colors

**Spacing:**
- `--space-xs: 0.25rem` - Label margins
- `--space-sm: 0.5rem` - Input padding (vertical)
- `--space-md: 1rem` - Input padding (horizontal)
- `--space-lg: 1.5rem` - Form group margins
- `--space-xl: 2rem` - Section spacing
- `--space-2xl: 3rem` - Large section spacing

**Typography:**
- `--font-sans` - Body text and inputs
- `--font-mono` - Labels and technical elements
- `--font-code` - Special buttons and headers
- `--font-size-sm: 0.875rem` - Labels and small text
- `--font-size-base: 1rem` - Input text and body
- `--letter-spacing-wide: 0.025em` - Label spacing

## Mobile-Optimized Form Behavior

### Touch Targets (`/css/mobile-overrides.css` lines 278-285)

```css
.nav-link,
.social-link-type,
.menu-toggle,
.form-button-type {
  min-height: 44px;
  min-width: 44px;
}
```

### Input Enhancements

**Touch Action:**
```css
input[type="text"],
input[type="email"],
input[type="tel"],
input[type="number"] {
  touch-action: manipulation;
  min-height: 44px;
}
```

**Focus States:**
```css
.nav-link:focus,
.form-button-type:focus,
input:focus {
  outline: 2px solid var(--color-blue);
  outline-offset: 2px;
}
```

### Grid Responsiveness

**Mobile Stacking:**
```css
@media (max-width: 768px) {
  .form-grid-type {
    grid-template-columns: 1fr !important;
  }
  
  .purchase-section [style*="grid-template-columns: 1fr 1fr"] {
    grid-template-columns: 1fr !important;
    gap: var(--space-md) !important;
  }
}
```

## Implementation Examples

### Complete Form Implementation

**HTML Structure:**
```html
<form class="volunteer-form-typographic" id="volunteer-form" 
      onsubmit="handleVolunteerForm(event)" method="post">
    <h3 class="form-title text-mask">VOLUNTEER APPLICATION</h3>
    
    <div class="form-grid-type">
        <div class="form-group-type">
            <label class="form-label-type font-mono">FIRST NAME</label>
            <input type="text" class="form-input-type" 
                   placeholder="Your first name" required>
        </div>
        <div class="form-group-type">
            <label class="form-label-type font-mono">LAST NAME</label>
            <input type="text" class="form-input-type" 
                   placeholder="Your last name" required>
        </div>
    </div>
    
    <div class="form-group-type">
        <label class="form-label-type font-mono">EMAIL</label>
        <input type="email" class="form-input-type" 
               placeholder="your@email.com" required>
    </div>
    
    <div class="form-group-type">
        <label class="form-label-type font-mono">PHONE</label>
        <input type="tel" class="form-input-type" 
               placeholder="(303) 555-0123">
    </div>
    
    <div class="form-group-type">
        <label class="form-label-type font-mono">WHY DO YOU WANT TO VOLUNTEER?</label>
        <textarea class="form-textarea-type" rows="4" 
                  placeholder="Tell us about your motivation..."></textarea>
    </div>
    
    <div class="form-actions-type">
        <button type="submit" class="form-button-type volunteer-submit">
            SUBMIT APPLICATION
        </button>
    </div>
</form>
```

**JavaScript Handler:**
```javascript
function handleVolunteerForm(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    
    // Collect form data with fallbacks
    const firstName = formData.get('first-name') || '';
    const lastName = formData.get('last-name') || '';
    const email = formData.get('email') || '';
    const phone = formData.get('phone') || '';
    const motivation = formData.get('motivation') || '';
    
    // Collect checkbox data
    const areas = [];
    formData.getAll('area').forEach(area => areas.push(area));
    const availability = [];
    formData.getAll('day').forEach(day => availability.push(day));
    
    // Create structured email
    const emailBody = `Volunteer Application - A Lo Cubano Boulder Fest

Name: ${firstName} ${lastName}
Email: ${email}
Phone: ${phone}

Areas of Interest: ${areas.join(', ')}
Availability: ${availability.join(', ')}

Motivation:
${motivation}

---
Sent from A Lo Cubano Boulder Fest website`;
    
    // Secure mailto URL
    const subject = encodeURIComponent('Volunteer Application - A Lo Cubano Boulder Fest');
    const body = encodeURIComponent(emailBody);
    const mailtoUrl = `mailto:alocubanoboulderfest@gmail.com?subject=${subject}&body=${body}`;
    
    // Redirect to email client
    window.location.href = mailtoUrl;
}
```

## Summary

The A Lo Cubano Boulder Fest form system exemplifies **typography-forward design** while maintaining strict **accessibility compliance** and **security best practices**. Key characteristics include:

- **Unified Design Language** - Consistent styling across volunteer, donation, and ticket forms
- **Progressive Enhancement** - HTML5 validation with JavaScript enhancements
- **Mobile-First Responsive** - Touch-optimized inputs and layouts
- **Accessibility Compliant** - ARIA attributes, semantic HTML, keyboard navigation
- **Security Conscious** - Proper encoding, structured data handling, client-side validation
- **Typography Integration** - Monospace headers, display fonts, letter-spacing enhancement
- **Performance Optimized** - Minimal DOM manipulation, efficient CSS transitions

The system successfully balances aesthetic appeal with functional requirements, creating forms that are both visually striking and highly usable across all devices and accessibility contexts.