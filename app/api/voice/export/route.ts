import { getSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";

// 分頁取回全部（避開 PostgREST 1000 筆上限）
async function fetchAll(build: (from: number, to: number) => any) {
  const PAGE = 1000; let all: any[] = []; let from = 0;
  while (true) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * GET /api/voice/export?industry=&city=&limit=&country=
 * 匯出「可外撥名單」CSV：只含有電話、未在拒撥名單、未被遮蔽的品牌。
 * 欄位含話術變數（品牌名/產業/縣市/負責人），可直接餵給 Bland/Retell/Vapi 等平台。
 */
export async function GET(req: Request) {
  try {
    const supabase = getSupabaseServerClient();
    const url = new URL(req.url);
    const industry = url.searchParams.get("industry");
    const city = url.searchParams.get("city");
    const country = url.searchParams.get("country") || "TW";
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "5000", 10) || 5000, 1), 50000);

    // 1) 候選品牌（未遮蔽，可加產業篩選）
    const brands = await fetchAll((from, to) => {
      let q = supabase.from("brands")
        .select("id, name, industry, owner_name, registered_name")
        .eq("country", country).eq("enrich_state", "active")
        .order("name", { ascending: true }).range(from, to);
      if (industry) q = q.ilike("industry", `%${industry}%`);
      return q;
    });
    if (brands.length === 0) return csvResponse([]);
    const brandIds = brands.map((b) => b.id);

    // 2) 電話來源：brand_channels(phone) 優先，其次 stores.phone；同時取 stores.city 供篩選。
    //    有產業篩選(候選數有限)→ 依 id 分塊查(快)；全庫匯出→整表分頁掃。
    const phoneMap = new Map<string, string>();
    const cityMap = new Map<string, string>();
    const scoped = brandIds.length <= 8000;
    const chunk = <T,>(arr: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };
    await Promise.allSettled([
      (async () => {
        const rows = scoped
          ? (await Promise.all(chunk(brandIds, 200).map((ids) => supabase.from("brand_channels").select("brand_id, value").eq("channel", "phone").in("brand_id", ids)))).flatMap((r) => r.data || [])
          : await fetchAll((f, t) => supabase.from("brand_channels").select("brand_id, value").eq("channel", "phone").range(f, t));
        for (const r of rows) if (r.value && !phoneMap.has(r.brand_id)) phoneMap.set(r.brand_id, String(r.value).trim());
      })(),
      (async () => {
        const rows = scoped
          ? (await Promise.all(chunk(brandIds, 200).map((ids) => supabase.from("stores").select("brand_id, phone, city").in("brand_id", ids)))).flatMap((r) => r.data || [])
          : await fetchAll((f, t) => supabase.from("stores").select("brand_id, phone, city").range(f, t));
        for (const r of rows) {
          if (r.phone && String(r.phone).trim() && !phoneMap.has(r.brand_id)) phoneMap.set(r.brand_id, String(r.phone).trim());
          if (r.city && !cityMap.has(r.brand_id)) cityMap.set(r.brand_id, r.city);
        }
      })(),
    ]);

    // 3) 拒撥名單
    const dnc = new Set<string>();
    try {
      const rows = await fetchAll((f, t) => supabase.from("phone_dnc").select("phone").range(f, t));
      for (const r of rows) dnc.add(String(r.phone).replace(/\D/g, ""));
    } catch { /* 拒撥名單讀取失敗不影響 */ }

    // 4) 組裝：有電話、非拒撥、（若指定）符合縣市
    const out: Record<string, string>[] = [];
    for (const b of brands) {
      const phone = phoneMap.get(b.id);
      if (!phone) continue;
      if (dnc.has(phone.replace(/\D/g, ""))) continue;
      const bcity = cityMap.get(b.id) || "";
      if (city && bcity !== city) continue;
      out.push({
        brand_id: b.id,
        phone,
        品牌名: b.name || "",
        產業: b.industry || "",
        縣市: bcity,
        負責人: b.owner_name || "",
        公司名稱: b.registered_name || "",
      });
      if (out.length >= limit) break;
    }
    return csvResponse(out);
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "匯出失敗" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

function csvResponse(rows: Record<string, string>[]) {
  const headers = ["brand_id", "phone", "品牌名", "產業", "縣市", "負責人", "公司名稱"];
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(","));
  const csv = "﻿" + lines.join("\r\n"); // BOM 讓 Excel 正確判讀 UTF-8
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="voice_call_list_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
