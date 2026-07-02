-- ============================================================
-- Migration 0025: 讀取加速 — 統計層快取 + 排序索引
-- overview/gaps 每次要掃全部名單(約 2 秒)，改為 5 分鐘 TTL 的 DB 快取；
-- 清單層 country+created_at 排序補複合索引。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stats_cache (
  key text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.stats_cache ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY stats_cache_all ON public.stats_cache FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_brands_country_created ON public.brands (country, created_at DESC);
