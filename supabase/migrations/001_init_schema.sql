-- 品牌表（連鎖歸戶後的母體）
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  registered_name text,
  brand_key text unique,
  industry text,
  industry_code text,
  store_count int default 1,
  is_chain boolean default false,
  chain_type text,
  tax_id text unique,
  owner_name text,
  capital bigint,
  priority_score numeric,
  pitch text,
  status text default 'new',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 分店表（Places 抓回的原始單位）
create table stores (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  place_id text unique,
  name text not null,
  address text,
  address_key text,
  city text,
  phone text,
  website text,
  rating numeric,
  review_count int,
  gmaps_url text,
  raw jsonb,
  created_at timestamptz default now()
);

-- 聯絡管道
create table brand_channels (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  channel text,
  value text,
  source_url text,
  fetched_at timestamptz,
  verified boolean default false,
  created_at timestamptz default now()
);

-- 聯絡窗口（人工補登）
create table contacts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  name text,
  title text,
  role text,
  mobile text,
  email text,
  line_id text,
  note text,
  source text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 聯繫紀錄
create table outreach_logs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  contact_id uuid references contacts(id),
  log_type text default 'develop',
  channel text,
  summary text,
  next_action text,
  next_action_date date,
  created_at timestamptz default now()
);

-- 商機表
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  product_line text,
  stage text default 'new',
  stage_entered_at timestamptz default now(),
  est_monthly_qty int,
  est_annual_value bigint,
  probability int,
  expected_close date,
  owner text,
  lost_reason text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 客情維護設定
create table care_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) unique,
  tier text,
  visit_cycle_days int,
  reorder_cycle_days int,
  last_order_date date,
  last_contact_date date,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 客情任務
create table care_tasks (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id),
  task_type text,
  title text,
  due_date date,
  done boolean default false,
  done_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 採集任務
create table scrape_jobs (
  id uuid primary key default gen_random_uuid(),
  keywords text[],
  cities text[],
  job_type text,
  status text default 'pending',
  progress int default 0,
  result_count int,
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 政府名冊原始資料
create table gov_records (
  id uuid primary key default gen_random_uuid(),
  source text,
  tax_id text,
  name text,
  address text,
  address_key text,
  industry_code text,
  owner_name text,
  extra jsonb,
  matched_brand_id uuid references brands(id),
  match_confidence text,
  imported_at timestamptz default now()
);

-- 索引優化
create index on brands(status);
create index on brands(industry);
create index on brands(tax_id);
create index on stores(brand_id);
create index on stores(city);
create index on contacts(brand_id);
create index on outreach_logs(brand_id);
create index on opportunities(brand_id);
create index on opportunities(stage);
create index on care_plans(brand_id);
create index on scrape_jobs(status);
create index on gov_records(tax_id);
create index on gov_records(address_key);

-- 啟用 RLS（行級安全）
alter table brands enable row level security;
alter table stores enable row level security;
alter table brand_channels enable row level security;
alter table contacts enable row level security;
alter table outreach_logs enable row level security;
alter table opportunities enable row level security;
alter table care_plans enable row level security;
alter table care_tasks enable row level security;
alter table scrape_jobs enable row level security;

-- RLS 策略（允許所有認證用戶讀寫）
create policy "Enable read for all authenticated users" on brands
  for select using (auth.role() = 'authenticated');

create policy "Enable insert for all authenticated users" on brands
  for insert with check (auth.role() = 'authenticated');

create policy "Enable update for all authenticated users" on brands
  for update using (auth.role() = 'authenticated');

-- 對其他表應用相同的 RLS 策略（簡化版）
create policy "Enable read access" on stores for select using (true);
create policy "Enable insert access" on stores for insert using (auth.role() = 'authenticated');

create policy "Enable read access" on contacts for select using (true);
create policy "Enable insert access" on contacts for insert using (auth.role() = 'authenticated');

create policy "Enable read access" on opportunities for select using (true);
create policy "Enable insert access" on opportunities for insert using (auth.role() = 'authenticated');
