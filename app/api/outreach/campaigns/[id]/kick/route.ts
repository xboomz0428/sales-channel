import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { kickCampaignDrain } from '@/lib/outreach/drain';
import { remainingDailyBudget } from '@/lib/outreach/throttle';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/campaigns/[id]/kick
 * 「繼續寄送」：觸發此活動的背景寄送（伺服器自我接力），立即返回；進度由清單 API 輪詢。
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;
    const { data: batch } = await supabaseAdmin.from('outreach_batches').select('id').eq('id', id).maybeSingle();
    if (!batch) throw new HttpError(404, '活動不存在');

    const budget = await remainingDailyBudget();
    if (budget <= 0) return NextResponse.json({ kicked: false, reason: 'cap', budget: 0 });

    const origin = new URL(req.url).origin;
    const ok = await kickCampaignDrain(origin, id, 0);
    return NextResponse.json({ kicked: ok, budget });
  } catch (err) {
    return errorResponse(err);
  }
}
