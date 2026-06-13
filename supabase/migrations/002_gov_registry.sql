-- 財政部營業（稅籍）登記資料本地鏡像
-- GCIS 查不到的獨資/合夥商號改查此表（資料由 /api/gov/registry 匯入 BGMOPEN1 CSV）
create extension if not exists pg_trgm;

create table if not exists gov_registry (
  tax_id text primary key,
  name text not null,
  address text,
  city text,
  capital bigint,
  setup_date text,
  organization_type text,
  industry_codes text[],
  imported_at timestamptz default now()
);

create index if not exists gov_registry_name_trgm on gov_registry using gin (name gin_trgm_ops);
create index if not exists gov_registry_city_idx on gov_registry(city);
