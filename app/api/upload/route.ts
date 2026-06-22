import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BUCKET = "email-assets";
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/upload  (multipart/form-data, field: file)
 * 上傳檔案/圖片到 Supabase Storage（公開 bucket），回傳公開網址。
 * 供郵件編輯器的圖片與夾帶檔案使用。
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "缺少檔案" }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: "檔案超過 10MB 上限" }, { status: 400 });
    }

    const safeName = (file.name || "file").replace(/[^\w.\-]+/g, "_").slice(-60);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());

    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ success: true, url: data.publicUrl, name: file.name, size: file.size });
  } catch (e) {
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : "上傳失敗" }, { status: 500 });
  }
}
