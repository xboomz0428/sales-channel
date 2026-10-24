import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/**
 * POST /api/brands/import
 * 接收 multipart/form-data 的 XLS/XLSX 檔，自動辨識格式後批次寫入：
 *  - B2B 通路樣板（含「品牌名稱*」欄）→ 既有通路匯入
 *  - 好漢草官網會員匯出（含 email + 姓名/會員ID 欄）→ 會員名單匯入，依 email／電話／LINE 去重
 */

const VALID_STATUSES = new Set(["new", "contacted", "sampling", "quoting", "negotiating", "won", "lost"]);

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}
function cleanInt(v: unknown): number | null {
  const n = parseInt(String(v ?? "").replace(/[^\d-]/g, ""), 10);
  return isNaN(n) ? null : n;
}
// email 正規化：小寫去空白，需含 @ 與網域點
function normEmail(v: unknown): string {
  const s = cleanStr(v).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : "";
}
// 電話正規化（僅留數字；台灣號碼去國碼 +886→0）— 僅供去重比對
function normPhone(v: unknown): string {
  let s = cleanStr(v).replace(/[^\d+]/g, "");
  if (s.startsWith("+886")) s = "0" + s.slice(4);
  else if (s.startsWith("886") && s.length >= 11) s = "0" + s.slice(3);
  s = s.replace(/\D/g, "");
  return s.length >= 7 ? s : "";
}

type Row = Record<string, unknown>;

export async function POST(request: NextRequest) {
  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ success: false, error: "無法解析上傳的表單資料，請確認檔案格式" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ success: false, error: "請上傳檔案" }, { status: 400 });
    if (file.size === 0) return NextResponse.json({ success: false, error: "檔案是空的" }, { status: 400 });

    let wb: XLSX.WorkBook;
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      wb = XLSX.read(buf, { type: "buffer" });
    } catch {
      return NextResponse.json({ success: false, error: "無法讀取檔案，請確認是有效的 .xlsx / .xls 格式" }, { status: 400 });
    }

    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "" });
    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: "檔案內無資料列" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const header = Object.keys(rows[0]);
    const has = (k: string) => header.includes(k);

    // 格式判斷：優先認 B2B 樣板；否則官網會員（有 email 且有 姓名 或 會員ID）
    const isB2B = has("品牌名稱*") || has("品牌名稱");
    const isMember = !isB2B && has("email") && (has("姓名") || has("會員ID"));

    if (isMember) {
      return await importMembers(supabase, rows);
    }
    return await importB2B(supabase, rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "匯入失敗";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

// ── 好漢草官網會員匯入（依 email／電話／LINE 去重）───────────────────
async function importMembers(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  rows: Row[],
) {
  interface Cand {
    name: string; email: string; phoneRaw: string; phone: string; line: string;
    city: string; address: string; country: string; group: string;
    spend: number; times: number; joined: string; note: string;
  }

  const cands: Cand[] = [];
  let skippedNoContact = 0;
  let dedupInFile = 0;
  const seen = new Set<string>(); // 檔案內去重鍵

  for (const row of rows) {
    const email = normEmail(row["email"]);
    const phoneRaw = cleanStr(row["電話"]);
    const phone = normPhone(phoneRaw);
    const line = cleanStr(row["LINE_USERID"] || row["LINE_ID"]);
    // 無任何聯絡方式 → 無法後續聯繫，略過
    if (!email && !phone && !line) { skippedNoContact++; continue; }

    const keys = [email && `e:${email}`, phone && `p:${phone}`, line && `l:${line}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) { dedupInFile++; continue; }
    keys.forEach((k) => seen.add(k));

    const rawName = cleanStr(row["姓名"]);
    const memberId = cleanStr(row["會員ID"]);
    const name = (rawName || (email ? email.split("@")[0] : "") || phoneRaw || (memberId ? `會員${memberId}` : "官網會員")).slice(0, 80);
    const group = cleanStr(row["會員群組"]) || "官網會員";
    const spend = cleanInt(row["累積消費(已付款)"]) ?? 0;
    const times = cleanInt(row["累積次數"]) ?? 0;
    const joined = cleanStr(row["加入日期"]).slice(0, 10);
    const note = cleanStr(row["備註"]);

    cands.push({
      name, email, phoneRaw, phone, line,
      city: cleanStr(row["居住縣市"]),
      address: cleanStr(row["居住地址"]),
      country: cleanStr(row["國家"]) || "TW",
      group, spend, times, joined, note,
    });
  }

  if (cands.length === 0) {
    return NextResponse.json({
      success: true,
      data: { total: rows.length, imported: 0, skipped: skippedNoContact + dedupInFile, errors: 0, mode: "member", dedupInFile, dedupExisting: 0, skippedNoContact, errorDetails: [] },
    });
  }

  // 對既有名單去重：以 email 與 電話 比對 brands 與 brand_channels
  const emails = [...new Set(cands.map((c) => c.email).filter(Boolean))];
  const phonesRaw = [...new Set(cands.map((c) => c.phoneRaw).filter(Boolean))];

  const existingEmail = new Set<string>();
  const existingPhone = new Set<string>(); // 以正規化後比對

  // 分批查詢，避免 in 清單過長
  const chunk = <T,>(arr: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < arr.length; i += n) o.push(arr.slice(i, i + n)); return o; };

  for (const part of chunk(emails, 300)) {
    const [{ data: b }, { data: ch }] = await Promise.all([
      supabase.from("brands").select("email").in("email", part),
      supabase.from("brand_channels").select("value").eq("channel", "email").in("value", part),
    ]);
    (b ?? []).forEach((r) => r.email && existingEmail.add(String(r.email).toLowerCase()));
    (ch ?? []).forEach((r) => r.value && existingEmail.add(String(r.value).toLowerCase()));
  }
  for (const part of chunk(phonesRaw, 300)) {
    const [{ data: b }, { data: ch }] = await Promise.all([
      supabase.from("brands").select("phone").in("phone", part),
      supabase.from("brand_channels").select("value").eq("channel", "phone").in("value", part),
    ]);
    (b ?? []).forEach((r) => { const p = normPhone(r.phone); if (p) existingPhone.add(p); });
    (ch ?? []).forEach((r) => { const p = normPhone(r.value); if (p) existingPhone.add(p); });
  }

  const toInsert = cands.filter((c) =>
    !(c.email && existingEmail.has(c.email)) && !(c.phone && existingPhone.has(c.phone)),
  );
  const dedupExisting = cands.length - toInsert.length;

  let imported = 0, errors = 0;
  const errorDetails: string[] = [];

  // 分批 bulk insert brands → 取回 id（PostgREST 依插入順序回傳）→ 建 channels / stores
  for (const part of chunk(toInsert, 300)) {
    const payload = part.map((c) => ({
      name: c.name,
      brand_key: c.name.slice(0, 20),
      industry: "官網會員",
      industry_sub: c.group,
      status: "new",
      country: c.country,
      email: c.email || null,
      phone: c.phoneRaw || null,
      company_address: c.address || null,
      data_source: "website_member",
      priority_score: c.spend > 0 ? 70 : 50,
      pitch: `官網會員（${c.group}）｜累積消費 NT$${c.spend.toLocaleString()}／${c.times} 次${c.joined ? `｜加入 ${c.joined}` : ""}${c.note ? `｜備註：${c.note}` : ""}`.slice(0, 500),
    }));

    const { data: inserted, error } = await supabase.from("brands").insert(payload).select("id");
    if (error || !inserted) {
      errors += part.length;
      if (errorDetails.length < 5) errorDetails.push(error?.message ?? "批次寫入失敗");
      continue;
    }
    imported += inserted.length;

    const now = new Date().toISOString();
    const channels: Array<{ brand_id: string; channel: string; value: string; fetched_at: string }> = [];
    const stores: Array<{ brand_id: string; name: string; city: string | null; address: string | null; phone: string | null }> = [];
    inserted.forEach((b, i) => {
      const c = part[i];
      if (!c) return;
      if (c.email) channels.push({ brand_id: b.id, channel: "email", value: c.email, fetched_at: now });
      if (c.phoneRaw) channels.push({ brand_id: b.id, channel: "phone", value: c.phoneRaw, fetched_at: now });
      if (c.line) channels.push({ brand_id: b.id, channel: "line", value: c.line, fetched_at: now });
      if (c.city || c.address) stores.push({ brand_id: b.id, name: `${c.name}（官網會員）`, city: c.city || null, address: c.address || null, phone: c.phoneRaw || null });
    });
    if (channels.length) for (const cp of chunk(channels, 500)) await supabase.from("brand_channels").insert(cp);
    if (stores.length) for (const sp of chunk(stores, 500)) await supabase.from("stores").insert(sp);
  }

  return NextResponse.json({
    success: true,
    data: {
      total: rows.length,
      imported,
      skipped: skippedNoContact + dedupInFile + dedupExisting,
      errors,
      mode: "member",
      dedupInFile,
      dedupExisting,
      skippedNoContact,
      errorDetails,
    },
  });
}

// ── B2B 通路樣板匯入（原行為）───────────────────────────────────────
async function importB2B(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  rows: Row[],
) {
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

    const { data: brand, error: brandErr } = await supabase
      .from("brands")
      .insert({
        name,
        brand_key: name.slice(0, 20),
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

    if (estAnnual || probability) {
      await supabase.from("opportunities").insert({
        brand_id: brand.id,
        stage: status === "won" ? "won" : status === "lost" ? "lost" : "new",
        est_annual_value: estAnnual ?? null,
        probability: probability ?? null,
      });
    }

    if (cities) {
      const cityList = cities.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
      await supabase.from("stores").insert({
        brand_id: brand.id,
        name: `${name}（匯入）`,
        city: cityList[0] ?? null,
        website: website ?? null,
        phone: phone ?? null,
      });
    }
  }

  return NextResponse.json({
    success: true,
    data: { total: rows.length, imported, skipped, errors, mode: "b2b", errorDetails },
  });
}
