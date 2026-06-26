import { NextResponse } from "next/server";
import { getCompany } from "@/lib/companyServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/company — 我方公司資料（供報價單檢視/列印讀取，非機密） */
export async function GET() {
  try {
    const company = await getCompany();
    return NextResponse.json({ success: true, data: company });
  } catch {
    return NextResponse.json({ success: false, error: "讀取失敗" }, { status: 500 });
  }
}
