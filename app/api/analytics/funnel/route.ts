// app/api/analytics/funnel/route.ts
// GET /api/analytics/funnel
// 回傳：垂直市場轉換率 + 漏斗分佈 + 階段瓶頸 + 本週行動清單
// 資料來源為 migration 0019 建立的 View（接本專案實際 schema）

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    const [conversion, funnel, bottleneck, actions] = await Promise.all([
      supabaseAdmin.from("industry_conversion").select("*"),
      supabaseAdmin.from("funnel_by_industry").select("*"),
      supabaseAdmin.from("stage_bottleneck").select("*"),
      supabaseAdmin.from("weekly_action_list").select("*"),
    ]);

    if (conversion.error) throw conversion.error;
    if (funnel.error) throw funnel.error;

    return NextResponse.json({
      conversion: conversion.data,
      funnel: funnel.data,
      bottleneck: bottleneck.data,
      actionList: actions.data,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
