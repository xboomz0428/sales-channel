import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// GET /api/outreach/email-dashboard
export async function GET() {
  try {
    await requireUser();

    // 近 14 日每日成效(來自視圖)
    const { data: daily } = await supabaseAdmin
      .from('v_email_send_stats')
      .select('*')
      .limit(14);

    // 彙總卡片
    const totals = (daily || []).reduce(
      (a: any, d: any) => ({
        sent: a.sent + (d.sent || 0),
        failed: a.failed + (d.failed || 0),
        bounced: a.bounced + (d.bounced || 0),
        opened: a.opened + (d.opened || 0),
        clicked: a.clicked + (d.clicked || 0),
        replied: a.replied + (d.replied || 0),
      }),
      { sent: 0, failed: 0, bounced: 0, opened: 0, clicked: 0, replied: 0 }
    );
    totals.openRate = totals.sent ? Math.round((totals.opened / totals.sent) * 1000) / 10 : 0;
    totals.clickRate = totals.sent ? Math.round((totals.clicked / totals.sent) * 1000) / 10 : 0;

    // 最近寄送明細(含內容)
    const { data: messages } = await supabaseAdmin
      .from('outreach_messages')
      .select(
        'id, to_email, subject, body, body_html, status, open_count, click_count, sent_at, error_detail, brands(name)'
      )
      .eq('channel', 'EM')
      .eq('direction', 'out')
      .order('created_at', { ascending: false })
      .limit(100);

    return NextResponse.json({ totals, daily, messages });
  } catch (err) {
    return errorResponse(err);
  }
}
