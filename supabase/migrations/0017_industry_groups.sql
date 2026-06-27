create table if not exists industry_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8FAAA4',
  industries jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_industry_groups_sort on industry_groups (sort_order);
comment on table industry_groups is '產業群組：把多個產業(brands.industry)歸成命名群組，供群發訊息篩選';
