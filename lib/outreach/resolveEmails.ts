import { supabaseAdmin } from "@/lib/supabaseAdmin";

const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$/i;
export const isValidEmail = (e: string | null | undefined): e is string =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);

// .in() 的 id 會展開在 URL 上，一次太多會超過長度上限（實測約 400 個 uuid 即 fetch failed）→ 100 個一塊
const CHUNK = 100;

/**
 * 取一組品牌的最佳 email：採集管道 → 聯絡人 → 名單
 * 查詢失敗一律丟錯（不回空 Map）：否則整批名單會被誤判成「沒有 Email」而靜默消失。
 */
export async function resolveBrandEmails(brandIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (brandIds.length === 0) return map;
  for (let i = 0; i < brandIds.length; i += CHUNK) {
    const { data: brands, error } = await supabaseAdmin
      .from("brands")
      .select("id, email, brand_channels(channel, value), contacts(email)")
      .in("id", brandIds.slice(i, i + CHUNK));
    if (error) throw new Error("讀取名單 Email 失敗：" + error.message);
    for (const b of brands || []) {
      const chEmail = ((b as any).brand_channels || []).find((c: any) => c.channel === "email" && isValidEmail(c.value))?.value;
      const contactEmail = ((b as any).contacts || []).map((c: any) => c.email).find(isValidEmail);
      const email = chEmail || contactEmail || (isValidEmail((b as any).email) ? (b as any).email : null);
      if (email) map.set((b as any).id, email);
    }
  }
  return map;
}
