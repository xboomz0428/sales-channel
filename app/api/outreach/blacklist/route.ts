import { NextResponse } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { normalizeEmail, isValidEmail } from '@/lib/outreach/blacklist';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 退信黑名單（email_blacklist，主鍵為 email；本 API 的 id 即為 email）
 *  GET    /api/outreach/blacklist?q=&blocked=true|false&kind=hard|soft|manual|failed&page=1&pageSize=50 → { items, total }
 *  POST   /api/outreach/blacklist   body { email, reason? }   → 手動加入（blocked=true、bounce_type=manual）
 *  PATCH  /api/outreach/blacklist   body { id, blocked }      → 切換封鎖；解除封鎖時累計次數歸零
 *  DELETE /api/outreach/blacklist?id=<email>                  → 刪除一筆
 * blocked=true 的信箱，寄送（dispatchEmail）與收件人名單（/api/outreach/recipients）都會跳過。
 */

const KINDS = ['hard', 'soft', 'manual', 'failed'] as const;
const COLS = 'email, reason, fail_count, soft_count, blocked, bounce_type, last_fail, created_at';

function requireEmail(raw: unknown, field = 'email'): string {
  const email = normalizeEmail(raw);
  if (!email) throw new HttpError(400, `缺少 ${field}`);
  if (!isValidEmail(email)) throw new HttpError(400, `Email 格式不正確：${email}`);
  return email;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new HttpError(400, '請求內容不是有效的 JSON 物件');
  }
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10) || 50));
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const blocked = url.searchParams.get('blocked');
    const kind = url.searchParams.get('kind');

    let query = supabaseAdmin.from('email_blacklist').select(COLS, { count: 'exact' });
    if (q) query = query.ilike('email', `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    if (blocked === 'true' || blocked === 'false') query = query.eq('blocked', blocked === 'true');
    else if (blocked) throw new HttpError(400, 'blocked 只能是 true 或 false');
    if (kind) {
      if (!(KINDS as readonly string[]).includes(kind)) throw new HttpError(400, `kind 只能是 ${KINDS.join(' / ')}`);
      query = query.eq('bounce_type', kind);
    }
    const from = (page - 1) * pageSize;
    const { data, count, error } = await query
      .order('last_fail', { ascending: false, nullsFirst: false })
      .order('email', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new HttpError(500, error.message);

    const items = (data || []).map((r) => ({ id: r.email, ...r }));
    return NextResponse.json({ items, total: count ?? items.length, page, pageSize });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await readJson(req);
    const email = requireEmail(body.email);
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : '手動加入';
    const now = new Date().toISOString();

    const { data: existing, error: readErr } = await supabaseAdmin
      .from('email_blacklist').select('email').eq('email', email).maybeSingle();
    if (readErr) throw new HttpError(500, readErr.message);

    // 已在名單中（例如軟退信觀察中）→ 改為手動封鎖，保留累計次數；否則新增
    const { data, error } = existing
      ? await supabaseAdmin.from('email_blacklist')
          .update({ blocked: true, bounce_type: 'manual', reason, last_fail: now })
          .eq('email', email).select(COLS).single()
      : await supabaseAdmin.from('email_blacklist')
          .insert({ email, blocked: true, bounce_type: 'manual', reason, fail_count: 0, soft_count: 0, last_fail: now })
          .select(COLS).single();
    if (error) throw new HttpError(500, error.message);
    return NextResponse.json({ item: { id: data.email, ...data }, created: !existing }, { status: existing ? 200 : 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: Request) {
  try {
    await requireUser();
    const body = await readJson(req);
    const email = requireEmail(body.id ?? body.email, 'id');
    if (typeof body.blocked !== 'boolean') throw new HttpError(400, 'blocked 必須是 true 或 false');

    const patch: Record<string, unknown> = { blocked: body.blocked };
    if (!body.blocked) { patch.soft_count = 0; patch.fail_count = 0; }

    const { data, error } = await supabaseAdmin
      .from('email_blacklist').update(patch).eq('email', email).select(COLS);
    if (error) throw new HttpError(500, error.message);
    if (!data || data.length === 0) throw new HttpError(404, `黑名單中找不到 ${email}`);
    return NextResponse.json({ item: { id: data[0].email, ...data[0] } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const email = requireEmail(url.searchParams.get('id') ?? url.searchParams.get('email'), 'id');
    const { data, error } = await supabaseAdmin
      .from('email_blacklist').delete().eq('email', email).select('email');
    if (error) throw new HttpError(500, error.message);
    if (!data || data.length === 0) throw new HttpError(404, `黑名單中找不到 ${email}`);
    return NextResponse.json({ deleted: email });
  } catch (err) {
    return errorResponse(err);
  }
}
