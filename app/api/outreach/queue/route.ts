import { NextResponse } from 'next/server';
import { requireUser, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const end = new Date(`${date}T23:59:59.999Z`).toISOString();

    // 到期且仍活躍的 enrollment,連同名單與目前步驟管道
    const { data, error } = await supabaseAdmin
      .from('outreach_enrollments')
      .select(
        'id, brand_id, current_step, next_action_at, brands(name, industry), outreach_sequences(name)'
      )
      .eq('status', 'active')
      .lte('next_action_at', end)
      .order('next_action_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    // 補當前步驟的 channel(分開查,避免巢狀過深)
    const groups: Record<string, any[]> = {};
    for (const row of data || []) {
      const { data: step } = await supabaseAdmin
        .from('outreach_sequence_steps')
        .select('channel')
        .eq('sequence_id', (row as any).sequence_id)
        .eq('step_order', row.current_step)
        .maybeSingle();
      const ch = step?.channel || 'LN';
      (groups[ch] ||= []).push(row);
    }

    return NextResponse.json({ date, groups });
  } catch (err) {
    return errorResponse(err);
  }
}
