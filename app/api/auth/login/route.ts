import { NextResponse } from "next/server";
import { checkPassword, loginEnabled, signSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  // 未設定 APP_PASSWORD → 登入未啟用（開發期），直接成功放行
  if (!loginEnabled()) return NextResponse.json({ success: true, disabled: true });
  if (!checkPassword(String(password || ""))) {
    return NextResponse.json({ success: false, error: "密碼錯誤" }, { status: 401 });
  }
  const res = NextResponse.json({ success: true });
  res.cookies.set(SESSION_COOKIE, await signSession(), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SESSION_MAX_AGE,
  });
  return res;
}
