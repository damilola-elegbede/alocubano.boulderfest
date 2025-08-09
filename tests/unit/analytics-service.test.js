import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnalyticsService } from '../../api/lib/analytics-service.js';

describe('AnalyticsService', () => {
  let analyticsService;
  let mockDb;

  beforeEach(() => {
    // Mock database with the actual schema columns
    mockDb = {
      execute: vi.fn()
    };

    analyticsService = new AnalyticsService();
    analyticsService.db = mockDb;
  });

  describe('getEventStatistics', () => {
    it('should query using correct wallet columns (apple_pass_serial and google_pass_id)', async () => {
      // Mock response that matches the expected query output
      mockDb.execute.mockResolvedValue({
        rows: [{
          total_tickets: 100,
          valid_tickets: 95,
          checked_in: 60,
          unique_orders: 80,
          gross_revenue: 15000.00,
          refunded_amount: 250.00,
          avg_ticket_price: 157.89,
          vip_tickets: 10,
          weekend_passes: 50,
          workshop_tickets: 20,
          friday_tickets: 15,
          saturday_tickets: 30,
          sunday_tickets: 25,
          wallet_enabled_tickets: 40,
          apple_wallet_tickets: 25,
          google_wallet_tickets: 15,
          first_sale: '2024-01-01T10:00:00Z',
          last_sale: '2024-01-15T16:30:00Z',
          today_sales: 5,
          week_sales: 12,
          month_sales: 35
        }]
      });

      const result = await analyticsService.getEventStatistics();

      // Verify the method was called
      expect(mockDb.execute).toHaveBeenCalledWith({
        sql: expect.any(String),
        args: ['boulder-fest-2026']
      });

      // Ensure the query DOES contain the new wallet columns
      const calledSql = mockDb.execute.mock.calls[0][0].sql;
      expect(calledSql).toContain('(t.apple_pass_serial IS NOT NULL OR t.google_pass_id IS NOT NULL)');
      expect(calledSql).toContain('t.apple_pass_serial IS NOT NULL');
      expect(calledSql).toContain('t.google_pass_id IS NOT NULL');

      // Ensure the query does NOT contain the old, non-existent columns
      expect(calledSql).not.toContain('wallet_source');
      expect(calledSql).not.toContain('qr_access_method');

      expect(result.wallet_enabled_tickets).toBe(40);
      expect(result.apple_wallet_tickets).toBe(25);
      expect(result.google_wallet_tickets).toBe(15);
    });
  });

  describe('getWalletAnalytics', () => {
    it('should query using correct wallet detection logic', async () => {
      // Mock responses for all three queries in getWalletAnalytics
      mockDb.execute
        .mockResolvedValueOnce({
          rows: [{
            checkin_date: '2024-01-15',
            total_checkins: 50,
            wallet_checkins: 20,
            traditional_checkins: 30,
            apple_wallet_checkins: 12,
            google_wallet_checkins: 8,
            wallet_adoption_rate: 40.0
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            total_wallet_users: 40,
            total_checkins: 100,
            overall_adoption_rate: 40.0,
            unique_wallet_users: 35,
            apple_wallet_users: 22,
            google_wallet_users: 18,
            avg_wallet_ticket_price: 180.00,
            avg_traditional_ticket_price: 150.00
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            wallet_sales: 40,
            traditional_sales: 55,
            wallet_revenue: 7200.00,
            traditional_revenue: 8250.00,
            apple_wallet_sales: 22,
            google_wallet_sales: 18,
            apple_wallet_revenue: 3960.00,
            google_wallet_revenue: 3240.00
          }]
        });

      const result = await analyticsService.getWalletAnalytics();

      // Verify all three queries were called
      expect(mockDb.execute).toHaveBeenCalledTimes(3);

      // Check that all queries use the correct wallet detection logic
      const queries = mockDb.execute.mock.calls.map(call => call[0].sql);
      
      queries.forEach(sql => {
        // Verify wallet detection uses correct columns
        expect(sql).toContain('apple_pass_serial IS NOT NULL OR google_pass_id IS NOT NULL');
        expect(sql).toContain('apple_pass_serial IS NULL AND google_pass_id IS NULL');
        
        // Verify old columns are not used
        expect(sql).not.toContain('wallet_source');
        expect(sql).not.toContain('qr_access_method');
      });

      expect(result).toEqual({
        timeline: [{
          checkin_date: '2024-01-15',
          total_checkins: 50,
          wallet_checkins: 20,
          traditional_checkins: 30,
          apple_wallet_checkins: 12,
          google_wallet_checkins: 8,
          wallet_adoption_rate: 40.0
        }],
        summary: {
          total_wallet_users: 40,
          total_checkins: 100,
          overall_adoption_rate: 40.0,
          unique_wallet_users: 35,
          apple_wallet_users: 22,
          google_wallet_users: 18,
          avg_wallet_ticket_price: 180.00,
          avg_traditional_ticket_price: 150.00
        },
        roi: {
          wallet_sales: 40,
          traditional_sales: 55,
          wallet_revenue: 7200.00,
          traditional_revenue: 8250.00,
          apple_wallet_sales: 22,
          google_wallet_sales: 18,
          apple_wallet_revenue: 3960.00,
          google_wallet_revenue: 3240.00
        }
      });
    });
  });

  describe('generateExecutiveSummary', () => {
    it('should calculate wallet metrics correctly with actual schema columns', async () => {
      // Mock all the dependent method calls
      vi.spyOn(analyticsService, 'getEventStatistics').mockResolvedValue({
        valid_tickets: 100,
        gross_revenue: 15000.00,
        checked_in: 80,
        week_sales: 15,
        month_sales: 45,
        today_sales: 3
      });

      vi.spyOn(analyticsService, 'getSalesTrend').mockResolvedValue([
        { tickets_sold: 5 },
        { tickets_sold: 8 },
        { tickets_sold: 3 }
      ]);

      vi.spyOn(analyticsService, 'getCustomerAnalytics').mockResolvedValue({
        summary: {
          unique_customers: 75,
          repeat_customers: 25,
          single_ticket_customers: 50
        }
      });

      vi.spyOn(analyticsService, 'getRevenueBreakdown').mockResolvedValue([
        { ticket_type: 'weekend-pass', revenue_percentage: 45.0 }
      ]);

      vi.spyOn(analyticsService, 'getConversionFunnel').mockResolvedValue({
        completion_rate: 85
      });

      vi.spyOn(analyticsService, 'getWalletAnalytics').mockResolvedValue({
        summary: {
          overall_adoption_rate: 40.0,
          total_wallet_users: 40
        },
        roi: {
          wallet_revenue: 6000.00,
          traditional_revenue: 9000.00
        }
      });

      const result = await analyticsService.generateExecutiveSummary();

      expect(result.wallet).toEqual({
        adoption_rate: 40.0,
        total_users: 40,
        revenue_share: 40 // 6000 / (6000 + 9000) * 100
      });
    });
  });
});