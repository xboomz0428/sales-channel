import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// GET /api/outreach/recipients?q=&industry=&stage=
// 只回有 email 的名單(電子報寄送對象)
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const q = url.searchParams.get('q');
    const industry = url.searchParams.get('industry');
    const stage = url.searchParams.get('stage');

    let query = supabaseAdmin
      .from('brands')
      .select('id, name, industry, email, stage')
      .not('email', 'is', null)
      .order('name', { ascending: true })
      .limit(500);

    if (q) query = query.ilike('name', `%${q}%`);
    if (industry) query = query.eq('industry', industry);
    if (stage) query = query.eq('stage', stage);

    const { data, error } = await query;
    if (error) throw error;

    // 產業清單(給篩選下拉)
    const industries = [...new Set((data || []).map((b: any) => b.industry).filter(Boolean))];

    return NextResponse.json({ recipients: data || [], industries });
  } catch (err) {
    return errorResponse(err);
  }
}
