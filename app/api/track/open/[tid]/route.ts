import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { PIXEL_GIF } from '@/lib/channels/emailTracking';

export const runtime = 'nodejs';

// GET /api/track/open/[tid] — 回 1x1 GIF,並記錄開信。
// 公開端點:email 客戶端會直接抓圖,故無登入。
// 注意:Gmail 圖片代理 / Apple Mail 隱私保護會預載或擋圖,開信數僅供參考。
export async function GET(req: Request, { params }: { params: Promise<{ tid: string }> }) {
  const { tid } = await params;
  try {
    const { data: msg } = await supabaseAdmin
      .from('outreach_messages')
      .select('id, open_count, first_opened_at, read_at')
      .eq('tracking_id', tid)
      .single();

    if (msg) {
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('outreach_messages')
        .update({
          open_count: (msg.open_count || 0) + 1,
          last_opened_at: now,
          first_opened_at: msg.first_opened_at || now,
          read_at: msg.read_at || now,
        })
        .eq('id', msg.id);

      await supabaseAdmin.from('email_events').insert({
        message_id: msg.id,
        type: 'open',
        ip: req.headers.get('x-forwarded-for'),
        ua: req.headers.get('user-agent'),
      });
    }
  } catch {
    // 追蹤失敗不影響回圖
  }

  return new Response(PIXEL_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Content-Length': String(PIXEL_GIF.length),
    },
  });
}
