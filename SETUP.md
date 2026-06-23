# HeroHerb 通路開發系統 — 設定指南

通路開發 / CRM / 採集 / 電子報外發 / 產品報價一站式系統。
本檔說明環境變數、API 金鑰申請、資料庫遷移與部署。應用程式內亦有圖形化版本（側欄 → **使用說明**）。

---

## 1. 環境變數

放在 `.env.local`（本機開發）或 Vercel 專案的 **Settings → Environment Variables**（正式環境）。修改後需重啟 / 重新部署。

### 必需 — 資料庫（Supabase）
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxx     # 外發引擎後端用（繞過 RLS），強烈建議設定
```

### 採集功能（Google）
```
GOOGLE_PLACES_API_KEY=AIzaxxxxxxxx    # 啟用 Places API + Custom Search API
GOOGLE_CSE_ID=xxxxxxxx                # programmablesearchengine.google.com 取得
```

### 電子報寄送（Gmail SMTP / Resend / SendGrid 擇一）
用 `EMAIL_PROVIDER` 指定，或依設定的金鑰自動挑選（Resend → SendGrid → Gmail）。
```
OUTREACH_FROM_NAME=HeroHerb 好漢草
APP_BASE_URL=https://你的網址               # 追蹤像素/連結用絕對網址

# 方案 A：Gmail SMTP（最快，不需網域；需開兩步驟驗證 + 應用程式密碼）
EMAIL_PROVIDER=gmail
GMAIL_USER=you@gmail.com
GMAIL_APP_PASSWORD=16碼應用程式密碼

# 方案 B：Resend（需驗證寄件網域）
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxx
OUTREACH_FROM_EMAIL=hello@yourdomain.com

# 方案 C：SendGrid
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxx
OUTREACH_FROM_EMAIL=hello@yourdomain.com

# 方案 D：自訂 SMTP
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
```
> 都沒設定時，電子報只會「模擬寄出」（標記已寄、不真的送信）。
> Gmail 免費帳號每日約 500 封上限，不適合大量冷開發信。

### AI 生成草稿（Claude / OpenAI / Gemini 三選一）
設定任一家金鑰即可；要指定用哪家可加 `AI_PROVIDER`，否則依設定的金鑰自動挑選（優先 Claude → OpenAI → Gemini）。
```
# 方式一：Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
CLAUDE_MODEL=claude-sonnet-4-6        # 選填

# 方式二：OpenAI
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=gpt-4o                   # 選填

# 方式三：Google Gemini
GEMINI_API_KEY=xxxxxxxx
GEMINI_MODEL=gemini-1.5-pro           # 選填

# 選填：指定供應商與每日生成上限
AI_PROVIDER=claude                    # claude | openai | gemini
AI_DAILY_GENERATION_CAP=200
```

### 選填 — Webhook / 排程
```
RESEND_WEBHOOK_SECRET=whsec_xxxx      # Resend 開信/退信回拋驗簽
LINE_CHANNEL_SECRET=xxxx              # LINE 入站 webhook 驗簽
CRON_SECRET=xxxx                      # 保護 /api/cron/* 排程端點
```

---

## 2. API 金鑰申請步驟

| 服務 | 申請網址 | 取得項目 |
|------|---------|---------|
| Supabase | supabase.com | Project URL、anon key、service_role key |
| Google Cloud | console.cloud.google.com | Places API + Custom Search API 金鑰 |
| Google CSE | programmablesearchengine.google.com | 搜尋引擎 ID（CSE ID） |
| Resend | resend.com | API Key（需先驗證寄件網域 DNS） |
| Anthropic | console.anthropic.com | API Key（需儲值） |

---

## 3. 資料庫遷移

於 Supabase **SQL Editor** 依序執行 `supabase/migrations/` 內的檔案：

| 檔案 | 內容 |
|------|------|
| `001_init_schema.sql` | 名單/門市/聯絡管道/商機等核心表 |
| `002_gov_registry.sql` | 財政部稅籍鏡像表 |
| `003_store_reviews.sql` | Google 評論 |
| `004_rls_gov_registry_store_reviews.sql` | RLS |
| `0001_outreach_engine.sql` | 外發引擎（模板/序列/訊息/批次/稽核） |
| `0002_email.sql` | brands.email + Email 模板 |
| `0003_email_tracking.sql` | 開信/點擊追蹤 |
| `0004_products_quotes.sql` | 產品 / 報價單 |

> RLS 政策採開放式 `using(true)`（內部工具，搭配 anon key）。
> 既有 `brands` 表使用 `status` 欄位（非 `stage`）。

---

## 4. 本機開發

```bash
npm install
npm run dev          # http://localhost:3000
npx tsc --noEmit     # 型別檢查
```

部署：推送到 GitHub，Vercel 自動建置（框架 Next.js App Router）。

---

## 5. 功能總覽

| 模組 | 路徑 | 需要的金鑰 |
|------|------|-----------|
| 儀表板 / 名單 / 商機 / 跟進 | `/`, `/leads`, `/opportunities`, `/followups` | Supabase |
| 採集 & 比對中心 | `/matching` | Supabase + Google |
| 產品報價 | `/products` | Supabase |
| 郵件編輯器（含 AI 生成） | `/outreach/email-editor` | Supabase（AI 需 Anthropic） |
| 電子報發送 | `/outreach/newsletter` | Supabase（寄送需 Resend） |
| 郵件儀表板 | `/outreach/email-dashboard` | Supabase |
| API 設定 / 使用說明 | `/settings`, `/guide` | — |
