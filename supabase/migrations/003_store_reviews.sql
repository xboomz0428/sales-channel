create table if not exists store_reviews (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references stores(id) on delete cascade,
  rating int,
  text text,
  author_name text,
  relative_time text,
  created_at timestamptz default now()
);
create index if not exists store_reviews_store_id_idx on store_reviews(store_id);
create index if not exists store_reviews_created_idx on store_reviews(created_at desc);
