import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// x-line-signature = base64( HMAC-SHA256(channelSecret, rawBody) )
function verifyLine(raw: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyLine(raw, req.headers.get('x-line-signature'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  for (const ev of payload.events || []) {
    // 入站文字訊息:可選擇對應名單(此處示意,實務需 LINE userId ↔ brand 對照表)
    if (ev.type === 'message' && ev.message?.type === 'text') {
      // TODO: 依 ev.source.userId 查 brand_id 後寫 inbound;略
    }
    // 1:1 已讀回拋
    if (ev.type === 'read') {
      // TODO: 依 userId 對應名單,更新最近 out 訊息 read_at;略
    }
  }
  return NextResponse.json({ ok: true });
}
