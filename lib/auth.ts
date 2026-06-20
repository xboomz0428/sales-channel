import { NextResponse } from "next/server";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * 簡易驗證：目前為單人系統，僅檢查環境變數 API_SECRET。
 * 若 API_SECRET 未設定則直接放行（開發期）。
 */
export async function requireUser(): Promise<void> {
  // 開發期暫不驗證；正式環境可串接 Clerk / NextAuth
  const secret = process.env.API_SECRET;
  if (!secret) return;
  // 若未來要求帶 header，可在此驗證
}

/**
 * Cron 端點驗證：Vercel Cron 會帶 Authorization: Bearer <CRON_SECRET>
 */
export function requireCron(req: Request): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) return;
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    throw new HttpError(401, "Unauthorized cron call");
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: err.message },
      { status: err.status }
    );
  }
  const message = err instanceof Error ? err.message : "伺服器錯誤";
  console.error("[API Error]", err);
  return NextResponse.json({ error: message }, { status: 500 });
}
