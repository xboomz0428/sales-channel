-- ============================================================
-- Migration 0022: 各產業「缺管道」彙整 View（比對中心優先度用）
-- 跨全部名單計算每個產業缺少多少聯絡管道，決定先採集哪個垂直市場。
-- MATERIALIZED CTE：EXISTS 只算一次（未 materialize 會被 count 與 gap_score 重算兩次）。
-- ============================================================
CREATE OR REPLACE VIEW industry_channel_gaps AS
WITH b AS MATERIALIZED (
  SELECT br.id, br.industry, COALESCE(br.country, 'TW') AS country,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='phone')
       OR EXISTS(SELECT 1 FROM stores s WHERE s.brand_id=br.id AND s.phone IS NOT NULL AND btrim(s.phone)<>'')) AS has_phone,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='email')
       OR EXISTS(SELECT 1 FROM contacts ct WHERE ct.brand_id=br.id AND ct.email IS NOT NULL AND btrim(ct.email)<>'')) AS has_email,
    EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel IN ('line','line_id')) AS has_line,
    EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='fb') AS has_fb,
    EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='ig') AS has_ig,
    (EXISTS(SELECT 1 FROM brand_channels c WHERE c.brand_id=br.id AND c.channel='website')
       OR EXISTS(SELECT 1 FROM stores s WHERE s.brand_id=br.id AND s.website IS NOT NULL AND btrim(s.website)<>'')) AS has_web
  FROM brands br WHERE br.industry IS NOT NULL
)
SELECT industry, country,
  count(*)::int AS total,
  count(*) FILTER (WHERE NOT has_phone)::int AS miss_phone,
  count(*) FILTER (WHERE NOT has_email)::int AS miss_email,
  count(*) FILTER (WHERE NOT has_line)::int  AS miss_line,
  count(*) FILTER (WHERE NOT has_fb)::int    AS miss_fb,
  count(*) FILTER (WHERE NOT has_ig)::int    AS miss_ig,
  count(*) FILTER (WHERE NOT has_web)::int   AS miss_web,
  (count(*) FILTER (WHERE NOT has_phone)*3 + count(*) FILTER (WHERE NOT has_email)*2
   + count(*) FILTER (WHERE NOT has_line)*2 + count(*) FILTER (WHERE NOT has_web))::int AS gap_score
FROM b GROUP BY industry, country;
