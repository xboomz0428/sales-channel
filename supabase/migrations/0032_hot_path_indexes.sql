-- ============================================================
-- Migration 0032: 熱路徑索引優化
-- 統計層(overview/gaps)、收件名單、語音匯出都在對 brand_channels/stores 做
-- 「WHERE channel=xxx」「WHERE phone/website IS NOT NULL」的 EXISTS/過濾，之前是 seq scan。
-- 實測：brands_overview 由 ~3.0s 降到 ~1.3s（EXISTS 全走 index-only scan）。
-- ============================================================

-- brand_channels：加 (channel, brand_id) 複合索引 → EXISTS(channel='phone'…) 與 email/website 查詢改走索引
CREATE INDEX IF NOT EXISTS idx_brand_channels_channel_brand ON brand_channels(channel, brand_id);
-- 移除失效的舊 partial 索引（channel='EM' 從未命中，實際值是 'email'）
DROP INDEX IF EXISTS idx_brand_channels_email;

-- stores：has_phone / has_web 用的 partial 索引
CREATE INDEX IF NOT EXISTS idx_stores_has_phone ON stores(brand_id) WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE INDEX IF NOT EXISTS idx_stores_has_web ON stores(brand_id) WHERE website IS NOT NULL AND btrim(website) <> '';

-- store_reviews：移除重複索引（保留 idx_store_reviews_store）
DROP INDEX IF EXISTS store_reviews_store_id_idx;
