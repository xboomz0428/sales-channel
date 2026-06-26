import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, newsletterSendSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { runSendBatch } from '@/lib/outreach/runSend';
import { remainingDailyBudget } from '@/lib/outreach/throttle';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await parseBody(req, newsletterSendSchema);
    const templateId = body.templateId as string;
    const brandIds: string[] = Array.isArray(body.brandIds) ? body.brandIds : [];
    const manualEmails: { name: string; email: string }[] = Array.isArray(body.manualEmails) ? body.manualEmails : [];
    const skipDuplicates = body.skipDuplicates !== false;

    if (brandIds.length === 0 && manualEmails.length === 0) {
      throw new HttpError(400, '至少提供 brandIds 或 manualEmails');
    }

    const totalCount = brandIds.length + manualEmails.length;

    // 建立批次
    const { data: batch } = await supabaseAdmin
      .from('outreach_batches')
      .insert({ name: 'newsletter', channel: 'EM', total: totalCount, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single();
    const batchId = batch?.id;

    // ③ 節流：本次最多寄出「今日剩餘額度」封，超出留 queued 由 cron 補寄
    const budget = await remainingDailyBudget();

    const r = await runSendBatch({
      templateId,
      brandIds,
      manualEmails,
      skipDuplicates,
      budget,
      batchId,
    });

    if (r.total === 0 && r.skipped > 0) {
      // 全部都是重複
      if (batchId) await supabaseAdmin.from('outreach_batches').update({ status: 'done', finished_at: new Date().toISOString() }).eq('id', batchId);
      return NextResponse.json({ batchId, total: 0, sent: 0, failed: 0, queued: 0, skipped: r.skipped });
    }

    if (batchId) {
      await supabaseAdmin
        .from('outreach_batches')
        .update({
          sent: r.sent,
          failed: r.failed,
          total: totalCount,
          status: r.queued ? 'paused' : 'done',
          finished_at: r.queued ? null : new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    return NextResponse.json({ batchId, total: r.total, sent: r.sent, failed: r.failed, queued: r.queued, skipped: r.skipped });
  } catch (err) {
    return errorResponse(err);
  }
}
