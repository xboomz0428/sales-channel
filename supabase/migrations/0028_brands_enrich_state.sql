-- ============================================================
-- Migration 0028: 低價值名單遮蔽（黑名單）機制
-- enrich_state:
--   'active'    正常（預設）
--   'exhausted' 採集過但仍無電話+Email → 自動遮蔽
--   'masked'    手動遮蔽
-- 遮蔽的品牌批次採集直接跳過、清單可選擇隱藏，避免浪費讀取與採集速度。
-- ============================================================
ALTER TABLE brands ADD COLUMN IF NOT EXISTS enrich_state text NOT NULL DEFAULT 'active';
CREATE INDEX IF NOT EXISTS idx_brands_enrich_state ON brands(enrich_state) WHERE enrich_state <> 'active';
