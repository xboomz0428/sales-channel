import { HttpError } from "@/lib/auth";
import { getCfgMany } from "@/lib/settings";

interface AIResult {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
  ms: number;
}

type Provider = "claude" | "openai" | "gemini";

// 決定使用哪家 AI（DB 設定優先，其次環境變數）：優先 AI_PROVIDER 指定，否則自動挑選
async function resolveProvider(): Promise<{ provider: Provider; apiKey: string; model: string } | null> {
  const c = await getCfgMany([
    "AI_PROVIDER", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_API_KEY",
    "CLAUDE_MODEL", "OPENAI_MODEL", "GEMINI_MODEL",
  ]);
  const explicit = (c.AI_PROVIDER || "").toLowerCase() as Provider | "";
  const anthropicKey = c.ANTHROPIC_API_KEY;
  const openaiKey = c.OPENAI_API_KEY;
  const geminiKey = c.GEMINI_API_KEY || c.GOOGLE_AI_API_KEY;

  const pick = (p: Provider): { provider: Provider; apiKey: string; model: string } | null => {
    if (p === "claude" && anthropicKey)
      return { provider: "claude", apiKey: anthropicKey, model: c.CLAUDE_MODEL || "claude-sonnet-4-6" };
    if (p === "openai" && openaiKey)
      return { provider: "openai", apiKey: openaiKey, model: c.OPENAI_MODEL || "gpt-4o" };
    if (p === "gemini" && geminiKey)
      return { provider: "gemini", apiKey: geminiKey, model: c.GEMINI_MODEL || "gemini-1.5-pro" };
    return null;
  };

  if (explicit) return pick(explicit);
  return pick("claude") || pick("openai") || pick("gemini");
}

async function callAnthropic(system: string, user: string, apiKey: string, model: string): Promise<AIResult> {
  const start = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 2048, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new HttpError(502, `Claude API 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
  return { text, model: data.model || model, usage: { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0, cache_read_input_tokens: data.usage?.cache_read_input_tokens }, ms: Date.now() - start };
}

async function callOpenAI(system: string, user: string, apiKey: string, model: string): Promise<AIResult> {
  const start = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) throw new HttpError(502, `OpenAI API 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return { text, model: data.model || model, usage: { input_tokens: data.usage?.prompt_tokens || 0, output_tokens: data.usage?.completion_tokens || 0 }, ms: Date.now() - start };
}

async function callGemini(system: string, user: string, apiKey: string, model: string): Promise<AIResult> {
  const start = Date.now();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 2048 },
    }),
  });
  if (!res.ok) throw new HttpError(502, `Gemini API 錯誤 (${res.status}): ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || "").join("");
  return { text, model, usage: { input_tokens: data.usageMetadata?.promptTokenCount || 0, output_tokens: data.usageMetadata?.candidatesTokenCount || 0 }, ms: Date.now() - start };
}

/**
 * 統一 AI 呼叫：依環境變數自動選擇 Claude / OpenAI / Gemini。
 * 設定 AI_PROVIDER=claude|openai|gemini 可指定；否則依已設定的金鑰自動挑選。
 */
export async function callAI(system: string, user: string): Promise<AIResult> {
  const cfg = await resolveProvider();
  if (!cfg) {
    throw new HttpError(500, "未設定 AI 金鑰（請設定 ANTHROPIC_API_KEY、OPENAI_API_KEY 或 GEMINI_API_KEY 其一）");
  }
  if (cfg.provider === "openai") return callOpenAI(system, user, cfg.apiKey, cfg.model);
  if (cfg.provider === "gemini") return callGemini(system, user, cfg.apiKey, cfg.model);
  return callAnthropic(system, user, cfg.apiKey, cfg.model);
}

// 相容舊呼叫名稱
export const callClaude = callAI;
