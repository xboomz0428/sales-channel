-- ============================================================
-- Migration 0034: 收斂 RLS 全開政策（⚠️ 手動、最後才套用）
--
-- 前置條件（缺一不可，否則會鎖死正式站）：
--   1. Vercel 已設定 SUPABASE_SERVICE_ROLE_KEY（後端改用 service_role 連線，繞過 RLS）。
--   2. 已部署含本批「登入 gate + server 改優先 service_role」的版本，並確認 app 正常讀寫。
--   3. 已設定 APP_PASSWORD（啟用登入）。
--
-- 作用：把所有資料表的「dev 全開」政策（TO public USING(true)）改成
--   「只允許 service_role」。如此一來：
--     - 後端（service_role）照常運作；
--     - 任何人拿 public anon key 直接打 Supabase REST API 都讀不到你的 CRM 資料。
--
-- 回復方式：若套用後正式站讀不到資料，代表 service_role 尚未生效 →
--   先確認環境變數，或臨時執行本檔末尾「回復（ROLLBACK）」區塊還原全開政策。
-- ============================================================

DO $$
DECLARE r record;
BEGIN
  -- 逐一把 public schema 內所有 RLS 政策，改成僅限 service_role
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', r.policyname, r.tablename);
  END LOOP;
END $$;

-- 確保這些表確實啟用了 RLS（沒啟用時政策不生效）
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname='public'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXCEPTION WHEN others THEN NULL; -- 檢視表/無擁有權者略過
    END;
  END LOOP;
END $$;

-- ============================================================
-- 回復（ROLLBACK）：若需要暫時還原「全開」政策，執行下列（拿掉註解）：
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN SELECT tablename, policyname FROM pg_policies WHERE schemaname='public'
--   LOOP EXECUTE format('ALTER POLICY %I ON public.%I TO public', r.policyname, r.tablename); END LOOP;
-- END $$;
-- ============================================================
