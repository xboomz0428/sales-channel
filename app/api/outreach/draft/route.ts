import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/auth";
import { callClaude } from "@/lib/claude";
import { parseDraft } from "@/lib/outreach/prompt";
import { checkCompliance } from "@/lib/outreach/compliance";

export const runtime = "nodejs";

/**
 * POST /api/outreach/draft
 * 用 AI 生成電子報/信件草稿（給編輯器用，不綁定特定品牌、不寫入訊息表）
 *   body: { intent: string, industry?: string, tone?: string }
 *   回傳: { subject, body, complianceFlag, complianceNote }
 *
 * 需設定環境變數 ANTHROPIC_API_KEY，否則回傳 500 並提示。
 */
export async function POST(req: Request) {
  try {
    const { intent, industry, tone } = await req.json();
    if (!intent || typeof intent !== "string") {
      return NextResponse.json({ error: "請提供信件主題/目的（intent）" }, { status: 400 });
    }

    const system = `你是 HeroHerb 好漢草的行銷文案助手。
公司經營天然草本保健 B2B 通路，主打：艾草淨化包、草本足浴包、空間噴霧、精選禮盒。
品牌調性：專業、親切、自然樸實、值得信賴。
撰寫電子報/開發信時：
- 繁體中文，300 字以內，分段清楚
- 開頭親切問候，明確說明價值，結尾有具體行動呼籲
- 不得宣稱療效或使用醫療用語（台灣藥事法合規）
- 可用 {{品牌名}} 作為個人化變數`;

    let user = `請依以下需求撰寫一封電子報/開發信：\n目的：${intent}`;
    if (industry) user += `\n目標產業：${industry}`;
    if (tone) user += `\n語氣：${tone}`;
    user += `\n\n請以以下格式回覆：\nSUBJECT:（主旨）\nBODY:\n（內文，可含多段，用空行分段）`;

    const result = await callClaude(system, user);
    const { subject, body } = parseDraft(result.text);
    const compliance = checkCompliance(`${subject}\n${body}`);

    return NextResponse.json({
      subject,
      body,
      complianceFlag: compliance.flag,
      complianceNote: compliance.note,
      model: result.model,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
