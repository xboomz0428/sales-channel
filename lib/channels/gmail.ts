import { cleanEnv } from "@/lib/env";

// Gmail API 簡易封裝（用於 cron 掃退信）
// 需要設定 GMAIL_SERVICE_ACCOUNT_JSON 或 GMAIL_ACCESS_TOKEN

async function getAccessToken(): Promise<string> {
  const token = cleanEnv("GMAIL_ACCESS_TOKEN");
  if (token) return token;
  // TODO: 實作 Service Account JWT → access_token 交換
  throw new Error("GMAIL_ACCESS_TOKEN 未設定");
}

export async function listMessages(query: string, maxResults = 50): Promise<string[]> {
  const token = await getAccessToken();
  const user = cleanEnv("GMAIL_USER_EMAIL") || "me";
  const url = `https://gmail.googleapis.com/gmail/v1/users/${user}/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.messages || []).map((m: { id: string }) => m.id);
}

export async function getMessageText(messageId: string): Promise<string> {
  const token = await getAccessToken();
  const user = cleanEnv("GMAIL_USER_EMAIL") || "me";
  const url = `https://gmail.googleapis.com/gmail/v1/users/${user}/messages/${messageId}?format=full`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "";

  const data = await res.json();
  // 嘗試取 text/plain part
  const parts = data.payload?.parts || [data.payload];
  for (const part of parts) {
    if (part?.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
  }
  return data.snippet || "";
}
