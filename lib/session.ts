// 輕量登入 session：HMAC 簽章的 cookie（Edge middleware 與 Node route 皆可用，走 Web Crypto）。
// 單一公司內部工具 → 共用密碼登入；session 密鑰由 APP_LOGIN_SECRET（或退回 APP_PASSWORD）簽發。

export const SESSION_COOKIE = "sc_session";
const DAYS = 7;

function sessionSecret(): string {
  return process.env.APP_LOGIN_SECRET || process.env.APP_PASSWORD || "dev-secret";
}
// 登入密碼（未設定時視為「未啟用登入」＝開發期放行）
export function loginEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}
export function checkPassword(input: string): boolean {
  const pw = process.env.APP_PASSWORD || "";
  return !!pw && input === pw;
}

const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64url(new Uint8Array(sig));
}

/** 產生 session token（含到期時間） */
export async function signSession(): Promise<string> {
  const exp = Date.now() + DAYS * 86400_000;
  return `${exp}.${await hmac(String(exp))}`;
}
/** 驗證 session token：簽章相符且未過期 */
export async function verifySession(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  const expect = await hmac(exp);
  // 長度相同才逐字比較，降低 timing 洩漏
  if (sig.length !== expect.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expect.charCodeAt(i);
  return diff === 0;
}
export const SESSION_MAX_AGE = DAYS * 86400;
