/**
 * Admin Donations Dashboard
 * Manages donation analytics and reporting
 */

// State management
let currentFilters = {
  eventId: 'all',
  testMode: 'all',
  days: 30
};

let donationsData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
  console.log('📊 Initializing Donations Dashboard...');

  try {
    // Initialize event selector
    if (window.eventSelector) {
      await window.eventSelector.init();
      window.eventSelector.render('event-selector-container');

      // Get selected event ID
      const selectedEventId = window.eventSelector.getSelectedEventId();
      currentFilters.eventId = selectedEventId || 'all';

      // Listen for event changes
      window.eventSelector.onChange(async (eventId) => {
        currentFilters.eventId = eventId;
        await loadDonations();
      });
    }

    // Setup test mode filter
    const testModeFilter = document.getElementById('test-mode-filter');
    if (testModeFilter) {
      testModeFilter.addEventListener('change', async (e) => {
        currentFilters.testMode = e.target.value;
        await loadDonations();
      });
    }

    // Setup time range buttons
    document.querySelectorAll('.time-range-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        // Update active state
        document.querySelectorAll('.time-range-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Update filter
        currentFilters.days = e.target.dataset.days;
        await loadDonations();
      });
    });

    // Load initial data
    await loadDonations();

    // Show content after successful initialization
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';

    console.log('✅ Donations Dashboard initialized');
  } catch (error) {
    console.error('❌ Failed to initialize donations dashboard:', error);

    // Show error to user
    document.getElementById('donations-tbody').innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
          Failed to load donations data. Please try refreshing the page.
        </td>
      </tr>
    `;

    // Show content even on error
    document.documentElement.style.visibility = 'visible';
    document.documentElement.style.opacity = '1';
  }
});

/**
 * Load donations data from API
 */
async function loadDonations() {
  try {
    console.log('🔄 Loading donations data with filters:', currentFilters);

    const params = new URLSearchParams({
      eventId: currentFilters.eventId,
      testMode: currentFilters.testMode,
      days: currentFilters.days
    });

    const response = await fetch(`/api/admin/donations?${params}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Donations data loaded:', data);

    donationsData = data;

    // Update UI
    updateMetrics(data.metrics);
    renderDonationsTable(data.donations);

  } catch (error) {
    console.error('❌ Failed to load donations:', error);
    throw error;
  }
}

/**
 * Update metrics cards
 */
function updateMetrics(metrics) {
  // Total Donations
  document.getElementById('total-donations').textContent = metrics.totalDonations || '0';

  // Donation Revenue
  document.getElementById('donation-revenue').textContent = `$${Number(metrics.donationRevenue || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  // Transactions with Donations
  document.getElementById('transactions-with-donations').textContent = metrics.transactionsWithDonations || '0';

  // Average Donation
  document.getElementById('average-donation').textContent = `$${Number(metrics.averageDonation || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

  // For now, hide change indicators (would require historical comparison)
  document.querySelectorAll('.stat-change').forEach(el => {
    el.style.display = 'none';
  });
}

/**
 * Render donations table
 */
function renderDonationsTable(donations) {
  const tbody = document.getElementById('donations-tbody');

  if (!donations || donations.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: var(--space-xl);">
          No donations found for the selected filters.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = donations.map(donation => {
    const date = donation.created_at_mt || new Date(donation.created_at).toLocaleDateString();
    const amount = `$${Number(donation.amount).toFixed(2)}`;
    const customer = donation.customer_name || donation.customer_email || 'N/A';
    const event = donation.event_name || 'N/A';

    // Status badge
    let statusBadge = '';
    if (donation.status === 'completed') {
      statusBadge = '<span class="status-badge completed">Completed</span>';
    } else if (donation.status === 'pending') {
      statusBadge = '<span class="status-badge pending">Pending</span>';
    } else if (donation.status === 'failed') {
      statusBadge = '<span class="status-badge failed">Failed</span>';
    } else {
      statusBadge = `<span class="status-badge">${donation.status}</span>`;
    }

    // Test/Real badge
    const typeBadge = donation.is_test === 1 || donation.is_test === true
      ? '<span class="test-badge">TEST</span>'
      : '<span class="real-badge">REAL</span>';

    return `
      <tr>
        <td>${date}</td>
        <td style="font-family: var(--font-code); font-size: var(--font-size-xs);">${donation.transaction_id || 'N/A'}</td>
        <td style="font-weight: 600;">${amount}</td>
        <td>${customer}</td>
        <td>${event}</td>
        <td>${statusBadge}</td>
        <td>${typeBadge}</td>
      </tr>
    `;
  }).join('');
}

/**
 * Export data as JSON
 */
function exportJSON() {
  if (!donationsData) {
    alert('No data to export');
    return;
  }

  const dataStr = JSON.stringify(donationsData, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `donations-${new Date().toISOString().split('T')[0]}.json`;
  link.click();

  URL.revokeObjectURL(url);
}

/**
 * Export data as CSV
 */
function exportCSV() {
  if (!donationsData || !donationsData.donations) {
    alert('No data to export');
    return;
  }

  // CSV headers
  const headers = ['Date', 'Transaction ID', 'Amount', 'Customer', 'Event', 'Status', 'Type'];

  // CSV rows
  const rows = donationsData.donations.map(donation => {
    return [
      donation.created_at_mt || new Date(donation.created_at).toLocaleDateString(),
      donation.transaction_id || 'N/A',
      Number(donation.amount).toFixed(2),
      donation.customer_name || donation.customer_email || 'N/A',
      donation.event_name || 'N/A',
      donation.status || 'N/A',
      donation.is_test ? 'TEST' : 'REAL'
    ];
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  // Create download
  const dataBlob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `donations-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

// Make functions globally available
window.exportJSON = exportJSON;
window.exportCSV = exportCSV;
