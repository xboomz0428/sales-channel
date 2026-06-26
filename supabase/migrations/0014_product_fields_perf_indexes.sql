-- 產品新增效期、條碼欄位（獨立欄位，不再塞進說明）
alter table products add column if not exists barcode text;
alter table products add column if not exists shelf_life text;

-- 效能索引
create index if not exists idx_brand_channels_brand on brand_channels (brand_id);
create index if not exists idx_brands_created_at on brands (created_at desc);
create index if not exists idx_products_category on products (category);
create index if not exists idx_outreach_logs_created on outreach_logs (created_at desc);
create index if not exists idx_stores_created on stores (created_at desc);
