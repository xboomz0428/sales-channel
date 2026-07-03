-- ============================================================
-- Migration 0027: 管道補齊冷卻機制
-- brands.last_enriched_at 記錄最近一次採集時間。
-- 批次補齊時預設跳過 7 天內已試過(但仍不完整)的品牌，
-- 避免對「查無結果」的名單反覆空轉浪費時間。
-- ============================================================
ALTER TABLE brands ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_brands_last_enriched ON brands(last_enriched_at);
