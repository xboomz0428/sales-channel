-- =====================================================================
-- 電子報自動化 — Migration 0009
-- ① 排程寄送  ③ 節流/暖機  ⑦ 自動跟進序列
-- =====================================================================

-- ① 排程寄送
create table if not exists public.scheduled_sends (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid not null,
  brand_ids       jsonb not null default '[]'::jsonb,
  manual_emails   jsonb not null default '[]'::jsonb,
  scheduled_at    timestamptz not null,
  skip_duplicates boolean not null default true,
  status          text not null default 'pending',  -- pending | sending | done | canceled
  result          jsonb,
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists scheduled_sends_due on public.scheduled_sends (status, scheduled_at);

-- ⑦ 自動跟進序列
create table if not exists public.followup_rules (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  trigger_template_id  uuid not null,
  followup_template_id uuid not null,
  days_after           int not null default 3,
  condition            text not null default 'no_open',  -- no_open | no_reply | always
  active               boolean not null default true,
  created_at           timestamptz not null default now()
);

-- 標記跟進信來源，避免重複跟進
alter table public.outreach_messages add column if not exists parent_message_id uuid;
alter table public.outreach_messages add column if not exists followup_rule_id uuid;
create index if not exists outreach_messages_parent on public.outreach_messages (parent_message_id);
create index if not exists outreach_messages_tpl_status on public.outreach_messages (template_id, status);

-- ③ 節流/暖機 預設值（不覆寫既有）
insert into public.app_settings (key, value) values
  ('EMAIL_DAILY_CAP', '300'),
  ('EMAIL_PER_RUN', '40'),
  ('LINE_NOTIFY_ENABLED', 'false')
on conflict (key) do nothing;

-- RLS
alter table public.scheduled_sends enable row level security;
alter table public.followup_rules enable row level security;
do $$ begin
  create policy scheduled_sends_all on public.scheduled_sends for all using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy followup_rules_all on public.followup_rules for all using (true) with check (true);
exception when duplicate_object then null; end $$;
