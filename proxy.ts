import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession, loginEnabled } from "@/lib/session";

// 這些路徑「必須公開」，不能擋（否則會壞掉）：
// - /login 與登入 API；Next 靜態資源
// - 郵件開信/點擊追蹤像素與連結（外部信箱會打）
// - Vercel cron（自帶 CRON_SECRET 驗證）
// - 各語音平台 webhook（自帶 token 驗證）
const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  "/api/track/",
  "/api/cron/",
  "/api/voice/webhook",
  "/_next/",
  "/favicon",
];

export async function proxy(req: NextRequest) {
  // 未設定 APP_PASSWORD → 登入未啟用（開發期），全部放行
  if (!loginEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();

  // API → 401 JSON；頁面 → 導去 /login（帶回跳網址）
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // 排除靜態資源；其餘都經過 middleware
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|ico|webp|css|js)$).*)"],
};
