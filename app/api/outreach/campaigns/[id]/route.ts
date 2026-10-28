import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

/**
 * GET /api/outreach/campaigns/[id]
 * 單一活動：統計 + 全部寄送明細（輕量，不含內容）+ 被排除重複的名單
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireUser();
    const { id } = await params;

    const { data: rows, error } = await supabaseAdmin.rpc('email_campaigns', { p_limit: 1, p_id: id });
    if (error) throw new HttpError(500, error.message);
    const campaign = (rows || [])[0];
    if (!campaign) throw new HttpError(404, '活動不存在');

    // 明細（輕量欄位；一個活動最多幾千筆，分頁取回避開 1000 筆上限）
    const messages: any[] = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data } = await supabaseAdmin
        .from('outreach_messages')
        .select('id, to_email, subject, status, open_count, click_count, sent_at, error_detail, brands(name, industry)')
        .eq('batch_id', id)
        .order('created_at', { ascending: false })
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      messages.push(...data);
      if (data.length < 1000) break;
    }

    // 被排除重複的名單
    const { data: batchRow } = await supabaseAdmin
      .from('outreach_batches')
      .select('skipped_brand_ids')
      .eq('id', id)
      .maybeSingle();
    const skippedIds: string[] = Array.isArray(batchRow?.skipped_brand_ids) ? batchRow!.skipped_brand_ids : [];
    const skipped: any[] = [];
    for (let i = 0; i < skippedIds.length; i += 100) {
      const { data } = await supabaseAdmin
        .from('brands')
        .select('id, name, industry, email')
        .in('id', skippedIds.slice(i, i + 100));
      if (data) skipped.push(...data);
    }

    return NextResponse.json({ campaign, messages, skipped });
  } catch (err) {
    return errorResponse(err);
  }
}
