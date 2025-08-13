#!/usr/bin/env node

/**
 * Simple test for analytics service without authentication
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { existsSync } from "fs";
import analyticsService from "../api/lib/analytics-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables with graceful fallback
const envPath = join(__dirname, "..", ".env.local");
if (existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  // Silently continue without .env.local - service may use defaults or .env
  dotenv.config();
}

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

async function runTests() {
  console.log(
    `${colors.blue}🚀 Testing Analytics Service Directly${colors.reset}`,
  );
  console.log(
    `${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}\n`,
  );

  try {
    // Test 1: Event Statistics
    console.log(`${colors.cyan}📊 Testing Event Statistics...${colors.reset}`);
    const stats = await analyticsService.getEventStatistics();
    console.log(`${colors.green}✅ Event Statistics:${colors.reset}`);
    console.log(`  - Total Tickets: ${stats.total_tickets || 0}`);
    console.log(`  - Valid Tickets: ${stats.valid_tickets || 0}`);
    console.log(`  - Revenue: $${stats.gross_revenue || 0}`);
    console.log("");

    // Test 2: Sales Trend
    console.log(`${colors.cyan}📈 Testing Sales Trend...${colors.reset}`);
    const trend = await analyticsService.getSalesTrend(7);
    console.log(`${colors.green}✅ Sales Trend (7 days):${colors.reset}`);
    console.log(`  - Data Points: ${trend.length}`);
    if (trend.length > 0) {
      console.log(`  - Latest: ${trend[trend.length - 1].sale_date}`);
    }
    console.log("");

    // Test 3: Customer Analytics
    console.log(
      `${colors.cyan}👥 Testing Customer Analytics...${colors.reset}`,
    );
    const customers = await analyticsService.getCustomerAnalytics();
    console.log(`${colors.green}✅ Customer Analytics:${colors.reset}`);
    console.log(
      `  - Unique Customers: ${customers.summary?.unique_customers || 0}`,
    );
    console.log(`  - Top Customers: ${customers.topCustomers?.length || 0}`);
    console.log("");

    // Test 4: Revenue Breakdown
    console.log(`${colors.cyan}💰 Testing Revenue Breakdown...${colors.reset}`);
    const revenue = await analyticsService.getRevenueBreakdown();
    console.log(`${colors.green}✅ Revenue Breakdown:${colors.reset}`);
    console.log(`  - Ticket Types: ${revenue.length}`);
    revenue.slice(0, 3).forEach((r) => {
      console.log(`    • ${r.ticket_type}: $${r.total_revenue || 0}`);
    });
    console.log("");

    // Test 5: Wallet Analytics
    console.log(`${colors.cyan}📱 Testing Wallet Analytics...${colors.reset}`);
    const wallet = await analyticsService.getWalletAnalytics();
    console.log(`${colors.green}✅ Wallet Analytics:${colors.reset}`);
    console.log(`  - Total Users: ${wallet.summary?.total_wallet_users || 0}`);
    console.log(
      `  - Adoption Rate: ${wallet.summary?.overall_adoption_rate || 0}%`,
    );
    console.log("");

    // Test 6: Executive Summary
    console.log(`${colors.cyan}📋 Testing Executive Summary...${colors.reset}`);
    const summary = await analyticsService.generateExecutiveSummary();
    console.log(`${colors.green}✅ Executive Summary:${colors.reset}`);
    console.log(`  - Tickets Sold: ${summary.overview?.tickets_sold || 0}`);
    console.log(`  - Revenue: $${summary.overview?.gross_revenue || 0}`);
    console.log(
      `  - Days Until Event: ${summary.overview?.days_until_event || 0}`,
    );
    console.log(`  - Recommendations: ${summary.recommendations?.length || 0}`);

    console.log(
      `\n${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );
    console.log(
      `${colors.green}✅ All Analytics Service Tests Passed!${colors.reset}`,
    );
    console.log(
      `${colors.green}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`,
    );
  } catch (error) {
    console.error(`${colors.red}❌ Test failed:${colors.reset}`, error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run tests
runTests().catch(console.error);
