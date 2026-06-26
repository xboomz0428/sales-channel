-- =====================================================================
-- 退信分類 — Migration 0010
-- 硬退信（信箱不存在）永久封鎖；軟退信（暫時性，如信箱滿）累計到門檻才封鎖。
-- =====================================================================
alter table public.email_blacklist add column if not exists blocked boolean not null default true;
alter table public.email_blacklist add column if not exists bounce_type text;   -- hard | soft | failed
alter table public.email_blacklist add column if not exists soft_count int not null default 0;
-- 既有資料維持封鎖（blocked 預設 true）
