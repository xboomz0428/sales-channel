-- ============================================================
-- Migration 0031: 自訂自動化流程
-- 一個 flow = 一串 email 步驟。存檔時每步驟建一個 outreach_templates，
-- 相鄰兩步驟建一條 followup_rules 串接（沿用既有每天 8AM cron 執行引擎）。
-- flow_id 讓我們能重建/刪除整組（改流程時先刪舊的再建新的）。
-- ============================================================
CREATE TABLE IF NOT EXISTS outreach_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE outreach_templates ADD COLUMN IF NOT EXISTS flow_id uuid;
ALTER TABLE outreach_templates ADD COLUMN IF NOT EXISTS flow_step int;
ALTER TABLE followup_rules ADD COLUMN IF NOT EXISTS flow_id uuid;
CREATE INDEX IF NOT EXISTS idx_templates_flow ON outreach_templates(flow_id) WHERE flow_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rules_flow ON followup_rules(flow_id) WHERE flow_id IS NOT NULL;
