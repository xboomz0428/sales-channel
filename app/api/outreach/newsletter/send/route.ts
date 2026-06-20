import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, newsletterSendSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchEmail } from '@/lib/outreach/dispatchEmail';

export const runtime = 'nodejs';
export const maxDuration = 60;

// 單次呼叫實際寄出的上限(serverless 時間限制;超出留 queued)
const PER_CALL = 30;

export async function POST(req: Request) {
  try {
    await requireUser();
    const { templateId, brandIds } = await parseBody(req, newsletterSendSchema);

    const { data: tpl } = await supabaseAdmin
      .from('outreach_templates')
      .select('subject, body, body_html')
      .eq('id', templateId)
      .single();
    if (!tpl || !tpl.body_html) throw new HttpError(400, '模板不存在或非 HTML 電子報');

    // 建立批次
    const { data: batch } = await supabaseAdmin
      .from('outreach_batches')
      .insert({ name: 'newsletter', channel: 'EM', total: brandIds.length, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single();
    const batchId = batch?.id;

    // 取名單 email
    const { data: brands } = await supabaseAdmin
      .from('brands')
      .select('id, email')
      .in('id', brandIds);
    const emailMap = new Map((brands || []).map((b: any) => [b.id, b.email]));

    let sent = 0;
    let failed = 0;
    let queued = 0;

    for (let i = 0; i < brandIds.length; i++) {
      const brandId = brandIds[i];
      const to = emailMap.get(brandId);
      if (!to) {
        failed++;
        continue;
      }
      // 建立訊息(queued)
      const { data: msg } = await supabaseAdmin
        .from('outreach_messages')
        .insert({
          brand_id: brandId,
          channel: 'EM',
          direction: 'out',
          status: 'queued',
          subject: tpl.subject,
          body: tpl.body || '',
          body_html: tpl.body_html,
          template_id: templateId,
          batch_id: batchId,
          to_email: to,
        })
        .select('id')
        .single();
      if (!msg) {
        failed++;
        continue;
      }

      if (i < PER_CALL) {
        const r = await dispatchEmail(msg.id);
        r.ok ? sent++ : failed++;
      } else {
        queued++; // 超出本次上限,維持 queued,可由後續批次處理
      }
    }

    if (batchId) {
      await supabaseAdmin
        .from('outreach_batches')
        .update({
          sent,
          failed,
          status: queued ? 'paused' : 'done',
          finished_at: queued ? null : new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    return NextResponse.json({ batchId, total: brandIds.length, sent, failed, queued });
  } catch (err) {
    return errorResponse(err);
  }
}
