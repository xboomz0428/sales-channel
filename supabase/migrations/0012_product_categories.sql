create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8FAAA4',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_categories_sort on product_categories (sort_order);

comment on table product_categories is '產品分類定義（名稱+卡片色），products.category 以名稱對應';
