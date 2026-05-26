-- Migration 011: Synchronize bus/canteen subscriptions with existing payments
-- Problem: student_payments with type='bus' or 'canteen' exist,
-- but student_fees.bus_subscribed / canteen_subscribed were not updated.
-- This migration reconciles the two sources of truth.

-- Step 1: Activate bus_subscribed for students who have bus payments
UPDATE student_fees
SET bus_subscribed = 1,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1,
    sync_status = 'pending'
WHERE bus_subscribed = 0
  AND EXISTS (
    SELECT 1 FROM student_payments sp
    WHERE sp.student_id = student_fees.student_id
      AND sp.payment_type = 'bus'
  );

-- Step 2: Activate canteen_subscribed for students who have canteen payments
UPDATE student_fees
SET canteen_subscribed = 1,
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1,
    sync_status = 'pending'
WHERE canteen_subscribed = 0
  AND EXISTS (
    SELECT 1 FROM student_payments sp
    WHERE sp.student_id = student_fees.student_id
      AND sp.payment_type = 'canteen'
  );

-- Step 3: Set a default bus_route for students with bus payments but no route
UPDATE student_fees
SET bus_route = COALESCE(bus_route, 'Zone non définie'),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1,
    sync_status = 'pending'
WHERE bus_subscribed = 1
  AND (bus_route IS NULL OR bus_route = '') ;

-- Step 4: Set default canteen days for students with canteen payments but no days configured
UPDATE student_fees
SET canteen_days_per_week = COALESCE(canteen_days_per_week, 5),
    canteen_days = COALESCE(canteen_days, '["Monday","Tuesday","Wednesday","Thursday","Friday"]'),
    updated_at = CURRENT_TIMESTAMP,
    version = version + 1,
    sync_status = 'pending'
WHERE canteen_subscribed = 1
  AND (canteen_days_per_week IS NULL OR canteen_days_per_week = 0)
  AND (canteen_days IS NULL OR canteen_days = '' OR canteen_days = '[]') ;