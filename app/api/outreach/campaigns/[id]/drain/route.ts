import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchEmail } from '@/lib/outreach/dispatchEmail';
import { remainingDailyBudget } from '@/lib/outreach/throttle';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/outreach/campaigns/[id]/drain   body: { n?: number }
 * 從此活動的佇列取最早的 n 封（預設 10、上限 50），在「今日剩餘額度」內逐封寄出。
 * 回傳本段結果與剩餘佇列數；呼叫端重複呼叫直到 remainingQueued=0 或 capReached。
 * 每段 ≤ 50 封 × ~10 秒，遠低於 300 秒上限；就算被中斷，未寄的仍在佇列。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const n = Math.min(50, Math.max(1, parseInt(String(body?.n ?? 10), 10) || 10));

    const { data: batch } = await supabaseAdmin
      .from('outreach_batches')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();
    if (!batch) throw new HttpError(404, '活動不存在');

    const budget = await remainingDailyBudget();
    const take = Math.min(n, budget);

    const countQueued = async () => {
      const { count } = await supabaseAdmin
        .from('outreach_messages')
        .select('id', { count: 'exact', head: true })
        .eq('batch_id', id)
        .eq('status', 'queued');
      return count || 0;
    };

    if (take <= 0) {
      const remaining = await countQueued();
      return NextResponse.json({ sent: 0, failed: 0, remainingQueued: remaining, budgetLeft: 0, capReached: remaining > 0 });
    }

    const { data: q } = await supabaseAdmin
      .from('outreach_messages')
      .select('id')
      .eq('batch_id', id)
      .eq('status', 'queued')
      .order('created_at', { ascending: true })
      .limit(take);

    let sent = 0, failed = 0;
    for (const m of q || []) {
      const r = await dispatchEmail(m.id);
      if (r.ok) sent++; else failed++;
    }

    const remaining = await countQueued();
    const budgetLeft = Math.max(0, budget - (sent + failed));
    if (remaining === 0) {
      await supabaseAdmin
        .from('outreach_batches')
        .update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', id);
    }

    return NextResponse.json({ sent, failed, remainingQueued: remaining, budgetLeft, capReached: budgetLeft <= 0 && remaining > 0 });
  } catch (err) {
    return errorResponse(err);
  }
}
