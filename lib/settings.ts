import { getSupabaseServerClient } from "@/lib/supabase-server";
import { cleanEnv } from "@/lib/env";

// 用與其他 API 完全相同的 Supabase client（已驗證可用）
function db() {
  try {
    return getSupabaseServerClient();
  } catch {
    return null;
  }
}

let cache: { at: number; map: Record<string, string> } | null = null;
const TTL = 15_000; // 15 秒快取，避免每次都打 DB

export async function getSettings(force = false): Promise<Record<string, string>> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.map;
  const client = db();
  if (!client) return cache?.map ?? {};
  try {
    const { data } = await client.from("app_settings").select("key, value");
    const map: Record<string, string> = {};
    for (const r of data ?? []) {
      if (r.value != null && String(r.value).trim() !== "") map[r.key] = String(r.value);
    }
    cache = { at: Date.now(), map };
    return map;
  } catch {
    return cache?.map ?? {};
  }
}

/** 取設定值：優先 DB（app_settings），其次環境變數。 */
export async function getCfg(key: string): Promise<string | undefined> {
  const map = await getSettings();
  const v = map[key];
  if (v && v.trim() !== "") return v;
  return cleanEnv(key);
}

/** 多筆一次取 */
export async function getCfgMany(keys: string[]): Promise<Record<string, string | undefined>> {
  const map = await getSettings();
  const out: Record<string, string | undefined> = {};
  for (const k of keys) out[k] = (map[k] && map[k].trim() !== "") ? map[k] : cleanEnv(k);
  return out;
}

/** 寫入設定（空字串視為清除）。 */
export async function saveSettings(values: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  const client = db();
  if (!client) return { ok: false, error: "資料庫未連線" };
  const rows = Object.entries(values).map(([key, value]) => ({ key, value: value ?? "", updated_at: new Date().toISOString() }));
  if (rows.length === 0) return { ok: true };
  const { error } = await client.from("app_settings").upsert(rows, { onConflict: "key" });
  cache = null;
  return error ? { ok: false, error: error.message } : { ok: true };
}
