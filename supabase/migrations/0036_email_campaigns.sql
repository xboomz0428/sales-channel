-- 0036 群發活動（Campaign）
-- 一次群發 ＝ 一筆 outreach_batches；即時統計由 outreach_messages 依 batch_id 彙整（不另存計數器，避免失真）

alter table public.outreach_batches
  add column if not exists template_id uuid,
  add column if not exists requested integer not null default 0,          -- 選取人數
  add column if not exists skipped integer not null default 0,            -- 排除重複（已寄過/已排隊）
  add column if not exists cleaned integer not null default 0,            -- 無效信箱（語法/MX）
  add column if not exists skipped_brand_ids jsonb not null default '[]'::jsonb, -- 被排除重複的名單 id
  add column if not exists note text;

create index if not exists idx_outreach_messages_batch_id
  on public.outreach_messages (batch_id) where batch_id is not null;
create index if not exists idx_outreach_batches_created
  on public.outreach_batches (created_at desc);

-- 活動清單／單筆：彙整每個活動的 已寄/失敗/排隊/寄送中/開信/點擊/回覆
create or replace function public.email_campaigns(p_limit integer default 50, p_id uuid default null)
returns table (
  id uuid, name text, template_id uuid, template_name text,
  created_at timestamptz, started_at timestamptz, finished_at timestamptz,
  status text, note text, requested integer, skipped integer, cleaned integer,
  total integer, sent integer, failed integer, queued integer, sending integer,
  opened integer, clicked integer, replied integer
)
language sql stable
set search_path = public, pg_temp
as $$
  select b.id, b.name, b.template_id, t.name,
         b.created_at, b.started_at, b.finished_at,
         b.status, b.note, coalesce(b.requested, 0), coalesce(b.skipped, 0), coalesce(b.cleaned, 0),
         count(m.id)::int,
         count(m.id) filter (where m.status in ('sent','delivered','read','replied'))::int,
         count(m.id) filter (where m.status in ('failed','bounced'))::int,
         count(m.id) filter (where m.status = 'queued')::int,
         count(m.id) filter (where m.status = 'sending')::int,
         count(m.id) filter (where m.open_count > 0)::int,
         count(m.id) filter (where m.click_count > 0)::int,
         count(m.id) filter (where m.status = 'replied')::int
  from public.outreach_batches b
  left join public.outreach_templates t on t.id = b.template_id
  left join public.outreach_messages m on m.batch_id = b.id
  where b.channel = 'EM'
    and coalesce(b.status, '') <> 'merged'
    and (p_id is null or b.id = p_id)
  group by b.id, t.name
  order by b.created_at desc
  limit p_limit
$$;

revoke all on function public.email_campaigns(integer, uuid) from public, anon;
grant execute on function public.email_campaigns(integer, uuid) to authenticated, service_role;
