// 台灣藥事法 / 食安法 / 化粧品法 合規關鍵字掃描
const FORBIDDEN_PATTERNS = [
  /治療|治癒|根治/,
  /藥效|療效|醫療/,
  /抗癌|防癌|消炎/,
  /降血[壓糖脂]/,
  /瘦身|減[肥重]/,
  /FDA.?認證/,
  /保證.?有效/,
  /臨床.?證[明實]/,
  /專利.?配方/,
];

const WARNING_PATTERNS = [
  /改善|促進|調[理節整]/,
  /增強免疫/,
  /排毒|解毒/,
  /抗[氧老]/,
];

interface ComplianceResult {
  flag: boolean;
  note: string | null;
}

export function checkCompliance(text: string): ComplianceResult {
  const forbidden: string[] = [];
  const warnings: string[] = [];

  for (const p of FORBIDDEN_PATTERNS) {
    const m = text.match(p);
    if (m) forbidden.push(m[0]);
  }
  for (const p of WARNING_PATTERNS) {
    const m = text.match(p);
    if (m) warnings.push(m[0]);
  }

  if (forbidden.length > 0) {
    return {
      flag: true,
      note: `含違規用語：${forbidden.join("、")}${warnings.length ? `；另有警示：${warnings.join("、")}` : ""}`,
    };
  }
  if (warnings.length > 0) {
    return {
      flag: true,
      note: `含警示用語（建議修改）：${warnings.join("、")}`,
    };
  }
  return { flag: false, note: null };
}
