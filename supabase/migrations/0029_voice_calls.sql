-- ============================================================
-- Migration 0029: AI 語音外撥橋接（平台無關）
-- voice_calls：一次通話的結果（狀態/成效/逐字稿/錄音/秒數），
--   可由語音 AI 平台(Bland/Retell/Vapi…) webhook 或 CSV 匯入寫入。
-- phone_dnc：拒撥名單（Do-Not-Call）。外撥名單匯出時排除；
--   通話結果為「拒撥(do_not_call)」時自動加入。
-- ============================================================
CREATE TABLE IF NOT EXISTS voice_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  phone text NOT NULL,
  brand_name text,
  campaign text,
  status text NOT NULL DEFAULT 'completed',   -- completed/no_answer/voicemail/busy/failed
  outcome text,                                -- interested/not_interested/callback/do_not_call/wrong_number/unknown
  transcript text,
  recording_url text,
  duration_sec int,
  notes text,
  called_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_calls_brand ON voice_calls(brand_id);
CREATE INDEX IF NOT EXISTS idx_voice_calls_called_at ON voice_calls(called_at DESC);

CREATE TABLE IF NOT EXISTS phone_dnc (
  phone text PRIMARY KEY,
  brand_id uuid,
  reason text,
  created_at timestamptz DEFAULT now()
);
