-- Payment Feature Database Schema
-- Version: 1.0.0
-- Description: Initial payment system schema for A Lo Cubano Boulder Fest

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE payment_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'refunded',
  'partially_refunded',
  'cancelled'
);

CREATE TYPE payment_provider AS ENUM (
  'stripe',
  'paypal'
);

CREATE TYPE ticket_type AS ENUM (
  'full_festival',
  'day_pass',
  'workshop_only',
  'social_only',
  'vip'
);

CREATE TYPE refund_status AS ENUM (
  'pending',
  'processed',
  'failed'
);

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  stripe_customer_id VARCHAR(255) UNIQUE,
  paypal_customer_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- GDPR compliance fields
  consent_marketing BOOLEAN DEFAULT false,
  consent_date TIMESTAMP WITH TIME ZONE,
  data_retention_date TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_customers_email (email),
  INDEX idx_customers_stripe_id (stripe_customer_id),
  INDEX idx_customers_created_at (created_at)
);

-- Payment methods table (PCI compliant - no sensitive data stored)
CREATE TABLE IF NOT EXISTS payment_methods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  provider payment_provider NOT NULL,
  provider_payment_method_id VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'card', 'bank_account', 'paypal'
  last_four VARCHAR(4),
  brand VARCHAR(50),
  exp_month INTEGER CHECK (exp_month >= 1 AND exp_month <= 12),
  exp_year INTEGER CHECK (exp_year >= EXTRACT(YEAR FROM CURRENT_DATE)),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_payment_methods_customer (customer_id),
  INDEX idx_payment_methods_provider (provider, provider_payment_method_id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(20) UNIQUE NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id),
  status payment_status NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Event information
  event_id VARCHAR(100) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  event_date DATE NOT NULL,
  
  -- Metadata
  ip_address INET,
  user_agent TEXT,
  referrer TEXT,
  utm_source VARCHAR(100),
  utm_medium VARCHAR(100),
  utm_campaign VARCHAR(100),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_orders_order_number (order_number),
  INDEX idx_orders_customer (customer_id),
  INDEX idx_orders_status (status),
  INDEX idx_orders_created_at (created_at),
  INDEX idx_orders_event (event_id)
);

-- Order items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type ticket_type NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
  
  -- Ticket holder information
  attendee_first_name VARCHAR(100),
  attendee_last_name VARCHAR(100),
  attendee_email VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_order_items_order (order_id)
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id),
  payment_method_id UUID REFERENCES payment_methods(id),
  provider payment_provider NOT NULL,
  provider_payment_id VARCHAR(255) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  -- Provider-specific data (encrypted)
  provider_data JSONB,
  
  -- 3D Secure / SCA
  authentication_required BOOLEAN DEFAULT false,
  authentication_status VARCHAR(50),
  
  -- Metadata
  failure_code VARCHAR(100),
  failure_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_payments_order (order_id),
  INDEX idx_payments_provider (provider, provider_payment_id),
  INDEX idx_payments_status (status),
  INDEX idx_payments_created_at (created_at),
  
  -- Ensure unique payment per provider
  UNIQUE(provider, provider_payment_id)
);

-- Refunds table
CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES payments(id),
  provider payment_provider NOT NULL,
  provider_refund_id VARCHAR(255) NOT NULL,
  status refund_status NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  reason TEXT,
  metadata JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  INDEX idx_refunds_payment (payment_id),
  INDEX idx_refunds_provider (provider, provider_refund_id),
  INDEX idx_refunds_created_at (created_at),
  
  UNIQUE(provider, provider_refund_id)
);

-- Webhooks table for idempotency
CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider payment_provider NOT NULL,
  provider_event_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_webhook_events_provider (provider, provider_event_id),
  INDEX idx_webhook_events_processed (processed_at),
  
  -- Ensure idempotency
  UNIQUE(provider, provider_event_id)
);

-- Payment audit log
CREATE TABLE IF NOT EXISTS payment_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type VARCHAR(50) NOT NULL, -- 'order', 'payment', 'refund'
  entity_id UUID NOT NULL,
  action VARCHAR(50) NOT NULL,
  actor_type VARCHAR(50) NOT NULL, -- 'customer', 'admin', 'system'
  actor_id VARCHAR(255),
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_audit_log_entity (entity_type, entity_id),
  INDEX idx_audit_log_created_at (created_at)
);

-- Discount codes table
CREATE TABLE IF NOT EXISTS discount_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL CHECK (discount_value > 0),
  minimum_order_cents INTEGER,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  valid_until TIMESTAMP WITH TIME ZONE NOT NULL,
  event_ids TEXT[], -- Array of applicable event IDs
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_discount_codes_code (code),
  INDEX idx_discount_codes_validity (valid_from, valid_until),
  
  CHECK (valid_until > valid_from)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refunds_updated_at BEFORE UPDATE ON refunds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discount_codes_updated_at BEFORE UPDATE ON discount_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate order numbers
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS VARCHAR AS $$
DECLARE
    new_order_number VARCHAR;
    order_exists BOOLEAN;
BEGIN
    LOOP
        -- Generate order number: ALB-YYYYMMDD-XXXX
        new_order_number := 'ALB-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || 
                           LPAD(FLOOR(RANDOM() * 10000)::TEXT, 4, '0');
        
        -- Check if it already exists
        SELECT EXISTS(SELECT 1 FROM orders WHERE order_number = new_order_number) INTO order_exists;
        
        EXIT WHEN NOT order_exists;
    END LOOP;
    
    RETURN new_order_number;
END;
$$ LANGUAGE plpgsql;

-- Create views for reporting
CREATE OR REPLACE VIEW payment_summary AS
SELECT 
    DATE_TRUNC('day', p.created_at) as payment_date,
    p.provider,
    p.status,
    COUNT(*) as payment_count,
    SUM(p.amount_cents) / 100.0 as total_amount,
    p.currency
FROM payments p
GROUP BY DATE_TRUNC('day', p.created_at), p.provider, p.status, p.currency;

CREATE OR REPLACE VIEW order_summary AS
SELECT 
    DATE_TRUNC('day', o.created_at) as order_date,
    o.event_id,
    o.event_name,
    o.status,
    COUNT(*) as order_count,
    SUM(o.total_cents) / 100.0 as total_revenue,
    AVG(o.total_cents) / 100.0 as average_order_value,
    o.currency
FROM orders o
GROUP BY DATE_TRUNC('day', o.created_at), o.event_id, o.event_name, o.status, o.currency;

-- Indexes for performance
CREATE INDEX idx_payments_daily_summary ON payments(DATE_TRUNC('day', created_at), provider, status);
CREATE INDEX idx_orders_daily_summary ON orders(DATE_TRUNC('day', created_at), event_id, status);

-- Row-level security policies (to be enabled after setup)
-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;