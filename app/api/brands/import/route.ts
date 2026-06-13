import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/brands/import
 * 接收 multipart/form-data 的 XLS/XLSX 檔，解析後批次寫入 brands + brand_channels
 */

const VALID_STATUSES = new Set(["new", "contacted", "sampling", "quoting", "negotiating", "won", "lost"]);

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}
function cleanInt(v: unknown): number | null {
  const n = parseInt(String(v ?? ""), 10);
  return isNaN(n) ? null : n;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "請上傳檔案" }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    // 取第一個工作表
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "檔案內無資料列" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();

    // 取既有品牌名稱（用於去重）
    const { data: existingBrands } = await supabase.from("brands").select("name");
    const existingNames = new Set((existingBrands ?? []).map((b) => b.name.trim()));

    let imported = 0, skipped = 0, errors = 0;
    const errorDetails: string[] = [];

    for (const row of rows) {
      const name = cleanStr(row["品牌名稱*"] || row["品牌名稱"]);
      if (!name) { skipped++; continue; }
      if (existingNames.has(name)) { skipped++; continue; }

      const status = VALID_STATUSES.has(cleanStr(row["狀態"])) ? cleanStr(row["狀態"]) : "new";
      const storeCount = cleanInt(row["分店數"]) ?? 1;
      const cities = cleanStr(row["城市（逗號分隔）"] || row["城市"]);
      const industry = cleanStr(row["產業別"]);
      const taxId = cleanStr(row["統一編號"]) || null;
      const ownerName = cleanStr(row["負責人"]) || null;
      const website = cleanStr(row["官網"]) || null;
      const phone = cleanStr(row["電話"]) || null;
      const line = cleanStr(row["LINE"]) || null;
      const fb = cleanStr(row["Facebook"]) || null;
      const ig = cleanStr(row["Instagram"]) || null;
      const estAnnual = cleanInt(row["預估年營收(NT$)"]);
      const probability = cleanInt(row["成交機率(%)"]);
      const pitch = cleanStr(row["備註"]) || null;

      // 計算 brand_key（取前12字，用於連鎖歸戶）
      const brandKey = name.slice(0, 20);

      const { data: brand, error: brandErr } = await supabase
        .from("brands")
        .insert({
          name,
          brand_key: brandKey,
          industry: industry || null,
          store_count: storeCount,
          tax_id: taxId,
          owner_name: ownerName,
          status,
          pitch,
          priority_score: probability ?? 50,
        })
        .select("id")
        .single();

      if (brandErr || !brand) {
        errors++;
        errorDetails.push(`「${name}」：${brandErr?.message ?? "未知錯誤"}`);
        continue;
      }

      existingNames.add(name);
      imported++;

      // 寫入 brand_channels
      const channels: Array<{ channel: string; value: string }> = [];
      if (website) channels.push({ channel: "website", value: website });
      if (phone)   channels.push({ channel: "phone",   value: phone });
      if (line)    channels.push({ channel: "line",    value: line });
      if (fb)      channels.push({ channel: "fb",      value: fb });
      if (ig)      channels.push({ channel: "ig",      value: ig });

      if (channels.length > 0) {
        await supabase.from("brand_channels").insert(
          channels.map((c) => ({ brand_id: brand.id, ...c, fetched_at: new Date().toISOString() }))
        );
      }

      // 如有年營收 / 機率，建立商機記錄
      if (estAnnual || probability) {
        await supabase.from("opportunities").insert({
          brand_id: brand.id,
          stage: status === "won" ? "won" : status === "lost" ? "lost" : "new",
          est_annual_value: estAnnual ?? null,
          probability: probability ?? null,
        });
      }

      // 城市拆分存第一間門市（佔位用）
      if (cities) {
        const cityList = cities.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
        const firstCity = cityList[0];
        await supabase.from("stores").insert({
          brand_id: brand.id,
          name: `${name}（匯入）`,
          city: firstCity ?? null,
          website: website ?? null,
          phone: phone ?? null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { total: rows.length, imported, skipped, errors, errorDetails },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "匯入失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
