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
    const body = await parseBody(req, newsletterSendSchema);
    const templateId = body.templateId as string;
    const brandIds: string[] = Array.isArray(body.brandIds) ? body.brandIds : [];
    const manualEmails: { name: string; email: string }[] = Array.isArray(body.manualEmails) ? body.manualEmails : [];

    if (brandIds.length === 0 && manualEmails.length === 0) {
      throw new HttpError(400, '至少提供 brandIds 或 manualEmails');
    }

    const { data: tpl } = await supabaseAdmin
      .from('outreach_templates')
      .select('subject, body, body_html')
      .eq('id', templateId)
      .single();
    if (!tpl || !tpl.body_html) throw new HttpError(400, '模板不存在或非 HTML 電子報');

    const totalCount = brandIds.length + manualEmails.length;

    // 建立批次
    const { data: batch } = await supabaseAdmin
      .from('outreach_batches')
      .insert({ name: 'newsletter', channel: 'EM', total: totalCount, status: 'running', started_at: new Date().toISOString() })
      .select('id')
      .single();
    const batchId = batch?.id;

    // 取名單 email：採集 brand_channels → 聯絡人 contacts → brands.email
    const { data: brands } = brandIds.length > 0
      ? await supabaseAdmin.from('brands').select('id, email, brand_channels(channel, value), contacts(email)').in('id', brandIds)
      : { data: [] };
    const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$/i;
    const isValidEmail = (e: string | null | undefined): e is string =>
      !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);
    const emailMap = new Map(
      (brands || []).map((b: any) => {
        const chEmail = (b.brand_channels || []).find((c: any) => c.channel === 'email' && isValidEmail(c.value))?.value;
        const contactEmail = (b.contacts || []).map((c: any) => c.email).find(isValidEmail);
        return [b.id, chEmail || contactEmail || (isValidEmail(b.email) ? b.email : null)];
      })
    );

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

    // 手動新增的收件人（不綁品牌，直接寄到指定 email）
    for (const m of manualEmails) {
      if (!m.email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(m.email)) { failed++; continue; }
      const { data: msg } = await supabaseAdmin
        .from('outreach_messages')
        .insert({
          brand_id: null,
          channel: 'EM',
          direction: 'out',
          status: 'queued',
          subject: tpl.subject,
          body: tpl.body || '',
          body_html: tpl.body_html,
          template_id: templateId,
          batch_id: batchId,
          to_email: m.email,
        })
        .select('id')
        .single();
      if (!msg) { failed++; continue; }
      const r = await dispatchEmail(msg.id);
      r.ok ? sent++ : failed++;
    }

    if (batchId) {
      await supabaseAdmin
        .from('outreach_batches')
        .update({
          sent,
          failed,
          total: totalCount,
          status: queued ? 'paused' : 'done',
          finished_at: queued ? null : new Date().toISOString(),
        })
        .eq('id', batchId);
    }

    return NextResponse.json({ batchId, total: totalCount, sent, failed, queued });
  } catch (err) {
    return errorResponse(err);
  }
}
