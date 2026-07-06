-- ============================================================
-- Migration 0035: 採集方法級效率記錄（自動成長基礎）
-- 每個「方法 × 產業 × 國家」累積：嘗試數 / 命中數(有補到管道) / 補到管道數 / 總耗時。
-- 引擎依此自動判斷「某產業某方法歷史命中率過低」→ 之後跳過，越跑越省。
-- ============================================================
CREATE TABLE IF NOT EXISTS collection_method_stats (
  method text NOT NULL,
  industry text NOT NULL DEFAULT '未分類',
  country text NOT NULL DEFAULT 'TW',
  attempts int NOT NULL DEFAULT 0,
  hits int NOT NULL DEFAULT 0,
  channels_found int NOT NULL DEFAULT 0,
  ms_total bigint NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (method, industry, country)
);
ALTER TABLE collection_method_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collection_method_stats_all ON collection_method_stats;
CREATE POLICY collection_method_stats_all ON collection_method_stats FOR ALL TO public USING (true) WITH CHECK (true);

-- 原子增量：一次 upsert 累加，避免讀改寫競態
CREATE OR REPLACE FUNCTION public.bump_method_stats(
  p_method text, p_industry text, p_country text,
  p_attempts int, p_hits int, p_channels int, p_ms bigint
) RETURNS void LANGUAGE sql SET search_path = public, pg_temp AS $$
  INSERT INTO collection_method_stats(method, industry, country, attempts, hits, channels_found, ms_total, updated_at)
  VALUES (p_method, coalesce(nullif(p_industry,''),'未分類'), coalesce(nullif(p_country,''),'TW'), p_attempts, p_hits, p_channels, p_ms, now())
  ON CONFLICT (method, industry, country) DO UPDATE SET
    attempts = collection_method_stats.attempts + excluded.attempts,
    hits = collection_method_stats.hits + excluded.hits,
    channels_found = collection_method_stats.channels_found + excluded.channels_found,
    ms_total = collection_method_stats.ms_total + excluded.ms_total,
    updated_at = now();
$$;
GRANT EXECUTE ON FUNCTION public.bump_method_stats(text,text,text,int,int,int,bigint) TO anon, authenticated, service_role;
