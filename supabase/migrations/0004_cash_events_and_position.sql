-- 0004_cash_events_and_position.sql
-- Applied to production: 2026-05-15 (via Supabase MCP; this file mirrors it)
--
-- Cash control: a running cash-on-hand balance (till + safe combined).
--
-- cash_events holds MANUAL cash control events only:
--   kind 'count'      -> sets the cash-on-hand baseline (opening balance,
--                        a physical recount, or "zero out" = a count of 0).
--   kind 'withdrawal' -> cash taken out of the system (e.g. moved to the bank).
--
-- Cash sales (closings.cash_total) and cash expenses (expenses where
-- payment_method = 'cash') are NOT stored here -- they are derived. The
-- running balance is computed by v_cash_position.

CREATE TABLE IF NOT EXISTS cash_events (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  location_id uuid NOT NULL REFERENCES locations(id),
  event_date  date NOT NULL DEFAULT current_date,
  kind        text NOT NULL CHECK (kind IN ('count', 'withdrawal')),
  amount      numeric NOT NULL CHECK (amount >= 0),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_events_location_date
  ON cash_events (location_id, event_date);

ALTER TABLE cash_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_full_access_cash_events" ON cash_events
  FOR ALL USING (is_owner()) WITH CHECK (is_owner());

COMMENT ON TABLE cash_events IS 'Manual cash control events. kind=count sets the cash-on-hand baseline (opening balance / recount / zero-out); kind=withdrawal deducts cash taken out. Cash sales and cash expenses are derived, not stored here.';

-- ============================================================
-- v_cash_position — running cash-on-hand balance per location
-- ============================================================
CREATE OR REPLACE VIEW v_cash_position AS
WITH anchor AS (
  -- The most recent 'count' per location is the baseline. Everything dated
  -- after it accrues; everything on/before it is considered absorbed by it.
  SELECT DISTINCT ON (location_id)
    location_id,
    event_date AS anchor_date,
    amount     AS anchor_amount
  FROM cash_events
  WHERE kind = 'count'
  ORDER BY location_id, event_date DESC, created_at DESC
)
SELECT
  l.id                    AS location_id,
  l.name                  AS location_name,
  a.anchor_date,
  a.anchor_amount,
  (a.anchor_date IS NULL) AS needs_opening_count,
  COALESCE(a.anchor_amount, 0)
    + COALESCE((
        SELECT SUM(c.cash_total) FROM closings c
        WHERE c.location_id = l.id
          AND c.status IN ('confirmed', 'pending_review')
          AND a.anchor_date IS NOT NULL
          AND c.closing_date > a.anchor_date
      ), 0)
    - COALESCE((
        SELECT SUM(e.total) FROM expenses e
        WHERE e.location_id = l.id
          AND e.payment_method = 'cash'
          AND e.status IN ('confirmed', 'pending_review')
          AND a.anchor_date IS NOT NULL
          AND e.expense_date > a.anchor_date
      ), 0)
    - COALESCE((
        SELECT SUM(ce.amount) FROM cash_events ce
        WHERE ce.location_id = l.id
          AND ce.kind = 'withdrawal'
          AND a.anchor_date IS NOT NULL
          AND ce.event_date > a.anchor_date
      ), 0)
                          AS cash_on_hand,
  COALESCE((
    SELECT SUM(c.cash_total) FROM closings c
    WHERE c.location_id = l.id
      AND c.status IN ('confirmed', 'pending_review')
      AND c.closing_date = (now() AT TIME ZONE l.timezone)::date
  ), 0)                   AS cash_in_today,
  COALESCE((
    SELECT SUM(e.total) FROM expenses e
    WHERE e.location_id = l.id
      AND e.payment_method = 'cash'
      AND e.status IN ('confirmed', 'pending_review')
      AND e.expense_date = (now() AT TIME ZONE l.timezone)::date
  ), 0)                   AS cash_out_today,
  COALESCE((
    SELECT SUM(ce.amount) FROM cash_events ce
    WHERE ce.location_id = l.id
      AND ce.kind = 'withdrawal'
      AND ce.event_date = (now() AT TIME ZONE l.timezone)::date
  ), 0)                   AS cash_withdrawn_today
FROM locations l
LEFT JOIN anchor a ON a.location_id = l.id
WHERE l.is_active = true;

COMMENT ON VIEW v_cash_position IS 'Running cash-on-hand per location: latest count + cash sales - cash expenses - withdrawals dated after that count. Plus today''s cash in/out/withdrawn.';

-- Opening cash balance (owner-supplied 2026-05-15). Idempotent guard so this
-- file can be re-run without inserting a duplicate opening count.
INSERT INTO cash_events (location_id, event_date, kind, amount, notes)
SELECT l.id, (now() AT TIME ZONE l.timezone)::date, 'count', 165.50,
       'Opening cash balance — set by owner (till + safe combined)'
FROM locations l
WHERE l.slug = 'qave_main'
  AND NOT EXISTS (SELECT 1 FROM cash_events ce WHERE ce.location_id = l.id);
