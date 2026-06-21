import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// GET /api/outreach/recipients?q=&industry=&stage=
// 回有 email 的名單：從 brand_channels(channel=email) 或 brands.email 取得
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const industry = url.searchParams.get('industry');
    const stage = url.searchParams.get('stage');

    // email 來自採集到的 brand_channels（channel='email'），不依賴 brands.email 欄位
    let query = supabaseAdmin
      .from('brands')
      .select('id, name, industry, status, registered_name, brand_channels(channel, value)')
      .order('name', { ascending: true })
      .limit(5000);

    if (q) query = query.ilike('name', `%${q}%`);
    if (industry) query = query.eq('industry', industry);
    if (stage) query = query.eq('status', stage);

    const { data, error } = await query;
    if (error) throw error;

    // 排除爬蟲誤抓的系統/追蹤信箱（Sentry DSN、no-reply、圖檔等）
    const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$|sentry-next/i;
    const isValidEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);

    const recipients = (data || [])
      .map((b: any) => {
        const email = (b.brand_channels || []).find((c: any) => c.channel === 'email' && isValidEmail(c.value))?.value || null;
        return email ? { id: b.id, name: b.name, industry: b.industry, email, stage: b.status, registered_name: b.registered_name } : null;
      })
      .filter(Boolean);

    const industries = [...new Set(recipients.map((r: any) => r.industry).filter(Boolean))];

    return NextResponse.json({ recipients, industries });
  } catch (err) {
    return errorResponse(err);
  }
}
