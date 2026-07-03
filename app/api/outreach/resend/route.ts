import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchEmail } from '@/lib/outreach/dispatchEmail';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/resend  body: { messageId }
 * 重寄一封「失敗/退信」的郵件：
 * - 只允許 failed / bounced 狀態（成功的不能重寄，避免重複轟炸）
 * - 信箱已被黑名單封鎖（硬退信或軟退信達 3 次）→ 擋下並回報原因
 * - 重寄仍走 dispatchEmail：會重新做黑名單檢查、變數替換、追蹤注入與退信分類
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const { messageId } = await req.json().catch(() => ({}));
    if (!messageId) throw new HttpError(400, '缺少 messageId');

    const { data: msg } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, status, to_email')
      .eq('id', String(messageId))
      .single();
    if (!msg) throw new HttpError(404, '找不到這封郵件');
    if (!['failed', 'bounced'].includes(msg.status)) {
      throw new HttpError(400, `此郵件狀態為「${msg.status}」，只有失敗/退信的郵件可以重寄`);
    }

    // 已封鎖的信箱直接擋下，給明確原因
    if (msg.to_email) {
      const { data: bl } = await supabaseAdmin
        .from('email_blacklist')
        .select('reason, bounce_type, fail_count, soft_count, blocked')
        .eq('email', msg.to_email.toLowerCase())
        .eq('blocked', true)
        .maybeSingle();
      if (bl) {
        return NextResponse.json({
          success: false,
          blocked: true,
          error: `此信箱已被封鎖（${bl.bounce_type === 'soft' ? `軟退信累計 ${bl.soft_count} 次` : '硬退信/無效信箱'}），重寄也會失敗。若確認信箱有效，請先到排除名單解除封鎖。`,
        }, { status: 409 });
      }
    }

    const r = await dispatchEmail(String(messageId));
    return NextResponse.json({ success: r.ok, error: r.error || null });
  } catch (err) {
    return errorResponse(err);
  }
}
