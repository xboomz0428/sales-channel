-- 0037 活動清單排除舊碎片批次
-- Phase 0 之前每批 30 封各自成一筆 outreach_batches；歷史訊息已依「模板＋日期」合併為活動後，
-- 這些碎片沒有任何訊息也沒有選取數 → 以 HAVING 排除（不改 status，避免動到既有 check constraint）。

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
  having count(m.id) > 0 or coalesce(b.requested, 0) > 0
  order by b.created_at desc
  limit p_limit
$$;

revoke all on function public.email_campaigns(integer, uuid) from public, anon;
grant execute on function public.email_campaigns(integer, uuid) to authenticated, service_role;
