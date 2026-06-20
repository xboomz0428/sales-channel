import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// GET /api/track/click/[lid] — 記錄點擊後 302 轉回原網址。
// 以 DB 內的 link id 查回 url(非由 query 帶 url),因此沒有 open redirect 風險。
export async function GET(req: Request, { params }: { params: Promise<{ lid: string }> }) {
  const { lid } = await params;
  const fallback = process.env.APP_BASE_URL || '/';
  try {
    const { data: link } = await supabaseAdmin
      .from('email_links')
      .select('id, url, message_id, click_count')
      .eq('id', lid)
      .single();

    if (!link || !/^https?:\/\//i.test(link.url)) {
      return NextResponse.redirect(fallback, 302);
    }

    // 連結 + 訊息點擊數 +1,並記事件
    await supabaseAdmin
      .from('email_links')
      .update({ click_count: (link.click_count || 0) + 1 })
      .eq('id', link.id);

    const { data: msg } = await supabaseAdmin
      .from('outreach_messages')
      .select('click_count')
      .eq('id', link.message_id)
      .single();
    await supabaseAdmin
      .from('outreach_messages')
      .update({ click_count: (msg?.click_count || 0) + 1 })
      .eq('id', link.message_id);

    await supabaseAdmin.from('email_events').insert({
      message_id: link.message_id,
      type: 'click',
      link_id: link.id,
      ip: req.headers.get('x-forwarded-for'),
      ua: req.headers.get('user-agent'),
    });

    return NextResponse.redirect(link.url, 302);
  } catch {
    return NextResponse.redirect(fallback, 302);
  }
}
