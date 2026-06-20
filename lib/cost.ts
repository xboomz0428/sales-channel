// 簡易成本估算（依 Anthropic 公開定價）
const PRICING: Record<string, { input: number; output: number; cached?: number }> = {
  "claude-sonnet-4-6":  { input: 3, output: 15, cached: 0.3 },
  "claude-haiku-4-5":   { input: 0.8, output: 4, cached: 0.08 },
  "claude-opus-4-8":    { input: 15, output: 75, cached: 1.5 },
};

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
}

export async function computeCost(
  model: string,
  usage: Usage
): Promise<{
  tokens_in: number;
  tokens_out: number;
  cached_tokens: number;
  cost_usd: number;
}> {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"];
  const cached = usage.cache_read_input_tokens || 0;
  const nonCachedIn = usage.input_tokens - cached;

  const cost_usd =
    (nonCachedIn / 1_000_000) * p.input +
    (cached / 1_000_000) * (p.cached ?? p.input) +
    (usage.output_tokens / 1_000_000) * p.output;

  return {
    tokens_in: usage.input_tokens,
    tokens_out: usage.output_tokens,
    cached_tokens: cached,
    cost_usd: Math.round(cost_usd * 1_000_000) / 1_000_000,
  };
}
