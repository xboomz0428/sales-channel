import { NextResponse } from 'next/server';
import { requireCron, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { listMessages, getMessageText } from '@/lib/channels/gmail';
import { classifyBounce, addToBlacklist } from '@/lib/outreach/blacklist';
import { notifyLine } from '@/lib/notify/line';

export const runtime = 'nodejs';

// GET /api/cron/scan-bounces — Gmail 沒有退信 webhook,改掃信箱裡的退信信。
// vercel.json 可加:{ "path": "/api/cron/scan-bounces", "schedule": "30 */6 * * *" }
export async function GET(req: Request) {
  try {
    requireCron(req);

    // 近 3 天已寄出、尚未標記退信的 email 訊息
    const since = new Date(Date.now() - 3 * 86400_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, to_email')
      .eq('channel', 'EM')
      .eq('status', 'sent')
      .gte('created_at', since)
      .not('to_email', 'is', null);

    if (!recent || recent.length === 0) {
      return NextResponse.json({ scanned: 0, bounced: 0 });
    }

    // 掃退信信(來自 mailer-daemon / postmaster)
    const ids = await listMessages(
      'from:(mailer-daemon OR postmaster) newer_than:3d',
      50
    );

    let hard = 0, soft = 0, ignored = 0;
    for (const id of ids) {
      const text = (await getMessageText(id));
      const lower = text.toLowerCase();
      for (const m of recent) {
        const email = (m.to_email || '').toLowerCase();
        if (!email || !lower.includes(email)) continue;

        const kind = classifyBounce(text);
        if (kind === 'none') { ignored++; continue; } // 純延遲通知，不算退信

        const { data: upd } = await supabaseAdmin
          .from('outreach_messages')
          .update({ status: 'bounced', error_detail: `${kind === 'hard' ? '硬退信（信箱不存在）' : '軟退信（暫時性）'}` })
          .eq('id', m.id)
          .eq('status', 'sent')
          .select('id');
        if (upd && upd.length) {
          // 硬退信永久封鎖；軟退信累計到門檻才封鎖
          await addToBlacklist(email, kind === 'hard' ? 'hard' : 'soft', kind === 'hard' ? '硬退信' : '軟退信');
          kind === 'hard' ? hard++ : soft++;
        }
      }
    }

    if (hard + soft > 0) {
      await notifyLine(`【退信清理】硬退信 ${hard} 封（已永久排除）、軟退信 ${soft} 封。`);
    }

    return NextResponse.json({ scannedBounceMails: ids.length, candidates: recent.length, hard, soft, ignored });
  } catch (err) {
    return errorResponse(err);
  }
}
