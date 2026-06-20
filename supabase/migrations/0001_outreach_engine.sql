-- =====================================================================
-- HeroHerb 通路開發系統 — AI 外聯引擎  Migration 0001
-- 對應規格 v1.1。可在 Supabase SQL Editor 直接執行。
-- 既有資料表:brands(名單/品牌)、followups(跟進)。本檔僅 ALTER,不重建。
-- =====================================================================

-- 0) 既有 brands 表補欄位(若欄位名不同,請對應調整) -------------------
alter table public.brands add column if not exists engagement_score int default 0;
alter table public.brands add column if not exists last_contacted_at timestamptz;

-- 1) 計價設定(價格可調,程式不寫死) -----------------------------------
create table if not exists public.ai_model_pricing (
  model               text primary key,
  input_per_mtok      numeric(10,4) not null,
  output_per_mtok     numeric(10,4) not null,
  cache_read_per_mtok numeric(10,4) not null default 0,
  updated_at          timestamptz default now()
);
insert into public.ai_model_pricing (model, input_per_mtok, output_per_mtok, cache_read_per_mtok)
values
  ('claude-haiku-4-5',  1, 5,  0.10),
  ('claude-sonnet-4-6', 3, 15, 0.30),
  ('claude-opus-4-8',   5, 25, 0.50)
on conflict (model) do update
  set input_per_mtok      = excluded.input_per_mtok,
      output_per_mtok     = excluded.output_per_mtok,
      cache_read_per_mtok = excluded.cache_read_per_mtok,
      updated_at          = now();

-- 2) 訊息模板 ----------------------------------------------------------
create table if not exists public.outreach_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  channel       text not null check (channel in ('LN','FB','IG','EM','TEL')),
  industry      text,
  product_focus text,
  body          text not null,
  created_at    timestamptz default now()
);

-- 3) 序列(節奏)------------------------------------------------------
create table if not exists public.outreach_sequences (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists public.outreach_sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  sequence_id uuid references public.outreach_sequences(id) on delete cascade,
  step_order  int  not null,
  wait_days   int  not null default 0,
  channel     text not null check (channel in ('LN','FB','IG','EM','TEL')),
  template_id uuid references public.outreach_templates(id),
  goal        text,
  unique (sequence_id, step_order)
);

-- 4) 批次任務(進度條來源)-------------------------------------------
create table if not exists public.outreach_batches (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  channel     text,
  total       int default 0,
  sent        int default 0,
  failed      int default 0,
  status      text default 'pending'
              check (status in ('pending','running','paused','done','error')),
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz default now()
);

-- 5) 名單加入序列(enrollment)--------------------------------------
create table if not exists public.outreach_enrollments (
  id             uuid primary key default gen_random_uuid(),
  brand_id       uuid not null references public.brands(id) on delete cascade,
  sequence_id    uuid references public.outreach_sequences(id),
  current_step   int default 1,
  status         text default 'active'
                 check (status in ('active','replied','paused','done')),
  next_action_at timestamptz,
  enrolled_at    timestamptz default now()
);
create index if not exists idx_enroll_due
  on public.outreach_enrollments (next_action_at) where status = 'active';
-- 一張名單同一序列僅一筆有效 enrollment(防重複 enroll)
create unique index if not exists uq_enroll_active
  on public.outreach_enrollments (brand_id, sequence_id)
  where status in ('active','paused');

-- 6) 訊息(草稿 / 已發 / 回覆 / 交付追蹤 / 可觀測性)----------------
create table if not exists public.outreach_messages (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references public.brands(id) on delete cascade,
  enrollment_id       uuid references public.outreach_enrollments(id) on delete set null,
  batch_id            uuid references public.outreach_batches(id) on delete set null,
  channel             text not null check (channel in ('LN','FB','IG','EM','TEL')),
  direction           text default 'out' check (direction in ('out','in')),
  status              text default 'draft'
                      check (status in ('draft','queued','sending','sent',
                                        'delivered','read','replied','failed','bounced')),
  subject             text,
  body                text not null,
  -- 合規
  compliance_flag     boolean default false,
  compliance_note     text,
  compliance_override boolean default false,   -- 人工確認可送
  -- 交付追蹤
  provider_message_id text,
  delivered_at        timestamptz,
  read_at             timestamptz,
  error_detail        text,
  -- 可觀測性 / 費用
  model               text,
  tokens_in           int default 0,
  tokens_out          int default 0,
  cached_tokens       int default 0,
  generation_ms       int,
  cost_usd            numeric(12,6) default 0,
  -- 熱度
  engagement_score    int default 0,
  sent_at             timestamptz,
  created_at          timestamptz default now()
);
create index if not exists idx_msg_brand    on public.outreach_messages (brand_id, created_at desc);
create index if not exists idx_msg_status   on public.outreach_messages (status);
create index if not exists idx_msg_created  on public.outreach_messages (created_at);
-- provider id 唯一(webhook 冪等比對)
create unique index if not exists uq_msg_provider
  on public.outreach_messages (provider_message_id)
  where provider_message_id is not null;

-- 7) 訊息版本(重新生成 / 人工修改留版本)--------------------------
create table if not exists public.outreach_message_revisions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid references public.outreach_messages(id) on delete cascade,
  version    int  not null,
  body       text not null,
  edited_by  text,
  reason     text,
  created_at timestamptz default now(),
  unique (message_id, version)
);

-- 8) 全域稽核日誌 ----------------------------------------------------
create table if not exists public.audit_log (
  id         bigserial primary key,
  entity     text not null,
  entity_id  uuid not null,
  field      text,
  old_value  text,
  new_value  text,
  actor      text default 'system',
  created_at timestamptz default now()
);
create index if not exists idx_audit_entity
  on public.audit_log (entity, entity_id, created_at desc);

-- 9) 自動記錄名單階段變更(供停留天數計算)------------------------
create or replace function public.log_brand_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.audit_log(entity, entity_id, field, old_value, new_value, actor)
    values ('brand', new.id, 'stage', old.stage, new.stage,
            coalesce(current_setting('app.actor', true), 'system'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_brand_stage on public.brands;
create trigger trg_brand_stage
  after update on public.brands
  for each row execute function public.log_brand_stage_change();

-- 10) 視圖:效率 / 費用 ---------------------------------------------
create or replace view public.v_outreach_efficiency as
select
  date_trunc('day', created_at) as day,
  count(*)                                                         as generated,
  round(avg(generation_ms))                                       as avg_gen_ms,
  count(*) filter (where status in ('sent','delivered','read','replied')) as sent,
  round(100.0 * count(*) filter (where status = 'failed')
        / nullif(count(*), 0), 1)                                 as fail_rate,
  count(*) filter (where status = 'replied')                      as replied
from public.outreach_messages
where direction = 'out'
group by 1
order by 1 desc;

create or replace view public.v_ai_cost_daily as
select
  date_trunc('day', created_at) as day,
  model,
  sum(tokens_in)        as tin,
  sum(tokens_out)       as tout,
  round(sum(cost_usd),4) as usd
from public.outreach_messages
group by 1, 2
order by 1 desc;

-- 11) Row Level Security ------------------------------------------
-- 內部工具:僅登入(authenticated)使用者可讀寫。
-- 注意:server route 用 service_role 會「繞過」RLS,故 route 內務必自行驗證登入(見 lib/auth.ts)。
do $$
declare t text;
begin
  foreach t in array array[
    'ai_model_pricing','outreach_templates','outreach_sequences',
    'outreach_sequence_steps','outreach_batches','outreach_enrollments',
    'outreach_messages','outreach_message_revisions','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %1$s_auth_all on public.%1$I
        for all to authenticated using (true) with check (true);
    $p$, t);
  end loop;
exception when duplicate_object then
  null; -- policy 已存在則略過
end $$;
