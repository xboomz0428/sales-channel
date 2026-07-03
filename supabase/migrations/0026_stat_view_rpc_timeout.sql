-- ============================================================
-- Migration 0026: 讓統計層聚合查詢突破 anon 3s statement_timeout
-- brands_overview / industry_channel_gaps 會對 58k+ 名單逐筆算 EXISTS(~3s)。
-- API 走 anon 角色(statement_timeout=3s)：overview 剛好卡邊過關、gaps 稍慢就回 500
-- (canceling statement due to statement timeout) → 比對中心「類別」下拉塌回只剩已載入那批。
-- 解法：用帶 SET statement_timeout 的函式包一層，該次呼叫的逾時上限拉高到 30s。
-- 資料仍是即時計算(不物化、不需 refresh)，只是給它足夠時間跑完。
-- ============================================================

CREATE OR REPLACE FUNCTION public.industry_channel_gaps_rows(p_country text DEFAULT 'TW')
RETURNS SETOF public.industry_channel_gaps
LANGUAGE sql STABLE
SET statement_timeout = '30s'
AS $$
  SELECT * FROM public.industry_channel_gaps
  WHERE country = p_country
  ORDER BY gap_score DESC;
$$;

CREATE OR REPLACE FUNCTION public.brands_overview_rows(p_country text DEFAULT 'TW')
RETURNS SETOF public.brands_overview
LANGUAGE sql STABLE
SET statement_timeout = '30s'
AS $$
  SELECT * FROM public.brands_overview
  WHERE country = p_country
  ORDER BY total DESC;
$$;

GRANT EXECUTE ON FUNCTION public.industry_channel_gaps_rows(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brands_overview_rows(text) TO anon, authenticated, service_role;
