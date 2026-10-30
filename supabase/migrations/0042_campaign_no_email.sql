-- 0042 活動記錄「名單無 Email」人數
-- 10/28 的 802 人群發：490 排除重複後，其餘 312 人在「建立寄送訊息」整批失敗（312 列 × ~26KB 內文 ≈ 8.5MB 單一請求），
-- 錯誤被計成 failed 而非丟錯，活動標成 done 0/0、看不出原因；且舊版把「無 Email」與「建立失敗」混在同一個數字。
-- 程式面已改為分批建立＋失敗丟錯；這裡把 no_email 納入活動統計，讓「選取 = 排除重複 + 無效 + 無 Email + 入佇列」對得上。
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

-- 10/28 18:36 那筆：312 人不是「無 Email」而是「建立訊息失敗」，no_email 維持 0，以 status=error + 備註呈現原因
update public.outreach_batches
   set status = 'error',
       note = '建立寄送訊息失敗：312 人一次送出（約 8.5MB）未成功，一封都未入佇列；已改為分批建立，重新對同名單寄送即可補寄（已寄過者自動排除）'
 where id = '5afc51eb-90bd-4c60-bf58-ae595096dedc';
