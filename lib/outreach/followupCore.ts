import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ⑦ 自動跟進序列的核心邏輯（v3.7.0）
 * 跟進信不再在 cron 內同步逐封寄送，而是「排入一筆群發活動」，交給既有的背景接力寄送
 * （lib/outreach/drain.ts：受每日上限約束、額度用完隔天續寄、原子認領不重寄、儀表板看得到進度）。
 *
 * 本檔刻意不使用 "@/..." 路徑別名、DB client 一律由參數傳入、只用可抹除的 TS 語法，
 * 讓 node 內建 type stripping 可直接 import（tests/followup-core.test.mjs、scripts/followup-dryrun.mjs）。
 */

export const MAX_ENQUEUE_PER_RULE = 2000;
const PAGE_SIZE = 1000;
const INSERT_CHUNK = 50; // 每列帶完整 body_html；沿用 runSend.ts 的每批 50 列（v3.6.4 起的做法）
const TW_OFFSET_MS = 8 * 3600_000; // 台灣 UTC+8，無日光節約
const DAY_MS = 86400_000;

export interface FollowupRule {
  id: string;
  name: string;
  trigger_template_id: string;
  followup_template_id: string;
  days_after: number | null;
  condition: string | null; // no_open | no_reply | always
  active?: boolean;
  created_at?: string;
}

export interface OriginMessage {
  id: string;
  brand_id: string | null;
  to_email: string | null;
  open_count: number | null;
  status: string | null;
  sent_at: string | null;
}

export interface FollowupTarget {
  id: string; // 原始信 id（= 跟進信的 parent_message_id）
  brand_id: string | null;
  to_email: string;
}

export interface FollowupTemplate {
  subject: string | null;
  body: string | null;
  body_html: string | null;
  name: string | null;
}

export interface RulePlan {
  rule: FollowupRule;
  cutoff: string;
  eligibleOrigins: number;  // 符合時間條件的原始信數
  alreadyFollowed: number;  // 其中已建立過跟進的數量
  targets: FollowupTarget[]; // 本次要排入的對象（最多 MAX_ENQUEUE_PER_RULE）
  deferred: number;         // 超過單次上限、留待隔天的數量
  template: FollowupTemplate | null;
  skipReason?: string;
  error?: string;
}

export interface EnqueueResult {
  ruleName: string;
  batchId: string | null;
  queued: number;
  error?: string;
}

function normDays(daysAfter: unknown): number {
  const n = typeof daysAfter === "number" ? daysAfter : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 3; // 非正數／非數字沿用舊行為當作 3
}

/**
 * 台灣日曆日語意：原始信的台灣寄出日期 + daysAfter ≤ 今天（台灣日期）才符合。
 * 回傳 cutoff，原始信需 sent_at < cutoff；cutoff = 台灣今日 00:00（UTC 表示）−(daysAfter−1) 天。
 */
export function followupCutoffIso(now: Date, daysAfter: number): string {
  const days = normDays(daysAfter);
  const twMidnightUtc = Math.floor((now.getTime() + TW_OFFSET_MS) / DAY_MS) * DAY_MS - TW_OFFSET_MS;
  return new Date(twMidnightUtc - (days - 1) * DAY_MS).toISOString();
}

/** 純函式：排除已跟進、條件不符、無 Email 的原始信（不做 email 去重，維持原行為） */
export function selectFollowupTargets(
  rule: Pick<FollowupRule, "condition">,
  origins: OriginMessage[],
  followedParentIds: Set<string>,
): FollowupTarget[] {
  const out: FollowupTarget[] = [];
  for (const o of origins) {
    if (followedParentIds.has(o.id)) continue;
    if (rule.condition === "no_open" && (o.open_count || 0) > 0) continue;
    if (rule.condition === "no_reply" && o.status === "replied") continue;
    if (!o.to_email) continue;
    out.push({ id: o.id, brand_id: o.brand_id, to_email: o.to_email });
  }
  return out;
}

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/** 以 .range() 分頁讀完；任何一頁出錯即丟錯（不可當成「沒有資料」） */
async function fetchAllPages<T>(page: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message || String(error));
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 唯讀：計算每條啟用規則這次要排入的跟進對象 */
export async function planFollowups(db: SupabaseClient, now: Date): Promise<RulePlan[]> {
  const { data: rules, error: rulesErr } = await db
    .from("followup_rules")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (rulesErr) throw new Error("讀取跟進規則失敗：" + rulesErr.message);

  const plans: RulePlan[] = [];
  for (const rule of (rules || []) as FollowupRule[]) {
    const cutoff = followupCutoffIso(now, rule.days_after as number);
    const plan: RulePlan = {
      rule, cutoff, eligibleOrigins: 0, alreadyFollowed: 0, targets: [], deferred: 0, template: null,
    };
    plans.push(plan);
    try {
      const origins = await fetchAllPages<OriginMessage>((from, to) =>
        db.from("outreach_messages")
          .select("id, brand_id, to_email, open_count, status, sent_at")
          .eq("template_id", rule.trigger_template_id)
          .eq("status", "sent")
          .lt("sent_at", cutoff)
          .order("sent_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      );
      // 不用 .in(parent_message_id, 大陣列)：PostgREST 會把陣列展開在 URL（v3.6.4 實測 394 個可過、395 個起失敗）
      const followed = await fetchAllPages<{ parent_message_id: string | null }>((from, to) =>
        db.from("outreach_messages")
          .select("parent_message_id")
          .eq("followup_rule_id", rule.id)
          .order("id", { ascending: true })
          .range(from, to),
      );
      const followedSet = new Set<string>();
      for (const f of followed) if (f.parent_message_id) followedSet.add(f.parent_message_id);

      plan.eligibleOrigins = origins.length;
      plan.alreadyFollowed = origins.filter((o) => followedSet.has(o.id)).length;

      const { data: tpl, error: tplErr } = await db
        .from("outreach_templates")
        .select("subject, body, body_html, name")
        .eq("id", rule.followup_template_id)
        .maybeSingle();
      if (tplErr) throw new Error("讀取跟進模板失敗：" + tplErr.message);
      if (!tpl) { plan.skipReason = "跟進模板不存在"; continue; }
      plan.template = tpl as FollowupTemplate;
      if (!plan.template.body_html) { plan.skipReason = "跟進模板沒有 HTML 內文"; continue; }

      const all = selectFollowupTargets(rule, origins, followedSet);
      plan.targets = all.slice(0, MAX_ENQUEUE_PER_RULE); // origins 已依 sent_at 升冪，取最早的
      plan.deferred = all.length - plan.targets.length;
    } catch (e) {
      plan.error = errMsg(e);
      plan.targets = [];
      plan.deferred = 0;
    }
  }
  return plans;
}

/** 寫入：每條有對象的規則建一筆群發活動並分批排入訊息。不寄信、不扣額度、不觸發背景寄送。 */
export async function enqueueFollowupPlan(db: SupabaseClient, plans: RulePlan[], now: Date): Promise<EnqueueResult[]> {
  const results: EnqueueResult[] = [];
  for (const p of plans) {
    if (p.error || p.skipReason || !p.template || p.targets.length === 0) continue;
    const rule = p.rule;
    const tpl = p.template;
    const note = `自動跟進規則「${rule.name}」`;

    const { data: batch, error: batchErr } = await db
      .from("outreach_batches")
      .insert({
        name: `跟進｜${rule.name}`,
        channel: "EM",
        template_id: rule.followup_template_id,
        total: p.targets.length,
        requested: p.targets.length,
        status: "running",
        started_at: now.toISOString(),
        note,
      })
      .select("id")
      .single();
    if (batchErr || !batch) {
      results.push({ ruleName: rule.name, batchId: null, queued: 0, error: "建立活動失敗：" + (batchErr?.message || "無回傳") });
      continue;
    }
    const batchId = (batch as { id: string }).id;

    let created = 0;
    let chunkErr: string | undefined;
    for (let i = 0; i < p.targets.length; i += INSERT_CHUNK) {
      const rows = p.targets.slice(i, i + INSERT_CHUNK).map((t) => ({
        brand_id: t.brand_id,
        channel: "EM",
        direction: "out",
        status: "queued",
        subject: tpl.subject,
        body: tpl.body || "",
        body_html: tpl.body_html,
        template_id: rule.followup_template_id,
        to_email: t.to_email,
        parent_message_id: t.id,
        followup_rule_id: rule.id,
        batch_id: batchId,
      }));
      // 唯一索引 uq_msg_followup_rule_parent（migration 0044）：同一規則對同一封原始信絕不建立兩封
      const { data: ins, error } = await db
        .from("outreach_messages")
        .upsert(rows, { onConflict: "followup_rule_id,parent_message_id", ignoreDuplicates: true })
        .select("id");
      if (error) { chunkErr = error.message || String(error); break; }
      created += (ins || []).length;
    }

    if (created > 0) {
      if (chunkErr || created !== p.targets.length) {
        const patch: Record<string, unknown> = { total: created };
        // 未建立的對象隔天 cron 會因「尚未跟進」自動再被排入
        if (chunkErr) patch.note = `${note}；部分建立失敗（${created}/${p.targets.length}）：${chunkErr.slice(0, 200)}`;
        await db.from("outreach_batches").update(patch).eq("id", batchId);
      }
      results.push({ ruleName: rule.name, batchId, queued: created, ...(chunkErr ? { error: chunkErr } : {}) });
    } else if (chunkErr) {
      await db.from("outreach_batches").update({
        status: "error",
        finished_at: new Date().toISOString(),
        note: `${note}；建立跟進訊息失敗：${chunkErr.slice(0, 200)}`,
      }).eq("id", batchId);
      results.push({ ruleName: rule.name, batchId, queued: 0, error: chunkErr });
    } else {
      // 全部被唯一索引去重（例如 cron 被重複觸發）→ 刪掉這筆空活動
      await db.from("outreach_batches").delete().eq("id", batchId);
      results.push({ ruleName: rule.name, batchId: null, queued: 0 });
    }
  }
  return results;
}
