-- 每日平台數據快照，供每日晚報計算「昨天 vs 今天」的真實成長差異
create table if not exists daily_metrics (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_daily_metrics_date on daily_metrics (snapshot_date desc);

comment on table daily_metrics is '每日平台累計數據快照，用於 LINE 晚報的昨日對比';
