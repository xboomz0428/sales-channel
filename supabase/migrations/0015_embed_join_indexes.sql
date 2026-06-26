-- 嵌入查詢的關聯鍵索引（原本缺，導致 /api/brands 深層嵌入慢）
-- store_reviews 1 萬筆、依 store_id 關聯 stores
create index if not exists idx_store_reviews_store on store_reviews (store_id);
-- gov_records 依 matched_brand_id 關聯 brands（且常篩 match_confidence）
create index if not exists idx_gov_records_matched_brand on gov_records (matched_brand_id);
create index if not exists idx_gov_records_matched_conf on gov_records (matched_brand_id, match_confidence);
