-- 0042 活動記錄「名單無 Email」人數
-- 10/28 的 802 人群發：490 排除重複後，其餘 312 人因 resolveBrandEmails 一次 .in() 312 個 id 超過 URL 長度、
-- 查詢失敗被靜默當成「沒有 Email」，一封都沒入佇列，而儀表板只顯示 0/0 完成、看不出原因。
-- 程式面已改為分塊查詢＋失敗丟錯；這裡把 no_email 納入活動統計，讓「選取 = 排除重複 + 無效 + 無 Email + 入佇列」永遠對得上。
alter table public.outreach_batches add column if not exists no_email integer not null default 0;

-- 回傳欄位變動必須先 drop（create or replace 不允許改 returns table）
drop function if exists public.email_campaigns(integer, uuid);
create function public.email_campaigns(p_limit integer default 50, p_id uuid default null)
returns table (
  id uuid, name text, template_id uuid, template_name text,
  created_at timestamptz, started_at timestamptz, finished_at timestamptz,
  status text, note text, requested integer, skipped integer, cleaned integer, no_email integer,
  total integer, sent integer, failed integer, queued integer, sending integer,
  opened integer, clicked integer, replied integer
)
language sql stable
set search_path = public, pg_temp
as $$
  select b.id, b.name, b.template_id, t.name,
         b.created_at, b.started_at, b.finished_at,
         b.status, b.note, coalesce(b.requested, 0), coalesce(b.skipped, 0), coalesce(b.cleaned, 0), coalesce(b.no_email, 0),
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

-- supabaseAdmin 為 anon-優先 client（同 0038），必須 grant anon
revoke all on function public.email_campaigns(integer, uuid) from public;
grant execute on function public.email_campaigns(integer, uuid) to anon, authenticated, service_role;

-- 回填 10/28 18:36 那筆：802 選取 − 490 排除重複 − 0 無效 − 0 入佇列 = 312 人被誤判無 Email
update public.outreach_batches b
   set no_email = b.requested - b.skipped - b.cleaned - (select count(*) from public.outreach_messages m where m.batch_id = b.id),
       note = '名單 Email 查詢失敗（一次查 312 個 id 超過 URL 長度），312 人未入佇列；已修正，重新對同名單寄送即可補寄'
 where b.id = '5afc51eb-90bd-4c60-bf58-ae595096dedc' and b.no_email = 0;
