-- 0044 自動跟進防重複：同一條跟進規則對同一封原始信，最多只能建立一封跟進信
-- 用途：cron 改為「把跟進信排入群發活動」後（v3.7.0，lib/outreach/followupCore.ts），
--       若排程被重複觸發或兩次執行重疊，upsert(onConflict: followup_rule_id,parent_message_id, ignoreDuplicates)
--       會靠這個唯一索引直接略過已存在的列，不會對同一位收件人排入兩封。
-- 非 partial 索引：followup_rule_id 或 parent_message_id 任一為 NULL 的一般訊息（群發、手動信）
--       在 Postgres 唯一索引中視為彼此不同，不受影響。
-- 注意：必須先套用本 migration，新版 cron 的 upsert 才能使用 onConflict（否則會回「沒有符合的唯一約束」錯誤）。
create unique index if not exists uq_msg_followup_rule_parent
  on public.outreach_messages (followup_rule_id, parent_message_id);
