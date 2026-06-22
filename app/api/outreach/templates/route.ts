import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, templateCreateSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// GET /api/outreach/templates?channel=EM&industry=禮儀
export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    let q = supabaseAdmin
      .from('outreach_templates')
      .select('*')
      .not('is_active', 'is', false) // 隱藏軟刪除（is_active=false）的模板
      .order('updated_at', { ascending: false });

    const channel = url.searchParams.get('channel');
    const industry = url.searchParams.get('industry');
    if (channel) q = q.eq('channel', channel);
    if (industry) q = q.eq('industry', industry);

    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ templates: data });
  } catch (err) {
    return errorResponse(err);
  }
}

// POST /api/outreach/templates
export async function POST(req: Request) {
  try {
    await requireUser();
    const b = await parseBody(req, templateCreateSchema);
    const { data, error } = await supabaseAdmin
      .from('outreach_templates')
      .insert({
        name: b.name,
        channel: b.channel,
        industry: b.industry ?? null,
        product_focus: b.productFocus ?? null,
        subject: b.subject ?? null,
        body: b.body,
        body_html: b.bodyHtml ?? null,
        blocks_json: b.blocksJson ?? null,
      })
      .select('id')
      .single();
    if (error || !data) throw new HttpError(500, '建立模板失敗');
    return NextResponse.json({ id: data.id });
  } catch (err) {
    return errorResponse(err);
  }
}
