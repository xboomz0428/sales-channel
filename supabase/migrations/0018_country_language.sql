-- 海外拓展：國家別 + 語言欄位
alter table brands add column if not exists country text not null default 'TW';
alter table brands add column if not exists website text;
alter table brands add column if not exists email text;
alter table brands add column if not exists phone text;

alter table outreach_templates add column if not exists language text not null default 'zh';

-- 效能索引
create index if not exists idx_brands_country on brands(country);
create index if not exists idx_brands_country_industry on brands(country, industry, created_at desc);
create index if not exists idx_templates_language on outreach_templates(language);
