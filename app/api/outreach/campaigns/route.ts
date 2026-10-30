import { NextResponse, after } from 'next/server';
import { requireUser, errorResponse, HttpError } from '@/lib/auth';
import { parseBody, campaignCreateSchema } from '@/lib/validation';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { runSendBatch } from '@/lib/outreach/runSend';
import { getSendCaps, sentToday } from '@/lib/outreach/throttle';
import { kickCampaignDrain } from '@/lib/outreach/drain';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * 群發活動（Campaign）
 *  GET  /api/outreach/campaigns?limit=50 → 活動清單（含即時統計：已寄/失敗/排隊/開信/點擊）+ 今日額度
 *  POST /api/outreach/campaigns          → 建立活動，並把全部收件人「一次入佇列」（不寄、瞬間完成）
 *        body: { templateId, brandIds?, manualEmails?, skipDuplicates?, name? }
 *        寄出由 POST /api/outreach/campaigns/[id]/drain 分段進行（瀏覽器關掉也不遺失，排程器會補寄）
 */

const STALL_MS = 3 * 60_000; // 超過 3 分鐘沒有任何認領／寄出 → 視為接力中斷

async function resumeStalledCampaigns(
  origin: string,
  list: { id: string; started_at: string | null; created_at: string }[],
) {
  for (const c of list) {
    try {
      const { data: b } = await supabaseAdmin.from('outreach_batches').select('drain_lock_until').eq('id', c.id).maybeSingle();
      if (b?.drain_lock_until && new Date(b.drain_lock_until).getTime() > Date.now()) continue; // 有棒在跑
      const { data: last } = await supabaseAdmin
        .from('outreach_messages')
        .select('status, claimed_at')
        .eq('batch_id', c.id)
        .not('claimed_at', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(5);
      const rows = (last || []) as { status: string; claimed_at: string }[];
      const lastTs = rows[0]?.claimed_at ? Date.parse(rows[0].claimed_at) : Date.parse(c.started_at || c.created_at);
      if (!Number.isFinite(lastTs) || Date.now() - lastTs < STALL_MS) continue;
      // 最近 5 封全部失敗 → 是寄信服務故障而非接力中斷，不要一直重踢把名單標成失敗；交給每日排程
      if (rows.length >= 5 && rows.every((r) => r.status === 'failed' || r.status === 'bounced')) continue;
      await kickCampaignDrain(origin, c.id, 0);
    } catch { /* 看門狗失敗不影響回應 */ }
  }
}

export async function GET(req: Request) {
  try {
    await requireUser();
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
    const [{ data, error }, caps, used] = await Promise.all([
      supabaseAdmin.rpc('email_campaigns', { p_limit: limit, p_id: null }),
      getSendCaps(),
      sentToday(),
    ]);
    if (error) throw new HttpError(500, error.message);

    // 看門狗：背景自我接力若中斷（例如下一棒的觸發請求失敗——10/30 一筆活動寄到第 65 封後停了 1 小時），
    // 寄送頁與儀表板每 6～20 秒都會打這支 GET，順手檢查「還有排隊、沒有正在寄、鎖已釋放、3 分鐘無動靜」的活動
    // 並重新踢一棒。踢完當下就取得活動鎖，所以同一活動不會被連續重複踢；今日額度用完或連續失敗的活動不踢。
    const remainingToday = Math.max(0, caps.dailyCap - used);
    const candidates = ((data || []) as { id: string; status: string | null; queued: number; sending: number; started_at: string | null; created_at: string }[])
      .filter((c) => c.status === 'running' && (c.queued || 0) > 0 && (c.sending || 0) === 0);
    if (candidates.length > 0 && remainingToday > 0) {
      const origin = new URL(req.url).origin;
      after(() => resumeStalledCampaigns(origin, candidates));
    }

    return NextResponse.json({
      campaigns: data || [],
      quota: { dailyCap: caps.dailyCap, usedToday: used, remainingToday: Math.max(0, caps.dailyCap - used) },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireUser();
    const body = await parseBody(req, campaignCreateSchema);
    const templateId = body.templateId as string;
    const brandIds: string[] = Array.isArray(body.brandIds) ? body.brandIds : [];
    const manualEmails: { name?: string; email: string }[] = Array.isArray(body.manualEmails) ? body.manualEmails : [];
    const skipDuplicates = body.skipDuplicates !== false;
    if (brandIds.length === 0 && manualEmails.length === 0) {
      throw new HttpError(400, '至少提供 brandIds 或 manualEmails');
    }

    const { data: tpl } = await supabaseAdmin
      .from('outreach_templates')
      .select('name')
      .eq('id', templateId)
      .maybeSingle();
    if (!tpl) throw new HttpError(404, '模板不存在');

    const requested = brandIds.length + manualEmails.length;
    const name = (typeof body.name === 'string' && body.name.trim()) || tpl.name;
    const nowIso = new Date().toISOString();

    // 1) 建立活動
    const { data: batch, error: bErr } = await supabaseAdmin
      .from('outreach_batches')
      .insert({
        name, channel: 'EM', template_id: templateId,
        total: requested, requested, status: 'running', started_at: nowIso,
      })
      .select('id')
      .single();
    if (bErr || !batch) throw new HttpError(500, '建立活動失敗');

    // 2) 全部入佇列（budget=0：只建立 queued、不寄）；失敗則把活動標為 error，不留永遠 running 的殭屍
    let r;
    try {
      r = await runSendBatch({ templateId, brandIds, manualEmails, skipDuplicates, budget: 0, batchId: batch.id });
    } catch (e) {
      await supabaseAdmin.from('outreach_batches').update({ status: 'error', finished_at: nowIso, note: e instanceof Error ? e.message.slice(0, 200) : '入佇列失敗' }).eq('id', batch.id);
      throw e;
    }

    // 3) 回寫活動摘要（排除重複／無效／入佇列數）
    await supabaseAdmin
      .from('outreach_batches')
      .update({
        skipped: r.skipped,
        cleaned: r.cleaned,
        no_email: r.noEmail,
        skipped_brand_ids: r.skippedBrandIds,
        total: r.queued,
        status: r.queued > 0 ? 'running' : 'done',
        finished_at: r.queued > 0 ? null : nowIso,
        // 一封都沒入佇列時把原因寫進備註，清單上一眼看得出「為什麼 0/0」
        note: r.queued > 0 ? null : ([
          r.skipped > 0 ? '排除重複 ' + r.skipped : '',
          r.cleaned > 0 ? '無效信箱 ' + r.cleaned : '',
          r.noEmail > 0 ? '名單無 Email ' + r.noEmail : '',
        ].filter(Boolean).join('、') || '選取名單為空') + '，無人需寄送',
      })
      .eq('id', batch.id);

    // 4) 觸發背景寄送（伺服器自我接力；回應送出後才執行，不拖慢回應，也不靠瀏覽器）
    const origin = new URL(req.url).origin;
    if (r.queued > 0) after(() => kickCampaignDrain(origin, batch.id, 0));

    return NextResponse.json({
      campaignId: batch.id,
      name,
      requested,
      skipped: r.skipped,
      cleaned: r.cleaned,
      noEmail: r.noEmail,    // 名單無 Email、無法建立
      queued: r.queued,      // 已入佇列、由伺服器背景寄出
      background: r.queued > 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
