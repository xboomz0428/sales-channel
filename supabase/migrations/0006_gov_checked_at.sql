-- =====================================================================
-- 工商登記比對排序 — Migration 0006
-- 記錄每個品牌最後一次工商比對時間，讓批次優先處理沒比對過的，
-- 已比對過（即使未命中）的排到最後，避免重複比對浪費 API。
-- =====================================================================

alter table public.brands add column if not exists gov_checked_at timestamptz;

-- 缺統編品牌依「沒比對過優先、最久沒比對其次」排序用
create index if not exists idx_brands_gov_checked
  on public.brands (gov_checked_at nulls first)
  where tax_id is null;
