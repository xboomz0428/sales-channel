-- 0040 舊路徑碎片自動合併
-- 舊寄送路徑（/api/outreach/newsletter/send，每批一筆 name='newsletter'、requested=0）會把一次群發切成數十筆。
-- 此函式依「模板＋台灣日期」把碎片併入一筆活動（找不到就建、找得到就併），可重複執行；
-- 中途執行也安全：訊息已整批建立，改 batch_id 不影響寄送。由每日排程呼叫，也可手動 select * from merge_legacy_email_batches();

create or replace function public.merge_legacy_email_batches()
returns table (campaigns_touched integer, messages_moved integer, empty_fragments integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  g record;
  target uuid;
  tname text;
  moved integer;
  mm integer := 0;
  ct integer := 0;
  ef integer := 0;
  merged_note constant text := '由歷史寄送紀錄依模板＋日期合併';
begin
  for g in
    select m.template_id,
           (m.created_at at time zone 'Asia/Taipei')::date as d,
           min(m.created_at) as first_at
    from public.outreach_messages m
    join public.outreach_batches b on b.id = m.batch_id
    where m.channel = 'EM' and m.direction = 'out'
      and b.name = 'newsletter' and coalesce(b.requested, 0) = 0
    group by 1, 2
  loop
    target := null;
    select id into target
      from public.outreach_batches
     where channel = 'EM'
       and template_id is not distinct from g.template_id
       and note = merged_note
       and (created_at at time zone 'Asia/Taipei')::date = g.d
     order by created_at
     limit 1;

    if target is null then
      select name into tname from public.outreach_templates where id = g.template_id;
      insert into public.outreach_batches (name, channel, template_id, total, requested, status, started_at, created_at, note)
      values (coalesce(tname, '（無模板）') || '（' || to_char(g.d, 'MM/DD') || '）',
              'EM', g.template_id, 0, 0, 'running', g.first_at, g.first_at, merged_note)
      returning id into target;
    end if;

    update public.outreach_messages m
       set batch_id = target
      from public.outreach_batches b
     where m.batch_id = b.id
       and b.name = 'newsletter' and coalesce(b.requested, 0) = 0
       and m.channel = 'EM' and m.direction = 'out'
       and m.template_id is not distinct from g.template_id
       and (m.created_at at time zone 'Asia/Taipei')::date = g.d;
    get diagnostics moved = row_count;
    mm := mm + moved;
    ct := ct + 1;

    update public.outreach_batches t set
      requested   = (select count(*) from public.outreach_messages where batch_id = target),
      total       = (select count(*) from public.outreach_messages where batch_id = target),
      status      = case when exists (select 1 from public.outreach_messages where batch_id = target and status in ('queued','sending')) then 'running' else 'done' end,
      finished_at = case when exists (select 1 from public.outreach_messages where batch_id = target and status in ('queued','sending')) then null
                         else (select max(coalesce(sent_at, created_at)) from public.outreach_messages where batch_id = target) end
    where t.id = target;
  end loop;

  select count(*) into ef
    from public.outreach_batches b
   where b.channel = 'EM' and b.name = 'newsletter' and coalesce(b.requested, 0) = 0
     and not exists (select 1 from public.outreach_messages m where m.batch_id = b.id);

  return query select ct, mm, ef;
end $$;

grant execute on function public.merge_legacy_email_batches() to anon, authenticated, service_role;
