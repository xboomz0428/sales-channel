-- ============================================================
-- Migration 0023: brands_overview — 名單「統計層」(第一層數據表)
-- 預設先讀這份完整統計（跨全部名單），詳細資料再按 id/篩選按需載入。
-- 每個 country×industry：總數 + 各管道/工商覆蓋數 + 階段(status)彙整。
-- MATERIALIZED CTE 讓每筆的 EXISTS 只算一次。
-- ============================================================
CREATE OR REPLACE VIEW brands_overview AS
WITH b AS MATERIALIZED (
  SELECT br.id, br.industry, COALESCE(br.country, 'TW') AS country, COALESCE(br.status,'new') AS status,
    (br.tax_id IS NOT NULL) AS has_gov,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='phone')
       OR EXISTS(SELECT 1 FROM stores s WHERE s.brand_id=br.id AND s.phone IS NOT NULL AND btrim(s.phone)<>'')) AS has_phone,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='email')
       OR EXISTS(SELECT 1 FROM contacts ct WHERE ct.brand_id=br.id AND ct.email IS NOT NULL AND btrim(ct.email)<>'')) AS has_email,
    EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel IN ('line','line_id')) AS has_line,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='website')
       OR EXISTS(SELECT 1 FROM stores s WHERE s.brand_id=br.id AND s.website IS NOT NULL AND btrim(s.website)<>'')) AS has_web
  FROM brands br WHERE br.industry IS NOT NULL
)
SELECT industry, country,
  count(*)::int AS total,
  count(*) FILTER (WHERE has_phone)::int AS has_phone,
  count(*) FILTER (WHERE has_email)::int AS has_email,
  count(*) FILTER (WHERE has_line)::int  AS has_line,
  count(*) FILTER (WHERE has_web)::int   AS has_web,
  count(*) FILTER (WHERE has_gov)::int   AS has_gov,
  count(*) FILTER (WHERE status='won')::int AS won,
  count(*) FILTER (WHERE status NOT IN ('new','won','lost'))::int AS pipeline,
  count(*) FILTER (WHERE status='new')::int AS new_cnt
FROM b GROUP BY industry, country;
