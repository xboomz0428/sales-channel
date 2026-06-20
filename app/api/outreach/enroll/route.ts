import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, enrollSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireUser();
    const { brandIds, sequenceId } = await parseBody(req, enrollSchema);

    // 取第一步,決定首次觸點時間
    const { data: step1 } = await supabaseAdmin
      .from('outreach_sequence_steps')
      .select('wait_days, channel, goal')
      .eq('sequence_id', sequenceId)
      .eq('step_order', 1)
      .single();
    if (!step1) throw new HttpError(400, '序列缺少第 1 步');

    const firstAt = new Date();
    firstAt.setDate(firstAt.getDate() + (step1.wait_days || 0));

    let enrolled = 0;
    let followups = 0;

    for (const brandId of brandIds) {
      // upsert 防重複:已有 active/paused enrollment 會被唯一索引擋下
      const { data: enr, error } = await supabaseAdmin
        .from('outreach_enrollments')
        .insert({
          brand_id: brandId,
          sequence_id: sequenceId,
          current_step: 1,
          status: 'active',
          next_action_at: firstAt.toISOString(),
        })
        .select('id')
        .single();

      if (error) continue; // 多半是重複 enroll,略過
      enrolled++;

      // 建立首觸點跟進任務(對應既有 followups 表;欄位請依實際 schema 調整)
      const { error: fe } = await supabaseAdmin.from('followups').insert({
        brand_id: brandId,
        due_date: firstAt.toISOString(),
        done: false,
        note: `外聯序列第 1 步(${step1.channel})${step1.goal ? `:${step1.goal}` : ''}`,
      });
      if (!fe) followups++;
    }

    return NextResponse.json({ enrolled, followupsCreated: followups });
  } catch (err) {
    return errorResponse(err);
  }
}
