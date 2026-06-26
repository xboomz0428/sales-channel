import { getCfgMany } from "@/lib/settings";

/**
 * 透過 LINE Messaging API 廣播訊息給官方帳號(bot)的所有好友。
 * （LINE Notify 已於 2025/3 停止服務，改用 Messaging API broadcast）
 *
 * 需要在「API 設定」填入：
 *   LINE_CHANNEL_ACCESS_TOKEN  — LINE Developers 後台的長期 access token
 *   LINE_NOTIFY_ENABLED        — 'true' 才會實際送出
 *
 * 失敗不丟例外，只回傳結果，避免阻塞寄信主流程。
 */
export async function notifyLine(text: string): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  try {
    const cfg = await getCfgMany(["LINE_CHANNEL_ACCESS_TOKEN", "LINE_NOTIFY_ENABLED"]);
    const token = cfg.LINE_CHANNEL_ACCESS_TOKEN;
    const enabled = (cfg.LINE_NOTIFY_ENABLED || "").toLowerCase() === "true";
    if (!enabled || !token) return { ok: false, skipped: true };

    const res = await fetch("https://api.line.me/v2/bot/message/broadcast", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages: [{ type: "text", text: text.slice(0, 4900) }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `LINE ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "LINE 推播失敗" };
  }
}
