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

    // 最近寄送明細(含內容、產業)
    const { data: messages } = await supabaseAdmin
      .from('outreach_messages')
      .select(
        'id, to_email, subject, body, body_html, status, open_count, click_count, sent_at, error_detail, template_id, brands(name, industry)'
      )
      .eq('channel', 'EM')
      .eq('direction', 'out')
      .order('created_at', { ascending: false })
      .limit(2000);

    const SENT_STATUSES = new Set(['sent', 'delivered', 'read', 'replied']);
    type Agg = { sent: number; opened: number; clicked: number; replied: number; failed: number };
    const blank = (): Agg => ({ sent: 0, opened: 0, clicked: 0, replied: 0, failed: 0 });
    const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

    // 依產業分群分析
    const indMap: Record<string, Agg> = {};
    // 依模板分群分析
    const tplMap: Record<string, Agg> = {};
    for (const m of (messages || []) as any[]) {
      const isSent = SENT_STATUSES.has(m.status);
      const ind = m.brands?.industry || '未分類';
      const tpl = m.template_id || '_none';
      for (const [map, key] of [[indMap, ind], [tplMap, tpl]] as const) {
        if (!map[key]) map[key] = blank();
        if (isSent) map[key].sent++;
        if (m.open_count > 0) map[key].opened++;
        if (m.click_count > 0) map[key].clicked++;
        if (m.status === 'replied') map[key].replied++;
        if (m.status === 'failed' || m.status === 'bounced') map[key].failed++;
      }
    }

    // 模板名稱對照
    const { data: tplRows } = await supabaseAdmin
      .from('outreach_templates')
      .select('id, name');
    const tplName = new Map((tplRows || []).map((t: any) => [t.id, t.name]));

    const byIndustry = Object.entries(indMap)
      .map(([industry, a]) => ({ industry, ...a, openRate: rate(a.opened, a.sent), clickRate: rate(a.clicked, a.sent), replyRate: rate(a.replied, a.sent) }))
      .sort((x, y) => y.sent - x.sent);
    const byTemplate = Object.entries(tplMap)
      .map(([id, a]) => ({ template: id === '_none' ? '（無模板）' : (tplName.get(id) || '已刪除模板'), ...a, openRate: rate(a.opened, a.sent), clickRate: rate(a.clicked, a.sent), replyRate: rate(a.replied, a.sent) }))
      .sort((x, y) => y.sent - x.sent);

    // 漏斗（總體）
    const funnel = {
      sent: totals.sent,
      opened: totals.opened,
      clicked: totals.clicked,
      replied: totals.replied,
    };

    return NextResponse.json({ totals, daily, messages: (messages || []).slice(0, 100), byIndustry, byTemplate, funnel });
  } catch (err) {
    return errorResponse(err);
  }
}
