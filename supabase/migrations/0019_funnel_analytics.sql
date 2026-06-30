-- ============================================================
-- Migration 0019: 漏斗分析 Views（接本專案實際 schema）
-- 提供：各垂直市場轉換率、階段分佈、MRR 潛力、資源優先度、本週行動清單
--
-- 注意：本專案沒有 lead_scores 表，也沒有 brands.stage / brands.phone / brands.email。
-- 因此改以實際資料來源推導：
--   ‧ 漏斗階段  ← opportunities.stage（英文 → 中文 6 階）；無商機者視為「新名單」
--   ‧ 熱度/分級 ← brands.engagement_score（0–100）分 hot/warm/cool/cold
--   ‧ MRR 估值  ← opportunities.est_annual_value / 12（取該品牌最大商機）
--   ‧ 電話      ← stores.phone
--   ‧ Email     ← contacts.email 或 brand_channels(channel='EM')
--   ‧ 地址      ← stores.address
--   ‧ 最後聯繫  ← brands.last_contacted_at（由外聯引擎更新，無則 created_at）
-- ============================================================

-- ── 0. 品牌漏斗基底 View（其餘 4 個 View 共用）────────────────
CREATE OR REPLACE VIEW brand_funnel_base AS
WITH stage_map AS (
  SELECT * FROM (VALUES
    ('new',         '新名單', 1),
    ('contacted',   '已聯繫', 2),
    ('sampling',    '打樣中', 3),
    ('quoting',     '報價中', 4),
    ('negotiating', '議約中', 5),
    ('won',         '成交',   6)
  ) AS t(en, zh, rk)
),
-- 每個品牌取「最進階」的未流失商機階段，並估算月 MRR
brand_opp AS (
  SELECT
    o.brand_id,
    MAX(sm.rk)                              AS max_rk,
    MAX(o.est_annual_value)::numeric        AS max_annual
  FROM opportunities o
  JOIN stage_map sm ON sm.en = o.stage
  WHERE o.stage <> 'lost'
  GROUP BY o.brand_id
),
brand_phone AS (
  SELECT brand_id, MIN(NULLIF(btrim(phone), '')) AS phone
  FROM stores
  WHERE phone IS NOT NULL AND btrim(phone) <> ''
  GROUP BY brand_id
),
brand_addr AS (
  SELECT DISTINCT ON (brand_id) brand_id, address
  FROM stores
  WHERE address IS NOT NULL AND btrim(address) <> ''
  ORDER BY brand_id, created_at
),
brand_email AS (
  SELECT DISTINCT ON (brand_id) brand_id, email
  FROM (
    SELECT brand_id, NULLIF(btrim(email), '') AS email
      FROM contacts
     WHERE email IS NOT NULL AND btrim(email) <> ''
    UNION ALL
    SELECT brand_id, NULLIF(btrim(value), '') AS email
      FROM brand_channels
     WHERE channel = 'EM' AND value IS NOT NULL AND btrim(value) <> ''
  ) e
  WHERE email IS NOT NULL
  ORDER BY brand_id
)
SELECT
  b.id,
  b.name,
  b.industry,
  COALESCE(sm2.zh, '新名單')                AS stage,
  COALESCE(bo.max_rk, 1)                     AS stage_no,
  COALESCE(b.engagement_score, 0)            AS total_score,
  CASE
    WHEN COALESCE(b.engagement_score, 0) >= 50 THEN 'hot'
    WHEN COALESCE(b.engagement_score, 0) >= 25 THEN 'warm'
    WHEN COALESCE(b.engagement_score, 0) >= 10 THEN 'cool'
    ELSE 'cold'
  END                                        AS grade,
  ROUND(COALESCE(bo.max_annual, 0) / 12.0)::int AS mrr_estimate_max,
  bp.phone,
  be.email,
  ba.address,
  b.created_at,
  EXTRACT(DAY FROM NOW() -
    COALESCE(b.last_contacted_at, b.created_at)
  )::int                                     AS days_since_contact
FROM brands b
LEFT JOIN brand_opp   bo  ON bo.brand_id = b.id
LEFT JOIN stage_map   sm2 ON sm2.rk      = bo.max_rk
LEFT JOIN brand_phone bp  ON bp.brand_id = b.id
LEFT JOIN brand_email be  ON be.brand_id = b.id
LEFT JOIN brand_addr  ba  ON ba.brand_id = b.id
WHERE b.industry IS NOT NULL;

-- ── 1. 各垂直市場 × 各階段 計數 ──────────────────────────────
CREATE OR REPLACE VIEW funnel_by_industry AS
SELECT
  industry,
  stage,
  stage_no,
  COUNT(*)                              AS count,
  AVG(total_score)::NUMERIC(5,1)        AS avg_score,
  SUM(mrr_estimate_max)                 AS mrr_potential,
  COUNT(*) FILTER (WHERE phone IS NOT NULL) AS has_phone,
  COUNT(*) FILTER (WHERE email IS NOT NULL) AS has_email
FROM brand_funnel_base
GROUP BY industry, stage, stage_no
ORDER BY industry, stage_no;

-- ── 2. 各垂直市場轉換率摘要 ───────────────────────────────────
CREATE OR REPLACE VIEW industry_conversion AS
SELECT
  industry,
  COUNT(*)                                                          AS total,
  COUNT(*) FILTER (WHERE stage <> '新名單')                          AS contacted,
  COUNT(*) FILTER (WHERE stage IN ('打樣中','報價中','議約中','成交')) AS in_pipeline,
  COUNT(*) FILTER (WHERE stage = '成交')                            AS closed,

  -- 各轉換率（%）
  ROUND(
    COUNT(*) FILTER (WHERE stage <> '新名單') * 100.0 / NULLIF(COUNT(*), 0), 1
  )                                                                 AS contact_rate,
  ROUND(
    COUNT(*) FILTER (WHERE stage = '成交') * 100.0 / NULLIF(COUNT(*), 0), 1
  )                                                                 AS close_rate,
  ROUND(
    COUNT(*) FILTER (WHERE stage = '成交') * 100.0
      / NULLIF(COUNT(*) FILTER (WHERE stage <> '新名單'), 0), 1
  )                                                                 AS close_from_contact_rate,

  -- MRR 潛力
  SUM(mrr_estimate_max)                                            AS total_mrr_potential,
  AVG(mrr_estimate_max)::INTEGER                                   AS avg_mrr_per_lead,
  SUM(mrr_estimate_max) FILTER (WHERE stage = '成交')              AS realized_mrr,

  -- 平均評分
  AVG(total_score)::NUMERIC(5,1)                                   AS avg_score,
  AVG(total_score) FILTER (
    WHERE stage IN ('打樣中','報價中','議約中','成交')
  )::NUMERIC(5,1)                                                  AS pipeline_avg_score,

  -- 電話覆蓋度
  ROUND(
    COUNT(*) FILTER (WHERE phone IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0), 0
  )                                                                 AS phone_coverage_pct,

  -- 資源優先度分數 = close_rate × 2 + avg_mrr_per_lead / 1000 + phone_coverage × 0.3
  ROUND((
    COALESCE(COUNT(*) FILTER (WHERE stage = '成交') * 100.0
      / NULLIF(COUNT(*), 0), 0) * 2
    + COALESCE(AVG(mrr_estimate_max) / 1000.0, 0)
    + COALESCE(COUNT(*) FILTER (WHERE phone IS NOT NULL)
        * 100.0 / NULLIF(COUNT(*), 0), 0) * 0.3
  ), 1)                                                             AS priority_score
FROM brand_funnel_base
GROUP BY industry
ORDER BY priority_score DESC;

-- ── 3. 階段停留分析（哪個階段卡最久）─────────────────────────
CREATE OR REPLACE VIEW stage_bottleneck AS
SELECT
  industry,
  stage,
  COUNT(*)                       AS count,
  AVG(days_since_contact)::INTEGER AS avg_days_in_stage,
  ROUND(
    COUNT(*) FILTER (WHERE grade IN ('hot','warm')) * 100.0
      / NULLIF(COUNT(*), 0), 0
  )                              AS hot_warm_pct
FROM brand_funnel_base
WHERE stage NOT IN ('新名單','成交')
GROUP BY industry, stage
ORDER BY industry, avg_days_in_stage DESC;

-- ── 4. 本週行動建議 View（Hot/Warm + 有聯絡方式 + 最久未聯繫）──
CREATE OR REPLACE VIEW weekly_action_list AS
SELECT
  id,
  name,
  industry,
  stage,
  phone,
  email,
  address,
  total_score,
  grade,
  mrr_estimate_max,
  days_since_contact
FROM brand_funnel_base
WHERE grade IN ('hot','warm')
  AND stage <> '成交'
  AND (phone IS NOT NULL OR email IS NOT NULL)
ORDER BY
  CASE grade WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 ELSE 3 END,
  total_score DESC,
  days_since_contact DESC
LIMIT 20;
