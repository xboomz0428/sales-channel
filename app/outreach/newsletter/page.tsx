'use client';

import { useEffect, useMemo, useState } from 'react';

interface Recipient {
  id: string;
  name: string;
  industry: string | null;
  email: string | null;
  stage: string | null;
  source?: string;
}
interface Template {
  id: string;
  name: string;
  subject: string | null;
  body_html: string | null;
  industry: string | null;
}
interface SendResult {
  total: number;
  sent: number;
  failed: number;
  queued: number;
}

export default function NewsletterPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tplId, setTplId] = useState<string>('');
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(true);

  // 載入名單(隨搜尋/篩選)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (industry) p.set('industry', industry);
    fetch(`/api/outreach/recipients?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRecipients(d.recipients || []);
        if (d.industries?.length) setIndustries(d.industries);
      })
      .finally(() => setLoading(false));
  }, [q, industry]);

  // 載入電子報模板(有 HTML 的)
  useEffect(() => {
    fetch('/api/outreach/templates?channel=EM')
      .then((r) => r.json())
      .then((d) => setTemplates((d.templates || []).filter((t: Template) => t.body_html)));
  }, []);

  const tpl = useMemo(() => templates.find((t) => t.id === tplId), [templates, tplId]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const allShown = recipients.length > 0 && recipients.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      if (allShown) recipients.forEach((r) => n.delete(r.id));
      else recipients.forEach((r) => n.add(r.id));
      return n;
    });

  async function doSend() {
    setSending(true);
    setConfirm(false);
    try {
      const res = await fetch('/api/outreach/newsletter/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, brandIds: [...selected] }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setSelected(new Set());
      } else {
        alert(data.error || '寄送失敗');
      }
    } catch {
      alert('連線失敗');
    } finally {
      setSending(false);
    }
  }

  const canSend = tplId && selected.size > 0;

  return (
    <div className="wrap">
      <header>
        <h1>電子報發送</h1>
        <p>選名單 → 選模板 → 預覽 → 批量寄送</p>
      </header>

      <div className="grid">
        {/* 收件名單 */}
        <section className="panel">
          <div className="phead">
            <strong>收件名單</strong>
            <span className="count">已選 {selected.size}</span>
          </div>
          <div className="filters">
            <input className="in" placeholder="搜尋名稱…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="in" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">全部產業</option>
              {industries.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
          </div>
          <button className="selall" onClick={toggleAll}>
            {allShown ? '取消全選' : `全選目前 ${recipients.length} 筆`}
          </button>
          <div className="list">
            {loading ? (
              <div className="muted">載入中…</div>
            ) : recipients.length === 0 ? (
              <div className="muted">沒有符合條件且有 email 的名單</div>
            ) : (
              recipients.map((r) => (
                <label key={r.id} className={`row ${selected.has(r.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="rname">{r.name}{r.source && <span className="rsrc">{r.source}</span>}</span>
                  <span className="rmeta">{r.industry || '—'} · {r.email}</span>
                </label>
              ))
            )}
          </div>
        </section>

        {/* 模板 + 預覽 */}
        <section className="panel">
          <div className="phead"><strong>電子報模板</strong></div>
          <select className="in" value={tplId} onChange={(e) => setTplId(e.target.value)}>
            <option value="">選擇模板…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <div className="muted small">
              還沒有電子報模板,先到 <a href="/outreach/email-editor">編輯器</a> 建立一個。
            </div>
          )}
          {tpl && <div className="subj">主旨:{tpl.subject || '(無主旨)'}</div>}
          <div className="previewbox">
            {tpl?.body_html ? (
              <iframe title="preview" srcDoc={tpl.body_html} className="frame" />
            ) : (
              <div className="muted center">選擇模板後在此預覽</div>
            )}
          </div>
        </section>
      </div>

      {/* 寄送列 */}
      <div className="sendbar">
        <div className="summary">
          {canSend ? (
            <>準備寄送「<strong>{tpl?.name}</strong>」給 <strong>{selected.size}</strong> 位</>
          ) : (
            <span className="muted">請選擇至少一位名單與一個模板</span>
          )}
        </div>
        <button className="btn solid" disabled={!canSend || sending} onClick={() => setConfirm(true)}>
          {sending ? '寄送中…' : '寄送'}
        </button>
      </div>

      {/* 確認對話框 */}
      {confirm && (
        <div className="overlay" onClick={() => setConfirm(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>確認寄送</h3>
            <p>
              即將把「<strong>{tpl?.name}</strong>」寄給 <strong>{selected.size}</strong> 位收件人。
              此動作會實際寄出 email,無法收回。
            </p>
            <p className="muted small">單次最多寄出 30 封,超出會排隊。</p>
            <div className="dbtns">
              <button className="btn ghost" onClick={() => setConfirm(false)}>取消</button>
              <button className="btn solid" onClick={doSend}>確認寄送</button>
            </div>
          </div>
        </div>
      )}

      {/* 結果 */}
      {result && (
        <div className="overlay" onClick={() => setResult(null)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>寄送完成</h3>
            <div className="rstat">
              <div><b>{result.sent}</b><span>成功</span></div>
              <div><b>{result.failed}</b><span>失敗</span></div>
              <div><b>{result.queued}</b><span>排隊</span></div>
            </div>
            <div className="dbtns">
              <a className="btn ghost" href="/outreach/email-dashboard">看儀表板</a>
              <button className="btn solid" onClick={() => setResult(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; min-height: 100vh; padding: 22px 22px 110px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 23px; margin: 0; }
        header p { margin: 4px 0 16px; font-size: 12px; color: #8a8472; }
        .muted { color: #9a9384; }
        .small { font-size: 12px; }
        .center { display: grid; place-items: center; height: 100%; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
        .panel { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; }
        .phead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .count { font-size: 12px; background: #eef0e6; color: #4a6b3f; padding: 3px 10px; border-radius: 999px; }
        .filters { display: flex; gap: 8px; margin-bottom: 8px; }
        .in { width: 100%; border: 1px solid #d9d3c4; border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; box-sizing: border-box; }
        .selall { width: 100%; border: 1px dashed #b9b29e; background: transparent; color: #5a6b4f; border-radius: 8px; padding: 7px; font-size: 12px; cursor: pointer; margin-bottom: 8px; font-family: inherit; }
        .list { max-height: 440px; overflow: auto; display: flex; flex-direction: column; gap: 4px; }
        .row { display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; gap: 0 8px; padding: 8px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
        .row:hover { background: #f8f6ee; }
        .row.on { background: #eef0e6; border-color: #cdd6bf; }
        .row input { grid-row: span 2; align-self: center; }
        .rname { font-size: 14px; }
        .rsrc { font-size: 10px; color: #6b8f71; background: #eef0e6; border-radius: 999px; padding: 1px 7px; margin-left: 6px; }
        .rmeta { font-size: 11px; color: #9a9384; grid-column: 2; }
        .subj { font-size: 13px; margin: 10px 0 8px; color: #4a4a40; }
        .previewbox { border: 1px solid #e3ded3; border-radius: 10px; overflow: hidden; height: 420px; background: #f3f0e7; margin-top: 10px; }
        .frame { width: 100%; height: 100%; border: none; }
        .sendbar { position: fixed; left: 0; right: 0; bottom: 0; background: #fffdf8; border-top: 1px solid #e3ded3; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .summary { font-size: 14px; }
        .btn { border: none; border-radius: 999px; padding: 10px 24px; font-size: 14px; cursor: pointer; font-family: inherit; text-decoration: none; display: inline-block; }
        .btn.solid { background: #4a6b3f; color: #fff; }
        .btn.solid:disabled { opacity: 0.45; cursor: default; }
        .btn.ghost { background: #fffdf8; border: 1px solid #d9d3c4; color: #4a6b3f; }
        .overlay { position: fixed; inset: 0; background: rgba(40, 44, 36, 0.45); display: grid; place-items: center; padding: 20px; }
        .dialog { background: #fffdf8; border-radius: 16px; padding: 24px; max-width: 380px; width: 100%; }
        .dialog h3 { font-family: 'Noto Serif TC', serif; margin: 0 0 10px; }
        .dialog p { font-size: 14px; line-height: 1.6; margin: 0 0 8px; }
        .dbtns { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
        .rstat { display: flex; gap: 10px; margin: 6px 0; }
        .rstat div { flex: 1; background: #f6f4ec; border-radius: 10px; padding: 14px; text-align: center; }
        .rstat b { font-family: 'Noto Serif TC', serif; font-size: 24px; display: block; }
        .rstat span { font-size: 12px; color: #8a8472; }
      `}</style>
    </div>
  );
}
