"use client";

import { useState } from "react";
import { C } from "@/lib/design";
import { APP_VERSION } from "@/lib/version";
import MobileTabBar from "@/components/MobileTabBar";

type TabKey = "flow" | "keys" | "faq";

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
        {([["flow", "頁面流程"], ["keys", "API 申請與設定"], ["faq", "常見問題"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: tab === k ? 700 : 400, border: "none", background: tab === k ? C.p50 : "transparent", color: tab === k ? C.primary : C.muted, cursor: "pointer" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px", background: C.bg, paddingBottom: 90 }}>
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          {tab === "flow" && <FlowGuide />}
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
        <Step n={1}>到 <b>採集任務</b>，輸入關鍵字（如「養生館」）與縣市/地區，執行 Google Places 採集，自動建立品牌與門市。</Step>
        <Step n={2}>到 <b>比對中心</b>，用「🏛 工商登記比對」補上統一編號與公司登記名（Google→mygov→twincn 多來源）。</Step>
        <Step n={3}>用「🔗 管道補齊」自動從官網/FB 抓 LINE、電話、Email、IG 等聯絡管道，存入名單。</Step>
        <Step n={4}>「🌐 官網爬蟲」可指定數量、類別或「依篩選」（縣市＋地區）批次抓取。</Step>
      </Card>

      <Card title="② 經營名單" badge="名單總覽 / 商機 / 跟進">
        <Step n={1}><b>名單總覽</b>：檢視每個品牌的聯絡管道、工商資料、門市與評論；可建立客戶照護計畫（拜訪/回購週期）。</Step>
        <Step n={2}><b>商機進度</b>：把名單推進到打樣、報價、議約、成交等階段。</Step>
        <Step n={3}><b>今日跟進</b>：系統自動產生回購、拜訪到期、停滯商機、三節提醒等任務。</Step>
      </Card>

      <Card title="③ 產品與報價" badge="產品報價">
        <Step n={1}>在 <b>產品資料</b> 分頁維護產品（售價、通路價、成本、毛利、規格、最低起訂量）。</Step>
        <Step n={2}>在 <b>報價單</b> 分頁點「＋ 新增報價單」，左側點選產品加入、調整數量與折扣，搜尋並綁定客戶名單。</Step>
        <Step n={3}>建立後可查看、改狀態（草稿/已寄出/已接受），並「📋 複製內容」貼到 LINE 或 Email。</Step>
      </Card>

      <Card title="④ 電子報外發" badge="郵件編輯器 / 電子報發送 / 郵件儀表板">
        <Step n={1}><b>郵件編輯器</b>：選 11 組情境範本（初次開發、報價、節慶…）或按「✨ AI 生成」用主題自動產生草稿，編輯後「存成模板」。</Step>
        <Step n={2}><b>電子報發送</b>：左側勾選收件名單（自動帶出採集到 Email 的客戶），右側選模板預覽，點「寄送」批次發出。</Step>
        <Step n={3}><b>郵件儀表板</b>：追蹤寄送量、開信率、點擊率、退信與回覆，點單筆可看內容。</Step>
        <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8, lineHeight: 1.6, background: C.surf2, padding: "10px 12px", borderRadius: 9 }}>
          💡 實際把信寄進對方信箱需要設定 <span style={code}>RESEND_API_KEY</span>；未設定時系統僅「模擬寄出」（標記已寄但不會真的送信）。設定方式見「API 申請與設定」。
        </div>
      </Card>
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

      <Card title="Anthropic Claude — AI 生成草稿" badge="AI 生成必需">
        <Step n={1}>到 <b>console.anthropic.com</b> 註冊並儲值。</Step>
        <Step n={2}>建立 API Key（Settings → API Keys）。</Step>
        <KeyBlock vars={["ANTHROPIC_API_KEY=sk-ant-xxxxxxxx", "# 選填，預設 claude-sonnet-4-6", "CLAUDE_MODEL=claude-sonnet-4-6"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>用於郵件編輯器的「✨ AI 生成」。未設定時點生成會提示設定金鑰。</div>
      </Card>

      <Card title="Google Places / Custom Search — 採集" badge="採集必需">
        <Step n={1}>到 <b>Google Cloud Console</b> 建專案，啟用 <i>Places API</i> 與 <i>Custom Search API</i>。</Step>
        <Step n={2}>建立 API Key；到 <b>programmablesearchengine.google.com</b> 建立搜尋引擎取得 CSE ID。</Step>
        <KeyBlock vars={["GOOGLE_PLACES_API_KEY=AIzaxxxxxxxx", "GOOGLE_CSE_ID=xxxxxxxx"]} />
        <div style={{ fontSize: 12.5, color: C.muted }}>用量與費用可在「API 設定」頁追蹤（Places $32、詳情 $17、CSE $5／1000 次）。</div>
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
    { q: "報價單可以寄給客戶嗎？", a: "目前可「📋 複製內容」貼到 Email/LINE。也可在郵件編輯器用「報價單」範本，搭配電子報發送。" },
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
