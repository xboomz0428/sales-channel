-- ============================================================
-- Migration 0033: 安全一致性
-- (1) 7 張未啟用 RLS 的表補上 RLS + 與其他表相同的開發期 allow-all 政策
--     （功能不變，但與全庫一致、清掉 linter ERROR；日後導入 Auth 時已是 RLS-enabled）
-- (2) 修正 2 個統計 RPC 函式的 mutable search_path（函式內用 public. 全限定，設 public 安全）
-- 註：其餘 dev_all_access / SECURITY DEFINER view 屬「開發期全開」既定狀態，
--     正式導入使用者驗證(Auth)時再一併收斂 RLS，不在此變更以免影響現有運作。
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['voice_calls','phone_dnc','outreach_flows','daily_metrics','product_categories','industry_groups','dashboard_cache']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO public USING (true) WITH CHECK (true)', t||'_all', t);
  END LOOP;
END $$;

ALTER FUNCTION public.brands_overview_rows(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.industry_channel_gaps_rows(text) SET search_path = public, pg_temp;
