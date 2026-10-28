-- 0039 群發活動背景寄送鎖
-- 同一活動同時只允許一個背景寄送者（/api/cron/drain-campaign 自我接力）；
-- 鎖帶到期時間，執行被平台中斷時不會永久鎖死。
alter table public.outreach_batches add column if not exists drain_lock_until timestamptz;
