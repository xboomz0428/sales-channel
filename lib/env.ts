// 讀取環境變數並清除不可見字元。
// 從網頁/編輯器複製貼上到 Vercel 後台或 .env 時，常混入 BOM（U+FEFF）、
// 零寬空白（U+200B）或不換行空白（U+00A0）——放進 HTTP header 會拋出
// 「Cannot convert argument to a ByteString」錯誤。
const INVISIBLE_CODEPOINTS = new Set([0xfeff, 0x200b, 0x00a0]);

export function cleanEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const cleaned = Array.from(raw)
    .filter((ch) => !INVISIBLE_CODEPOINTS.has(ch.codePointAt(0) ?? 0))
    .join("")
    .trim();
  return cleaned || undefined;
}
