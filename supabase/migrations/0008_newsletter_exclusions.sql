-- =====================================================================
-- 電子報排除名單 — Migration 0008
-- 使用者在「電子報發送」頁手動「移除選取」的收件人，存進此表，
-- 收件名單 API 讀取時排除這些 email，未來篩選不再顯示。
-- =====================================================================

create table if not exists public.newsletter_exclusions (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  brand_id   uuid,
  reason     text,
  created_at timestamptz not null default now()
);
create unique index if not exists newsletter_exclusions_email_uniq on public.newsletter_exclusions (lower(email));

alter table public.newsletter_exclusions enable row level security;
do $$ begin
  create policy newsletter_exclusions_all on public.newsletter_exclusions for all using (true) with check (true);
exception when duplicate_object then null; end $$;
