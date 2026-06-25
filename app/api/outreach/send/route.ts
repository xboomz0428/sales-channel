import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, sendSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { dispatchEmail } from '@/lib/outreach/dispatchEmail';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    await requireUser();
    const { messageId, override } = await parseBody(req, sendSchema);

    const { data: msg, error } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, brand_id, channel, status, compliance_flag')
      .eq('id', messageId)
      .single();
    if (error || !msg) throw new HttpError(404, '找不到訊息');

    // 冪等
    if (['sent', 'delivered', 'read', 'replied'].includes(msg.status)) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }
    if (msg.status !== 'draft' && msg.status !== 'queued') {
      throw new HttpError(409, `狀態 ${msg.status} 不可送出`);
    }

    // 合規閘門
    if (msg.compliance_flag && !override) {
      throw new HttpError(422, '訊息有合規警示,請人工確認後再送(override)');
    }
    if (msg.compliance_flag && override) {
      await supabaseAdmin
        .from('outreach_messages')
        .update({ compliance_override: true })
        .eq('id', messageId);
    }

    if (msg.channel === 'EM') {
      // Email:實際透過 Gmail 寄出(含追蹤注入)
      const r = await dispatchEmail(messageId);
      if (!r.ok) throw new HttpError(502, r.error || '寄送失敗');
      return NextResponse.json({ ok: true, channel: 'EM', brandStage: '已聯繫' });
    }

    // 其他管道:半自動,只標記已送
    await supabaseAdmin
      .from('outreach_messages')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', messageId);
    await supabaseAdmin
      .from('brands')
      .update({ status: 'contacted', updated_at: new Date().toISOString() })
      .eq('id', msg.brand_id)
      .eq('status', 'new');
    // 寫入聯繫紀錄
    await supabaseAdmin
      .from('outreach_logs')
      .insert({ brand_id: msg.brand_id, channel: 'email', summary: `📧 手動寄送 Email`, created_at: new Date().toISOString() });

    return NextResponse.json({ ok: true, channel: msg.channel, brandStage: '已聯繫' });
  } catch (err) {
    return errorResponse(err);
  }
}
