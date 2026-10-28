-- 0038 email_campaigns 授權 anon
-- 後端 supabaseAdmin 即全站共用的 anon-優先 client（v3.3.1 統一），正式站亦同；
-- 比照 brands_overview_rows / dashboard_metrics 慣例授權 anon，安全由 API 層 requireUser 把關。
-- （0036/0037 的 revoke anon 在此覆蓋）
grant execute on function public.email_campaigns(integer, uuid) to anon, authenticated, service_role;
