-- ============================================================
-- Migration 0030: 語音通話來源平台 + 外部通話 ID
-- webhook 串接時，平台可能重送同一通話 → 以 (provider, external_id) 去重，避免重複紀錄。
-- ============================================================
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE voice_calls ADD COLUMN IF NOT EXISTS external_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_calls_external ON voice_calls(provider, external_id) WHERE external_id IS NOT NULL;
