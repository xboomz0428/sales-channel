import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireUser();
    const { data, error } = await supabaseAdmin
      .from('outreach_batches')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({ batches: data });
  } catch (err) {
    return errorResponse(err);
  }
}
