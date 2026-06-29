import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { callAI } from '@/lib/claude';

export const runtime = 'nodejs';

const LANG_LABEL: Record<string, string> = { ja: '日文', en: '英文', zh: '中文' };

/**
 * POST /api/outreach/translate-template
 * body: { templateId: string, targetLang: 'ja' | 'en' }
 * AI 翻譯模板，建立新模板並回傳 { id, name }
 */
export async function POST(req: Request) {
  try {
    await requireUser();
    const { templateId, targetLang } = await req.json();
    if (!templateId || !targetLang) throw new HttpError(400, '缺少 templateId 或 targetLang');
    if (!['ja', 'en'].includes(targetLang)) throw new HttpError(400, '僅支援 ja / en');

    const { data: tpl, error: te } = await supabaseAdmin
      .from('outreach_templates')
      .select('name, subject, body_html, body, channel, industry, product_focus')
      .eq('id', templateId)
      .single();
    if (te || !tpl) throw new HttpError(404, '找不到模板');

    const langName = LANG_LABEL[targetLang] || targetLang;
    const targetDesc = targetLang === 'ja' ? 'Japanese' : 'English (British preferred)';

    const system = `You are a professional B2B business email translator.
Rules:
- Translate into ${targetDesc}.
- Keep ALL HTML tags, attributes, inline styles, and structure exactly intact.
- Only translate visible text content inside HTML tags.
- Keep brand names, product names, URLs, and email addresses unchanged.
- Keep the professional, warm B2B sales tone.
- Respond ONLY with a valid JSON object, no markdown fences, no explanation.
JSON format: {"subject":"<translated subject>","body_html":"<translated full HTML>","body":"<plain text version>"}`;

    const user = `Translate this email template to ${targetDesc}.

SUBJECT: ${tpl.subject || ''}

BODY_HTML:
${tpl.body_html || tpl.body || ''}

BODY (plain text):
${tpl.body || ''}`;

    const aiResult = await callAI(system, user);

    let parsed: { subject: string; body_html: string; body: string };
    try {
      parsed = JSON.parse(aiResult.text.trim());
    } catch {
      throw new HttpError(500, `AI 回傳格式錯誤：${aiResult.text.slice(0, 200)}`);
    }

    const newName = `[${langName}] ${tpl.name}`;
    const { data: created, error: ce } = await supabaseAdmin
      .from('outreach_templates')
      .insert({
        name: newName,
        channel: tpl.channel,
        industry: tpl.industry ?? null,
        product_focus: tpl.product_focus ?? null,
        subject: parsed.subject || tpl.subject,
        body: parsed.body || '',
        body_html: parsed.body_html || parsed.body || '',
        language: targetLang,
      })
      .select('id, name')
      .single();

    if (ce || !created) throw new HttpError(500, '建立翻譯模板失敗');
    return NextResponse.json({ success: true, id: created.id, name: created.name });
  } catch (err) {
    return errorResponse(err);
  }
}
