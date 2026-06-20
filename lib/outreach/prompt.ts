interface Brand {
  id: string;
  name: string;
  industry: string;
}

interface PromptInput {
  brand: Brand;
  channel: string;
  stepOrder: number;
  goal?: string;
  productFocus?: string;
  template?: { subject: string | null; body: string } | null;
}

export function buildSystemPrompt(): string {
  return `你是 HeroHerb 好漢草的業務開發助手。
公司經營天然草本保健品 B2B 通路，主打：養生茶飲、漢方保健食品、草本原料供應。
品牌調性：專業但親切、自然樸實、值得信賴。

撰寫外聯訊息時請遵守以下原則：
- 簡潔有力，不超過 300 字
- 開頭提及對方品牌名稱，展現個人化
- 明確說明合作價值，不用空洞套話
- 結尾有具體的行動呼籲（CTA）
- 不得宣稱療效或使用醫療用語（台灣藥事法合規）
- 用繁體中文撰寫`;
}

export function buildUserPrompt(input: PromptInput): string {
  const { brand, channel, stepOrder, goal, productFocus, template } = input;
  const channelLabel = channel === "EM" ? "Email" : channel === "LN" ? "LINE" : channel;

  let prompt = `請為以下品牌撰寫一封${channelLabel}外聯訊息：

品牌名稱：${brand.name}
產業類別：${brand.industry}
序列步驟：第 ${stepOrder} 步`;

  if (goal) prompt += `\n目標：${goal}`;
  if (productFocus) prompt += `\n重點產品：${productFocus}`;

  if (template) {
    prompt += `\n\n以下是母版模板，請據此個人化（保留結構，調整稱呼與內容）：`;
    if (template.subject) prompt += `\n主旨：${template.subject}`;
    prompt += `\n內容：${template.body}`;
  }

  if (channel === "EM") {
    prompt += `\n\n請以以下格式回覆：
SUBJECT: （主旨）
BODY:
（信件內容）`;
  }

  return prompt;
}

export function parseDraft(text: string): { subject: string; body: string } {
  const subjectMatch = text.match(/SUBJECT:\s*(.+?)(?:\n|$)/);
  const bodyMatch = text.match(/BODY:\s*\n?([\s\S]+)/);

  if (subjectMatch && bodyMatch) {
    return {
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
    };
  }

  // fallback：整段作為 body
  const lines = text.trim().split("\n");
  return {
    subject: lines[0].slice(0, 80),
    body: text.trim(),
  };
}
