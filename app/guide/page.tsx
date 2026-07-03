"use client";

import { useState } from "react";
import { C } from "@/lib/design";
import { APP_VERSION } from "@/lib/version";
import MobileTabBar from "@/components/MobileTabBar";

type TabKey = "flow" | "diagrams" | "keys" | "faq";

export default function GuidePage() {
  const [tab, setTab] = useState<TabKey>("flow");

  return (
    <>
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "11px 20px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <h1 style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: 0 }}>使用說明</h1>
        <span className="d-only" style={{ fontSize: 13, color: C.muted }}>— 操作流程、API 金鑰申請與設定</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>v{APP_VERSION}</span>
      </div>

      <div style={{ display: "flex", gap: 4, padding: "8px 20px", background: C.surface, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {([["flow", "頁面流程"], ["diagrams", "工作流程圖"], ["keys", "API 申請與設定"], ["faq", "常見問題"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: tab === k ? 700 : 400, border: "none", background: tab === k ? C.p50 : "transparent", color: tab === k ? C.primary : C.muted, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: C.bg, paddingBottom: 90 }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {tab === "flow" && <FlowGuide />}
          {tab === "diagrams" && <DiagramsGuide />}
          {tab === "keys" && <KeysGuide />}
          {tab === "faq" && <FaqGuide />}
        </div>
      </div>

      <MobileTabBar />
    </>
  );
}

// ── 卡片元件 ─────────────────────────────────────────
function Card({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
        {badge && <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: C.p50, color: C.primary, fontWeight: 600 }}>{badge}</span>}
      </div>
      {children}
    </div>
  );
}
function Step({ n, children }: { n: number | string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 11, marginBottom: 10 }}>
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.primary, color: "white", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
      <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.6, paddingTop: 1 }}>{children}</div>
    </div>
  );
}
const code: React.CSSProperties = { background: C.surf2, padding: "1px 6px", borderRadius: 5, fontSize: 12.5, fontFamily: "ui-monospace, monospace", color: C.accentDk };

// ── 頁面流程 ─────────────────────────────────────────
function FlowGuide() {
  return (
    <>
      <Card title="① 採集名單" badge="比對中心 / 採集任務">
        <Step n={1}>到 <b>採集任務</b>，輸入關鍵字（如「養生館」）與縣市/地區，執行 Google Places 採集；或到 <b>政府資料匯入</b> 匯官方名冊（診所/旅宿/禮儀/宮廟/月子…）。</Step>
        <Step n={2}>到 <b>比對中心</b>，用「🚀 批次採集」勾「🏛 工商統編比對」補統編與公司登記名（mygov / GCIS / twincn）。</Step>
        <Step n={3}>勾「🔗 管道補齊」自動補 LINE/電話/Email/IG/FB：<b>免費方法優先</b>（官網爬蟲→DDG+Bing 並行找官網與社群→Email 網域推測）；<b>付費 Google API 預設關閉</b>，勾了才當備援。</Step>
        <Step n={4}>低價值名單（採後仍無電話+Email）會<b>自動遮蔽</b>；「⋯ 更多工具」也可手動遮蔽/還原，遮蔽者批次採集跳過、清單隱藏，加快讀取。</Step>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.6, background: C.surf2, padding: "10px 12px", borderRadius: 9 }}>
          🔎 類別/統計數字取自跨全 5.8 萬筆的完整統計；批次預設跳過 7 天內已試過的品牌、30 線並行，進度條會顯示每分鐘筆數與預估剩餘時間。
        </div>
      </Card>

      <Card title="② 經營名單" badge="名單總覽 / 商機 / 跟進">
        <Step n={1}><b>名單總覽</b>：檢視每個品牌的聯絡管道、工商資料、門市與評論；可建立客戶照護計畫（拜訪/回購週期）。</Step>
        <Step n={2}><b>商機進度</b>：把名單推進到打樣、報價、議約、成交等階段。<b>AI 語音外撥</b>的每通電話會自動在這裡建立/推進商機並註記「AI語音」。</Step>
        <Step n={3}><b>今日跟進</b>：系統自動產生回購、拜訪到期、停滯商機、三節提醒等任務。<b>漏斗分析</b>看各階段轉換與熱度。</Step>
      </Card>

      <Card title="③ 產品與報價" badge="產品報價">
        <Step n={1}>在 <b>產品資料</b> 分頁維護產品（售價、通路價、成本、毛利、規格、最低起訂量）。</Step>
        <Step n={2}>在 <b>報價單</b> 分頁點「＋ 新增報價單」，左側點選產品加入、調整數量與折扣，搜尋並綁定客戶名單。</Step>
        <Step n={3}>建立後可查看、改狀態（草稿/已寄出/已接受），並「📋 複製內容」貼到 LINE 或 Email。</Step>
      </Card>

      <Card title="④ 電子報外發" badge="郵件編輯器 / 電子報發送 / 郵件儀表板">
        <Step n={1}><b>郵件編輯器</b>：選 11 組情境範本（初次開發、報價、節慶…）或按「✨ AI 生成」用主題自動產生草稿，編輯後「存成模板」。</Step>
        <Step n={2}><b>電子報發送</b>：左側勾選收件名單（自動帶出採集到 Email 的客戶），右側選模板預覽，點「寄送」批次發出。</Step>
        <Step n={3}><b>郵件儀表板</b>：追蹤寄送量、開信率、點擊率、退信與回覆，並有漏斗、依產業/模板分析。</Step>
      </Card>

      <Card title="📧 怎麼真正寄出 Email？" badge="重要">
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.7, marginBottom: 10 }}>
          支援三家寄信服務，<b>設定其中一家即可</b>。<b>未設定前是「模擬寄出」</b>——會標記已寄、但不會真的進對方信箱。
          電子報發送頁上方會顯示目前模式與使用的服務。可用 <span style={code}>EMAIL_PROVIDER</span>（gmail / resend / sendgrid）指定，否則自動挑選。
        </div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginTop: 6, marginBottom: 4 }}>方案 A — Gmail SMTP（最快，不需網域）</div>
        <Step n={1}>Gmail 帳號開啟<b>兩步驟驗證</b>，到 Google 帳戶 → 安全性 → <b>應用程式密碼</b> 產生一組 16 碼密碼。</Step>
        <Step n={2}>填入環境變數：</Step>
        <KeyBlock vars={["EMAIL_PROVIDER=gmail", "GMAIL_USER=你的帳號@gmail.com", "GMAIL_APP_PASSWORD=16碼應用程式密碼", "OUTREACH_FROM_NAME=HeroHerb 好漢草", "APP_BASE_URL=https://你的網址"]} />
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>⚠️ 免費 Gmail 每日約 500 封上限，且不適合大量冷開發信（送達率/帳號風險），適合先小量測試。</div>

        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginTop: 6, marginBottom: 4 }}>方案 B — Resend（適合長期、量大）</div>
        <Step n={1}>到 <b>resend.com</b> 註冊 → Domains 驗證寄件網域（加 SPF/DKIM DNS）→ 建立 API Key。</Step>
        <Step n={2}>填入環境變數：</Step>
        <KeyBlock vars={["EMAIL_PROVIDER=resend", "RESEND_API_KEY=re_xxxxxxxx", "OUTREACH_FROM_EMAIL=hello@你的網域.com", "OUTREACH_FROM_NAME=HeroHerb 好漢草", "APP_BASE_URL=https://你的網址"]} />

        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginTop: 6, marginBottom: 4 }}>方案 C — SendGrid（每日免費額度較高）</div>
        <Step n={1}>到 <b>sendgrid.com</b> 註冊 → Settings → <b>Sender Authentication</b> 驗證寄件人或網域。</Step>
        <Step n={2}>Settings → <b>API Keys</b> → Create API Key（權限選 Mail Send），複製 <span style={code}>SG.</span> 開頭金鑰。</Step>
        <KeyBlock vars={["EMAIL_PROVIDER=sendgrid", "SENDGRID_API_KEY=SG.xxxxxxxx", "OUTREACH_FROM_EMAIL=hello@你的網域.com"]} />

        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, marginTop: 6, marginBottom: 4 }}>方案 D — 自訂 SMTP（自有郵件主機 / 其他服務商）</div>
        <Step n={1}>向你的郵件服務商（公司信箱、Mailgun、Postmark、Zoho…）取得 SMTP 主機、連接埠、帳號、密碼。</Step>
        <Step n={2}>填入環境變數（port 587 用 STARTTLS、465 用 SSL 則 <span style={code}>SMTP_SECURE=true</span>）：</Step>
        <KeyBlock vars={["EMAIL_PROVIDER=smtp", "SMTP_HOST=smtp.example.com", "SMTP_PORT=587", "SMTP_SECURE=false", "SMTP_USER=帳號", "SMTP_PASS=密碼", "OUTREACH_FROM_EMAIL=hello@你的網域.com"]} />

        <Step n={3}>存檔後重啟（本機）或重新部署（Vercel）。回 <b>電子報發送</b> 確認上方變「✅ 真實寄送模式」，選名單、選模板、按「寄送」。</Step>
        <Step n={4}>到 <b>郵件儀表板</b> 看送達、開信、點擊、退信、回覆。報價單「✉ 寄給客戶」也走同一條寄信管道。</Step>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8, lineHeight: 1.6, background: C.surf2, padding: "10px 12px", borderRadius: 9 }}>
          🔌 內部已串接：Resend／SendGrid 走 HTTP API、Gmail／自訂 SMTP 走 nodemailer。你只要填金鑰/密碼，系統自動依 <span style={code}>EMAIL_PROVIDER</span> 或已設定的金鑰挑選。「API 設定」頁可看到哪些已設定。
        </div>
      </Card>

      <Card title="⑤ AI 語音外撥" badge="AI 語音外撥 → 商機進度">
        <Step n={1}><b>匯出可外撥名單</b>：選產業下載 CSV（只含有電話、未拒撥、未遮蔽者，帶 brand_id 與話術變數：品牌名/產業/縣市/負責人）。</Step>
        <Step n={2}>用語音 AI 平台外撥：<b>Bland AI / Retell / Vapi / ElevenLabs</b>。撥號時把 <span style={code}>brand_id</span> 放進該平台的 metadata / dynamic variables 帶著跑。</Step>
        <Step n={3}><b>自動回寫（webhook）</b>：把平台「通話結束」的 webhook 指向 <span style={code}>/api/voice/webhook?provider=平台代號</span>，逐字稿/錄音/秒數/成效就自動進系統；或用「匯入結果 CSV」手動匯入。</Step>
        <Step n={4}>每通電話<b>無論接通與否</b>都會自動寫入<b>商機進度</b>並註記「AI語音」：接通→已聯繫、有興趣/約回撥→留在管道、沒興趣/拒撥→登記流失（拒撥號碼加入拒撥名單、下次匯出排除）。</Step>
        <div style={{ fontSize: 12.5, color: C.accentDk, marginTop: 8, lineHeight: 1.7, background: "#FDF4E3", border: "1px solid #E8DCAE", padding: "10px 12px", borderRadius: 9 }}>
          ⚖️ 合規四要點：用<b>自己的聲音</b>、開場<b>表明是 AI 助理</b>、<b>告知錄音</b>、維護<b>拒撥名單</b>。webhook 可設 <span style={code}>VOICE_WEBHOOK_TOKEN</span> 密鑰驗證。本系統只做名單匯出與結果紀錄，不代為撥打。
        </div>
      </Card>
    </>
  );
}

// ── 動態工作流程圖 ───────────────────────────────────
type WFStep = { label: string; sub?: string; color?: string; tone?: "start" | "auto" | "branch" | "end" };
const TONE: Record<string, string> = { start: "#5B7C99", auto: "#7B6E99", branch: "#A6824A", end: "#4A6B50" };

function WorkflowStep({ s, last }: { s: WFStep; last: boolean }) {
  const color = s.color || TONE[s.tone || "auto"];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ width: "100%", maxWidth: 460, background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "11px 14px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{s.label}</div>
        {s.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{s.sub}</div>}
      </div>
      {!last && (
        <div className="wf-conn" aria-hidden>
          <span className="wf-dot" style={{ background: color }} />
        </div>
      )}
    </div>
  );
}

function Workflow({ title, badge, steps, note }: { title: string; badge?: string; steps: WFStep[]; note?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
        {badge && <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: C.p50, color: C.primary, fontWeight: 600 }}>{badge}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {steps.map((s, i) => <WorkflowStep key={i} s={s} last={i === steps.length - 1} />)}
      </div>
      {note && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginTop: 12, background: C.surf2, padding: "10px 12px", borderRadius: 9 }}>{note}</div>}
    </div>
  );
}

function DiagramsGuide() {
  return (
    <>
      <style>{`
        .wf-conn { position: relative; width: 2px; height: 26px; background: linear-gradient(${C.border},${C.border}); overflow: visible; }
        .wf-dot { position: absolute; left: -3px; width: 8px; height: 8px; border-radius: 50%; animation: wf-fall 1.4s linear infinite; }
        @keyframes wf-fall { 0% { top: -4px; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { top: 26px; opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .wf-dot { animation: none; opacity: .6; top: 9px; } }
      `}</style>
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginBottom: 14 }}>
        每個模組的資料怎麼流、系統自動做了什麼，一圖看懂。實線流程箭頭上的移動點代表「資料流向」，紫色＝系統自動執行、綠色＝結果落地。
      </div>

      <Workflow title="① 名單採集與管道補齊" badge="採集任務 / 比對中心"
        steps={[
          { label: "取得名單", sub: "Google 地圖採集 · 政府開放資料 · 手動/CSV 匯入", tone: "start" },
          { label: "工商統編比對", sub: "名稱→統編→工商登記（mygov / GCIS / twincn）", tone: "auto" },
          { label: "管道補齊（免費優先）", sub: "官網爬蟲→交叉搜尋→DDG/Bing 並行找官網與 FB/IG/LINE", tone: "auto" },
          { label: "Email 網域推測", sub: "有官網無 Email → 推測 info@ 並驗證 MX", tone: "auto" },
          { label: "付費 API 備援（勾選才用）", sub: "免費補不到才呼叫 Google Places / CSE", tone: "branch" },
          { label: "寫回名單 · 低價值自動遮蔽", sub: "採後仍無電話+Email → 標記遮蔽，之後批次跳過", tone: "end" },
        ]}
        note="效率機制：已完整的品牌自動剃除；7 天內試過的預設跳過；30 線並行；進度條顯示每分鐘筆數與預估剩餘時間。" />

      <Workflow title="② 電子報外發與自動化" badge="編輯器 / 發送 / 自動化"
        steps={[
          { label: "編輯內容", sub: "單一大欄位撰寫 · 11 組範本 · AI 生成 · 可翻日/英文", tone: "start" },
          { label: "選收件名單", sub: "自動帶出有 Email 的客戶（採集/聯絡人/名單）· 排除黑名單", tone: "start" },
          { label: "寄送 / 排程", sub: "分批 30 封 · 每日額度控管 · 可寄測試信 · 略過重複", tone: "auto" },
          { label: "每天 8AM 自動化", sub: "到期排程寄出 · 自動跟進未開信 · 補寄佇列 · 掃描退信", tone: "auto" },
          { label: "成效追蹤", sub: "開信/點擊/回覆 · 退信自動進黑名單 · 失敗可一鍵重寄", tone: "end" },
        ]}
        note="失敗處理：硬退信立即封鎖、軟退信累計 3 次封鎖；發送紀錄顯示失敗原因，可單封重寄。" />

      <Workflow title="③ AI 語音外撥" badge="AI 語音外撥 → 商機進度"
        steps={[
          { label: "匯出可外撥名單", sub: "有電話·未拒撥·未遮蔽 · CSV 帶 brand_id 與話術變數", tone: "start" },
          { label: "語音平台外撥", sub: "Bland / Retell / Vapi / ElevenLabs · 克隆聲音即時對話", tone: "start" },
          { label: "webhook 自動回寫", sub: "通話結束送回逐字稿/錄音/秒數/成效 · external_id 去重", tone: "auto" },
          { label: "寫入通話紀錄", sub: "逐字稿 · 錄音連結 · 成效統計", tone: "auto" },
          { label: "推進商機進度（註記 AI 語音）", sub: "無論接通與否都建立/推進商機；沒興趣/拒撥→流失", tone: "end" },
        ]}
        note="閉環：接通→已聯繫、有興趣/約回撥→留在管道、拒撥→登記流失並加入拒撥名單，下次匯出自動排除。商機階段只前進不倒退。" />
    </>
  );
}

// ── API 金鑰 ─────────────────────────────────────────
function KeyBlock({ vars }: { vars: string[] }) {
  return (
    <div style={{ background: "#0e1a11", borderRadius: 9, padding: "11px 13px", margin: "10px 0", fontFamily: "ui-monospace, monospace", fontSize: 12.5, lineHeight: 1.8, color: "#9dbeaa", overflowX: "auto" }}>
      {vars.map((v) => <div key={v}>{v}</div>)}
    </div>
  );
}
function KeysGuide() {
  return (
    <>
      <Card title="設定位置">
        <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.7 }}>
          所有金鑰都放在環境變數（<span style={code}>.env.local</span> 開發用；正式環境放 Vercel 專案的 <b>Settings → Environment Variables</b>）。
          修改後需重新部署或重啟伺服器才會生效。完整清單也在專案根目錄的 <span style={code}>SETUP.md</span>。
        </div>
      </Card>

      <Card title="Resend — 寄送 Email" badge="電子報必需">
        <Step n={1}>到 <b>resend.com</b> 註冊，驗證你的寄件網域（DNS 加 SPF/DKIM 記錄）。</Step>
        <Step n={2}>建立 API Key（Dashboard → API Keys）。</Step>
        <Step n={3}>設定以下變數；<span style={code}>OUTREACH_FROM_EMAIL</span> 須為已驗證網域的信箱。</Step>
        <KeyBlock vars={["RESEND_API_KEY=re_xxxxxxxx", "OUTREACH_FROM_EMAIL=hello@yourdomain.com", "OUTREACH_FROM_NAME=HeroHerb 好漢草", "APP_BASE_URL=https://你的網址"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>未設定時：電子報只會「模擬寄出」，不會真的送信。</div>
      </Card>

      <Card title="AI 生成草稿 — Claude / OpenAI / Gemini" badge="AI 生成必需">
        <Step n={1}>三家擇一即可：Anthropic（console.anthropic.com）、OpenAI（platform.openai.com）、或 Google Gemini（aistudio.google.com）。</Step>
        <Step n={2}>建立 API Key，設定對應變數。要指定用哪家可加 <span style={code}>AI_PROVIDER</span>，否則自動挑選（Claude→OpenAI→Gemini）。</Step>
        <KeyBlock vars={["# 三選一", "ANTHROPIC_API_KEY=sk-ant-xxxx", "OPENAI_API_KEY=sk-xxxx", "GEMINI_API_KEY=xxxx", "# 選填：指定供應商", "AI_PROVIDER=claude   # claude | openai | gemini"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>用於郵件編輯器的「✨ AI 生成」。未設定任一金鑰時點生成會提示。</div>
      </Card>

      <Card title="Google Places / Custom Search — 採集" badge="採集必需">
        <Step n={1}>到 <b>Google Cloud Console</b> 建專案，啟用 <i>Places API</i> 與 <i>Custom Search API</i>。</Step>
        <Step n={2}>建立 API Key；到 <b>programmablesearchengine.google.com</b> 建立搜尋引擎取得 CSE ID。</Step>
        <KeyBlock vars={["GOOGLE_PLACES_API_KEY=AIzaxxxxxxxx", "GOOGLE_CSE_ID=xxxxxxxx"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>用量與費用可在「API 設定」頁追蹤（Places $32、詳情 $17、CSE $5／1000 次）。<b>非必需</b>：批次採集預設走免費方法，付費 API 只在勾選「💰 付費 API 當備援」時才呼叫。</div>
      </Card>

      <Card title="AI 語音外撥 — Webhook 密鑰" badge="選填">
        <Step n={1}>語音平台（Bland/Retell/Vapi/ElevenLabs）本身的金鑰在<b>各平台後台</b>設定，本系統不需保管。</Step>
        <Step n={2}>若要保護回寫端點，設一組共用密鑰，並在 webhook 網址加 <span style={code}>&token=你的密鑰</span>；未帶對就拒收。</Step>
        <KeyBlock vars={["VOICE_WEBHOOK_TOKEN=自訂一組隨機字串"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>webhook 網址、各平台設定步驟與欄位對應，都在「AI 語音外撥」頁面內。</div>
      </Card>

      <Card title="Supabase — 資料庫" badge="系統核心">
        <Step n={1}>已建立專案 <b>sales-dashboard</b>。新環境請到 Supabase 取得 URL 與金鑰。</Step>
        <KeyBlock vars={["NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co", "NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxx", "# 後端繞過 RLS 用（外發引擎建議設定）", "SUPABASE_SERVICE_ROLE_KEY=eyJxxxx"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>遷移檔在 <span style={code}>supabase/migrations/</span>，於 Supabase SQL Editor 依序執行。</div>
      </Card>

      <Card title="選填 — Webhook / 追蹤">
        <KeyBlock vars={["RESEND_WEBHOOK_SECRET=whsec_xxxx   # 開信/退信回拋", "LINE_CHANNEL_SECRET=xxxx           # LINE 入站", "CRON_SECRET=xxxx                   # 排程端點保護"]} />
      </Card>
    </>
  );
}

// ── 常見問題 ─────────────────────────────────────────
function FaqGuide() {
  const faqs = [
    { q: "電子報顯示「已寄出」，但對方沒收到信？", a: "代表尚未設定 RESEND_API_KEY，系統處於「模擬寄出」模式。設定 Resend 金鑰並驗證寄件網域後即會真實送出。" },
    { q: "收件名單為什麼比名單總數少？", a: "電子報只列出「採集到有效 Email」的客戶（已過濾 Sentry、no-reply 等系統信箱）。可先用「管道補齊」抓更多 Email。" },
    { q: "「✨ AI 生成」沒反應或報錯？", a: "需設定 ANTHROPIC_API_KEY。設定後輸入信件目的（可加產業）即可生成草稿並帶入編輯器。" },
    { q: "品牌數量曾經卡在 1000 筆？", a: "已修正。API 改用分頁讀取突破 Supabase 預設 1000 筆上限，目前可顯示全部。" },
    { q: "手機上找不到產品報價/電子報功能？", a: "點右下角浮動選單鈕（☰）開啟完整導航抽屜，功能與桌機側欄一致。" },
    { q: "報價單可以寄給客戶嗎？", a: "可以。報價單檢視頁有「✉ 寄給客戶」會用採集到的 Email 直接寄出（需設定 RESEND_API_KEY，否則為模擬寄出）；也可「📋 複製內容」貼到 LINE。" },
    { q: "採集一定要付費 Google API 嗎？", a: "不用。批次採集預設走免費方法（官網爬蟲、DDG+Bing 並行找官網與 FB/IG/LINE、Email 網域推測）。只有勾選「💰 付費 API 當備援」時，才會在免費方法補不到時呼叫 Google Places/CSE。" },
    { q: "缺太多管道的名單一直拖慢速度怎麼辦？", a: "採集後仍無電話+Email 的品牌會自動遮蔽；也可在比對中心「⋯ 更多工具」手動遮蔽此範圍缺電話+Email 的名單。遮蔽者批次採集會跳過、清單預設隱藏，可用「顯示已遮蔽」檢視或還原。" },
    { q: "AI 語音打的電話會記錄到哪裡？", a: "「AI 語音外撥」頁存逐字稿/錄音/成效；同時每通電話無論接通與否都會寫入「商機進度」並註記為 AI語音（接通→已聯繫、有興趣/約回撥→留在管道、沒興趣/拒撥→流失），拒撥號碼加入拒撥名單、下次匯出排除。可手動匯入結果 CSV，或設 webhook 全自動回寫。" },
  ];
  return (
    <>
      {faqs.map((f, i) => (
        <Card key={i} title={f.q}>
          <div style={{ fontSize: 13.5, color: C.text, lineHeight: 1.7 }}>{f.a}</div>
        </Card>
      ))}
    </>
  );
}
