-- ============================================================
-- Migration 0021: 政府開放資料匯入 — brands 補欄位
-- Phase 1 來源：禮儀社 / 旅館 / 民宿 / 旅行社 / 中醫診所
-- 匯入後的名單與 Google Places 採集的名單共用同一套 brands/stores，
-- 只多記「資料來源」與少數來源專屬欄位，方便日後做通路 ROI 分析與篩選。
-- ============================================================

ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS data_source  text;   -- 'places' | 'gov:funeral' | 'gov:lodging' | 'gov:travel' | 'gov:tcm' …
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS industry_sub text;   -- 次分類：綜合/甲種旅行社、旅館/民宿、中醫診所…
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS hotel_stars  int;    -- 星級（觀光署 HotelStars，僅評鑑過的旅館有值）
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS hotel_rooms  int;    -- 客房數（規模指標）
ALTER TABLE public.brands ADD COLUMN IF NOT EXISTS hotel_type   text;   -- 觀光旅館/一般旅館/民宿

-- 既有名單視為 Google Places 來源（之前都是這樣進來的）
UPDATE public.brands SET data_source = 'places' WHERE data_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_brands_data_source ON public.brands (data_source);
