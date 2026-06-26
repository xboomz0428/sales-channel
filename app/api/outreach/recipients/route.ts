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
 * GET /api/outreach/recipients?q=&industry=&stage=&source=
 * 收件名單：email 串聯採集管道(brand_channels) + 聯絡人(contacts) + 名單(brands.email)
 * 三個來源分開查詢再於 JS 合併，避免任一關聯/RLS 問題讓整份名單變空。
 */
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const industry = url.searchParams.get('industry');
    const stage = url.searchParams.get('stage');
    const source = url.searchParams.get('source');

    // 1) 主名單
    const brands = await fetchAll((from, to) => {
      let query = supabaseAdmin
        .from('brands')
        .select('id, name, industry, status, registered_name, email')
        .order('name', { ascending: true })
        .range(from, to);
      if (q) query = query.ilike('name', `%${q}%`);
      if (industry) query = query.eq('industry', industry);
      if (stage) query = query.eq('status', stage);
      return query;
    });

    const brandIds = brands.map((b: any) => b.id);

    // 2) email 來源（分開查，失敗不影響主名單）
    const chMap = new Map<string, string>();   // brand_id -> 採集 email
    const ctMap = new Map<string, string>();   // brand_id -> 聯絡人 email
    if (brandIds.length > 0) {
      try {
        const chans = await fetchAll((from, to) =>
          supabaseAdmin.from('brand_channels').select('brand_id, channel, value').eq('channel', 'email').range(from, to)
        );
        for (const c of chans) {
          if (!chMap.has(c.brand_id) && isValidEmail(c.value)) chMap.set(c.brand_id, c.value);
        }
      } catch { /* 採集管道讀取失敗 → 略過，仍可用其他來源 */ }
      try {
        const contacts = await fetchAll((from, to) =>
          supabaseAdmin.from('contacts').select('brand_id, email').not('email', 'is', null).range(from, to)
        );
        for (const c of contacts) {
          if (!ctMap.has(c.brand_id) && isValidEmail(c.email)) ctMap.set(c.brand_id, c.email);
        }
      } catch { /* 聯絡人讀取失敗 → 略過 */ }
    }

    // 3) 讀取黑名單（寄送失敗的信箱，排除不寄）+ 手動排除名單
    const blackSet = new Set<string>();
    try {
      // 只排除已封鎖（硬退信、或軟退信達門檻）的信箱
      const { data: bl } = await supabaseAdmin.from('email_blacklist').select('email, blocked');
      for (const b of bl || []) if (b.blocked !== false) blackSet.add(b.email.toLowerCase());
    } catch { /* 黑名單讀取失敗不影響 */ }
    try {
      const { data: ex } = await supabaseAdmin.from('newsletter_exclusions').select('email');
      for (const e of ex || []) blackSet.add(e.email.toLowerCase());
    } catch { /* 排除名單讀取失敗不影響 */ }

    // 4) 合併（優先序：採集 → 聯絡人 → 名單），排除黑名單
    let recipients = brands
      .map((b: any) => {
        const chEmail = chMap.get(b.id);
        const contactEmail = ctMap.get(b.id);
        const email = chEmail || contactEmail || (isValidEmail(b.email) ? b.email : null);
        if (!email || blackSet.has(email.toLowerCase())) return null;
        const src = chEmail ? '採集' : contactEmail ? '聯絡人' : '名單';
        return { id: b.id, name: b.name, industry: b.industry || null, email, stage: b.status || null, registered_name: b.registered_name || null, source: src };
      })
      .filter(Boolean) as any[];

    // 5) 加入手動新增的收件人（持久化在 manual_recipients 表）
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

    // 篩選選項：用「全部品牌」算（不受目前篩選影響），下拉選單才會永遠保有所有類型
    let industries: string[] = [];
    let stages: string[] = [];
    try {
      const allMeta = await fetchAll((from, to) =>
        supabaseAdmin.from('brands').select('industry, status').range(from, to)
      );
      industries = [...new Set(allMeta.map((b: any) => b.industry).filter(Boolean))].sort();
      stages = [...new Set(allMeta.map((b: any) => b.status).filter(Boolean))].sort();
    } catch {
      // 退回用目前名單推算
      industries = [...new Set(recipients.map((r) => r.industry).filter(Boolean))].sort();
      stages = [...new Set(recipients.map((r) => r.stage).filter(Boolean))].sort();
    }
    // 來源為固定四種，永遠完整顯示
    const sources = ['採集', '聯絡人', '名單', '手動'];

    return NextResponse.json({
      recipients,
      industries,
      stages,
      sources,
      total: recipients.length,
      totalBrands: brands.length,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
