import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispatchEmail } from "@/lib/outreach/dispatchEmail";
import { resolveBrandEmails, isValidEmail } from "@/lib/outreach/resolveEmails";
import { partitionSendable } from "@/lib/outreach/validateEmail";

export interface RunSendResult {
  sent: number;
  failed: number;
  queued: number;
  skipped: number;
  cleaned: number; // 寄信前清洗：語法錯誤 / 網域無 MX 而被剔除（未寄出、不算失敗）
  noEmail: number; // 名單查無 Email、無法建立訊息（也計入 failed 以相容舊呼叫端）
  dispatched: number; // 本次實際送出（成功+失敗），用來扣每日額度
  total: number;
  skippedBrandIds: string[]; // 被排除重複的名單 id（供活動記錄「排除了誰」）
  skippedEmails: string[];   // 被排除重複的手動信箱
}

const SENT_STATUS = ["sent", "delivered", "read", "replied"];
// 「不需再寄」：已成功寄出，或已在佇列/寄送中（避免重寄時雙重排隊）
const DONE_OR_PENDING = [...SENT_STATUS, "queued", "sending"];

/**
 * 共用寄送：建立訊息 → 在預算內逐封寄出，超出預算留 queued。
 * 排程寄送、手動寄送、跟進序列都走這支，統一套用節流與重複判斷。
 *
 * 可靠性設計：先把本批「全部」建成 queued（只寫 DB、不等 SMTP，瞬間完成），
 * 再在額度內逐封寄出。即使執行中途被平台終止（maxDuration），尚未寄的仍留在佇列，
 * 由排程器補寄——不會像逐封「建立→寄出」那樣讓後段收件人憑空消失。
 * budget=0 時即為「只入佇列、不寄」（群發活動建立時使用，之後由 drain 分段寄出）。
 */
export async function runSendBatch(opts: {
  templateId: string;
  brandIds?: string[];
  manualEmails?: { name?: string; email: string }[];
  skipDuplicates?: boolean;
  budget: number;
  batchId?: string | null;
}): Promise<RunSendResult> {
  const { templateId } = opts;
  let brandIds = [...(opts.brandIds || [])];
  let manualEmails = [...(opts.manualEmails || [])];
  const skipDuplicates = opts.skipDuplicates !== false;
  let budget = Math.max(0, opts.budget);

  const skippedBrandIds: string[] = [];
  const skippedEmails: string[] = [];
  const empty: RunSendResult = { sent: 0, failed: 0, queued: 0, skipped: 0, cleaned: 0, noEmail: 0, dispatched: 0, total: 0, skippedBrandIds, skippedEmails };
  if (brandIds.length === 0 && manualEmails.length === 0) return empty;

  const { data: tpl } = await supabaseAdmin
    .from("outreach_templates")
    .select("subject, body, body_html")
    .eq("id", templateId)
    .single();
  if (!tpl || !tpl.body_html) return empty;

  // 重複判斷：此模板已寄出、或已在排隊/寄送中的對象，都不再建立
  let skipped = 0;
  if (skipDuplicates) {
    // 分頁取回全部（PostgREST 單次最多 1000 列；一個模板寄過上千人後若只取前 1000 列，後面的人會被重寄）
    const prevRows: { brand_id: string | null; to_email: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: prev, error } = await supabaseAdmin
        .from("outreach_messages")
        .select("brand_id, to_email")
        .eq("template_id", templateId)
        .in("status", DONE_OR_PENDING)
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw new Error("讀取已寄送紀錄失敗：" + error.message);
      if (!prev || prev.length === 0) break;
      prevRows.push(...(prev as typeof prevRows));
      if (prev.length < 1000) break;
    }
    const sentBrand = new Set(prevRows.map((m) => m.brand_id).filter(Boolean));
    const sentMail = new Set(prevRows.map((m) => (m.to_email || "").toLowerCase()).filter(Boolean));
    for (const id of brandIds) if (sentBrand.has(id)) skippedBrandIds.push(id);
    for (const m of manualEmails) if (sentMail.has((m.email || "").toLowerCase())) skippedEmails.push(m.email);
    brandIds = brandIds.filter((id) => !sentBrand.has(id));
    manualEmails = manualEmails.filter((m) => !sentMail.has((m.email || "").toLowerCase()));
    skipped = skippedBrandIds.length + skippedEmails.length;
  }

  const emailMap = await resolveBrandEmails(brandIds);

  // 寄信前清洗：把本批所有要寄的信箱做語法 + MX 檢查，無效的剔除（不寄、不算失敗）
  const allTargets = [
    ...brandIds.map((id) => emailMap.get(id)).filter((e): e is string => !!e),
    ...manualEmails.map((m) => m.email).filter(Boolean),
  ];
  const { bad: invalidSet } = await partitionSendable(allTargets);

  let sent = 0, failed = 0, queued = 0, cleaned = 0, noEmail = 0, dispatched = 0;
  const total = brandIds.length + manualEmails.length;
  const result = () => ({ sent, failed, queued, skipped, cleaned, noEmail, dispatched, total, skippedBrandIds, skippedEmails });

  // 1) 整理本批實際要寄的對象
  const targets: Array<{ brand_id: string | null; to_email: string }> = [];
  for (const brandId of brandIds) {
    const to = emailMap.get(brandId);
    if (!to) { failed++; noEmail++; continue; }
    if (invalidSet.has(to.trim())) { cleaned++; continue; } // 無效信箱：清洗剔除
    targets.push({ brand_id: brandId, to_email: to });
  }
  for (const m of manualEmails) {
    if (!isValidEmail(m.email) || invalidSet.has((m.email || "").trim())) { cleaned++; continue; }
    targets.push({ brand_id: null, to_email: m.email });
  }
  if (targets.length === 0) return result();

  // 2) 先全部建成 queued（一次 bulk insert，不等 SMTP）
  const now = new Date().toISOString();
  const { data: created, error: insErr } = await supabaseAdmin
    .from("outreach_messages")
    .insert(targets.map((t) => ({
      brand_id: t.brand_id,
      channel: "EM",
      direction: "out",
      status: "queued",
      subject: tpl.subject,
      body: tpl.body || "",
      body_html: tpl.body_html,
      template_id: templateId,
      batch_id: opts.batchId || null,
      to_email: t.to_email,
      created_at: now,
    })))
    .select("id");
  if (insErr || !created) {
    failed += targets.length;
    return result();
  }

  // 3) 在額度內逐封寄出；額度用完或執行被中斷的，都安全留在佇列
  for (const row of created) {
    if (budget <= 0) { queued++; continue; }
    const r = await dispatchEmail(row.id);
    if (r.skipped) continue; // 已被背景接力/排程搶先寄出：不算失敗、不扣額度
    if (r.ok) sent++; else failed++;
    dispatched++;
    budget--;
  }

  return result();
}
