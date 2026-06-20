import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    await requireUser();
    const { data: batch, error: be } = await supabaseAdmin
      .from('outreach_batches')
      .select('*')
      .eq('id', params.id)
      .single();
    if (be) throw be;

    const { data: messages, error: me } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, brand_id, channel, status, subject, body, sent_at, delivered_at, read_at, error_detail, brands(name)')
      .eq('batch_id', params.id)
      .order('created_at', { ascending: true });
    if (me) throw me;

    return NextResponse.json({ batch, messages });
  } catch (err) {
    return errorResponse(err);
  }
}
