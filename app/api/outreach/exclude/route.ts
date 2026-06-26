import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

/**
 * GET    /api/outreach/exclude            取得排除名單
 * POST   /api/outreach/exclude            新增排除（body: { items: [{ email, brand_id? }] }）
 * DELETE /api/outreach/exclude            復原（body: { email } 或 { id }）
 */
export async function GET() {
  try {
    const supabase = getSupabaseServerClient();
    const { data } = await supabase
      .from('newsletter_exclusions')
      .select('id, email, brand_id, created_at')
      .order('created_at', { ascending: false });
    return NextResponse.json({ success: true, data: data || [] });
  } catch {
    return NextResponse.json({ success: false, error: '查詢失敗' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    const items: { email?: string; brand_id?: string }[] = Array.isArray(body.items) ? body.items : [];
    const rows = items
      .map((i) => ({ email: (i.email || '').trim().toLowerCase(), brand_id: i.brand_id || null, reason: 'manual_exclude' }))
      .filter((r) => r.email);
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: '沒有可排除的 email' }, { status: 400 });
    }
    // upsert：以 lower(email) 唯一索引避免重複
    const { error } = await supabase
      .from('newsletter_exclusions')
      .upsert(rows, { onConflict: 'email', ignoreDuplicates: true });
    if (error) {
      // 唯一索引在 lower(email) 上，upsert 的 onConflict 可能不適用 → 逐筆 insert 忽略重複
      for (const r of rows) {
        await supabase.from('newsletter_exclusions').insert(r);
      }
    }
    return NextResponse.json({ success: true, count: rows.length });
  } catch {
    return NextResponse.json({ success: false, error: '排除失敗' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const body = await req.json();
    if (body.id) {
      await supabase.from('newsletter_exclusions').delete().eq('id', body.id);
    } else if (body.email) {
      await supabase.from('newsletter_exclusions').delete().ilike('email', String(body.email).trim());
    } else {
      return NextResponse.json({ success: false, error: '缺少 id 或 email' }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, error: '復原失敗' }, { status: 500 });
  }
}
