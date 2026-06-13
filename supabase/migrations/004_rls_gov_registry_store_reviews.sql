ALTER TABLE public.gov_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_all_access" ON public.gov_registry FOR ALL USING (true);

ALTER TABLE public.store_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dev_all_access" ON public.store_reviews FOR ALL USING (true);
