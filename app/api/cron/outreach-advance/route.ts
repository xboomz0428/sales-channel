import { NextResponse } from 'next/server';
import { requireCron, errorResponse } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// Vercel Cron 每日呼叫。vercel.json:
// { "crons": [{ "path": "/api/cron/outreach-advance", "schedule": "0 1 * * *" }] }
export async function GET(req: Request) {
  try {
    requireCron(req);
    const now = new Date().toISOString();

    const { data: due, error } = await supabaseAdmin
      .from('outreach_enrollments')
      .select('id, brand_id, sequence_id, current_step')
      .eq('status', 'active')
      .lte('next_action_at', now)
      .limit(500);
    if (error) throw error;

    let advanced = 0;
    let finished = 0;
    let followups = 0;

    for (const e of due || []) {
      const nextStepOrder = e.current_step + 1;
      const { data: nextStep } = await supabaseAdmin
        .from('outreach_sequence_steps')
        .select('wait_days, channel, goal')
        .eq('sequence_id', e.sequence_id)
        .eq('step_order', nextStepOrder)
        .maybeSingle();

      if (!nextStep) {
        // 沒有下一步 → 序列完成
        await supabaseAdmin
          .from('outreach_enrollments')
          .update({ status: 'done', next_action_at: null })
          .eq('id', e.id)
          .eq('status', 'active'); // 冪等:被別的執行先處理就不重複
        finished++;
        continue;
      }

      const at = new Date();
      at.setDate(at.getDate() + (nextStep.wait_days || 0));

      // 冪等推進:條件帶 current_step,確保只推進一次
      const { data: upd } = await supabaseAdmin
        .from('outreach_enrollments')
        .update({ current_step: nextStepOrder, next_action_at: at.toISOString() })
        .eq('id', e.id)
        .eq('current_step', e.current_step)
        .eq('status', 'active')
        .select('id');

      if (upd && upd.length) {
        advanced++;
        const { error: fe } = await supabaseAdmin.from('followups').insert({
          brand_id: e.brand_id,
          due_date: at.toISOString(),
          done: false,
          note: `外聯序列第 ${nextStepOrder} 步(${nextStep.channel})${
            nextStep.goal ? `:${nextStep.goal}` : ''
          }`,
        });
        if (!fe) followups++;
      }
    }

    return NextResponse.json({ processed: due?.length || 0, advanced, finished, followups });
  } catch (err) {
    return errorResponse(err);
  }
}
