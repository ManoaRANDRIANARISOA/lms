-- Migration 021: Repair student_fees from existing payments
-- Ensures all past payments are reflected in fee records (uniforms, bus, canteen, enrollment)
-- This is a data repair — after this migration, all future payments are handled in payment.repository.ts

-- ============================================
-- 1. UNIFORMS — sync existing uniform payments to fee records
-- ============================================

-- Tablier / Blouse → uniform_apron_purchased
UPDATE student_fees SET uniform_apron_purchased = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'uniform'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND (LOWER(sp.description) LIKE '%tablier%' OR LOWER(sp.description) LIKE '%blouse%')
    AND sf.uniform_apron_purchased = 0
);

-- T-shirt / Polo / Maillot → uniform_tshirt_purchased
UPDATE student_fees SET uniform_tshirt_purchased = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'uniform'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND (LOWER(sp.description) LIKE '%t-shirt%' OR LOWER(sp.description) LIKE '%tshirt%' OR LOWER(sp.description) LIKE '%polo%' OR LOWER(sp.description) LIKE '%maillot%')
    AND sf.uniform_tshirt_purchased = 0
);

-- Short / Pantalon / Bermuda → uniform_shorts_purchased
UPDATE student_fees SET uniform_shorts_purchased = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'uniform'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND (LOWER(sp.description) LIKE '%short%' OR LOWER(sp.description) LIKE '%pantalon%' OR LOWER(sp.description) LIKE '%bermuda%')
    AND sf.uniform_shorts_purchased = 0
);

-- Badge / Écusson → uniform_badge_purchased
UPDATE student_fees SET uniform_badge_purchased = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'uniform'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND (LOWER(sp.description) LIKE '%badge%' OR LOWER(sp.description) LIKE '%écusson%' OR LOWER(sp.description) LIKE '%ecusson%')
    AND sf.uniform_badge_purchased = 0
);

-- ============================================
-- 2. BUS — ensure bus_subscribed for students with bus payments
-- ============================================
UPDATE student_fees SET bus_subscribed = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'bus'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND sf.bus_subscribed = 0
);

-- ============================================
-- 3. CANTEEN — ensure canteen_subscribed for students with canteen payments
-- ============================================
UPDATE student_fees SET canteen_subscribed = 1, updated_at = CURRENT_TIMESTAMP, sync_status = 'pending'
WHERE id IN (
  SELECT DISTINCT sf.id
  FROM student_fees sf
  JOIN student_payments sp ON sp.student_id = sf.student_id
  WHERE sp.payment_type = 'canteen'
    AND sp.deleted = 0
    AND sf.deleted = 0
    AND sf.canteen_subscribed = 0
);

-- ============================================
-- 4. Done — bus and canteen are already synced by payment.repository.ts
--    The uniform sync above covers all remaining cases.
-- ============================================
