-- 報價單：我方業務 + 對方公司資訊 + 標準售價顯示開關
alter table quotes add column if not exists sales_rep text;
alter table quotes add column if not exists buyer_tax_id text;
alter table quotes add column if not exists buyer_contact text;
alter table quotes add column if not exists buyer_phone text;
alter table quotes add column if not exists show_list_price boolean not null default false;

-- 報價明細：型號 + 標準售價快照
alter table quote_items add column if not exists sku text;
alter table quote_items add column if not exists list_price numeric;
