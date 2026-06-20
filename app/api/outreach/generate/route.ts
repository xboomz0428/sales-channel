import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, generateSchema } from '@/lib/validation';
import { assertDailyGenerationCap } from '@/lib/rateLimit';
import { callClaude } from '@/lib/claude';
import { computeCost } from '@/lib/cost';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { buildSystemPrompt, buildUserPrompt, parseDraft } from '@/lib/outreach/prompt';
import { checkCompliance } from '@/lib/outreach/compliance';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireUser();
    const { brandId, channel, productFocus, sequenceStepId, templateId } = await parseBody(
      req,
      generateSchema
    );
    await assertDailyGenerationCap();

    // 取名單
    const { data: brand, error: be } = await supabaseAdmin
      .from('brands')
      .select('id, name, industry')
      .eq('id', brandId)
      .single();
    if (be || !brand) throw new HttpError(404, '找不到名單');

    // 若帶序列步驟,取 goal / stepOrder
    let stepOrder = 1;
    let goal: string | undefined;
    if (sequenceStepId) {
      const { data: step } = await supabaseAdmin
        .from('outreach_sequence_steps')
        .select('step_order, goal')
        .eq('id', sequenceStepId)
        .single();
      if (step) {
        stepOrder = step.step_order;
        goal = step.goal ?? undefined;
      }
    }

    // 若指定模板,載入作為母版讓 AI 個人化
    let template: { subject: string | null; body: string } | null = null;
    if (templateId) {
      const { data: tpl } = await supabaseAdmin
        .from('outreach_templates')
        .select('subject, body')
        .eq('id', templateId)
        .single();
      if (tpl) template = tpl;
    }

    // 生成
    const system = buildSystemPrompt();
    const user = buildUserPrompt({ brand, channel, stepOrder, goal, productFocus, template });
    const result = await callClaude(system, user);
    const { subject, body } = parseDraft(result.text);

    // 合規 + 費用
    const compliance = checkCompliance(`${subject}\n${body}`);
    const cost = await computeCost(result.model, result.usage);

    // 寫入草稿
    const { data: msg, error: me } = await supabaseAdmin
      .from('outreach_messages')
      .insert({
        brand_id: brandId,
        channel,
        direction: 'out',
        status: 'draft',
        subject: subject || null,
        body,
        compliance_flag: compliance.flag,
        compliance_note: compliance.note || null,
        template_id: templateId || null,
        model: result.model,
        tokens_in: cost.tokens_in,
        tokens_out: cost.tokens_out,
        cached_tokens: cost.cached_tokens,
        generation_ms: result.ms,
        cost_usd: cost.cost_usd,
      })
      .select('id')
      .single();
    if (me || !msg) throw new HttpError(500, '寫入草稿失敗');

    // 版本 v1
    await supabaseAdmin.from('outreach_message_revisions').insert({
      message_id: msg.id,
      version: 1,
      body,
      edited_by: 'AI',
      reason: '初次生成',
    });

    return NextResponse.json({
      draftId: msg.id,
      subject,
      body,
      complianceFlag: compliance.flag,
      complianceNote: compliance.note,
      costUsd: cost.cost_usd,
      generationMs: result.ms,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
