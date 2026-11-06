// 自動跟進「唯讀」試算：列出每條啟用規則此刻（或指定時刻）會排入幾封跟進信。
// 用法：node --env-file=.env.local scripts/followup-dryrun.mjs [--now=2026-11-10T00:05:00Z]
// 只呼叫 planFollowups（純讀取），絕不呼叫 enqueueFollowupPlan、不寫入任何資料。
import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "../lib/env.ts";
import { planFollowups } from "../lib/outreach/followupCore.ts";

// client 建法與 lib/supabase-server.ts 的 getSupabaseServerClient 相同（同一組環境變數與優先序）
function makeClient() {
  const supabaseUrl = cleanEnv("NEXT_PUBLIC_SUPABASE_URL") || cleanEnv("SUPABASE_URL");
  const anonKey = cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || cleanEnv("SUPABASE_ANON_KEY");
  const serviceKey = cleanEnv("SUPABASE_SERVICE_ROLE_KEY");
  const preferService = cleanEnv("USE_SERVICE_ROLE") === "1";
  const key = (preferService && serviceKey) ? serviceKey : (anonKey || serviceKey);
  if (!supabaseUrl || !key) throw new Error("Supabase 環境變數未設定（請用 node --env-file=.env.local 執行）");
  return createClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const nowArg = process.argv.find((a) => a.startsWith("--now="));
const now = nowArg ? new Date(nowArg.slice("--now=".length)) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error("無效的 --now 時間：" + nowArg);
  process.exit(1);
}

const twStr = (iso) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().replace("T", " ").slice(0, 16) + "（台灣）";

const plans = await planFollowups(makeClient(), now);
console.log(`試算時刻：${now.toISOString()} = ${twStr(now.toISOString())}　啟用規則 ${plans.length} 條`);
for (const p of plans) {
  console.log("—".repeat(40));
  console.log(`規則：${p.rule.name}（days_after=${p.rule.days_after}, condition=${p.rule.condition}）`);
  console.log(`  cutoff（sent_at <）：${p.cutoff} = ${twStr(p.cutoff)}`);
  console.log(`  符合時間條件的原始信：${p.eligibleOrigins}　其中已跟進：${p.alreadyFollowed}`);
  console.log(`  將排入：${p.targets.length}${p.deferred ? `　（超過單次上限、留待隔天：${p.deferred}）` : ""}`);
  if (p.template) console.log(`  跟進模板：${p.template.name || "（未命名）"}`);
  if (p.skipReason) console.log(`  略過原因：${p.skipReason}`);
  if (p.error) console.log(`  ⚠️ 錯誤：${p.error}`);
}
