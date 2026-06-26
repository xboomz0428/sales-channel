# AI 外聯引擎 — 詳細流程與規格(FLOW.md)

對應規格 v1.1。本文件說明每支 API 的職責、端到端流程與狀態機;程式碼見同專案各檔。

---

## 1. 系統組成

```
前端頁面(待建)            API Route Handlers                 Supabase
/outreach        ──▶  /api/outreach/queue        ──▶  enrollments / sequences
/outreach/[id]   ──▶  /api/outreach/generate     ──▶  Claude → messages(+revisions)
                 ──▶  /api/outreach/send         ──▶  messages / brands(stage)
                 ──▶  /api/outreach/enroll       ──▶  enrollments / followups
/outreach/monitor──▶  /api/outreach/batches[/id] ──▶  batches / messages
                 ──▶  /api/outreach/thread/[bid] ──▶  messages
(回覆回報)        ──▶  /api/outreach/reply        ──▶  brands(score)/enrollments
Vercel Cron      ──▶  /api/cron/outreach-advance ──▶  enrollments / followups
LINE / Resend    ──▶  /api/webhooks/*            ──▶  messages(交付狀態)
```

所有 `/api/outreach/*` 需登入;`/api/cron/*` 需 `CRON_SECRET`;`/api/webhooks/*` 需簽章驗證。

---

## 2. 端到端主流程

```
採集/名單(新名單)
   │  選 N 筆
   ▼
enroll 序列 ──▶ 建立第 1 步 followup + 設定 next_action_at
   │
   ▼ (到工作台或佇列)
generate 生成草稿 ──▶ Claude ──▶ 合規預檢 ──▶ 計費 ──▶ 存 messages(draft)+ revision v1
   │
   ▼ 人工審核(可重新生成 → 留新版本)
send 送出 ──▶ 合規閘門(flag 需 override)──▶ messages=sent
   │                                   └▶ brands: 新名單 → 已聯繫(觸發器寫 audit_log)
   ▼
通路交付(LINE/Email)──▶ webhook ──▶ messages: delivered / read / bounced
   │
   ▼ 對方回覆
reply 回報 ──▶ 熱度 +40 ──▶ 暫停序列(status=replied)──▶ 達門檻建議升級商機
   │
   ▼
Cron 每日 ──▶ 對未回覆且到期者推進下一步(建立下一 followup);無下一步則序列 done
```

---

## 3. 各 API 規格

### POST /api/outreach/generate
- 流程:`requireUser` → 驗證 body → **每日生成上限檢查** → 取名單(404 防呆)→ 組 prompt(含產業切角/管道格式/防注入)→ 呼叫 Claude(鎖 `max_tokens=700`)→ 解析 JSON → 合規掃描 → 由 usage 計費 → 寫 `outreach_messages(draft)` + `revisions(v1)`。
- 回傳:`{ draftId, subject, body, complianceFlag, complianceNote, costUsd, generationMs }`
- 失敗:401 / 400 / 404 / 429(超限)/ 500。

### POST /api/outreach/send
- 流程:`requireUser` → 取訊息 → **冪等**(已送回 `alreadySent`)→ 狀態檢查(僅 draft/queued 可送)→ **合規閘門**(flag 且未 override → 422)→ 標記 sent → 名單 `新名單→已聯繫`(條件式,不回退)。
- 回傳:`{ ok, brandStage }`

### POST /api/outreach/enroll
- 流程:取序列第 1 步 → 逐筆 insert enrollment(唯一索引防重複)→ 建立首觸點 followup。
- 回傳:`{ enrolled, followupsCreated }`

### GET /api/outreach/queue?date=YYYY-MM-DD
- 取 `status=active 且 next_action_at<=該日` 的 enrollment,依「目前步驟的管道」分組。
- 回傳:`{ date, groups: { LN:[...], EM:[...] } }`

### POST /api/outreach/reply
- 記 inbound 訊息 → 熱度 +40(夾 0–100)→ 暫停名單所有 active 序列 → 回 `suggestUpgradeToOpportunity`。

### GET /api/outreach/batches、GET /api/outreach/batches/[id]
- 批次清單與單批明細(含每筆狀態 + 內容),供 `/outreach/monitor` 進度條。

### GET /api/outreach/thread/[brandId]
- 單名單所有 in/out 訊息依時間排序(對話串)。

### GET /api/cron/outreach-advance
- `requireCron` → 取到期 enrollment → **冪等推進**(update 條件帶 `current_step`,確保只推一次)→ 有下一步:設定 `next_action_at` + 建 followup;無下一步:序列 `done`。

### POST /api/webhooks/resend、/api/webhooks/line
- 先讀 **raw body** → 驗簽(Svix / LINE HMAC,`timingSafeEqual`)→ 依事件以 `provider_message_id` 回寫交付狀態。

---

## 4. 訊息狀態機

```
draft ──send──▶ sent ──webhook──▶ delivered ──webhook──▶ read ──reply──▶ replied
  │                          └────────────────────────▶ bounced
  └─(合規未過且未 override)─▶ 擋下(維持 draft)
```

階段推進規則:`send` 只把 `新名單` 升 `已聯繫`(其餘階段不動,避免回退);後續 打樣/報價/議約/成交 由商機模組(L3)負責。

---

## 5. 防封與節奏(營運層)

| 管道 | 每日上限 | 間隔 | 發送 |
|---|---|---|---|
| LINE | 官方 API 不限手動 | — | API |
| Email | 50–80 | 30–90 秒隨機 | Resend |
| FB/IG | 20–30 | 2–5 分隨機 | Playwright 半自動 + 人工確認 |

系統層另有 `OUTREACH_DAILY_GEN_CAP`(預設 500)限制每日 AI 生成數,雙重防護成本與封號。

---

## 6. 待你對接的點(實作前確認)

1. **`brands` 欄位名**:`stage`、`name`、`industry`、`source`、`weighted_value` 是否一致。
2. **`followups` 表結構**:本程式以 `{ brand_id, due_date, done, note }` 寫入,請對應實際欄位。
3. **LINE userId ↔ brand 對照**:webhook 入站訊息/已讀對應名單需要一張對照表(目前留 TODO)。
4. **登入機制**:假設使用 Supabase Auth(cookie session)。若用其他 Auth,改寫 `lib/auth.ts`。
