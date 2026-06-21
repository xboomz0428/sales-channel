-- =====================================================================
-- AI 外聯引擎 — Migration 0003:HTML 電子報 + 開信/點擊追蹤 + 退信 + 儀表板
-- 接續 0002。
-- =====================================================================

-- 1) HTML 內文 + 追蹤欄位 -------------------------------------------
alter table public.outreach_templates add column if not exists body_html text;

alter table public.outreach_messages
  add column if not exists body_html       text,
  add column if not exists tracking_id     uuid unique default gen_random_uuid(),
  add column if not exists open_count      int default 0,
  add column if not exists click_count     int default 0,
  add column if not exists first_opened_at timestamptz,
  add column if not exists last_opened_at  timestamptz;

create index if not exists idx_msg_tracking on public.outreach_messages (tracking_id);

-- 2) 連結表(點擊追蹤;以 link id 轉址,避免 open redirect)----------
create table if not exists public.email_links (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid references public.outreach_messages(id) on delete cascade,
  url         text not null,
  click_count int default 0,
  created_at  timestamptz default now()
);
create index if not exists idx_link_msg on public.email_links (message_id);

-- 3) 事件明細(open / click 每次紀錄)-------------------------------
create table if not exists public.email_events (
  id         bigserial primary key,
  message_id uuid references public.outreach_messages(id) on delete cascade,
  type       text not null check (type in ('open','click')),
  link_id    uuid references public.email_links(id) on delete set null,
  ip         text,
  ua         text,
  created_at timestamptz default now()
);
create index if not exists idx_event_msg on public.email_events (message_id, created_at desc);

-- 4) Email 寄送成效視圖(儀表板用)----------------------------------
create or replace view public.v_email_send_stats as
select
  date_trunc('day', created_at) as day,
  count(*) filter (where status in ('sent','delivered','read','replied')) as sent,
  count(*) filter (where status = 'failed')                               as failed,
  count(*) filter (where status = 'bounced')                              as bounced,
  count(*) filter (where open_count  > 0)                                 as opened,
  count(*) filter (where click_count > 0)                                 as clicked,
  count(*) filter (where status = 'replied')                              as replied,
  round(100.0 * count(*) filter (where open_count > 0)
    / nullif(count(*) filter (where status in
      ('sent','delivered','read','replied')), 0), 1)                      as open_rate,
  round(100.0 * count(*) filter (where click_count > 0)
    / nullif(count(*) filter (where status in
      ('sent','delivered','read','replied')), 0), 1)                      as click_rate
from public.outreach_messages
where channel = 'EM' and direction = 'out'
group by 1
order by 1 desc;

-- 5) RLS(新表)----------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['email_links','email_events'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %1$s_auth_all on public.%1$I
        for all using (true) with check (true);
    $p$, t);
  end loop;
exception when duplicate_object then null;
end $$;
