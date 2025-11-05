/**
 * Volunteer Application Acknowledgement Email Template
 */

import { wrapInBaseLayout } from './base-layout.js';

/**
 * Build the HTML for a volunteer application acknowledgement email.
 * @param {Object} data - Email data.
 * @param {string} data.firstName - Volunteer's first name to personalize the message.
 * @param {string} data.lastName - Volunteer's last name.
 * @param {string} data.email - Volunteer's email address.
 * @param {Array<string>} data.areasOfInterest - Areas the volunteer is interested in.
 * @param {Array<string>} data.availability - Days the volunteer is available.
 * @returns {string} Complete HTML email content wrapped in the base site layout.
 */
export function generateVolunteerAcknowledgementEmail(data) {
  const {
    firstName,
    lastName,
    email,
    areasOfInterest = [],
    availability = []
  } = data;

  const content = `
    <div style="max-width: 600px; margin: 0 auto;">
      <h1 style="margin: 0 0 20px 0; color: #5b6bb5; font-size: 28px;">Thank You for Volunteering!</h1>

      <p style="margin: 0 0 15px 0;">Hi ${firstName}!</p>

      <p style="margin: 0 0 20px 0;">We're absolutely thrilled that you want to be part of A Lo Cubano Boulder Fest 2026! 🎉</p>

      <p style="margin: 0 0 20px 0;">We've received your volunteer application and we couldn't be more excited! Your interest in joining our festival family means the world to us.</p>

      <!-- Confirmation Banner -->
      <div style="background: linear-gradient(135deg, #5b6bb5 0%, #cc2936 100%); border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
        <p style="margin: 0; color: white; font-size: 18px; font-weight: bold;">
          ✓ Application Received
        </p>
      </div>

      <!-- What Happens Next Box -->
      <div style="background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #5b6bb5;">
        <h2 style="margin: 0 0 15px 0; font-size: 20px; color: #1F2D3D;">What Happens Next?</h2>

        <p style="margin: 0 0 10px 0; line-height: 1.6;">
          Our team will review your application as we approach the festival (<strong>May 15-17, 2026</strong>). We'll reach out to you with more details about volunteer opportunities, schedules, and next steps closer to the event.
        </p>
      </div>

      ${areasOfInterest.length > 0 || availability.length > 0 ? `
      <!-- Your Application Details -->
      <div style="background: #f9f9f9; border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 15px 0; font-size: 18px; color: #1F2D3D;">Your Application Details</h3>

        ${areasOfInterest.length > 0 ? `
        <div style="margin-bottom: 15px;">
          <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">Areas of Interest:</p>
          <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
            ${areasOfInterest.map(area => {
              const areaLabels = {
                'setup': 'Event Setup/Breakdown',
                'registration': 'Registration Desk',
                'artist': 'Artist Support',
                'merchandise': 'Merchandise Sales',
                'info': 'Information Booth',
                'social': 'Social Media Team'
              };
              return `<li style="margin: 4px 0; font-size: 14px;">${areaLabels[area] || area}</li>`;
            }).join('')}
          </ul>
        </div>
        ` : ''}

        ${availability.length > 0 ? `
        <div>
          <p style="margin: 0 0 8px 0; font-weight: bold; font-size: 14px;">Availability:</p>
          <ul style="margin: 0; padding-left: 20px; list-style-type: disc;">
            ${availability.map(day => {
              const dayLabels = {
                'friday': 'Friday, May 15',
                'saturday': 'Saturday, May 16',
                'sunday': 'Sunday, May 17'
              };
              return `<li style="margin: 4px 0; font-size: 14px;">${dayLabels[day] || day}</li>`;
            }).join('')}
          </ul>
        </div>
        ` : ''}
      </div>
      ` : ''}

      <!-- Stay Connected Box -->
      <div style="background: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 20px 0; border-radius: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #2e7d32;">Stay Connected</h3>
        <p style="margin: 0 0 10px 0; font-size: 14px; line-height: 1.6;">
          In the meantime, follow us on Instagram
          <a href="https://www.instagram.com/alocubano.boulderfest/" target="_blank" style="color: #5b6bb5; text-decoration: none; font-weight: bold;">@alocubano.boulderfest</a>
          for festival updates, artist announcements, and behind-the-scenes peeks!
        </p>
      </div>

      <!-- Questions Box -->
      <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 4px;">
        <p style="margin: 0; font-size: 14px; color: #666;">
          <strong>Questions?</strong> Feel free to reach out to us at
          <a href="mailto:alocubanoboulderfest@gmail.com" style="color: #5b6bb5; text-decoration: none;">alocubanoboulderfest@gmail.com</a>
        </p>
      </div>

      <!-- Closing -->
      <div style="margin: 30px 0 20px 0;">
        <p style="margin: 0 0 10px 0; font-size: 16px; font-weight: bold;">See you soon!</p>
        <p style="margin: 0 0 15px 0; font-size: 16px; font-weight: bold; color: #5b6bb5;">The A Lo Cubano Boulder Fest Team</p>

        <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #ddd;">
          <p style="margin: 0; font-size: 13px; font-style: italic; color: #666;">
            P.S. Get ready for three days of incredible Cuban salsa, amazing artists, and unforgettable memories in Boulder!
          </p>
        </div>
      </div>

    </div>
  `;

  return wrapInBaseLayout(content, 'Thank You for Volunteering - A Lo Cubano Boulder Fest');
}
