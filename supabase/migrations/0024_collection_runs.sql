-- ============================================================
-- Migration 0024: collection_runs — 採集紀錄
-- 每次批次採集（工商比對/管道補齊/超級比對/官網爬蟲…）留一筆紀錄：
-- 範圍、總數、成功/待確認/失敗，讓「做了什麼、成果多少」永久可查。
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collection_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,            -- gov | channels | super | places | chains | website
  label text,                    -- 顯示名稱（例：超級比對·中醫診所）
  scope text,                    -- 範圍描述（產業/筆數）
  total int DEFAULT 0,
  succeeded int DEFAULT 0,       -- 主要成果（統編寫入/補到管道數）
  pending int DEFAULT 0,         -- 待確認
  failed int DEFAULT 0,          -- 查無/失敗
  status text DEFAULT 'running', -- running | done | error
  detail jsonb,
  created_at timestamptz DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_collection_runs_created ON public.collection_runs (created_at DESC);
ALTER TABLE public.collection_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY collection_runs_all ON public.collection_runs FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
