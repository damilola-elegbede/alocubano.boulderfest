/**
 * Email formatting utilities
 * Centralizes email HTML generation logic to avoid duplication
 */

/**
 * Generate numbered badge for email items
 * @param {number} index - Item number (1-based)
 * @param {string} color - Badge color (hex code)
 * @returns {string} HTML for numbered badge
 */
export function generateItemBadge(index, color = '#5b6bb5') {
  return `<span style="background: ${color}; color: white; border-radius: 50%; width: 28px; height: 28px; display: inline-block; text-align: center; line-height: 28px; font-weight: bold;">${index}</span>`;
}

/**
 * Generate item detail row for email
 * @param {string} label - Row label (e.g., "Event:")
 * @param {string} value - Row value
 * @returns {string} HTML for detail row
 */
export function generateDetailRow(label, value) {
  return `
        <tr>
          <td style="color: #666; font-size: 14px; padding: 3px 0; width: 60px;"><strong>${label}</strong></td>
          <td style="color: #666; font-size: 14px; padding: 3px 0;">${value}</td>
        </tr>`;
}

/**
 * Format price in cents to dollar string
 * @param {number|null} priceCents - Price in cents
 * @returns {string} Formatted price (e.g., "12.50")
 */
export function formatPrice(priceCents) {
  if (priceCents === null || priceCents === undefined) {
    return '0.00';
  }
  return (Number(priceCents) / 100).toFixed(2);
}

/**
 * Generate card-style item for email (tickets or donations)
 * @param {object} options - Item options
 * @param {number} options.index - Item number (1-based)
 * @param {string} options.title - Item title
 * @param {number|null} options.price - Price in cents (optional)
 * @param {boolean} options.includePricing - Whether to show pricing
 * @param {Array<{label: string, value: string}>} options.details - Item details
 * @param {string} options.borderColor - Left border color (default: #5b6bb5 for tickets)
 * @param {string} options.badgeColor - Badge background color (default: matches border)
 * @returns {string} HTML for card item
 */
export function generateEmailCard({
  index,
  title,
  price = null,
  includePricing = false,
  details = [],
  borderColor = '#5b6bb5',
  badgeColor = null
}) {
  const effectiveBadgeColor = badgeColor || borderColor;
  const priceDisplay = includePricing && price !== null ? ` - $${formatPrice(price)}` : '';
  const detailRows = details.map(d => generateDetailRow(d.label, d.value)).join('');

  return `
<table style="width: 100%; border-collapse: collapse; background: #f5f5f5; border-left: 4px solid ${borderColor}; margin-bottom: 15px;">
  <tr>
    <td style="width: 40px; padding: 15px 10px; vertical-align: top; text-align: center;">
      ${generateItemBadge(index, effectiveBadgeColor)}
    </td>
    <td style="padding: 15px 15px 15px 5px;">
      <div style="font-weight: bold; color: #1F2D3D; font-size: 16px; margin-bottom: 8px;">
        ${title}${priceDisplay}
      </div>
      <table style="width: 100%; border-collapse: collapse;">
        ${detailRows}
      </table>
    </td>
  </tr>
</table>`;
}
