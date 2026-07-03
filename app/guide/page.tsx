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

// ── 動態工作流程圖（可點擊展開子流程與判斷分支）─────────────
type Rule = { when: string; then: string; kind?: "ok" | "bad" | "auto" };
type Decision = { q: string; rules: Rule[] };
type Detail = { flow?: string[]; decisions?: Decision[]; mech?: string[] };
type WFStep = { label: string; sub?: string; color?: string; tone?: "start" | "auto" | "branch" | "end"; detail?: Detail };
// 節點：單一步驟，或「並列群組」（mode: all=同時執行 / one=擇一）
type WFNode = ({ type?: "step" } & WFStep) | { type: "par"; label: string; mode?: "all" | "one"; items: WFStep[] };
const TONE: Record<string, string> = { start: "#5B7C99", auto: "#7B6E99", branch: "#A6824A", end: "#4A6B50" };
const RULE_COLOR: Record<string, string> = { ok: "#4A6B50", bad: "#A66A4F", auto: "#7B6E99" };

function SubFlow({ d }: { d: Detail }) {
  return (
    <div style={{ width: "100%", maxWidth: 540, background: C.surf2, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", marginTop: 8 }}>
      {d.flow && (
        <div style={{ marginBottom: d.decisions || d.mech ? 12 : 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 7 }}>子流程</div>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4 }}>
            {d.flow.map((f, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 12, color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "3px 8px" }}>{f}</span>
                {i < d.flow!.length - 1 && <span style={{ color: C.primary, fontWeight: 700 }}>→</span>}
              </span>
            ))}
          </div>
        </div>
      )}
      {d.decisions && d.decisions.map((dec, di) => (
        <div key={di} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>
            <span style={{ color: "#A6824A" }}>◆ 判斷：</span>{dec.q}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingLeft: 6 }}>
            {dec.rules.map((r, ri) => (
              <div key={ri} style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12.5, lineHeight: 1.5 }}>
                <span style={{ color: C.muted }}>{ri === dec.rules.length - 1 ? "└" : "├"}</span>
                <span style={{ color: C.muted }}>若 <b style={{ color: C.text }}>{r.when}</b></span>
                <span style={{ color: RULE_COLOR[r.kind || "auto"] }}>→ {r.then}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {d.mech && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 6 }}>機制</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {d.mech.map((m, i) => <li key={i} style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>{m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// 單一步驟卡（可點開子流程）
function StepCard({ s, compact }: { s: WFStep; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const color = s.color || TONE[s.tone || "auto"];
  const clickable = !!s.detail;
  return (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div
        onClick={clickable ? () => setOpen((v) => !v) : undefined}
        role={clickable ? "button" : undefined}
        aria-expanded={clickable ? open : undefined}
        style={{ width: "100%", background: open ? C.p50 : C.surface, borderStyle: "solid", borderWidth: 1, borderLeftWidth: 4, borderTopColor: open ? color : C.border, borderRightColor: open ? color : C.border, borderBottomColor: open ? color : C.border, borderLeftColor: color, borderRadius: 10, padding: compact ? "9px 11px" : "11px 14px", cursor: clickable ? "pointer" : "default", transition: "background 120ms" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ flex: 1, fontSize: compact ? 12.5 : 13.5, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{s.label}</div>
          {clickable && <span style={{ fontSize: 10.5, color, fontWeight: 700, whiteSpace: "nowrap" }}>{open ? "▾" : "▸"}</span>}
        </div>
        {s.sub && <div style={{ fontSize: compact ? 11 : 12, color: C.muted, marginTop: 3, lineHeight: 1.5 }}>{s.sub}</div>}
      </div>
      {open && s.detail && <SubFlow d={s.detail} />}
    </div>
  );
}

// 並列群組：多個功能同時執行（all）或擇一（one），並排顯示
function ParallelGroup({ label, mode, items }: { label: string; mode?: "all" | "one"; items: WFStep[] }) {
  const tag = mode === "one" ? "◇ 擇一" : "⇉ 並行";
  return (
    <div style={{ width: "100%", border: `1px dashed ${C.border}`, borderRadius: 12, padding: "10px 12px 12px", background: "rgba(0,0,0,0.012)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, background: C.p50, borderRadius: 999, padding: "2px 9px" }}>{tag}</span>
        <span style={{ fontSize: 12, color: C.muted }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
        {items.map((it, i) => (
          <div key={i} style={{ flex: "1 1 150px", minWidth: 150 }}>
            <StepCard s={it} compact />
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowNode({ n, last }: { n: WFNode; last: boolean }) {
  const color = n.type === "par" ? C.primary : (n.color || TONE[n.tone || "auto"]);
  return (
    <div style={{ width: "100%", maxWidth: 540, display: "flex", flexDirection: "column", alignItems: "center" }}>
      {n.type === "par"
        ? <ParallelGroup label={n.label} mode={n.mode} items={n.items} />
        : <StepCard s={n} />}
      {!last && (
        <div className="wf-conn" aria-hidden>
          <span className="wf-dot" style={{ background: color }} />
        </div>
      )}
    </div>
  );
}

function Workflow({ title, badge, nodes, note }: { title: string; badge?: string; nodes: WFNode[]; note?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
        {badge && <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 999, background: C.p50, color: C.primary, fontWeight: 600 }}>{badge}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {nodes.map((n, i) => <WorkflowNode key={i} n={n} last={i === nodes.length - 1} />)}
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
      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.7, marginBottom: 14, background: C.p50, borderRadius: 9, padding: "10px 12px" }}>
        👆 <b>點任一區塊</b>展開它的<b>子流程</b>、<b>判斷分支（◆ 判斷：條件→結果）</b>與機制。
        虛線框代表功能<b>並列</b>：<b>⇉ 並行</b>＝同時執行、<b>◇ 擇一</b>＝多選一。移動的點＝資料流向；紫＝系統自動、綠＝採用/落地、褐＝條件分支。
      </div>

      <Workflow title="① 名單採集與管道補齊" badge="採集任務 / 比對中心"
        nodes={[
          { type: "par", label: "資料來源（可同時用、亦可擇一）", mode: "one", items: [
            { label: "Google 地圖採集", sub: "關鍵字＋縣市找新店家", tone: "start",
              detail: { flow: ["搜尋店家", "解析電話/地址/評論", "建立品牌+門市"], mech: ["需 Places 金鑰；含評分與評論"] } },
            { label: "政府開放資料匯入", sub: "9 種官方名冊", tone: "start",
              detail: { flow: ["下載官方檔", "欄位對應", "去重寫入"], mech: ["診所/旅宿/禮儀/宮廟/月子/人民團體…免爬蟲、資料乾淨"] } },
            { label: "手動 / CSV 匯入", sub: "自訂名單", tone: "start",
              detail: { flow: ["貼上/上傳", "對應欄位", "寫入"] } },
          ] },
          { label: "去重寫入品牌 + 門市", sub: "brand_key 唯一鍵", tone: "auto",
            detail: { decisions: [{ q: "品牌是否已存在（brand_key）？", rules: [{ when: "已存在", then: "DB upsert 略過，不報錯", kind: "auto" }, { when: "不存在", then: "新增名單", kind: "ok" }] }] } },
          { label: "工商統編比對", sub: "名稱→統編→工商登記", tone: "auto",
            detail: { flow: ["名稱正規化", "查統一編號", "抓工商登記"],
              decisions: [
                { q: "品牌是法人（協會/基金會/公會）？", rules: [{ when: "是法人", then: "優先 twincn 台灣公司網", kind: "auto" }, { when: "一般公司", then: "mygov → GCIS 依序", kind: "auto" }] },
                { q: "比對信心度？", rules: [{ when: "高信心", then: "直接寫回統編", kind: "ok" }, { when: "低信心", then: "標記待人工確認", kind: "bad" }] }] } },
          { label: "管道補齊 ①：門市基礎", sub: "電話 / 地圖", tone: "auto",
            detail: { mech: ["政府/地圖匯入時多半已帶電話與地址，直接落地"] } },
          { label: "管道補齊 ②：有官網→爬官網", sub: "首頁＋聯絡頁", tone: "auto",
            detail: { flow: ["連線官網", "抓 LINE/FB/IG/Email", "找 /contact /about 補 Email"],
              decisions: [{ q: "官網首頁沒 Email？", rules: [{ when: "沒有", then: "再爬聯絡頁（含 Cloudflare 解碼）", kind: "auto" }] }] } },
          { label: "管道補齊 ③：交叉搜尋", sub: "用已知 FB/IG 互找缺漏", tone: "auto",
            detail: { mech: ["已有 FB→爬 FB 找 IG/電話/Email/LINE；能省下付費 API"] } },
          { type: "par", label: "管道補齊 ④：免 API 搜尋引擎（兩引擎同時查）", mode: "all", items: [
            { label: "DuckDuckGo", sub: "HTML 結果頁", tone: "auto" },
            { label: "Bing", sub: "結果頁", tone: "auto" },
          ] },
          { label: "採用搜尋結果", sub: "官網或 FB/IG/LINE", tone: "auto",
            detail: { decisions: [{ q: "結果可信嗎？", rules: [{ when: "標題含公司名", then: "採用（含社群連結）", kind: "ok" }, { when: "名錄站/不相關", then: "丟棄不寫入", kind: "bad" }] }],
              mech: ["兩引擎並行：逐一等最慢 12s → 並行 6s", "小店常只有粉專沒官網 → 直接收 FB/IG/LINE"] } },
          { label: "管道補齊 ⑤：Email 網域推測", sub: "有官網卻無 Email", tone: "auto",
            detail: { flow: ["取官網網域", "排除自由信箱/社群", "試 info@/contact@…", "驗證 MX"],
              decisions: [{ q: "網域有 MX（能收信）？", rules: [{ when: "有 MX", then: "寫入並標記 guessed", kind: "ok" }, { when: "無 MX/非企業網域", then: "放棄不亂寫", kind: "bad" }] }] } },
          { type: "par", label: "付費備援：勾選才用（免費補不到才呼叫）", mode: "all", items: [
            { label: "Google Places", sub: "找店家/電話/官網", tone: "branch",
              detail: { decisions: [{ q: "有勾且仍缺？", rules: [{ when: "是", then: "呼叫（計費）", kind: "auto" }, { when: "沒勾（預設）", then: "跳過零費用", kind: "ok" }] }] } },
            { label: "Google CSE", sub: "搜聯絡資訊/官網", tone: "branch" },
            { label: "CSE 搜 FB 粉專", sub: "找官方粉專", tone: "branch" },
          ] },
          { label: "寫回名單 · 低價值自動遮蔽", sub: "缺電話+Email 者遮蔽", tone: "end",
            detail: { decisions: [{ q: "採後仍無『電話與 Email』？", rules: [{ when: "兩者皆無", then: "標記 exhausted 遮蔽", kind: "bad" }, { when: "至少有一種", then: "保留正常", kind: "ok" }] }],
              mech: ["遮蔽者批次跳過、清單隱藏，加快讀取；可顯示/還原"] } },
        ]}
        note="效率機制：已完整品牌自動剃除、7 天內試過預設跳過、30 線並行；進度條顯示每分鐘筆數與預估剩餘時間。" />

      <Workflow title="② 電子報外發與自動化" badge="編輯器 / 發送 / 自動化"
        nodes={[
          { type: "par", label: "備妥內容（擇一起手）", mode: "one", items: [
            { label: "套用範本", sub: "11 組情境", tone: "start", detail: { mech: ["初次開發/報價/節慶/回訪…"] } },
            { label: "✨ AI 生成", sub: "輸入目的自動產草稿", tone: "start", detail: { mech: ["需 ANTHROPIC_API_KEY 等；可指定產業"] } },
            { label: "手動撰寫", sub: "單一大欄位", tone: "start" },
          ] },
          { label: "編輯 + 存成模板", sub: "可一鍵翻日/英文", tone: "auto",
            detail: { mech: ["圖片/按鈕/附件工具列插入；翻譯另存新模板"] } },
          { type: "par", label: "收件 Email 來源（三來源合併）", mode: "all", items: [
            { label: "採集管道", sub: "brand_channels", tone: "auto" },
            { label: "聯絡人", sub: "contacts", tone: "auto" },
            { label: "名單信箱", sub: "brands.email", tone: "auto" },
          ] },
          { label: "過濾收件名單", sub: "排除黑名單/退訂", tone: "auto",
            detail: { decisions: [{ q: "此信箱狀態？", rules: [{ when: "黑名單/已退訂", then: "排除不寄", kind: "bad" }, { when: "正常", then: "納入", kind: "ok" }] }] } },
          { label: "寄送 / 排程", sub: "清洗→分批→追蹤", tone: "auto",
            detail: { flow: ["寄前 MX 清洗", "分批 30 封", "注入追蹤像素+連結改寫", "送出"],
              decisions: [
                { q: "超過今日額度？", rules: [{ when: "超過", then: "排隊 queued 等 8AM 補寄", kind: "auto" }, { when: "未超過", then: "即時寄", kind: "ok" }] },
                { q: "已寄過此模板（且開略過重複）？", rules: [{ when: "是", then: "略過不重寄", kind: "auto" }, { when: "否", then: "正常寄", kind: "ok" }] }] } },
          { type: "par", label: "每天 8AM 自動化（一次做完）", mode: "all", items: [
            { label: "到期排程寄出", tone: "auto" },
            { label: "自動跟進", sub: "未開信/未回覆", tone: "auto",
              detail: { decisions: [{ q: "N 天後仍符合條件？", rules: [{ when: "未開信/未回覆", then: "寄跟進模板（每人一次）", kind: "auto" }, { when: "已互動", then: "不打擾", kind: "ok" }] }] } },
            { label: "補寄佇列", sub: "排隊的信", tone: "auto" },
            { label: "掃描退信", tone: "auto" },
            { label: "LINE 通知", sub: "結果彙整", tone: "auto" },
          ] },
          { type: "par", label: "成效追蹤（並行統計）", mode: "all", items: [
            { label: "開信 / 點擊 / 回覆", sub: "追蹤像素＋連結", tone: "end" },
            { label: "退信處理", sub: "硬/軟分類", tone: "end",
              detail: { decisions: [{ q: "退信類型？", rules: [{ when: "硬退信（查無此人）", then: "立即封鎖", kind: "bad" }, { when: "軟退信（暫時）", then: "累計 3 次才封鎖", kind: "auto" }] }] } },
            { label: "失敗重寄", sub: "顯示原因·一鍵重寄", tone: "end" },
          ] },
        ]}
        note="送達無法 100% 確認（Email 協定限制）；點擊與回覆才是最可靠的互動指標。" />

      <Workflow title="③ AI 語音外撥" badge="AI 語音外撥 → 商機進度"
        nodes={[
          { label: "匯出可外撥名單", sub: "三關過濾 · 帶 brand_id", tone: "start",
            detail: { decisions: [{ q: "此品牌可外撥嗎？（三關）", rules: [
              { when: "無電話", then: "排除", kind: "bad" }, { when: "在拒撥名單", then: "排除", kind: "bad" },
              { when: "被遮蔽", then: "排除", kind: "bad" }, { when: "三關皆過", then: "納入 CSV", kind: "ok" }] }],
              mech: ["CSV 帶 brand_id，回寫才能自動對上品牌"] } },
          { type: "par", label: "語音平台（擇一，皆為外部平台）", mode: "one", items: [
            { label: "Bland AI", tone: "start", detail: { mech: ["metadata 帶 brand_id"] } },
            { label: "Retell", tone: "start", detail: { mech: ["事件 call_analyzed；metadata 帶 brand_id"] } },
            { label: "Vapi", tone: "start", detail: { mech: ["end-of-call-report；metadata 帶 brand_id"] } },
            { label: "ElevenLabs", tone: "start", detail: { mech: ["聲音克隆最佳；dynamic variables 帶 brand_id"] } },
          ] },
          { type: "par", label: "結果回寫（擇一）", mode: "one", items: [
            { label: "webhook 自動", sub: "通話結束即回寫", tone: "auto",
              detail: { flow: ["偵測平台", "對應欄位", "external_id 去重", "寫入"],
                decisions: [
                  { q: "同一通重送？", rules: [{ when: "provider+external_id 已存在", then: "略過去重", kind: "auto" }, { when: "新通話", then: "寫入", kind: "ok" }] },
                  { q: "沒帶 brand_id？", rules: [{ when: "沒帶", then: "用電話回查品牌", kind: "auto" }] }],
                mech: ["可設 VOICE_WEBHOOK_TOKEN 密鑰"] } },
            { label: "CSV 手動匯入", sub: "平台跑完下載", tone: "auto" },
          ] },
          { type: "par", label: "自動寫入（同時發生）", mode: "all", items: [
            { label: "通話紀錄", sub: "逐字稿/錄音/秒數/成效", tone: "auto" },
            { label: "聯繫紀錄", sub: "outreach_logs", tone: "auto" },
            { label: "品牌狀態", sub: "接通→已聯繫", tone: "auto",
              detail: { decisions: [{ q: "有接通？", rules: [{ when: "接通", then: "new→已聯繫", kind: "ok" }, { when: "沒接通", then: "狀態不變", kind: "auto" }] }] } },
            { label: "拒撥名單", sub: "拒撥→加入", tone: "auto" },
          ] },
          { label: "推進商機進度（註記 AI 語音）", sub: "無論接通與否都進商機", tone: "end",
            detail: { decisions: [
              { q: "依通話成效推進階段", rules: [
                { when: "有興趣 / 約回撥 / 接通", then: "推進到『已聯繫』", kind: "ok" },
                { when: "沒興趣 / 拒撥 / 號碼有誤", then: "登記『流失』", kind: "bad" },
                { when: "未接 / 語音信箱 / 忙線", then: "不推進，但建商機留軌跡", kind: "auto" }] },
              { q: "品牌原本有商機嗎？", rules: [
                { when: "沒有", then: "建立（owner=AI語音）", kind: "ok" },
                { when: "已成交/流失", then: "不再變動", kind: "auto" },
                { when: "進行中", then: "只前進不倒退", kind: "auto" }] }],
              mech: ["每通電話都在商機進度可追蹤，並標記來源為 AI語音"] } },
        ]}
        note="閉環：拒撥自動排除、商機只前進不倒退，讓 AI 語音的每次接觸都留在商機進度。" />
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
