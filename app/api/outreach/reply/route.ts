import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, replySchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { applyDelta, UPGRADE_THRESHOLD } from '@/lib/outreach/scoring';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireUser();
    const { brandId, channel, body } = await parseBody(req, replySchema);

    // 記錄 inbound 訊息
    await supabaseAdmin.from('outreach_messages').insert({
      brand_id: brandId,
      channel,
      direction: 'in',
      status: 'replied',
      body,
    });

    // 加熱度
    const { data: brand, error } = await supabaseAdmin
      .from('brands')
      .select('engagement_score')
      .eq('id', brandId)
      .single();
    if (error || !brand) throw new HttpError(404, '找不到名單');

    const score = applyDelta(brand.engagement_score || 0, 'replied');
    await supabaseAdmin.from('brands').update({ engagement_score: score }).eq('id', brandId);

    // 已回覆 → 暫停該名單所有活躍序列(避免持續打擾)
    await supabaseAdmin
      .from('outreach_enrollments')
      .update({ status: 'replied' })
      .eq('brand_id', brandId)
      .eq('status', 'active');

    return NextResponse.json({
      engagementScore: score,
      suggestUpgradeToOpportunity: score >= UPGRADE_THRESHOLD,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
