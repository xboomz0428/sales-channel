// node --test tests/bounce-classify.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBounce } from "../lib/outreach/bounceClassify.ts";

// ── 真實樣本：2026-11-06 Outlook 退回 hotmail 收件人的技術詳細資料（使用者提供的退信截圖，逐字）──
const REAL_OUTLOOK_AUTH =
  "550 5.7.1 Message rejected: Message lacks SPF/DKIM/DMARC Auth Records [TY2PEPF0000AB83.apcprd03.prod.outlook.com 2026-11-06T02:03:46.093Z 08DF3B4A4EABCDC1]";

// 舊版分類器（v3.6.5 lib/outreach/blacklist.ts 原文），作為對照組
const OLD_HARD_RE = /(550|551|553|554)[\s-]|user unknown|no such user|does not exist|doesn'?t exist|mailbox not found|mailbox unavailable|recipient address rejected|address not found|invalid recipient|unknown recipient|no mailbox|account .* does not exist|address rejected|recipient not found|未知的收件|查無此|不存在/i;
const OLD_SOFT_RE = /(421|450|451|452)[\s-]|quota|mailbox full|over quota|temporar|try again|deferred|greylist|timed out|connection refused|rate limit|too many|信箱已滿|暫時/i;
const OLD_DELAY_RE = /delay|delayed|will retry|not yet been delivered|還在嘗試|延遲/i;
function oldClassify(text) {
  const t = text.toLowerCase();
  if (OLD_HARD_RE.test(t)) return "hard";
  if (OLD_DELAY_RE.test(t) && !OLD_HARD_RE.test(t) && !OLD_SOFT_RE.test(t)) return "none";
  if (OLD_SOFT_RE.test(t)) return "soft";
  return "hard";
}

// 退信通知會附上原信標頭；以下標頭名稱是 Gmail 寄出的信一定會帶的（合成，用來確認標頭單字不會觸發 policy）
const ORIGINAL_HEADERS = [
  "DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=example-com.20230601.gappssmtp.com; s=20230601;",
  "X-Google-DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/relaxed; d=1e100.net; s=20230601;",
  "Authentication-Results: mx.google.com; spf=pass smtp.mailfrom=sender@example.com; dkim=pass; dmarc=pass",
  "Received-SPF: pass (google.com: domain of sender@example.com designates 209.85.220.41 as permitted sender)",
].join("\r\n");

test("真實樣本：Outlook 以缺少 SPF/DKIM/DMARC 拒收 → policy（不封鎖）", () => {
  assert.equal(classifyBounce(REAL_OUTLOOK_AUTH), "policy");
});

test("對照組：舊分類器把同一個真實樣本判為 hard（會永久封鎖有效信箱）", () => {
  assert.equal(oldClassify(REAL_OUTLOOK_AUTH), "hard");
});

test("真實樣本放在完整退信內文中（含中文說明與原信標頭）仍判為 policy", () => {
  const text = [
    "郵件已遭封鎖",
    "你寄到 someone@hotmail.com 的郵件已遭封鎖。詳情請參閱下方的技術詳細資料。",
    "遠端伺服器的回應如下：",
    REAL_OUTLOOK_AUTH,
    "Final-Recipient: rfc822; someone@hotmail.com",
    "Action: failed",
    "Status: 5.7.1",
    "Diagnostic-Code: smtp; " + REAL_OUTLOOK_AUTH,
    ORIGINAL_HEADERS,
  ].join("\r\n");
  assert.equal(classifyBounce(text), "policy");
});

test("信箱不存在（合成，Gmail 公開的 5.1.1 措辭）即使附帶 DKIM／SPF 標頭也判為 hard，不被標頭單字誤判成 policy", () => {
  const text = [
    "550-5.1.1 The email account that you tried to reach does not exist. Please try",
    "550-5.1.1 double-checking the recipient's email address for typos or",
    "550 5.1.1 unnecessary spaces.",
    "Final-Recipient: rfc822; nobody@gmail.com",
    "Status: 5.1.1",
    ORIGINAL_HEADERS,
  ].join("\r\n");
  assert.equal(classifyBounce(text), "hard");
});

test("信箱已滿（合成，尚無真實樣本）維持 soft", () => {
  const text = [
    "552-5.2.2 The recipient's inbox is out of storage space and inactive. Please",
    "552 5.2.2 direct the recipient to https://support.google.com/mail/?p=OverQuotaPerm",
    "Status: 5.2.2",
    ORIGINAL_HEADERS,
  ].join("\r\n");
  assert.equal(classifyBounce(text), "soft");
});

test("多行格式的 5.7.x（550-5.7.26，合成）與我方登入失敗（535-5.7.8，合成）都判為 policy", () => {
  assert.equal(classifyBounce("550-5.7.26 This mail has been blocked because the sender is unauthenticated."), "policy");
  assert.equal(classifyBounce("535-5.7.8 Username and Password not accepted."), "policy");
});

test("版本號或 IP 形狀的 5.7.1 不會被當成 SMTP 回覆（沒有前置三位數回覆碼）", () => {
  assert.equal(classifyBounce("X-Mailer: SomeMailer 5.7.1\r\n452 4.2.2 The recipient's inbox is out of storage space"), "soft");
});

test("純延遲通知維持 none", () => {
  assert.equal(classifyBounce("Delivery incomplete. There was a temporary problem... message delayed, will retry"), "soft"); // 含 temporar → 既有行為為 soft
  assert.equal(classifyBounce("Your message has not yet been delivered. Gmail will retry for 46 more hours."), "none");
});
