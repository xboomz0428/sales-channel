import { HttpError } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DAILY_CAP = Number(process.env.AI_DAILY_GENERATION_CAP) || 200;

export async function assertDailyGenerationCap(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await supabaseAdmin
    .from("outreach_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`)
    .lte("created_at", `${today}T23:59:59Z`);

  if ((count ?? 0) >= DAILY_CAP) {
    throw new HttpError(429, `今日 AI 生成已達上限（${DAILY_CAP} 則）`);
  }
}
