#!/usr/bin/env node
/**
 * Generate Email Templates Script
 *
 * Generates formatted HTML email templates for copying to Brevo.
 * Uses Brevo template variable syntax ({{ params.variableName }})
 * Output: .tmp/ directory with prettified HTML files
 */

import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import {
  generateBrevoOrderConfirmationEmail,
  generateBrevoAttendeeConfirmationEmail,
  generateBrevoRegistrationReminderEmail
} from '../lib/email-templates/brevo-templates.js';

// Ensure .tmp directory exists
mkdirSync('.tmp', { recursive: true });

console.log('🎨 Generating Email Templates with Brevo Variables...\n');

// Generate templates with Brevo variable syntax ({{ params.* }})
// No sample data needed - templates use Brevo variables directly
const templates = [
  {
    name: 'brevo-order-confirmation-email.html',
    content: generateBrevoOrderConfirmationEmail()
  },
  {
    name: 'brevo-attendee-confirmation-email.html',
    content: generateBrevoAttendeeConfirmationEmail()
  },
  {
    name: 'brevo-registration-reminder-email.html',
    content: generateBrevoRegistrationReminderEmail()
  }
];

// Write unformatted files first
templates.forEach(({ name, content }) => {
  const filePath = `.tmp/${name}`;
  writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Generated: ${name}`);
});

console.log('\n🎨 Formatting with Prettier...\n');

// Format all HTML files with prettier
try {
  execSync('npx prettier --write .tmp/*.html --parser html', {
    stdio: 'inherit',
    encoding: 'utf8'
  });
  console.log('\n✨ All templates formatted successfully!');
  console.log('\n📂 Templates available in .tmp/ directory:');
  console.log('   - brevo-order-confirmation-email.html');
  console.log('   - brevo-attendee-confirmation-email.html');
  console.log('   - brevo-registration-reminder-email.html');
  console.log('\n📋 Ready to copy-paste into Brevo!\n');
} catch (error) {
  console.error('Error formatting templates:', error.message);
  process.exit(1);
}
