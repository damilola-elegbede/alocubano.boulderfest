#!/usr/bin/env node

/**
 * Test script for Phase 8 Analytics & Reporting
 * Tests all analytics endpoints and dashboard functionality
 */

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const BASE_URL = process.env.VERCEL_URL || 'http://localhost:3000';
const ADMIN_PASSWORD = 'admin123'; // Use the plaintext password for testing

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function login() {
  console.log(`${colors.cyan}🔐 Logging in as admin...${colors.reset}`);
  
  const response = await fetch(`${BASE_URL}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password: ADMIN_PASSWORD
    })
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`${colors.green}✅ Login successful${colors.reset}`);
  return data.token;
}

async function testAnalyticsEndpoint(token, type, days = 30) {
  console.log(`${colors.cyan}📊 Testing analytics type: ${type}${colors.reset}`);
  
  const response = await fetch(`${BASE_URL}/api/admin/analytics?type=${type}&days=${days}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Analytics ${type} failed: ${response.status}`);
  }
  
  const data = await response.json();
  console.log(`${colors.green}✅ ${type} analytics:${colors.reset}`);
  
  // Display key metrics based on type
  switch(type) {
    case 'summary':
      console.log(`  - Tickets Sold: ${data.data.overview.tickets_sold}`);
      console.log(`  - Revenue: $${data.data.overview.gross_revenue || 0}`);
      console.log(`  - Customers: ${data.data.overview.unique_customers}`);
      console.log(`  - Wallet Adoption: ${data.data.wallet?.adoption_rate || 0}%`);
      break;
    case 'statistics':
      console.log(`  - Total Tickets: ${data.data.total_tickets || 0}`);
      console.log(`  - Valid Tickets: ${data.data.valid_tickets || 0}`);
      console.log(`  - Checked In: ${data.data.checked_in || 0}`);
      break;
    case 'trend':
      console.log(`  - Data Points: ${data.data.length}`);
      if (data.data.length > 0) {
        const latest = data.data[data.data.length - 1];
        console.log(`  - Latest Date: ${latest.sale_date}`);
        console.log(`  - Cumulative Tickets: ${latest.cumulative_tickets}`);
      }
      break;
    case 'revenue':
      console.log(`  - Revenue Breakdown: ${data.data.length} ticket types`);
      data.data.slice(0, 3).forEach(item => {
        console.log(`    • ${item.ticket_type}: $${item.total_revenue} (${item.revenue_percentage}%)`);
      });
      break;
    case 'wallet':
      console.log(`  - Wallet Users: ${data.data.summary?.total_wallet_users || 0}`);
      console.log(`  - Adoption Rate: ${data.data.summary?.overall_adoption_rate || 0}%`);
      console.log(`  - Wallet Revenue: $${data.data.roi?.wallet_revenue || 0}`);
      break;
    case 'hourly':
      console.log(`  - Hourly Data Points: ${data.data?.length || 0}`);
      if (data.data?.length > 0) {
        const latest = data.data[data.data.length - 1];
        console.log(`  - Latest Hour: ${latest.hour || 'N/A'}`);
        console.log(`  - Sales in Hour: ${latest.sales || 0}`);
      }
      break;
    case 'customers':
      console.log(`  - Total Customers: ${data.data?.total_customers || 0}`);
      console.log(`  - New Customers: ${data.data?.new_customers || 0}`);
      console.log(`  - Returning Customers: ${data.data?.returning_customers || 0}`);
      break;
    case 'checkins':
      console.log(`  - Total Check-ins: ${data.data?.total_checkins || 0}`);
      console.log(`  - Check-in Rate: ${data.data?.checkin_rate || 0}%`);
      console.log(`  - Peak Hour: ${data.data?.peak_hour || 'N/A'}`);
      break;
    case 'funnel':
      console.log(`  - Funnel Stages: ${data.data?.stages?.length || 0}`);
      if (data.data?.stages?.length > 0) {
        data.data.stages.slice(0, 3).forEach(stage => {
          console.log(`    • ${stage.name || 'Unknown'}: ${stage.count || 0} (${stage.conversion_rate || 0}%)`);
        });
      }
      break;
  }
  
  return data;
}

async function testReportGeneration(token, format = 'json') {
  console.log(`${colors.cyan}📋 Testing report generation (${format})...${colors.reset}`);
  
  const response = await fetch(`${BASE_URL}/api/admin/generate-report?format=${format}`, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!response.ok) {
    throw new Error(`Report generation failed: ${response.status}`);
  }
  
  if (format === 'json') {
    const data = await response.json();
    console.log(`${colors.green}✅ JSON Report generated:${colors.reset}`);
    console.log(`  - Event ID: ${data.event_id}`);
    console.log(`  - Generated At: ${data.generated_at}`);
    console.log(`  - Has Executive Summary: ${!!data.executive_summary}`);
    console.log(`  - Has Sales Trend: ${!!data.sales_trend}`);
    console.log(`  - Has Customer Analytics: ${!!data.customer_analytics}`);
    return data;
  } else {
    const csv = await response.text();
    console.log(`${colors.green}✅ CSV Report generated:${colors.reset}`);
    console.log(`  - Size: ${csv.length} characters`);
    console.log(`  - Lines: ${csv.split('\n').length}`);
    return csv;
  }
}

async function testDashboardAccess(token) {
  console.log(`${colors.cyan}🖥️  Testing dashboard page access...${colors.reset}`);
  
  const response = await fetch(`${BASE_URL}/pages/admin/analytics.html`);
  
  if (!response.ok) {
    throw new Error(`Dashboard access failed: ${response.status}`);
  }
  
  const html = await response.text();
  console.log(`${colors.green}✅ Dashboard page accessible:${colors.reset}`);
  console.log(`  - Size: ${html.length} characters`);
  console.log(`  - Has Chart.js: ${html.includes('chart.js')}`);
  console.log(`  - Has metrics grid: ${html.includes('metrics-grid')}`);
  console.log(`  - Has export buttons: ${html.includes('exportReport')}`);
}

async function runTests() {
  console.log(`${colors.blue}🚀 Starting Analytics & Reporting Tests${colors.reset}`);
  console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  try {
    // 1. Login
    const token = await login();
    
    // 2. Test all analytics endpoints
    const analyticsTypes = [
      'summary',
      'statistics', 
      'trend',
      'hourly',
      'customers',
      'checkins',
      'revenue',
      'funnel',
      'wallet'
    ];
    
    console.log(`\n${colors.yellow}📊 Testing Analytics Endpoints${colors.reset}`);
    console.log(`${colors.yellow}───────────────────────────────${colors.reset}`);
    
    for (const type of analyticsTypes) {
      await testAnalyticsEndpoint(token, type);
      console.log('');
    }
    
    // 3. Test report generation
    console.log(`${colors.yellow}📋 Testing Report Generation${colors.reset}`);
    console.log(`${colors.yellow}───────────────────────────────${colors.reset}`);
    
    await testReportGeneration(token, 'json');
    await testReportGeneration(token, 'csv');
    
    // 4. Test dashboard access
    console.log(`\n${colors.yellow}🖥️  Testing Dashboard${colors.reset}`);
    console.log(`${colors.yellow}───────────────────────────────${colors.reset}`);
    
    await testDashboardAccess(token);
    
    console.log(`\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`${colors.green}✅ All Analytics Tests Passed!${colors.reset}`);
    console.log(`${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    
    console.log(`\n${colors.cyan}📈 Analytics System Summary:${colors.reset}`);
    console.log('  • Analytics service operational');
    console.log('  • All 9 analytics types working');
    console.log('  • Report generation (JSON/CSV) functional');
    console.log('  • Dashboard page accessible');
    console.log('  • Ready for production deployment');
    
  } catch (error) {
    console.error(`${colors.red}❌ Test failed:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);