import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { brandId: string } }) {
  try {
    await requireUser();
    const { data, error } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, channel, direction, status, subject, body, sent_at, delivered_at, read_at, created_at')
      .eq('brand_id', params.brandId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return NextResponse.json({ brandId: params.brandId, messages: data });
  } catch (err) {
    return errorResponse(err);
  }
}
