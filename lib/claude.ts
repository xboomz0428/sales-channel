import { HttpError } from "@/lib/auth";
import { cleanEnv } from "@/lib/env";

interface ClaudeResult {
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
  ms: number;
}

export async function callClaude(system: string, user: string): Promise<ClaudeResult> {
  const apiKey = cleanEnv("ANTHROPIC_API_KEY");
  if (!apiKey) throw new HttpError(500, "ANTHROPIC_API_KEY 未設定");

  const model = cleanEnv("CLAUDE_MODEL") || "claude-sonnet-4-6";
  const start = Date.now();

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new HttpError(502, `Claude API 錯誤 (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  return {
    text,
    model: data.model || model,
    usage: data.usage || { input_tokens: 0, output_tokens: 0 },
    ms: Date.now() - start,
  };
}
