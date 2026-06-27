-- 儀表板統計：全部在 DB 內聚合（取代抓全部列到 JS），毫秒級
create or replace function dashboard_metrics()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total_leads', (select count(*) from brands),
    'by_status', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb)
      from (select coalesce(status,'new') status, count(*) c from brands group by 1) s
    ),
    'industries', (
      select coalesce(jsonb_agg(jsonb_build_object('label', ind, 'n', c) order by c desc), '[]'::jsonb)
      from (select coalesce(nullif(industry,''),'其他') ind, count(*) c from brands group by 1) i
    ),
    'tax_count', (select count(*) from brands where tax_id is not null or registered_name is not null),
    'channel_counts', (
      select coalesce(jsonb_object_agg(channel, c), '{}'::jsonb)
      from (select channel, count(distinct brand_id) c from brand_channels group by 1) ch
    ),
    'line_brands', (select count(distinct brand_id) from brand_channels where channel in ('line','line_id')),
    'opp_total', (select count(*) from opportunities),
    'won_value', (select coalesce(sum(est_annual_value),0) from opportunities where stage='won'),
    'weighted_value', (
      select coalesce(sum(est_annual_value * coalesce(probability,0) / 100.0),0)
      from opportunities where stage not in ('won','lost')
    ),
    'pipeline', (
      select coalesce(jsonb_agg(jsonb_build_object('stage',stage,'n',n,'value',val,'weighted',wt)), '[]'::jsonb)
      from (
        select stage, count(*) n,
               coalesce(sum(est_annual_value),0) val,
               coalesce(sum(est_annual_value * coalesce(probability,0)/100.0),0) wt
        from opportunities where stage not in ('won','lost') group by stage
      ) p
    )
  );
$$;

-- 儀表板快照快取（單列）：讀取時若未過期就直接回，過期才重算存回。
create table if not exists dashboard_cache (
  id int primary key default 1,
  metrics jsonb not null,
  computed_at timestamptz not null default now(),
  constraint dashboard_cache_single check (id = 1)
);
