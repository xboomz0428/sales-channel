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
  dispatched: number; // 本次實際送出（成功+失敗），用來扣每日額度
  total: number;
}

const SENT_STATUS = ["sent", "delivered", "read", "replied"];

/**
 * 共用寄送：建立訊息 → 在預算內逐封寄出，超出預算留 queued。
 * 排程寄送、手動寄送、跟進序列都走這支，統一套用節流與重複判斷。
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

  const empty: RunSendResult = { sent: 0, failed: 0, queued: 0, skipped: 0, cleaned: 0, dispatched: 0, total: 0 };
  if (brandIds.length === 0 && manualEmails.length === 0) return empty;

  const { data: tpl } = await supabaseAdmin
    .from("outreach_templates")
    .select("subject, body, body_html")
    .eq("id", templateId)
    .single();
  if (!tpl || !tpl.body_html) return empty;

  // 重複判斷：此模板已成功寄出的對象
  let skipped = 0;
  if (skipDuplicates) {
    const { data: prev } = await supabaseAdmin
      .from("outreach_messages")
      .select("brand_id, to_email")
      .eq("template_id", templateId)
      .in("status", SENT_STATUS);
    const sentBrand = new Set((prev || []).map((m: any) => m.brand_id).filter(Boolean));
    const sentMail = new Set((prev || []).map((m: any) => (m.to_email || "").toLowerCase()).filter(Boolean));
    const b0 = brandIds.length, m0 = manualEmails.length;
    brandIds = brandIds.filter((id) => !sentBrand.has(id));
    manualEmails = manualEmails.filter((m) => !sentMail.has((m.email || "").toLowerCase()));
    skipped = (b0 - brandIds.length) + (m0 - manualEmails.length);
  }

  const emailMap = await resolveBrandEmails(brandIds);

  // 寄信前清洗：把本批所有要寄的信箱做語法 + MX 檢查，無效的剔除（不寄、不算失敗）
  const allTargets = [
    ...brandIds.map((id) => emailMap.get(id)).filter((e): e is string => !!e),
    ...manualEmails.map((m) => m.email).filter(Boolean),
  ];
  const { bad: invalidSet } = await partitionSendable(allTargets);

  let sent = 0, failed = 0, queued = 0, cleaned = 0, dispatched = 0;

  const handleOne = async (brandId: string | null, to: string) => {
    const { data: msg } = await supabaseAdmin
      .from("outreach_messages")
      .insert({
        brand_id: brandId,
        channel: "EM",
        direction: "out",
        status: "queued",
        subject: tpl.subject,
        body: tpl.body || "",
        body_html: tpl.body_html,
        template_id: templateId,
        batch_id: opts.batchId || null,
        to_email: to,
      })
      .select("id")
      .single();
    if (!msg) { failed++; return; }
    if (budget > 0) {
      const r = await dispatchEmail(msg.id);
      r.ok ? sent++ : failed++;
      dispatched++;
      budget--;
    } else {
      queued++;
    }
  };

  for (const brandId of brandIds) {
    const to = emailMap.get(brandId);
    if (!to) { failed++; continue; }
    if (invalidSet.has(to.trim())) { cleaned++; continue; } // 無效信箱：清洗剔除
    await handleOne(brandId, to);
  }
  for (const m of manualEmails) {
    if (!isValidEmail(m.email) || invalidSet.has((m.email || "").trim())) { cleaned++; continue; }
    await handleOne(null, m.email);
  }

  return { sent, failed, queued, skipped, cleaned, dispatched, total: brandIds.length + manualEmails.length };
}
