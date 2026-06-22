-- =====================================================================
-- 郵件編輯器富文字 — Migration 0005
-- 模板區塊結構保存 + 夾帶檔案/圖片的儲存 bucket
-- =====================================================================

-- 1) 模板保存完整區塊格式（字級/顏色/對齊/超連結/檔案）以利重新編輯
alter table public.outreach_templates add column if not exists blocks_json text;

-- 2) 郵件素材公開儲存桶（圖片、夾帶檔案；上限 10MB）
insert into storage.buckets (id, name, public, file_size_limit)
values ('email-assets', 'email-assets', true, 10485760)
on conflict (id) do update set public = true, file_size_limit = 10485760;

-- 3) 儲存桶存取政策（開放式，與專案其餘資料表一致；以 anon key 上傳）
do $$ begin
  create policy "email_assets_insert" on storage.objects for insert with check (bucket_id = 'email-assets');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "email_assets_select" on storage.objects for select using (bucket_id = 'email-assets');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "email_assets_update" on storage.objects for update using (bucket_id = 'email-assets') with check (bucket_id = 'email-assets');
exception when duplicate_object then null; end $$;
