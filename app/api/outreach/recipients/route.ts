import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// 排除爬蟲誤抓的系統/追蹤信箱（Sentry DSN、no-reply、圖檔等）
const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$|sentry-next/i;
const isValidEmail = (e: string | null | undefined): e is string =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);

// 分頁取回全部（避開 PostgREST 1000 筆上限）
async function fetchAll(build: (from: number, to: number) => any) {
  const PAGE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * GET /api/outreach/recipients?q=&industry=&industries=&stage=&source=&country=
 * 收件名單：email 串聯採集管道(brand_channels) + 聯絡人(contacts) + 名單(brands.email)
 *
 * 效能設計：名單已達 5.8 萬筆，「先抓全部品牌再挑有 Email 的」會分頁掃全表(~60 請求)。
 * 改為反向：先收集「有 Email 的 brand_id」(採集管道/聯絡人/brands.email，各只有幾千筆)，
 * 再依 id 分塊套用篩選撈品牌。名單總數改用 head count；產業/階段選項用 brands_overview(有快取)。
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

    // 1) Email 來源（都是小表：只抓有 email 的列）— 三來源並行查
    const chMap = new Map<string, string>();   // brand_id -> 採集 email
    const ctMap = new Map<string, string>();   // brand_id -> 聯絡人 email
    const bMap = new Map<string, string>();    // brand_id -> brands.email
    await Promise.allSettled([
      (async () => {
        const chans = await fetchAll((from, to) =>
          supabaseAdmin.from('brand_channels').select('brand_id, value').eq('channel', 'email').range(from, to)
        );
        for (const c of chans) if (!chMap.has(c.brand_id) && isValidEmail(c.value)) chMap.set(c.brand_id, c.value);
      })(),
      (async () => {
        const contacts = await fetchAll((from, to) =>
          supabaseAdmin.from('contacts').select('brand_id, email').not('email', 'is', null).range(from, to)
        );
        for (const c of contacts) if (!ctMap.has(c.brand_id) && isValidEmail(c.email)) ctMap.set(c.brand_id, c.email);
      })(),
      (async () => {
        const withEmail = await fetchAll((from, to) =>
          supabaseAdmin.from('brands').select('id, email').eq('country', country).not('email', 'is', null).range(from, to)
        );
        for (const b of withEmail) if (isValidEmail(b.email)) bMap.set(b.id, b.email);
      })(),
    ]); // 任一來源失敗 → 略過，仍可用其他來源

    // 2) 候選品牌 = 任一來源有 Email 者；依 id 分塊撈品牌並套用篩選
    const candidateIds = [...new Set([...chMap.keys(), ...ctMap.keys(), ...bMap.keys()])];
    const brandById = new Map<string, any>();
    // .in() 的 id 會展開在 URL 上，一塊太大會超過 URL 長度上限 → 100 個一塊、並行查
    const CHUNK = 100;
    const chunks: string[][] = [];
    for (let i = 0; i < candidateIds.length; i += CHUNK) chunks.push(candidateIds.slice(i, i + CHUNK));
    const chunkResults = await Promise.all(chunks.map((ids) => {
      let query = supabaseAdmin
        .from('brands')
        .select('id, name, industry, status, registered_name')
        .eq('country', country)
        .in('id', ids);
      if (q) query = query.ilike('name', `%${q}%`);
      if (industriesParam.length > 0) query = query.in('industry', industriesParam);
      else if (industry) query = query.eq('industry', industry);
      if (stage) query = query.eq('status', stage);
      return query;
    }));
    for (const r of chunkResults) {
      if (r.error) throw r.error;
      for (const b of r.data || []) brandById.set(b.id, b);
    }
    const brands = [...brandById.values()].sort((a, z) => String(a.name).localeCompare(String(z.name), 'zh-TW'));

    // 3) 名單總數（符合篩選的全部品牌，不限有無 Email）：head count，不抓資料列
    let totalBrands = 0;
    try {
      let cq = supabaseAdmin.from('brands').select('id', { count: 'exact', head: true }).eq('country', country);
      if (q) cq = cq.ilike('name', `%${q}%`);
      if (industriesParam.length > 0) cq = cq.in('industry', industriesParam);
      else if (industry) cq = cq.eq('industry', industry);
      if (stage) cq = cq.eq('status', stage);
      const { count } = await cq;
      totalBrands = count ?? 0;
    } catch { totalBrands = brands.length; }

    // 4) 讀取黑名單（寄送失敗的信箱，排除不寄）+ 手動排除名單
    const blackSet = new Set<string>();
    try {
      const { data: bl } = await supabaseAdmin.from('email_blacklist').select('email, blocked');
      for (const b of bl || []) if (b.blocked !== false) blackSet.add(b.email.toLowerCase());
    } catch { /* 黑名單讀取失敗不影響 */ }
    try {
      const { data: ex } = await supabaseAdmin.from('newsletter_exclusions').select('email');
      for (const e of ex || []) blackSet.add(e.email.toLowerCase());
    } catch { /* 排除名單讀取失敗不影響 */ }

    // 5) 合併（優先序：採集 → 聯絡人 → 名單），排除黑名單
    let recipients = brands
      .map((b: any) => {
        const chEmail = chMap.get(b.id);
        const contactEmail = ctMap.get(b.id);
        const email = chEmail || contactEmail || bMap.get(b.id) || null;
        if (!email || blackSet.has(email.toLowerCase())) return null;
        const src = chEmail ? '採集' : contactEmail ? '聯絡人' : '名單';
        return { id: b.id, name: b.name, industry: b.industry || null, email, stage: b.status || null, registered_name: b.registered_name || null, source: src };
      })
      .filter(Boolean) as any[];

    // 6) 加入手動新增的收件人（持久化在 manual_recipients 表）
    try {
      const { data: manual } = await supabaseAdmin
        .from('manual_recipients')
        .select('id, name, email')
        .eq('is_active', true);
      for (const m of manual || []) {
        if (!blackSet.has(m.email.toLowerCase()) && !recipients.some((r: any) => r.email === m.email)) {
          recipients.push({ id: `manual_${m.id}`, name: m.name || m.email, industry: null, email: m.email, stage: null, registered_name: null, source: '手動' });
        }
      }
    } catch { /* 手動名單讀取失敗不影響 */ }

    if (source) recipients = recipients.filter((r) => r.source === source);

    // 7) 篩選選項：跨全部名單的完整清單。用 brands_overview RPC（帶 30s timeout、server 端有快取），
    //    不再全表掃 5.8 萬筆；失敗退回從目前名單推算。
    let industries: string[] = [];
    let stages: string[] = [];
    try {
      const { data: ov } = await supabaseAdmin.rpc('brands_overview_rows', { p_country: country });
      industries = ([...new Set((ov || []).map((r: any) => String(r.industry || '')).filter(Boolean))] as string[]).sort((a, z) => a.localeCompare(z, 'zh-TW'));
    } catch { /* 退回下方 */ }
    if (industries.length === 0) industries = [...new Set(recipients.map((r) => r.industry).filter(Boolean))].sort() as string[];
    // 階段是固定的銷售流程，直接給完整清單（與前端 STAGE_LABEL 一致），不再抽樣查詢
    stages = ['new', 'contacted', 'sampling', 'quoting', 'negotiating', 'won', 'lost'];
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
