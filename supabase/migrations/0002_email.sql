-- =====================================================================
-- AI 外聯引擎 — Migration 0002:Email 發送工具 + 模板紀錄 + AI 生成
-- 接續 0001。可在 Supabase SQL Editor 直接執行。
-- =====================================================================

-- 1) 名單收件信箱(若既有 brands 已有 email 欄位則略過)----------------
alter table public.brands add column if not exists email text;

-- 2) 模板加上 email 需要的欄位 ---------------------------------------
alter table public.outreach_templates add column if not exists subject text;
alter table public.outreach_templates add column if not exists is_active boolean default true;
alter table public.outreach_templates add column if not exists updated_at timestamptz default now();

-- 3) 訊息連回模板 + 記錄實際寄件位址 ---------------------------------
alter table public.outreach_messages add column if not exists template_id uuid
  references public.outreach_templates(id) on delete set null;
alter table public.outreach_messages add column if not exists to_email text;

-- 4) 模板成效視圖(哪個模板回覆率高)---------------------------------
create or replace view public.v_template_performance as
select
  t.id, t.name, t.channel, t.industry,
  count(m.id)                                          as used,
  count(m.id) filter (where m.status in
    ('sent','delivered','read','replied'))             as sent,
  count(m.id) filter (where m.status = 'replied')      as replied,
  round(100.0 * count(m.id) filter (where m.status = 'replied')
    / nullif(count(m.id) filter (where m.status in
      ('sent','delivered','read','replied')), 0), 1)   as reply_rate
from public.outreach_templates t
left join public.outreach_messages m on m.template_id = t.id
group by t.id, t.name, t.channel, t.industry
order by reply_rate desc nulls last;

-- 5) 起手 email 模板(HeroHerb 各產業,供 AI 個人化的母版)-----------
insert into public.outreach_templates (name, channel, industry, product_focus, subject, body)
values
  ('禮儀業-淨化包-初次', 'EM', '禮儀', '艾草淨化包',
   '為禮廳與家屬準備的一份體面安心',
   E'您好,我是 HeroHerb 好漢草的{{我方稱呼}}。\n注意到貴公司在{{在地/服務}}的用心,想分享我們的艾草淨化包——以台灣製造、PLA 環保包裝,協助營造莊重、安定的場域氛圍,讓家屬感到踏實。\n若方便,想寄一份樣品給您參考,不知如何稱呼與寄送?\n敬祝順心。'),
  ('宮廟-淨化包-初次', 'EM', '宮廟', '艾草淨化包',
   '一份適合廟埕與信眾的艾草淨化心意',
   E'主委/師兄姐您好,我是 HeroHerb 好漢草。\n貴宮香火鼎盛,想與您分享我們的艾草淨化包,結合傳統艾草與現代環保包裝,適合作為結緣品或場域使用。\n可否寄一份樣品供您過目?期待有機會結緣。'),
  ('養生館-足浴/噴霧-初次', 'EM', '養生館', '足浴包、噴霧',
   '提升客人體驗的草本加值方案',
   E'您好,我是 HeroHerb 好漢草。\n想與貴館分享我們的草本足浴包與空間噴霧,協助提升顧客的放鬆體驗與空間質感,適合作為療程加值或自有商品。\n方便的話想寄樣品請您體驗,期待交流。')
on conflict do nothing;
