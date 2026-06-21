-- =====================================================================
-- HeroHerb 通路開發系統 — 產品資料 + 報價模組  Migration 0004
-- 客製化產品管理與報價單。可在 Supabase SQL Editor 直接執行。
-- =====================================================================

-- 1) 產品資料表 ------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sku           text,                       -- 產品編號
  category      text,                       -- 分類（淨化包/足浴/噴霧…）
  spec          text,                       -- 規格（30入 / 250ml…）
  unit          text default '組',          -- 單位
  list_price    numeric(12,2) default 0,    -- 建議零售價
  channel_price numeric(12,2) default 0,    -- 通路價（批發）
  cost_price    numeric(12,2) default 0,    -- 成本
  min_order     int default 1,              -- 最低起訂量
  lead_days     int default 7,              -- 交期（工作天）
  description   text,
  image_url     text,
  is_active     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_product_active on public.products (is_active, sort_order);

-- 2) 報價單 ----------------------------------------------------------
create table if not exists public.quotes (
  id            uuid primary key default gen_random_uuid(),
  quote_no      text,                       -- 報價單號 Q-YYYYMMDD-NNN
  brand_id      uuid references public.brands(id) on delete set null,
  customer_name text,                       -- 客戶名稱（可手填，不一定綁名單）
  title         text default '產品報價單',
  status        text default 'draft'
                check (status in ('draft','sent','accepted','expired','rejected')),
  valid_days    int default 30,             -- 報價有效天數
  subtotal      numeric(12,2) default 0,    -- 小計（未折扣）
  discount_pct  numeric(5,2)  default 0,    -- 折扣百分比
  discount_amt  numeric(12,2) default 0,    -- 折扣金額
  total         numeric(12,2) default 0,    -- 總計
  note          text,                       -- 備註（付款條件等）
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index if not exists idx_quote_brand on public.quotes (brand_id, created_at desc);
create index if not exists idx_quote_status on public.quotes (status);

-- 3) 報價單明細 ------------------------------------------------------
create table if not exists public.quote_items (
  id          uuid primary key default gen_random_uuid(),
  quote_id    uuid references public.quotes(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  name        text not null,                -- 快照：品名（產品改名不影響歷史報價）
  spec        text,
  unit        text default '組',
  unit_price  numeric(12,2) default 0,
  qty         int default 1,
  amount      numeric(12,2) default 0,      -- unit_price * qty
  sort_order  int default 0
);
create index if not exists idx_qitem_quote on public.quote_items (quote_id, sort_order);

-- 4) 起手產品資料（HeroHerb 核心產品線）-----------------------------
insert into public.products (name, sku, category, spec, unit, list_price, channel_price, cost_price, min_order, lead_days, description, sort_order)
values
  ('艾草淨化包', 'HH-AC-30', '淨化包', '30入/盒', '盒', 680, 450, 220, 50, 7,
   '台灣製造艾草淨化包，PLA 環保包裝，適合禮廳、宮廟、居家淨化使用。', 1),
  ('草本足浴包（暖薑）', 'HH-FB-G20', '足浴', '20入/袋', '袋', 580, 380, 180, 50, 7,
   '薑黃暖身配方，促進循環、舒緩疲勞，養生館療程加值首選。', 2),
  ('草本足浴包（艾草）', 'HH-FB-A20', '足浴', '20入/袋', '袋', 580, 380, 180, 50, 7,
   '艾草放鬆配方，舒緩身心，適合泡腳養生。', 3),
  ('空間噴霧（精油）', 'HH-SP-250', '噴霧', '250ml/瓶', '瓶', 480, 320, 150, 30, 10,
   '天然精油基底空間噴霧，不刺鼻、不殘留，提升空間質感。', 4),
  ('精選禮盒組', 'HH-GIFT-01', '禮盒', '綜合 6 件', '組', 1280, 880, 420, 20, 14,
   '節慶送禮首選，含淨化包、足浴包、噴霧綜合精選。', 5)
on conflict do nothing;

-- 5) Row Level Security ---------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['products','quotes','quote_items'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy %1$s_auth_all on public.%1$I
        for all using (true) with check (true);
    $p$, t);
  end loop;
exception when duplicate_object then null;
end $$;
