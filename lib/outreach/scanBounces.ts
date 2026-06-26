import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { listMessages, getMessageText } from "@/lib/channels/gmail";
import { classifyBounce, addToBlacklist } from "@/lib/outreach/blacklist";

/**
 * 掃 Gmail 信箱裡的退信通知（mailer-daemon / postmaster），
 * 比對近 3 天寄出的收件人，分類硬/軟退信並寫入黑名單。
 * 回傳 { hard, soft, ignored }。
 */
export async function scanBounces(): Promise<{ scanned: number; hard: number; soft: number; ignored: number }> {
  const since = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("outreach_messages")
    .select("id, to_email")
    .eq("channel", "EM")
    .eq("status", "sent")
    .gte("created_at", since)
    .not("to_email", "is", null);

  if (!recent || recent.length === 0) return { scanned: 0, hard: 0, soft: 0, ignored: 0 };

  const ids = await listMessages("from:(mailer-daemon OR postmaster) newer_than:3d", 50);

  let hard = 0, soft = 0, ignored = 0;
  for (const id of ids) {
    const text = await getMessageText(id);
    const lower = text.toLowerCase();
    for (const m of recent) {
      const email = (m.to_email || "").toLowerCase();
      if (!email || !lower.includes(email)) continue;

      const kind = classifyBounce(text);
      if (kind === "none") { ignored++; continue; }

      const { data: upd } = await supabaseAdmin
        .from("outreach_messages")
        .update({ status: "bounced", error_detail: kind === "hard" ? "硬退信（信箱不存在）" : "軟退信（暫時性）" })
        .eq("id", m.id)
        .eq("status", "sent")
        .select("id");
      if (upd && upd.length) {
        await addToBlacklist(email, kind === "hard" ? "hard" : "soft", kind === "hard" ? "硬退信" : "軟退信");
        kind === "hard" ? hard++ : soft++;
      }
    }
  }
  return { scanned: ids.length, hard, soft, ignored };
}
