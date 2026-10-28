-- 0041 訊息認領時間
-- dispatchEmail 原子認領（status 不在 sending/sent/delivered/read/replied 才能進入寄送）時寫入 claimed_at；
-- 每日排程的自癒改以 coalesce(claimed_at, created_at) 超過 15 分鐘判斷「真的卡住」，
-- 不再誤把正在被另一棒寄送中的訊息重設回佇列（驗證者發現的雙寄路徑）。
alter table public.outreach_messages add column if not exists claimed_at timestamptz;
