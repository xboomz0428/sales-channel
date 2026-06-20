import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/env";

const supabaseUrl = cleanEnv("NEXT_PUBLIC_SUPABASE_URL") || cleanEnv("SUPABASE_URL");
const serviceRoleKey =
  cleanEnv("SUPABASE_SERVICE_ROLE_KEY") ||
  cleanEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
  cleanEnv("SUPABASE_ANON_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Supabase 環境變數未設定（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
