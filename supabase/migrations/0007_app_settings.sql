-- =====================================================================
-- 應用程式設定（可在「API 設定」頁直接輸入金鑰）— Migration 0007
-- 讓使用者不必改環境變數，直接在 UI 輸入 API 金鑰，存進此表，
-- 後端讀取時 DB 優先、環境變數其次。
-- =====================================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz default now()
);

alter table public.app_settings enable row level security;
do $$ begin
  create policy app_settings_all on public.app_settings for all using (true) with check (true);
exception when duplicate_object then null; end $$;
