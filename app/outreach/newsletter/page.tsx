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
  skipped: number;
}

const STAGE_LABEL: Record<string, string> = {
  new: '新名單', contacted: '已聯繫', sampling: '打樣中', quoting: '報價中',
  negotiating: '議約中', won: '成交', lost: '流失',
};

export default function NewsletterPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [industries, setIndustries] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [totalBrands, setTotalBrands] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tplId, setTplId] = useState<string>('');
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('');
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [skipDup, setSkipDup] = useState(true); // 略過已寄送過相同模板的收件人
  const [removing, setRemoving] = useState(false);
  // ① 排程寄送
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<{ mode: string; fromEmail: string | null; providerLabel?: string } | null>(null);
  // 手動新增
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  // manualList 不再需要前端暫存，手動名單已持久化到資料庫，從 recipients API 取回
  // 發送紀錄
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; to_email: string; subject: string | null; status: string; sent_at: string | null; open_count: number; click_count: number; brands?: { name?: string } | null }[]>([]);

  // 寄信設定狀態（真實 / 模擬）
  useEffect(() => {
    fetch('/api/outreach/email-config').then((r) => r.json()).then(setCfg).catch(() => {});
  }, []);

  // 載入發送紀錄
  const loadHistory = () => {
    fetch('/api/outreach/email-dashboard')
      .then((r) => r.json())
      .then((d) => setHistory(d.messages || []))
      .catch(() => {});
  };
  useEffect(loadHistory, []);

  // 手動新增收件人（存到資料庫，重新整理也不會消失）
  const addManual = async () => {
    const email = manualEmail.trim();
    const name = manualName.trim() || email;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return;
    if (recipients.some((r) => r.email === email)) return;
    try {
      const res = await fetch('/api/outreach/manual-recipients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const json = await res.json();
      if (json.success) {
        // 重新載入名單（手動名單現在從 DB 來）
        setManualName('');
        setManualEmail('');
        // 觸發 recipients 重新載入
        const p = new URLSearchParams();
        if (q) p.set('q', q);
        if (industry) p.set('industry', industry);
        if (stage) p.set('stage', stage);
        if (source) p.set('source', source);
        fetch(`/api/outreach/recipients?${p.toString()}`)
          .then((r) => r.json())
          .then((d) => { setRecipients(d.recipients || []); });
      }
    } catch { /* 新增失敗 */ }
  };

  // 載入名單(隨搜尋/篩選)
  useEffect(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (industry) p.set('industry', industry);
    if (stage) p.set('stage', stage);
    if (source) p.set('source', source);
    fetch(`/api/outreach/recipients?${p.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setRecipients(d.recipients || []);
        if (d.industries?.length) setIndustries(d.industries);
        if (d.stages) setStages(d.stages);
        if (d.sources) setSources(d.sources);
        if (typeof d.totalBrands === 'number') setTotalBrands(d.totalBrands);
      })
      .finally(() => setLoading(false));
  }, [q, industry, stage, source]);

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

  // 刪除手動收件人（從 DB 移除）
  const removeManual = async (id: string) => {
    const dbId = id.replace(/^manual_/, '');
    await fetch('/api/outreach/manual-recipients', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: dbId }),
    });
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  // 每批最多 30 封（後端單次上限 PER_CALL=30），前端自動分批送完
  const BATCH_SIZE = 30;
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function doSend() {
    setSending(true);
    setConfirm(false);
    let sent = 0, failed = 0, queued = 0, skipped = 0;
    try {
      // 品牌 ID 和手動收件人分開處理
      const brandIds = [...selected].filter((id) => !id.startsWith('manual_'));
      const manualIds = [...selected].filter((id) => id.startsWith('manual_'));
      const manualRecips = manualIds
        .map((id) => recipients.find((r) => r.id === id))
        .filter((r): r is Recipient => !!r && !!r.email);

      const total = brandIds.length + manualRecips.length;
      setProgress({ done: 0, total });
      let done = 0;

      // 名單品牌：自動分批，每批 ≤ 30
      for (const batch of chunk(brandIds, BATCH_SIZE)) {
        const res = await fetch('/api/outreach/newsletter/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ templateId: tplId, brandIds: batch, skipDuplicates: skipDup }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { sent += data.sent || 0; failed += data.failed || 0; queued += data.queued || 0; skipped += data.skipped || 0; }
        else { failed += batch.length; }
        done += batch.length;
        setProgress({ done, total });
      }

      // 手動收件人：同樣分批
      for (const batch of chunk(manualRecips, BATCH_SIZE)) {
        const res = await fetch('/api/outreach/newsletter/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ templateId: tplId, manualEmails: batch.map((r) => ({ name: r.name, email: r.email! })), skipDuplicates: skipDup }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) { sent += data.sent || 0; failed += data.failed || 0; skipped += data.skipped || 0; }
        else { failed += batch.length; }
        done += batch.length;
        setProgress({ done, total });
      }

      setResult({ total, sent, failed, queued, skipped });
      setSelected(new Set());
      loadHistory();
    } catch {
      alert('連線失敗');
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  // 移除選取名單（未來篩選不再顯示）
  async function removeSelected() {
    if (selected.size === 0) return;
    if (!window.confirm(`確定將選取的 ${selected.size} 位移出名單？未來篩選將不再顯示（可至排除名單復原）。`)) return;
    setRemoving(true);
    try {
      const chosen = [...selected]
        .map((id) => recipients.find((r) => r.id === id))
        .filter((r): r is Recipient => !!r);
      // 手動收件人 → 直接刪除；一般品牌 → 加入排除名單
      const manualOnes = chosen.filter((r) => r.id.startsWith('manual_'));
      const brandOnes = chosen.filter((r) => !r.id.startsWith('manual_') && r.email);
      if (brandOnes.length > 0) {
        await fetch('/api/outreach/exclude', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: brandOnes.map((r) => ({ email: r.email, brand_id: r.id })) }),
        });
      }
      for (const m of manualOnes) {
        await fetch('/api/outreach/manual-recipients', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: m.id.replace(/^manual_/, '') }),
        });
      }
      const removedIds = new Set(chosen.map((r) => r.id));
      setRecipients((prev) => prev.filter((r) => !removedIds.has(r.id)));
      setSelected(new Set());
    } catch {
      alert('移除失敗');
    } finally {
      setRemoving(false);
    }
  }

  // ① 建立排程寄送
  async function doSchedule() {
    if (!scheduleAt) { alert('請選擇排程時間'); return; }
    const when = new Date(scheduleAt);
    if (isNaN(when.getTime()) || when.getTime() < Date.now()) { alert('排程時間需晚於現在'); return; }
    setScheduling(true);
    try {
      const brandIds = [...selected].filter((id) => !id.startsWith('manual_'));
      const manualRecips = [...selected]
        .filter((id) => id.startsWith('manual_'))
        .map((id) => recipients.find((r) => r.id === id))
        .filter((r): r is Recipient => !!r && !!r.email)
        .map((r) => ({ name: r.name, email: r.email! }));
      const res = await fetch('/api/outreach/schedule', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, brandIds, manualEmails: manualRecips, scheduledAt: when.toISOString(), skipDuplicates: skipDup }),
      });
      const json = await res.json();
      if (json.success) {
        setScheduleOpen(false);
        setScheduleAt('');
        setSelected(new Set());
        alert(`已排程：${when.toLocaleString('zh-TW')} 寄出`);
      } else {
        alert(json.error || '排程失敗');
      }
    } catch {
      alert('連線失敗');
    } finally {
      setScheduling(false);
    }
  }

  const canSend = tplId && selected.size > 0;

  return (
    <div className="wrap">
      <header>
        <h1>電子報發送</h1>
        <p>選名單 → 選模板 → 預覽 → 批量寄送</p>
      </header>

      {cfg && (
        <div className={`sendmode ${cfg.mode}`}>
          {cfg.mode === 'live' ? (
            <span>✅ <b>真實寄送模式</b>（{cfg.providerLabel}）{cfg.fromEmail ? `，寄件人 ${cfg.fromEmail}` : ''}。</span>
          ) : (
            <span>⚠️ <b>模擬寄出模式</b>：目前不會真的寄信。設定 Gmail SMTP、Resend 或 SendGrid 任一即可真實寄出。</span>
          )}
          <a href="/guide">如何設定 →</a>
        </div>
      )}

      <div className="grid">
        {/* 收件名單 */}
        <section className="panel">
          <div className="phead">
            <strong>收件名單</strong>
            <span className="count">名單 {totalBrands}・可寄送 {recipients.length}・已選 {selected.size}</span>
          </div>
          <div className="filters">
            <input className="in" placeholder="搜尋名稱…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="in" value={industry} onChange={(e) => setIndustry(e.target.value)}>
              <option value="">全部產業</option>
              {industries.map((i) => (<option key={i} value={i}>{i}</option>))}
            </select>
          </div>
          <div className="filters">
            <select className="in" value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="">全部階段</option>
              {stages.map((s) => (<option key={s} value={s}>{STAGE_LABEL[s] || s}</option>))}
            </select>
            <select className="in" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">全部來源</option>
              {sources.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button className="selall" style={{ flex: 1, marginBottom: 0 }} onClick={toggleAll}>
              {allShown ? '取消全選' : `全選 ${recipients.length} 筆`}
            </button>
            <button className="addbtn" onClick={() => setManualOpen(!manualOpen)}>＋ 手動新增</button>
            <button className="addbtn hist" onClick={() => { setHistoryOpen(!historyOpen); if (!historyOpen) loadHistory(); }}>📋 發送紀錄</button>
          </div>
          {selected.size > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <span className="muted small" style={{ flex: 1 }}>已選 {selected.size} 位</span>
              <button className="rmsel" onClick={removeSelected} disabled={removing}>
                {removing ? '移除中…' : `🗑 移除選取（${selected.size}）`}
              </button>
            </div>
          )}
          {manualOpen && (
            <div className="manualadd">
              <input className="in" value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="名稱（選填）" style={{ flex: 1 }} />
              <input className="in" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="Email *" style={{ flex: 1.5 }}
                onKeyDown={(e) => { if (e.key === 'Enter') addManual(); }} />
              <button className="btn solid small" onClick={addManual} disabled={!manualEmail.trim()}>加入</button>
            </div>
          )}
          <div className="list">
            {loading ? (
              <div className="muted">載入中…</div>
            ) : recipients.length === 0 ? (
              <div className="empty">
                <div>目前篩選沒有可寄送的 Email 名單</div>
                <div className="hint">
                  {totalBrands > 0
                    ? `名單共 ${totalBrands} 筆，但符合此篩選的沒有 Email。可到「比對中心」用「管道補齊」採集 Email，或放寬上方篩選。`
                    : '尚無名單資料，請先到「名單總覽」或「採集任務」建立。'}
                </div>
              </div>
            ) : (
              recipients.map((r) => (
                <label key={r.id} className={`row ${selected.has(r.id) ? 'on' : ''}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <span className="rname">
                    {r.name}
                    {r.source && <span className={r.source === '手動' ? 'rsrc manual' : 'rsrc'}>{r.source}</span>}
                    {r.stage && <span className="rstage">{STAGE_LABEL[r.stage] || r.stage}</span>}
                  </span>
                  <span className="rmeta">{r.industry || '—'} · {r.email}
                    {r.id.startsWith('manual_') && (
                      <button className="rmbtn" onClick={(e) => { e.preventDefault(); removeManual(r.id); }}>✕</button>
                    )}
                  </span>
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

      {/* 發送紀錄 */}
      {historyOpen && (
        <div className="histpanel">
          <div className="phead">
            <strong>發送紀錄</strong>
            <span className="count">{history.length} 筆</span>
          </div>
          {history.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: 20 }}>尚無發送紀錄</div>
          ) : (
            <table className="histtable">
              <thead>
                <tr><th>收件人</th><th>主旨</th><th>狀態</th><th>開信</th><th>點擊</th><th>時間</th></tr>
              </thead>
              <tbody>
                {history.slice(0, 50).map((m) => {
                  const st = { sent: '已寄出', delivered: '已送達', read: '已開信', replied: '已回覆', failed: '失敗', bounced: '退信', queued: '排隊', draft: '草稿', sending: '寄送中' }[m.status] || m.status;
                  const stColor = ['failed', 'bounced'].includes(m.status) ? '#a4452f' : ['read', 'replied'].includes(m.status) ? '#2f7d6b' : '#4a6b3f';
                  return (
                    <tr key={m.id}>
                      <td>{m.brands?.name || m.to_email}</td>
                      <td className="subj">{m.subject || '—'}</td>
                      <td><span style={{ color: stColor, fontWeight: 600 }}>{st}</span></td>
                      <td>{m.open_count || 0}</td>
                      <td>{m.click_count || 0}</td>
                      <td className="muted">{m.sent_at ? m.sent_at.slice(5, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 寄送列 */}
      <div className="sendbar">
        <div className="summary">
          {sending && progress ? (
            <span>寄送中… <strong>{progress.done}/{progress.total}</strong>
              <span className="pbar"><span className="pbarfill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></span>
            </span>
          ) : canSend ? (
            <>準備寄送「<strong>{tpl?.name}</strong>」給 <strong>{selected.size}</strong> 位{selected.size > BATCH_SIZE && <span className="muted small">（自動分 {Math.ceil(selected.size / BATCH_SIZE)} 批）</span>}</>
          ) : (
            <span className="muted">請選擇至少一位名單與一個模板</span>
          )}
        </div>
        <label className="dupchk" title="若收件人先前已收過此模板，預設略過不重複寄送">
          <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
          略過已寄過此模板
        </label>
        <a className="autolink" href="/outreach/automation" title="排程清單、自動跟進、節流設定">⚙ 自動化</a>
        <button className="btn ghost" disabled={!canSend || sending} onClick={() => { setScheduleOpen(true); }}>
          🕒 排程
        </button>
        <button className="btn solid" disabled={!canSend || sending} onClick={() => setConfirm(true)}>
          {sending ? '寄送中…' : '寄送'}
        </button>
      </div>

      {/* 排程對話框 */}
      {scheduleOpen && (
        <div className="overlay" onClick={() => setScheduleOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>排程寄送</h3>
            <p>把「<strong>{tpl?.name}</strong>」排定在指定時間自動寄給 <strong>{selected.size}</strong> 位。</p>
            <input
              className="in"
              type="datetime-local"
              value={scheduleAt}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              onChange={(e) => setScheduleAt(e.target.value)}
              style={{ marginTop: 8 }}
            />
            <p className="muted small" style={{ marginTop: 8 }}>
              系統每 5 分鐘檢查一次，到時自動分批寄送並套用每日上限。{skipDup ? '已開啟略過重複。' : ''}
            </p>
            <div className="dbtns">
              <button className="btn ghost" onClick={() => setScheduleOpen(false)}>取消</button>
              <button className="btn solid" disabled={scheduling || !scheduleAt} onClick={doSchedule}>
                {scheduling ? '建立中…' : '確認排程'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 確認對話框 */}
      {confirm && (
        <div className="overlay" onClick={() => setConfirm(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>確認寄送</h3>
            <p>
              即將把「<strong>{tpl?.name}</strong>」寄給 <strong>{selected.size}</strong> 位收件人。
              此動作會實際寄出 email,無法收回。
            </p>
            <p className="muted small">
              系統會自動分批寄送（每批 {BATCH_SIZE} 封{selected.size > BATCH_SIZE ? `，共 ${Math.ceil(selected.size / BATCH_SIZE)} 批` : ''}）。
              {skipDup ? '已開啟略過重複：先前收過此模板者不會重寄。' : '已關閉略過重複：相同模板會再寄一次。'}
            </p>
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
              <div><b>{result.skipped}</b><span>略過重複</span></div>
            </div>
            {result.queued > 0 && <p className="muted small" style={{ textAlign: 'center' }}>另有 {result.queued} 封排隊中</p>}
            <div className="dbtns">
              <a className="btn ghost" href="/outreach/email-dashboard">看儀表板</a>
              <button className="btn solid" onClick={() => setResult(null)}>關閉</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; height: 100vh; overflow-y: auto; box-sizing: border-box; padding: 22px 22px 110px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 23px; margin: 0; }
        .phead .count { font-size: 11px; }
        .empty { color: #9a9384; text-align: center; padding: 20px 8px; font-size: 13px; }
        .empty .hint { font-size: 12px; margin-top: 8px; line-height: 1.6; color: #b0a892; }
        .rstage { font-size: 10px; color: #5b7c99; background: #e3ecf2; border-radius: 999px; padding: 1px 7px; margin-left: 5px; }
        .sendmode { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
        .sendmode.live { background: #e8f2e8; color: #3f6b3f; border: 1px solid #cdd6bf; }
        .sendmode.simulate { background: #faf3df; color: #8a6d1f; border: 1px solid #e8dcae; }
        .sendmode code { background: rgba(0,0,0,.06); padding: 1px 6px; border-radius: 5px; font-size: 12px; }
        .sendmode a { margin-left: auto; color: inherit; font-weight: 700; text-decoration: underline; white-space: nowrap; }
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
        .rmeta { font-size: 11px; color: #9a9384; grid-column: 2; display: flex; align-items: center; gap: 6px; }
        .rmbtn { border: none; background: none; color: #a4452f; cursor: pointer; font-size: 12px; padding: 0; }
        .addbtn { border: 1px dashed #b9b29e; background: transparent; color: #5a6b4f; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .addbtn.hist { border-style: solid; }
        .addbtn:hover { background: #eef0e6; }
        .manualadd { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; padding: 10px; background: #fcfbf5; border: 1px solid #e3ded3; border-radius: 10px; }
        .manualadd .in { min-width: 100px; }
        .btn.small { padding: 7px 14px; font-size: 12px; }
        .rsrc.manual { background: #faf3df; color: #8a6d1f; }
        .histpanel { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; margin-top: 16px; max-height: 400px; overflow-y: auto; }
        .histtable { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .histtable th { text-align: left; font-size: 11px; color: #8a8472; font-weight: 500; padding: 6px 6px; border-bottom: 1px solid #e3ded3; }
        .histtable td { font-size: 12px; padding: 8px 6px; border-bottom: 1px solid #f0ece1; }
        .histtable .subj { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .subj { font-size: 13px; margin: 10px 0 8px; color: #4a4a40; }
        .previewbox { border: 1px solid #e3ded3; border-radius: 10px; overflow: hidden; height: 420px; background: #f3f0e7; margin-top: 10px; }
        .frame { width: 100%; height: 100%; border: none; }
        .sendbar { position: fixed; left: 0; right: 0; bottom: 0; background: #fffdf8; border-top: 1px solid #e3ded3; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .summary { font-size: 14px; flex: 1; }
        .rmsel { border: 1px solid #d9b3a8; background: #fbeee9; color: #a4452f; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .rmsel:hover { background: #f6e2da; }
        .rmsel:disabled { opacity: 0.5; cursor: default; }
        .dupchk { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #5a6b4f; cursor: pointer; white-space: nowrap; user-select: none; }
        .dupchk input { width: 15px; height: 15px; accent-color: #4a6b3f; cursor: pointer; }
        .autolink { font-size: 13px; color: #4a6b3f; text-decoration: none; white-space: nowrap; padding: 8px 10px; border-radius: 8px; }
        .autolink:hover { background: #eef0e6; }
        .pbar { display: inline-block; width: 140px; height: 7px; background: #e6e2d6; border-radius: 999px; margin-left: 10px; vertical-align: middle; overflow: hidden; }
        .pbarfill { display: block; height: 100%; background: #4a6b3f; border-radius: 999px; transition: width 0.25s ease; }
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
        /* 手機：寄送列自動換行，狀態獨佔一行、按鈕平均撐開不溢出 */
        @media (max-width: 767px) {
          .sendbar { flex-wrap: wrap; padding: 10px 14px 14px; gap: 8px; }
          .sendbar .summary { width: 100%; font-size: 13px; }
          .sendbar .dupchk { font-size: 12px; }
          .sendbar .autolink { padding: 8px 8px; }
          .sendbar .btn { flex: 1; text-align: center; padding: 11px 10px; }
          .pbar { width: 90px; }
        }
      `}</style>
    </div>
  );
}
