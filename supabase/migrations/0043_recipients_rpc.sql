-- 0043 電子報收件名單／產業數量改由資料庫端一次彙整
-- 之前：/api/industry-groups 把全部品牌（7.8 萬筆）每 1000 筆分頁抓回 Node 端數產業（約 80 次請求、實測 13 秒）；
--       /api/outreach/recipients 先抓三個 Email 來源全部列，再把幾千個 brand_id 每 100 個一塊查品牌（30+ 次請求、2～3 秒）。
-- 現在：兩支 RPC 各一次往返。supabaseAdmin 為 anon-優先 client（同 0038），必須 grant anon。
-- 設計：
--  * Email 合法性／垃圾信箱規則仍在 API 端（isValidEmail）判斷——實測在 SQL 用 regex 過濾 6 千筆要 1 秒以上，
--    改回傳每個品牌的 Email 候選陣列（依建立順序），由 Node 端取第一個合法者，與舊行為一致。
--  * 回傳 jsonb（單一值）而非 setof：PostgREST 對任何回應（含 RPC）套用 max-rows=1000，
--    回 setof 時不篩選的 6 千筆只會拿到前 1000 筆（實測名單從 3048 掉成 633）。

-- 1) 各產業品牌數（不分國家，與舊 API 同口徑）
drop function if exists public.industry_counts();
create function public.industry_counts()
returns table (industry text, cnt bigint)
language sql stable
set search_path = public, pg_temp
as $$
  select industry, count(*)::bigint
  from public.brands
  where industry is not null and industry <> ''
  group by industry
$$;
revoke all on function public.industry_counts() from public;
grant execute on function public.industry_counts() to anon, authenticated, service_role;

-- 2) 收件名單候選：任一來源有 Email 的品牌（採集管道／聯絡人／brands.email），套用篩選後以 jsonb 陣列回傳
drop function if exists public.email_recipient_candidates(text, text[], text, text, text);
create function public.email_recipient_candidates(
  p_country text default 'TW',
  p_industries text[] default null,
  p_industry text default null,
  p_stage text default null,
  p_q text default null
)
returns jsonb
language sql stable
set search_path = public, pg_temp
as $$
  with ch as (
    select brand_id, array_agg(value order by created_at, id) as emails
    from public.brand_channels where channel = 'email' group by brand_id
  ),
  ct as (
    select brand_id, array_agg(email order by created_at, id) as emails
    from public.contacts where email is not null group by brand_id
  ),
  cand as (
    select brand_id from ch
    union select brand_id from ct
    union select id from public.brands where country = p_country and email is not null
  ),
  rows as (
    select b.id, b.name, b.industry, b.status as stage, b.registered_name,
           b.email as brand_email, ch.emails as channel_emails, ct.emails as contact_emails
    from public.brands b
    join cand on cand.brand_id = b.id
    left join ch on ch.brand_id = b.id
    left join ct on ct.brand_id = b.id
    where b.country = p_country
      and (p_industries is null or b.industry = any(p_industries))
      and (p_industries is not null or p_industry is null or b.industry = p_industry)
      and (p_stage is null or b.status = p_stage)
      and (p_q is null or b.name ilike '%' || p_q || '%')
  )
  select coalesce(jsonb_agg(to_jsonb(rows)), '[]'::jsonb) from rows
$$;
revoke all on function public.email_recipient_candidates(text, text[], text, text, text) from public;
grant execute on function public.email_recipient_candidates(text, text[], text, text, text) to anon, authenticated, service_role;

-- 3) 輔助索引（brand_channels 已有 (channel, brand_id)）
create index if not exists idx_contacts_brand_email on public.contacts (brand_id) where email is not null;
create index if not exists idx_brands_country_email on public.brands (country) where email is not null;

-- 4) API 走 anon 角色（statement_timeout=3s）；不篩選時冷快取下實測 3～8 秒會被砍成 500。同 0026 的做法把函式自己的上限拉到 30s
alter function public.email_recipient_candidates(text, text[], text, text, text) set statement_timeout = '30s';
alter function public.industry_counts() set statement_timeout = '30s';
