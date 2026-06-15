import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * POST /api/brands/detect-chains
 * 根據 stores 表分析：同一品牌多個不同地址 → 標記連鎖、分類群組、提高優先分
 *
 * 群組分類：
 *   全國連鎖  ≥ 3 個不同縣市
 *   區域連鎖  2 個不同縣市
 *   多據點    多店同城（同縣市 ≥ 2 間）
 */
export async function POST() {
  const supabase = getSupabaseServerClient();

  try {
    const { data: stores } = await supabase
      .from("stores")
      .select("brand_id, city");

    if (!stores) {
      return NextResponse.json({ success: false, error: "查詢失敗" });
    }

    // 彙整每個品牌的城市集合
    const brandMap: Record<string, { cities: Set<string>; count: number }> = {};
    for (const s of stores) {
      if (!s.brand_id) continue;
      if (!brandMap[s.brand_id]) brandMap[s.brand_id] = { cities: new Set(), count: 0 };
      brandMap[s.brand_id].count++;
      if (s.city) brandMap[s.brand_id].cities.add(s.city);
    }

    const chains = Object.entries(brandMap).filter(([, v]) => v.count >= 2);
    const groups: Record<string, number> = { 全國連鎖: 0, 區域連鎖: 0, 多據點: 0 };
    let updated = 0;

    for (const [brandId, info] of chains) {
      const cityCount = info.cities.size;
      const storeCount = info.count;

      let chainType: string;
      let minPriority: number;

      if (cityCount >= 3) {
        chainType = "全國連鎖";
        minPriority = 90;
      } else if (cityCount === 2) {
        chainType = "區域連鎖";
        minPriority = 82;
      } else {
        chainType = "多據點";
        minPriority = 75;
      }

      groups[chainType]++;

      const { data: brand } = await supabase
        .from("brands")
        .select("priority_score")
        .eq("id", brandId)
        .single();

      // 依門市數額外加分，上限 98
      const bonus = Math.min(storeCount * 2, 8);
      const newScore = Math.min(
        Math.max(brand?.priority_score ?? 50, minPriority + bonus),
        98
      );

      await supabase
        .from("brands")
        .update({
          is_chain: true,
          chain_type: chainType,
          store_count: storeCount,
          priority_score: newScore,
          updated_at: new Date().toISOString(),
        })
        .eq("id", brandId);

      updated++;
    }

    return NextResponse.json({
      success: true,
      data: {
        total_brands: Object.keys(brandMap).length,
        chains_found: chains.length,
        updated,
        groups,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "失敗" },
      { status: 500 }
    );
  }
}
