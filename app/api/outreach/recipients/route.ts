import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// 排除爬蟲誤抓的系統/追蹤信箱（Sentry DSN、no-reply、圖檔等）
const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$|sentry-next/i;
const isValidEmail = (e: string | null | undefined): e is string =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);
const firstValid = (arr: unknown): string | null => {
  if (!Array.isArray(arr)) return null;
  for (const e of arr) if (isValidEmail(e)) return e;
  return null;
};

type CandidateRow = {
  id: string; name: string; industry: string | null; stage: string | null; registered_name: string | null;
  brand_email: string | null; channel_emails: string[] | null; contact_emails: string[] | null;
};
// 分頁取回整張小表（固定排序，避免跨頁漏列／重複）；失敗回空陣列並帶 error
async function fetchAllRows(table: string, columns: string, orderBy: string): Promise<{ data: any[]; error: unknown }> {
  const PAGE = 1000;
  const all: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin.from(table).select(columns).order(orderBy, { ascending: true }).range(from, from + PAGE - 1);
    if (error) return { data: all, error };
    if (!data || data.length === 0) break;
    all.push(...(data as any[]));
    if (data.length < PAGE) break;
  }
  return { data: all, error: null };
}

type Recipient = { id: string; name: string; industry: string | null; email: string; stage: string | null; registered_name: string | null; source: string };

/**
 * GET /api/outreach/recipients?q=&industry=&industries=&stage=&source=&country=
 * 收件名單：email 串聯採集管道(brand_channels) + 聯絡人(contacts) + 名單(brands.email)
 *
 * 效能設計（v3.6.5）：名單 7.8 萬筆、有 Email 的約 6 千筆。
 * 舊版先把三個 Email 來源全部抓回 Node，再把幾千個 brand_id 每 100 個一塊查品牌（30 多次請求、2～3 秒）；
 * 現在由 RPC email_recipient_candidates（migration 0043）在資料庫端一次把「任一來源有 Email 的品牌」套篩選回傳，
 * 每個品牌帶 Email 候選陣列（依建立順序），這裡取第一個合法者——優先序與合法性規則與舊版相同。
 * 名單總數 head count、黑名單、排除名單、手動名單、產業選項全部並行查，整體一輪往返。
 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const industry = url.searchParams.get('industry');
    const industriesParam = (url.searchParams.get('industries') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const stage = url.searchParams.get('stage');
    const source = url.searchParams.get('source');
    const country = url.searchParams.get('country') || 'TW';

    // 2) 名單總數（符合篩選的全部品牌，不限有無 Email）：head count，不抓資料列
    let countQuery = supabaseAdmin.from('brands').select('id', { count: 'exact', head: true }).eq('country', country);
    if (q) countQuery = countQuery.ilike('name', '%' + q + '%');
    if (industriesParam.length > 0) countQuery = countQuery.in('industry', industriesParam);
    else if (industry) countQuery = countQuery.eq('industry', industry);
    if (stage) countQuery = countQuery.eq('status', stage);

    const [candRes, countRes, blRes, exRes, manualRes, ovRes] = await Promise.all([
      // 1) 候選品牌（任一來源有 Email，已套篩選）
      supabaseAdmin.rpc('email_recipient_candidates', {
        p_country: country,
        p_industries: industriesParam.length > 0 ? industriesParam : null,
        p_industry: industriesParam.length > 0 ? null : (industry || null),
        p_stage: stage || null,
        p_q: q || null,
      }),
      countQuery,
      // 3) 黑名單（寄送失敗的信箱）+ 手動排除名單——都要分頁：PostgREST 單次最多 1000 列，排除名單已近千筆，
      //    一旦截斷，被排除的信箱就會重新出現在名單上
      fetchAllRows('email_blacklist', 'email, blocked', 'email'),
      fetchAllRows('newsletter_exclusions', 'email', 'id'),
      // 4) 手動新增的收件人
      supabaseAdmin.from('manual_recipients').select('id, name, email').eq('is_active', true),
      // 5) 產業選項：RPC industry_counts（0043，一次 group by 約 40ms）。
      //    舊版用 brands_overview_rows，實測單次 3～4 秒，是名單 API 第二大的耗時來源
      supabaseAdmin.rpc('industry_counts'),
    ]);
    if (candRes.error) throw candRes.error;

    const blackSet = new Set<string>();
    for (const b of (blRes.data || []) as { email: string; blocked: boolean | null }[]) if (b.blocked !== false) blackSet.add(b.email.toLowerCase());
    for (const e of (exRes.data || []) as { email: string }[]) blackSet.add(e.email.toLowerCase());

    // 合併（優先序：採集 → 聯絡人 → 名單），排除黑名單
    let recipients: Recipient[] = [];
    for (const b of (candRes.data || []) as CandidateRow[]) {
      const chEmail = firstValid(b.channel_emails);
      const contactEmail = firstValid(b.contact_emails);
      const email = chEmail || contactEmail || (isValidEmail(b.brand_email) ? b.brand_email : null);
      if (!email || blackSet.has(email.toLowerCase())) continue;
      const src = chEmail ? '採集' : contactEmail ? '聯絡人' : '名單';
      recipients.push({ id: b.id, name: b.name, industry: b.industry || null, email, stage: b.stage || null, registered_name: b.registered_name || null, source: src });
    }
    recipients.sort((a, z) => String(a.name).localeCompare(String(z.name), 'zh-TW'));

    const totalBrands = countRes.error ? recipients.length : (countRes.count ?? 0);

    // 6) 手動收件人（持久化在 manual_recipients 表）
    const seen = new Set(recipients.map((r) => r.email));
    for (const m of (manualRes.data || []) as { id: string; name: string | null; email: string }[]) {
      if (!blackSet.has(m.email.toLowerCase()) && !seen.has(m.email)) {
        seen.add(m.email);
        recipients.push({ id: 'manual_' + m.id, name: m.name || m.email, industry: null, email: m.email, stage: null, registered_name: null, source: '手動' });
      }
    }

    if (source) recipients = recipients.filter((r) => r.source === source);

    // 7) 篩選選項：跨全部名單的完整清單；RPC 失敗退回從目前名單推算
    let industries: string[] = [];
    if (!ovRes.error) {
      industries = ([...new Set(((ovRes.data || []) as { industry: string | null }[]).map((r) => String(r.industry || '')).filter(Boolean))] as string[]).sort((a, z) => a.localeCompare(z, 'zh-TW'));
    }
    if (industries.length === 0) industries = [...new Set(recipients.map((r) => r.industry).filter(Boolean))].sort() as string[];
    // 階段是固定的銷售流程，直接給完整清單（與前端 STAGE_LABEL 一致）
    const stages = ['new', 'contacted', 'sampling', 'quoting', 'negotiating', 'won', 'lost'];
    // 來源為固定四種，永遠完整顯示
    const sources = ['採集', '聯絡人', '名單', '手動'];

    return NextResponse.json({
      recipients,
      industries,
      stages,
      sources,
      total: recipients.length,
      totalBrands,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
