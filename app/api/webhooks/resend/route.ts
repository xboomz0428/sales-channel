import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

// 驗證 Svix(Resend)簽章。簽署內容為 `${id}.${timestamp}.${payload}`。
function verifySvix(payload: string, headers: Headers): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!secret || !id || !ts || !sigHeader) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${ts}.${payload}`)
    .digest('base64');

  // header 可能含多個版本:`v1,<sig> v1,<sig2>`
  return sigHeader.split(' ').some((part) => {
    const sig = part.split(',')[1];
    if (!sig) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    } catch {
      return false;
    }
  });
}

export async function POST(req: Request) {
  const raw = await req.text(); // 驗簽需用原始 body
  if (!verifySvix(raw, req.headers)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const providerId: string | undefined = event?.data?.email_id || event?.data?.id;
  if (!providerId) return NextResponse.json({ ok: true }); // 無法對應就略過

  const map: Record<string, Record<string, unknown>> = {
    'email.delivered': { status: 'delivered', delivered_at: new Date().toISOString() },
    'email.opened': { status: 'read', read_at: new Date().toISOString() },
    'email.bounced': { status: 'bounced', error_detail: 'bounced' },
    'email.complained': { status: 'bounced', error_detail: 'complained' },
  };
  const patch = map[event.type];
  if (patch) {
    await supabaseAdmin
      .from('outreach_messages')
      .update(patch)
      .eq('provider_message_id', providerId);
  }
  return NextResponse.json({ ok: true });
}
