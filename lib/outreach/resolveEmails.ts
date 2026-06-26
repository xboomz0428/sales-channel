import { supabaseAdmin } from "@/lib/supabaseAdmin";

const JUNK_EMAIL = /sentry\.io|ingest\.|noreply|no-reply|example\.|@sentry|wixpress|\.png$|\.jpg$/i;
export const isValidEmail = (e: string | null | undefined): e is string =>
  !!e && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e) && !JUNK_EMAIL.test(e);

/** 取一組品牌的最佳 email：採集管道 → 聯絡人 → 名單 */
export async function resolveBrandEmails(brandIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (brandIds.length === 0) return map;
  const { data: brands } = await supabaseAdmin
    .from("brands")
    .select("id, email, brand_channels(channel, value), contacts(email)")
    .in("id", brandIds);
  for (const b of brands || []) {
    const chEmail = ((b as any).brand_channels || []).find((c: any) => c.channel === "email" && isValidEmail(c.value))?.value;
    const contactEmail = ((b as any).contacts || []).map((c: any) => c.email).find(isValidEmail);
    const email = chEmail || contactEmail || (isValidEmail((b as any).email) ? (b as any).email : null);
    if (email) map.set((b as any).id, email);
  }
  return map;
}
