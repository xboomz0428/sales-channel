-- ============================================================
-- Migration 0020: 漏斗分析 — 大量資料讀取效能索引
-- 為 brand_funnel_base（0019）的各 CTE join/filter 補上支援索引。
-- brand_id 的 join 索引各表都已有，這裡補的是「過濾條件 / 排序」會用到的。
-- ============================================================

-- brand_channels：Email 子查詢用 channel='EM' 過濾（此表最大、成長最快）
-- 部分索引只收 EM 列，體積小、命中快。
CREATE INDEX IF NOT EXISTS idx_brand_channels_email
  ON public.brand_channels (brand_id)
  WHERE channel = 'EM';

-- stores：地址取每品牌最早一筆 → DISTINCT ON (brand_id) ORDER BY brand_id, created_at
-- 複合索引讓 Postgres 走 index scan 取代大排序。電話聚合也吃得到。
CREATE INDEX IF NOT EXISTS idx_stores_brand_created
  ON public.stores (brand_id, created_at);

-- opportunities：漏斗階段來源，依 (brand_id, stage) 聚合並過濾 stage<>'lost'
-- 目前資料少，但商機建檔後會持續成長，先備好複合索引。
CREATE INDEX IF NOT EXISTS idx_opportunities_brand_stage
  ON public.opportunities (brand_id, stage);
