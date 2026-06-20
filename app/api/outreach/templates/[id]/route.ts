import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, templateUpdateSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const b = await parseBody(req, templateUpdateSchema);
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (b.name !== undefined) patch.name = b.name;
    if (b.channel !== undefined) patch.channel = b.channel;
    if (b.industry !== undefined) patch.industry = b.industry;
    if (b.productFocus !== undefined) patch.product_focus = b.productFocus;
    if (b.subject !== undefined) patch.subject = b.subject;
    if (b.body !== undefined) patch.body = b.body;
    if (b.bodyHtml !== undefined) patch.body_html = b.bodyHtml;
    if (b.isActive !== undefined) patch.is_active = b.isActive;

    const { error } = await supabaseAdmin
      .from('outreach_templates')
      .update(patch)
      .eq('id', params.id);
    if (error) throw new HttpError(500, '更新失敗');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    // 軟刪除:停用即可,保留歷史成效資料
    const { error } = await supabaseAdmin
      .from('outreach_templates')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id);
    if (error) throw new HttpError(500, '停用失敗');
    return NextResponse.json({ ok: true, softDeleted: true });
  } catch (err) {
    return errorResponse(err);
  }
}
