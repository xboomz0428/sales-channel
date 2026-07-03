'use client';

import { useEffect, useMemo, useState } from 'react';

interface Call {
  id: string; brand_id: string | null; phone: string; brand_name: string | null;
  campaign: string | null; status: string; outcome: string | null; transcript: string | null;
  recording_url: string | null; duration_sec: number | null; called_at: string;
  statusLabel: string; outcomeLabel: string | null;
}
interface Summary { total: number; answered: number; interested: number; dnc: number }

const OUTCOMES = [
  { v: 'interested', l: '有興趣' }, { v: 'callback', l: '約回撥' },
  { v: 'not_interested', l: '沒興趣' }, { v: 'do_not_call', l: '拒撥' },
  { v: 'wrong_number', l: '號碼有誤' }, { v: 'unknown', l: '未定' },
];

export default function VoicePage() {
  const [industry, setIndustry] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [detail, setDetail] = useState<Call | null>(null);
  // 手動新增一筆通話
  const [mPhone, setMPhone] = useState('');
  const [mStatus, setMStatus] = useState('completed');
  const [mOutcome, setMOutcome] = useState('interested');
  const [mNote, setMNote] = useState('');
  const [base, setBase] = useState('');
  useEffect(() => { setBase(window.location.origin); }, []);
  const hookUrl = (p: string) => `${base || 'https://你的網域'}/api/voice/webhook?provider=${p}`;

  const loadCalls = () => {
    fetch('/api/voice/calls').then((r) => r.json()).then((d) => {
      if (d.success) { setCalls(d.data || []); setSummary(d.summary || null); }
    }).catch(() => {});
  };
  useEffect(loadCalls, []);
  useEffect(() => {
    fetch('/api/brands?view=overview&country=TW').then((r) => r.json())
      .then((d) => { if (d.success) setIndustries(((d.data || []) as { industry: string }[]).map((r) => r.industry).filter(Boolean)); })
      .catch(() => {});
  }, []);

  const exportUrl = useMemo(() => {
    const p = new URLSearchParams({ country: 'TW' });
    if (industry) p.set('industry', industry);
    return `/api/voice/export?${p.toString()}`;
  }, [industry]);

  // 匯入平台回傳的結果 CSV（欄位：phone,status,outcome,duration_sec,recording_url,transcript,brand_id?）
  async function importCsv(file: File) {
    setImporting(true); setMsg(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) { setMsg({ ok: false, text: 'CSV 沒有可匯入的資料列' }); return; }
      const calls = rows.map((r) => ({
        phone: r.phone || r['電話'] || '',
        brand_id: r.brand_id || undefined,
        brand_name: r.品牌名 || r.brand_name || undefined,
        status: r.status || 'completed',
        outcome: r.outcome || undefined,
        duration_sec: r.duration_sec || r['秒數'] || undefined,
        recording_url: r.recording_url || r['錄音'] || undefined,
        transcript: r.transcript || r['逐字稿'] || undefined,
        campaign: r.campaign || undefined,
      })).filter((c) => c.phone);
      const res = await fetch('/api/voice/calls', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ calls }) });
      const d = await res.json();
      if (d.success) { setMsg({ ok: true, text: `已匯入 ${d.saved} 筆通話（${d.contactedUpdated} 個品牌轉為已聯繫、${d.dncAdded} 個加入拒撥）` }); loadCalls(); }
      else setMsg({ ok: false, text: d.error || '匯入失敗' });
    } catch { setMsg({ ok: false, text: '檔案解析失敗' }); }
    finally { setImporting(false); }
  }

  async function addManual() {
    if (!mPhone.trim()) { setMsg({ ok: false, text: '請輸入電話' }); return; }
    const res = await fetch('/api/voice/calls', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone: mPhone.trim(), status: mStatus, outcome: mOutcome, notes: mNote || undefined }),
    });
    const d = await res.json();
    if (d.success) { setMsg({ ok: true, text: '已記錄一筆通話' }); setMPhone(''); setMNote(''); loadCalls(); }
    else setMsg({ ok: false, text: d.error || '記錄失敗' });
  }

  return (
    <div className="wrap">
      <header>
        <h1>AI 語音外撥</h1>
        <p>匯出可外撥名單 → 用語音 AI 平台撥打 → 回傳結果寫回 CRM（含拒撥名單）</p>
      </header>

      <div className="note">
        ⚖️ 合規提醒：請用<b>自己的聲音</b>、通話開場<b>表明是 AI 助理</b>、<b>告知錄音</b>、並維護<b>拒撥名單</b>（此頁「拒撥」的通話會自動加入，之後匯出名單即排除）。本工具只做名單匯出與結果紀錄，不代為撥打。
      </div>

      {summary && (
        <div className="cards">
          <div className="card"><b>{summary.total}</b><span>通話紀錄</span></div>
          <div className="card"><b>{summary.answered}</b><span>已接通</span></div>
          <div className="card ok"><b>{summary.interested}</b><span>有興趣</span></div>
          <div className="card bad"><b>{summary.dnc}</b><span>拒撥</span></div>
        </div>
      )}

      <section className="panel">
        <div className="phead"><strong>① 匯出可外撥名單</strong><span className="hint">只含有電話、未拒撥、未遮蔽的品牌</span></div>
        <div className="row">
          <select className="in" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">全部產業</option>
            {industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <a className="btn solid" href={exportUrl}>↓ 匯出 CSV{industry ? `（${industry}）` : ''}</a>
        </div>
        <div className="tip">CSV 欄位：brand_id・phone・品牌名・產業・縣市・負責人・公司名稱（話術變數可直接帶入平台）。支援平台：Bland AI、Retell、Vapi、ElevenLabs 等。</div>
      </section>

      <section className="panel">
        <div className="phead"><strong>② 匯入通話結果</strong><span className="hint">平台跑完後回傳的 CSV</span></div>
        <div className="row">
          <label className="btn ghost">
            {importing ? '匯入中…' : '⬆ 匯入結果 CSV'}
            <input type="file" accept=".csv" style={{ display: 'none' }} disabled={importing}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = ''; }} />
          </label>
          <span className="tip" style={{ margin: 0 }}>欄位：phone・status・outcome・duration_sec・recording_url・transcript（brand_id 選填，未帶會用電話自動回查品牌）</span>
        </div>
        <details className="manual">
          <summary>或手動記錄一筆通話</summary>
          <div className="mrow">
            <input className="in" placeholder="電話 *" value={mPhone} onChange={(e) => setMPhone(e.target.value)} />
            <select className="in" value={mStatus} onChange={(e) => setMStatus(e.target.value)}>
              <option value="completed">已接通</option><option value="no_answer">未接</option>
              <option value="voicemail">語音信箱</option><option value="busy">忙線</option>
            </select>
            <select className="in" value={mOutcome} onChange={(e) => setMOutcome(e.target.value)}>
              {OUTCOMES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <input className="in" placeholder="備註" value={mNote} onChange={(e) => setMNote(e.target.value)} />
            <button className="btn solid" onClick={addManual}>記錄</button>
          </div>
        </details>
      </section>

      {msg && <div className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.ok ? '✓' : '✕'} {msg.text}<button onClick={() => setMsg(null)}>×</button></div>}

      <section className="panel">
        <div className="phead"><strong>🔌 如何跟各平台協作（可自動串接）</strong><span className="hint">兩種做法：手動匯入 CSV，或設 webhook 自動回寫</span></div>
        <p className="gtext">
          流程都一樣：<b>這裡匯出名單 → 平台外撥 → 結果回到這裡</b>。差別只在「結果怎麼回來」。
          想<b>自動記錄進度與對話</b>，就在平台設定通話結束的 webhook 指向下列網址；把 <code>brand_id</code>、<code>outcome</code>
          放進該平台的 <b>metadata / dynamic variables / structured data</b>，回寫時就會自動對上品牌並更新拒撥名單。
        </p>
        <div className="hookbox">
          <span className="hooklabel">Webhook 網址</span>
          <code className="hook">{base || 'https://你的網域'}/api/voice/webhook?provider=<b>平台代號</b></code>
          <button className="copy" onClick={() => navigator.clipboard.writeText(`${base}/api/voice/webhook`)}>複製</button>
        </div>
        <p className="gtext small">安全性：可在「設定」新增 <code>VOICE_WEBHOOK_TOKEN</code>，並在網址加 <code>&amp;token=你的密鑰</code>，未帶對就拒收。</p>

        <details className="pf"><summary>🟦 Bland AI（<code>?provider=bland</code>）</summary>
          <ol>
            <li>撥號時帶 <code>metadata</code>：<code>{'{ brand_id, brand_name, campaign }'}</code>（從匯出的 CSV 取 brand_id）。</li>
            <li>設定 <b>Webhook</b> 指向上方網址（provider=bland）。通話結束會送 <code>call_id / to / call_length / concatenated_transcript / recording_url</code>。</li>
            <li>想標成「有興趣/拒撥」→ 在 Pathway 用 <code>metadata.outcome</code> 或 disposition 帶回。</li>
          </ol>
        </details>
        <details className="pf"><summary>🟩 Retell AI（<code>?provider=retell</code>）</summary>
          <ol>
            <li>建立 outbound call 時帶 <code>metadata.brand_id</code>。</li>
            <li>Agent 設 <b>Webhook</b>（事件 <code>call_analyzed</code>）→ 上方網址（provider=retell）。會送 <code>call.transcript / recording_url / duration_ms / call_analysis</code>。</li>
            <li>成效自動對應：<code>user_sentiment</code>／<code>call_successful</code> → 有興趣/沒興趣；或用 <code>call_analysis.custom_analysis_data.outcome</code> 精準指定。</li>
          </ol>
        </details>
        <details className="pf"><summary>🟪 Vapi（<code>?provider=vapi</code>）</summary>
          <ol>
            <li>建立 call 時帶 <code>metadata.brand_id</code>（在 assistant 或 call 層）。</li>
            <li>Server URL 設為上方網址（provider=vapi）；系統收 <code>end-of-call-report</code>：<code>transcript / recordingUrl / durationSeconds / analysis</code>。</li>
            <li>用 <code>analysis.structuredData.outcome</code> 讓 AI 自己判斷並回傳成效。</li>
          </ol>
        </details>
        <details className="pf"><summary>🟧 ElevenLabs Conversational AI（<code>?provider=elevenlabs</code>）</summary>
          <ol>
            <li>用其 <b>聲音克隆</b>建 agent（clone 你自己的聲音），電話走 Twilio。</li>
            <li>設 <b>Post-call webhook</b> → 上方網址（provider=elevenlabs）：送 <code>conversation_id / transcript / audio / metadata</code>。</li>
            <li>把 <code>brand_id / phone / outcome</code> 放進 <b>dynamic variables</b>，回寫時自動對上品牌。</li>
          </ol>
        </details>
        <p className="gtext small">
          註：各平台 payload 欄位偶有版本差異，系統取多個候選路徑對應；若有平台回寫沒對上，把該平台的範例 payload 給我，我再補對應。
        </p>
      </section>

      <section className="panel">
        <div className="phead"><strong>③ 通話紀錄</strong><span className="hint">{calls.length} 筆</span></div>
        {calls.length === 0 ? (
          <div className="empty">尚無通話紀錄。先匯出名單、用語音平台撥打，再把結果 CSV 匯入這裡。</div>
        ) : (
          <table className="t">
            <thead><tr><th>品牌 / 電話</th><th>狀態</th><th>成效</th><th>秒數</th><th>時間</th><th></th></tr></thead>
            <tbody>
              {calls.map((c) => (
                <tr key={c.id}>
                  <td>{c.brand_name || '—'}<div className="ph">{c.phone}</div></td>
                  <td>{c.statusLabel}</td>
                  <td><span className={`oc ${c.outcome || ''}`}>{c.outcomeLabel || '—'}</span></td>
                  <td>{c.duration_sec ? `${c.duration_sec}s` : '—'}</td>
                  <td className="muted">{c.called_at ? c.called_at.slice(5, 16).replace('T', ' ') : '—'}</td>
                  <td>{(c.transcript || c.recording_url) && <button className="link" onClick={() => setDetail(c)}>查看</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{detail.brand_name || detail.phone}</h3>
            <div className="dmeta">{detail.statusLabel}{detail.outcomeLabel ? `・${detail.outcomeLabel}` : ''}{detail.duration_sec ? `・${detail.duration_sec} 秒` : ''}</div>
            {detail.recording_url && <a className="btn ghost small" href={detail.recording_url} target="_blank" rel="noreferrer">▶ 開啟錄音</a>}
            {detail.transcript ? <pre className="tr">{detail.transcript}</pre> : <div className="muted" style={{ marginTop: 10 }}>此通話無逐字稿</div>}
            <div className="dbtns"><button className="btn solid" onClick={() => setDetail(null)}>關閉</button></div>
          </div>
        </div>
      )}

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; min-height: 100vh; padding: 22px 22px 60px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 23px; margin: 0; }
        header p { margin: 4px 0 16px; font-size: 12px; color: #8a8472; }
        .muted { color: #9a9384; }
        .note { background: #fdf4e3; border: 1px solid #e8dcae; color: #8a6d1f; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; line-height: 1.7; margin-bottom: 14px; }
        .cards { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
        .card { flex: 1; min-width: 90px; background: #fffdf8; border: 1px solid #e3ded3; border-radius: 12px; padding: 12px 14px; text-align: center; }
        .card b { font-family: 'Noto Serif TC', serif; font-size: 22px; display: block; }
        .card span { font-size: 11px; color: #8a8472; }
        .card.ok b { color: #2f7d6b; } .card.bad b { color: #a4452f; }
        .panel { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; margin-bottom: 14px; }
        .phead { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
        .hint { font-size: 11px; color: #9a9384; }
        .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .in { border: 1px solid #d9d3c4; border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; box-sizing: border-box; }
        .tip { font-size: 11px; color: #9a9384; margin-top: 8px; line-height: 1.6; }
        .btn { border: none; border-radius: 999px; padding: 9px 18px; font-size: 13px; cursor: pointer; font-family: inherit; text-decoration: none; display: inline-block; }
        .btn.solid { background: #4a6b3f; color: #fff; }
        .btn.ghost { background: #fffdf8; border: 1px solid #d9d3c4; color: #4a6b3f; cursor: pointer; }
        .btn.small { padding: 6px 12px; font-size: 12px; margin: 10px 0; }
        .manual { margin-top: 12px; }
        .manual summary { font-size: 12px; color: #8a8472; cursor: pointer; }
        .mrow { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
        .mrow .in { flex: 1; min-width: 110px; }
        .msg { padding: 9px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; display: flex; align-items: center; gap: 8px; }
        .msg.ok { background: #e8f2e8; color: #3f6b3f; } .msg.bad { background: #f6e2da; color: #a4452f; }
        .msg button { margin-left: auto; border: none; background: none; cursor: pointer; color: inherit; font-size: 16px; }
        .empty { color: #9a9384; text-align: center; padding: 24px; font-size: 13px; }
        .t { width: 100%; border-collapse: collapse; }
        .t th { text-align: left; font-size: 11px; color: #8a8472; font-weight: 500; padding: 6px; border-bottom: 1px solid #e3ded3; }
        .t td { font-size: 13px; padding: 9px 6px; border-bottom: 1px solid #f0ece1; vertical-align: top; }
        .ph { font-size: 11px; color: #9a9384; margin-top: 2px; }
        .oc { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: #eef0e6; color: #5a6b4f; }
        .oc.interested { background: #e8f2e8; color: #2f7d6b; } .oc.do_not_call { background: #f6e2da; color: #a4452f; }
        .oc.callback { background: #eef2f6; color: #4a6b8f; }
        .link { border: none; background: none; color: #4a6b3f; cursor: pointer; font-size: 12px; text-decoration: underline; padding: 0; }
        .overlay { position: fixed; inset: 0; background: rgba(40,44,36,.45); display: grid; place-items: center; padding: 20px; z-index: 50; }
        .dialog { background: #fffdf8; border-radius: 16px; padding: 22px; max-width: 560px; width: 100%; max-height: 80vh; overflow: auto; }
        .dialog h3 { font-family: 'Noto Serif TC', serif; margin: 0 0 4px; }
        .dmeta { font-size: 12px; color: #8a8472; margin-bottom: 8px; }
        .tr { white-space: pre-wrap; word-break: break-word; background: #f6f4ec; border-radius: 10px; padding: 12px; font-size: 13px; line-height: 1.7; font-family: inherit; margin-top: 8px; }
        .dbtns { display: flex; justify-content: flex-end; margin-top: 14px; }
        .gtext { font-size: 12.5px; color: #6e7a6d; line-height: 1.75; margin: 0 0 10px; }
        .gtext.small { font-size: 11.5px; color: #9a9384; }
        .gtext code, .pf code, .hooklabel + .hook { background: #eef0e6; color: #4a6b3f; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
        .hookbox { display: flex; align-items: center; gap: 8px; background: #f6f4ec; border: 1px solid #e3ded3; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; flex-wrap: wrap; }
        .hooklabel { font-size: 11px; color: #8a8472; font-weight: 700; }
        .hook { flex: 1; min-width: 220px; font-size: 12px; color: #4a6b3f; word-break: break-all; background: none; padding: 0; }
        .copy { border: 1px solid #cdd6bf; background: #fff; color: #4a6b3f; border-radius: 7px; padding: 4px 10px; font-size: 12px; cursor: pointer; font-family: inherit; }
        .pf { border: 1px solid #e3ded3; border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; background: #fcfbf5; }
        .pf summary { cursor: pointer; font-size: 13px; font-weight: 600; color: #4a6b3f; }
        .pf ol { margin: 8px 0 4px; padding-left: 20px; }
        .pf li { font-size: 12.5px; color: #5a6b4f; line-height: 1.8; }
      `}</style>
    </div>
  );
}

// 極簡 CSV 解析（支援引號跳脫、首列為表頭）
function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let cur: string[] = [], val = '', inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"' && clean[i + 1] === '"') { val += '"'; i++; }
      else if (ch === '"') inQ = false;
      else val += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cur.push(val); val = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      if (val !== '' || cur.length) { cur.push(val); rows.push(cur); cur = []; val = ''; }
    } else val += ch;
  }
  if (val !== '' || cur.length) { cur.push(val); rows.push(cur); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim())).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}
