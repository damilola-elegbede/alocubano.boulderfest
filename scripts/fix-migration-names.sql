-- Fix Migration Names in Database
-- Updates the migrations table to match the renamed files

-- First, let's see what we have
SELECT 'Current migrations in database:' as info;
SELECT filename FROM migrations ORDER BY id;

-- Update the filenames to match the new naming scheme
-- 002b_qr_code_system.sql -> 003_qr_code_system.sql
UPDATE migrations SET filename = '003_qr_code_system.sql' WHERE filename = '002b_qr_code_system.sql';

-- 003_admin_checkin.sql -> 004_admin_checkin.sql
UPDATE migrations SET filename = '004_admin_checkin.sql' WHERE filename = '003_admin_checkin.sql';

-- 004_payment_events.sql -> 005_payment_events.sql
UPDATE migrations SET filename = '005_payment_events.sql' WHERE filename = '004_payment_events.sql';

-- 005_final_indexes.sql -> 006_final_indexes.sql
UPDATE migrations SET filename = '006_final_indexes.sql' WHERE filename = '005_final_indexes.sql';

-- 006_token_system.sql -> 007_token_system.sql
UPDATE migrations SET filename = '007_token_system.sql' WHERE filename = '006_token_system.sql';

-- 007_wallet_integration.sql -> 008_wallet_integration.sql
UPDATE migrations SET filename = '008_wallet_integration.sql' WHERE filename = '007_wallet_integration.sql';

-- 008_admin_rate_limiting.sql -> 009_admin_rate_limiting.sql
UPDATE migrations SET filename = '009_admin_rate_limiting.sql' WHERE filename = '008_admin_rate_limiting.sql';

-- 009_add_wallet_tracking.sql -> 010_add_wallet_tracking.sql
UPDATE migrations SET filename = '010_add_wallet_tracking.sql' WHERE filename = '009_add_wallet_tracking.sql';

-- 010_admin_mfa_system.sql -> 011_admin_mfa_system.sql
UPDATE migrations SET filename = '011_admin_mfa_system.sql' WHERE filename = '010_admin_mfa_system.sql';

-- 011_email_subscriber_system.sql -> 012_email_subscriber_system.sql
UPDATE migrations SET filename = '012_email_subscriber_system.sql' WHERE filename = '011_email_subscriber_system.sql';

-- 012_fix_column_mismatches.sql -> 013_fix_column_mismatches.sql
UPDATE migrations SET filename = '013_fix_column_mismatches.sql' WHERE filename = '012_fix_column_mismatches.sql';

-- 013_add_bounce_count_column.sql -> 014_add_bounce_count_column.sql
UPDATE migrations SET filename = '014_add_bounce_count_column.sql' WHERE filename = '013_add_bounce_count_column.sql';

-- 014_add_registration_tracking.sql -> 015_add_registration_tracking.sql
UPDATE migrations SET filename = '015_add_registration_tracking.sql' WHERE filename = '014_add_registration_tracking.sql';

-- 015_create_registration_reminders.sql -> 016_create_registration_reminders.sql
UPDATE migrations SET filename = '016_create_registration_reminders.sql' WHERE filename = '015_create_registration_reminders.sql';

-- 016_create_registration_emails.sql -> 017_create_registration_emails.sql
UPDATE migrations SET filename = '017_create_registration_emails.sql' WHERE filename = '016_create_registration_emails.sql';

-- 017_add_transaction_registration.sql -> 018_add_transaction_registration.sql
UPDATE migrations SET filename = '018_add_transaction_registration.sql' WHERE filename = '017_add_transaction_registration.sql';

-- 018_tickets_table.sql -> 019_tickets_table.sql
UPDATE migrations SET filename = '019_tickets_table.sql' WHERE filename = '018_tickets_table.sql';

-- 019_transaction_items.sql -> 020_transaction_items.sql
UPDATE migrations SET filename = '020_transaction_items.sql' WHERE filename = '019_transaction_items.sql';

-- 020_fix_registrations_schema.sql -> 021_fix_registrations_schema.sql
UPDATE migrations SET filename = '021_fix_registrations_schema.sql' WHERE filename = '020_fix_registrations_schema.sql';

-- Verify the updates
SELECT 'Updated migrations in database:' as info;
SELECT filename FROM migrations ORDER BY id;