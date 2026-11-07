import { NextResponse } from 'next/server';
import { requireCron, errorResponse } from '@/lib/auth';
import { scanBounces } from '@/lib/outreach/scanBounces';
import { notifyLine } from '@/lib/notify/line';

export const runtime = 'nodejs';
export const maxDuration = 300;

// GET /api/cron/scan-bounces — Gmail 沒有退信 webhook，改掃信箱裡的退信信。
// Hobby 方案 cron 上限為「每天一次、最多 2 個」，此路由也可由主排程器或手動觸發。
export async function GET(req: Request) {
  try {
    requireCron(req);
    const r = await scanBounces();
    const lines: string[] = [];
    if (r.hard + r.soft > 0) lines.push(`【退信清理】硬退信 ${r.hard} 封（已永久排除）、軟退信 ${r.soft} 封。`);
    if (r.error) lines.push(`⚠️ 退信掃描中斷：${r.error.slice(0, 80)}`);
    if (r.deferred && r.deferred > 0) lines.push(`ℹ️ 退信通知尚有 ${r.deferred} 封留待下次`);
    if (lines.length) await notifyLine(lines.join('\n'));
    return NextResponse.json({
      scannedBounceMails: r.scanned, hard: r.hard, soft: r.soft, policy: r.policy, ignored: r.ignored,
      ...(r.error ? { error: r.error } : {}),
      ...(r.deferred ? { deferred: r.deferred } : {}),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
