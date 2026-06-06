-- 0003_dashboard_views_and_cash_float.sql
-- Applied to production: 2026-05-15
--
-- Changes:
--   1. Cash float: make cash_float_start/end nullable; rewrite over_short
--      as NULL-safe (returns NULL when either float is missing instead of
--      computing nonsense from default 0s).
--   2. Three dashboard views: v_sidebar_badges, v_dashboard_kpis,
--      v_daily_flow_30d, v_expense_breakdown_mtd. Single-query reads for
--      the owner dashboard.

-- ============================================================
-- 1. Cash float — nullable + NULL-safe generated column
-- ============================================================
ALTER TABLE closings DROP COLUMN IF EXISTS over_short;
ALTER TABLE closings ALTER COLUMN cash_float_start DROP NOT NULL;
ALTER TABLE closings ALTER COLUMN cash_float_end   DROP NOT NULL;
ALTER TABLE closings ALTER COLUMN cash_float_start DROP DEFAULT;
ALTER TABLE closings ALTER COLUMN cash_float_end   DROP DEFAULT;
ALTER TABLE closings ADD COLUMN over_short numeric GENERATED ALWAYS AS (
  CASE
    WHEN cash_float_start IS NULL OR cash_float_end IS NULL THEN NULL
    ELSE (cash_float_end - cash_float_start) - cash_total
  END
) STORED;

COMMENT ON COLUMN closings.cash_float_start IS 'Cash in drawer at shift start. NULL = not captured by barista.';
COMMENT ON COLUMN closings.cash_float_end   IS 'Cash in drawer at shift end. NULL = not captured by barista.';
COMMENT ON COLUMN closings.over_short       IS 'Generated: NULL if either float is missing. Otherwise (end - start) - cash_total. Negative = short, positive = over.';

-- ============================================================
-- 2. v_sidebar_badges — counts for owner sidebar
-- ============================================================
CREATE OR REPLACE VIEW v_sidebar_badges AS
SELECT
  (SELECT COUNT(*) FROM closings WHERE status IN ('pending_review','flagged'))
  + (SELECT COUNT(*) FROM expenses WHERE status IN ('pending_review','flagged'))
    AS pending_count,
  (SELECT COUNT(*) FROM expenses WHERE category_id IS NULL)
    AS uncategorized_count,
  (SELECT COUNT(*) FROM liabilities WHERE status = 'open')
    AS open_liabilities_count,
  (SELECT COUNT(*) FROM closings
    WHERE (cash_float_start IS NULL OR (cash_float_start = 0 AND cash_float_end = 0))
      AND closing_date >= CURRENT_DATE - INTERVAL '30 days')
    AS missing_float_count,
  (SELECT COUNT(*) FROM suppliers WHERE is_active = true AND (trn IS NULL OR trn = ''))
    AS missing_trn_count;

COMMENT ON VIEW v_sidebar_badges IS 'Real-time counts for owner sidebar badges. Single row, cheap to query, no params.';

-- ============================================================
-- 3. v_dashboard_kpis — all hero/stat numbers per location, tz-aware
-- ============================================================
CREATE OR REPLACE VIEW v_dashboard_kpis AS
WITH params AS (
  SELECT
    l.id                                                                  AS location_id,
    l.name                                                                AS location_name,
    l.timezone,
    l.vat_rate,
    (now() AT TIME ZONE l.timezone)::date                                 AS today_local,
    date_trunc('month', (now() AT TIME ZONE l.timezone))::date            AS month_start,
    (date_trunc('month', (now() AT TIME ZONE l.timezone))
      + INTERVAL '1 month' - INTERVAL '1 day')::date                      AS month_end
  FROM locations l
  WHERE l.is_active = true
),
sales_mtd AS (
  SELECT p.location_id,
    COUNT(DISTINCT c.closing_date)            AS days_closed,
    COALESCE(SUM(c.grand_total), 0)::numeric  AS revenue,
    COALESCE(SUM(c.cash_total),  0)::numeric  AS cash,
    COALESCE(SUM(c.card_total),  0)::numeric  AS card,
    COALESCE(SUM(c.online_total),0)::numeric  AS online
  FROM params p
  LEFT JOIN closings c
    ON c.location_id = p.location_id
   AND c.status = 'confirmed'
   AND c.closing_date BETWEEN p.month_start AND p.today_local
  GROUP BY p.location_id
),
expenses_mtd AS (
  SELECT p.location_id,
    COALESCE(SUM(e.total),      0)::numeric AS variable_total,
    COALESCE(SUM(e.vat_amount), 0)::numeric AS vat_paid
  FROM params p
  LEFT JOIN expenses e
    ON e.location_id = p.location_id
   AND e.status = 'confirmed'
   AND e.expense_date BETWEEN p.month_start AND p.today_local
  GROUP BY p.location_id
),
fixed AS (
  SELECT location_id,
    SUM(CASE
      WHEN frequency = 'monthly'   THEN amount
      WHEN frequency = 'quarterly' THEN amount / 3.0
      WHEN frequency = 'annual'    THEN amount / 12.0
      ELSE 0
    END)::numeric AS monthly_burden
  FROM fixed_costs
  WHERE is_active = true
  GROUP BY location_id
),
last7 AS (
  SELECT p.location_id,
    (SELECT AVG(grand_total)::numeric
      FROM (SELECT grand_total FROM closings
            WHERE location_id = p.location_id AND status = 'confirmed'
            ORDER BY closing_date DESC LIMIT 7) recent) AS avg_revenue,
    (SELECT grand_total::numeric FROM closings
      WHERE location_id = p.location_id AND status = 'confirmed'
      ORDER BY closing_date DESC LIMIT 1)               AS latest_revenue
  FROM params p
)
SELECT
  p.location_id, p.location_name, p.timezone, p.today_local,
  p.month_start, p.month_end,
  EXTRACT(DAY FROM p.month_end)::int                            AS days_in_month,
  EXTRACT(DAY FROM p.today_local)::int                          AS days_elapsed,
  COALESCE(s.days_closed, 0)::int                               AS days_closed_mtd,
  COALESCE(s.revenue, 0)                                        AS revenue_mtd,
  COALESCE(s.cash, 0)                                           AS cash_mtd,
  COALESCE(s.card, 0)                                           AS card_mtd,
  COALESCE(s.online, 0)                                         AS online_mtd,
  COALESCE(e.variable_total, 0)                                 AS variable_expenses_mtd,
  COALESCE(e.vat_paid, 0)                                       AS vat_paid_mtd,
  ROUND(COALESCE(s.revenue, 0) * p.vat_rate / (1 + p.vat_rate), 2)
                                                                AS vat_collected_mtd,
  ROUND(COALESCE(s.revenue, 0) * p.vat_rate / (1 + p.vat_rate)
        - COALESCE(e.vat_paid, 0), 2)                           AS vat_net_mtd,
  COALESCE(f.monthly_burden, 0)                                 AS fixed_monthly,
  ROUND(COALESCE(l.avg_revenue, 0), 2)                          AS avg_revenue_7d,
  COALESCE(l.latest_revenue, 0)                                 AS latest_day_revenue,
  CASE WHEN COALESCE(l.avg_revenue, 0) > 0
    THEN ROUND(((l.latest_revenue - l.avg_revenue) / l.avg_revenue * 100), 1)
    ELSE NULL
  END                                                           AS trend_vs_avg_pct,
  CASE WHEN COALESCE(s.days_closed, 0) > 0
    THEN ROUND((s.revenue / s.days_closed) * EXTRACT(DAY FROM p.month_end), 2)
    ELSE 0
  END                                                           AS projected_revenue,
  CASE WHEN COALESCE(s.days_closed, 0) > 0
    THEN ROUND((COALESCE(e.variable_total, 0) / s.days_closed)
               * EXTRACT(DAY FROM p.month_end), 2)
    ELSE 0
  END                                                           AS projected_variable,
  CASE WHEN COALESCE(s.days_closed, 0) > 0
    THEN ROUND(
      (s.revenue / s.days_closed * EXTRACT(DAY FROM p.month_end))
      - (COALESCE(e.variable_total, 0) / s.days_closed * EXTRACT(DAY FROM p.month_end))
      - COALESCE(f.monthly_burden, 0)
    , 2)
    ELSE 0
  END                                                           AS projected_net
FROM params p
LEFT JOIN sales_mtd    s ON s.location_id = p.location_id
LEFT JOIN expenses_mtd e ON e.location_id = p.location_id
LEFT JOIN fixed        f ON f.location_id = p.location_id
LEFT JOIN last7        l ON l.location_id = p.location_id;

COMMENT ON VIEW v_dashboard_kpis IS 'Headline KPIs per location, tz-aware. Single read for entire dashboard hero + stats.';

-- ============================================================
-- 4. v_daily_flow_30d — per-day revenue + expenses for the chart
-- ============================================================
CREATE OR REPLACE VIEW v_daily_flow_30d AS
WITH params AS (
  SELECT id AS location_id, timezone,
    (now() AT TIME ZONE timezone)::date AS today_local
  FROM locations WHERE is_active = true
),
days AS (
  SELECT p.location_id,
    generate_series(p.today_local - INTERVAL '29 days', p.today_local, '1 day')::date AS d
  FROM params p
)
SELECT
  d.location_id,
  d.d                              AS date,
  EXTRACT(DOW FROM d.d)::int       AS day_of_week,
  EXTRACT(DOW FROM d.d) IN (5, 6)  AS is_weekend,
  COALESCE(SUM(c.grand_total), 0)::numeric AS revenue,
  COALESCE(SUM(c.cash_total),  0)::numeric AS cash,
  COALESCE(SUM(c.card_total),  0)::numeric AS card,
  COALESCE(SUM(c.online_total),0)::numeric AS online,
  COALESCE((SELECT SUM(e.total) FROM expenses e
    WHERE e.location_id = d.location_id
      AND e.status = 'confirmed'
      AND e.expense_date = d.d), 0)::numeric AS expenses
FROM days d
LEFT JOIN closings c
  ON c.location_id = d.location_id
 AND c.closing_date = d.d
 AND c.status = 'confirmed'
GROUP BY d.location_id, d.d
ORDER BY d.location_id, d.d;

COMMENT ON VIEW v_daily_flow_30d IS 'Daily revenue + expenses, last 30 days, with weekend flag (Fri/Sat in UAE).';

-- ============================================================
-- 5. v_expense_breakdown_mtd — supplier and category splits
-- ============================================================
CREATE OR REPLACE VIEW v_expense_breakdown_mtd AS
WITH params AS (
  SELECT id AS location_id, timezone,
    date_trunc('month', (now() AT TIME ZONE timezone))::date AS month_start,
    (now() AT TIME ZONE timezone)::date                      AS today_local
  FROM locations WHERE is_active = true
)
SELECT
  p.location_id,
  'supplier'                       AS breakdown_kind,
  s.id                             AS bucket_id,
  s.name                           AS bucket_name,
  COUNT(e.id)::int                 AS expense_count,
  COALESCE(SUM(e.total),      0)::numeric AS total_amount,
  COALESCE(SUM(e.vat_amount), 0)::numeric AS vat_amount
FROM params p
JOIN expenses e
  ON e.location_id = p.location_id
 AND e.status = 'confirmed'
 AND e.expense_date BETWEEN p.month_start AND p.today_local
JOIN suppliers s ON e.supplier_id = s.id
GROUP BY p.location_id, s.id, s.name

UNION ALL

SELECT
  p.location_id,
  'category',
  c.id,
  c.name,
  COUNT(e.id)::int,
  COALESCE(SUM(e.total),      0)::numeric,
  COALESCE(SUM(e.vat_amount), 0)::numeric
FROM params p
JOIN expenses e
  ON e.location_id = p.location_id
 AND e.status = 'confirmed'
 AND e.expense_date BETWEEN p.month_start AND p.today_local
JOIN categories c ON e.category_id = c.id
GROUP BY p.location_id, c.id, c.name

ORDER BY breakdown_kind, total_amount DESC;

COMMENT ON VIEW v_expense_breakdown_mtd IS 'MTD expense splits by supplier and category. App filters by breakdown_kind.';

