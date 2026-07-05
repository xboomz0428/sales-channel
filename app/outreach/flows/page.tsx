'use client';

import { useEffect, useRef, useState } from 'react';

interface Step { subject: string; bodyHtml: string; daysAfter: number; condition: string }
interface Flow { id: string; name: string; active: boolean; steps: Step[] }

const COND_LABEL: Record<string, string> = { no_open: '前一封未開信', no_reply: '前一封未回覆', always: '一律接續寄' };
const uid = () => Math.random().toString(36).slice(2, 8);

// 內嵌富文字編輯器（contentEditable）：反白可套用格式；輸入即同步 HTML
function RichArea({ html, onChange, placeholder }: { html: string; onChange: (h: string) => void; placeholder: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(uid());
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) ref.current.innerHTML = html || '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idRef.current]);
  const exec = (cmd: string, val?: string) => { try { document.execCommand('styleWithCSS', false, 'true'); } catch {} document.execCommand(cmd, false, val); ref.current && onChange(ref.current.innerHTML); };
  return (
    <div className="rte-wrap">
      <div className="rte-tools">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}><b>B</b></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}><i>I</i></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}><u>U</u></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>•</button>
        {['#2f3d2f', '#4a6b3f', '#c0392b', '#b8860b', '#2b579a'].map((c) => (
          <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('foreColor', c)} className="sw" style={{ background: c }} />
        ))}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const u = prompt('連結網址', 'https://'); if (u) exec('createLink', u); }}>🔗</button>
      </div>
      <div ref={ref} className="rte" contentEditable suppressContentEditableWarning data-ph={placeholder}
        onInput={() => ref.current && onChange(ref.current.innerHTML)} />
    </div>
  );
}

export default function FlowsPage() {
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null); // null=未在編輯；''=新流程
  const [name, setName] = useState('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [cfg, setCfg] = useState<{ mode?: string } | null>(null);

  const load = () => { fetch('/api/outreach/flows').then((r) => r.json()).then((d) => { if (d.success) setFlows(d.data || []); }).finally(() => setLoading(false)); };
  useEffect(load, []);
  useEffect(() => { fetch('/api/outreach/email-config').then((r) => r.json()).then(setCfg).catch(() => {}); }, []);

  const newFlow = () => { setEditingId(''); setName(''); setSteps([{ subject: '', bodyHtml: '', daysAfter: 0, condition: 'always' }]); setMsg(null); };
  const editFlow = (f: Flow) => { setEditingId(f.id); setName(f.name); setSteps(f.steps.length ? f.steps : [{ subject: '', bodyHtml: '', daysAfter: 0, condition: 'always' }]); setMsg(null); };
  const closeEditor = () => { setEditingId(null); setSteps([]); setName(''); };

  const addStep = () => setSteps((s) => [...s, { subject: '', bodyHtml: '', daysAfter: 3, condition: 'no_open' }]);
  const updateStep = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const removeStep = (i: number) => setSteps((s) => s.filter((_, j) => j !== i));

  const save = async () => {
    if (!name.trim()) { setMsg({ ok: false, text: '請輸入流程名稱' }); return; }
    if (steps.some((s) => !s.subject.trim())) { setMsg({ ok: false, text: '每一封都要有主旨' }); return; }
    setSaving(true); setMsg(null);
    try {
      const res = await fetch('/api/outreach/flows', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: editingId || undefined, name: name.trim(), steps }),
      });
      const d = await res.json();
      if (d.success) { setMsg({ ok: true, text: `已儲存流程（${d.steps} 封）` }); await load(); setEditingId(d.id); }
      else setMsg({ ok: false, text: d.error || '儲存失敗' });
    } catch { setMsg({ ok: false, text: '連線失敗' }); }
    finally { setSaving(false); }
  };

  const toggleActive = async (f: Flow) => {
    await fetch('/api/outreach/flows', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: f.id, active: !f.active }) });
    load();
  };
  const del = async (f: Flow) => {
    if (!window.confirm(`刪除流程「${f.name}」？其自動跟進規則會一併移除。`)) return;
    await fetch('/api/outreach/flows', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: f.id }) });
    if (editingId === f.id) closeEditor();
    load();
  };

  return (
    <div className="wrap">
      <header>
        <h1>自訂自動化流程</h1>
        <p>設計你自己的多封 email 序列，每一封直接在下方編輯內容。第一封寄出後，系統每天早上 8 點依條件自動接續寄下一封。</p>
      </header>

      {cfg?.mode === 'simulate' && (
        <div className="note">⚠️ 目前是「模擬寄出」模式，不會真的寄信。到「設定」填 Gmail SMTP / Resend / SendGrid 任一即可真實寄出。</div>
      )}

      <div className="grid">
        {/* 流程清單 */}
        <aside className="side">
          <button className="btn solid w" onClick={newFlow}>＋ 新增流程</button>
          <div className="flist">
            {loading ? <div className="muted small">載入中…</div>
              : flows.length === 0 ? <div className="muted small" style={{ padding: '10px 2px' }}>還沒有流程，點上方「新增流程」開始。</div>
              : flows.map((f) => (
                <div key={f.id} className={`fitem ${editingId === f.id ? 'on' : ''}`} onClick={() => editFlow(f)}>
                  <div className="fname">{f.name}</div>
                  <div className="fmeta">
                    <span>{f.steps.length} 封</span>
                    <span className={`dot ${f.active ? 'a' : ''}`} onClick={(e) => { e.stopPropagation(); toggleActive(f); }} title={f.active ? '啟用中（點擊停用）' : '已停用（點擊啟用）'}>{f.active ? '啟用中' : '已停用'}</span>
                    <button className="del" onClick={(e) => { e.stopPropagation(); del(f); }}>刪</button>
                  </div>
                </div>
              ))}
          </div>
        </aside>

        {/* 編輯區 */}
        <section className="editor">
          {editingId === null ? (
            <div className="empty">
              <div style={{ fontSize: 40 }}>✉️</div>
              <div>左側「新增流程」開始，或點一個流程來編輯。</div>
              <div className="muted small" style={{ marginTop: 6 }}>每個流程是一串會自動接續寄出的 email。</div>
            </div>
          ) : (
            <>
              <input className="in name" value={name} onChange={(e) => setName(e.target.value)} placeholder="流程名稱，例如：新客 3 封開發序列" />

              <div className="steps">
                {steps.map((s, i) => (
                  <div key={`${editingId}-${i}`} className="step">
                    <div className="shead">
                      <span className="sno">第 {i + 1} 封</span>
                      {i === 0 ? (
                        <span className="stime">立即寄出（把這封寄給名單即啟動流程）</span>
                      ) : (
                        <span className="stime">
                          前一封後
                          <input className="in tiny" type="number" min={1} value={s.daysAfter} onChange={(e) => updateStep(i, { daysAfter: parseInt(e.target.value) || 1 })} />
                          天，
                          <select className="in sel" value={s.condition} onChange={(e) => updateStep(i, { condition: e.target.value })}>
                            <option value="no_open">未開信才寄</option>
                            <option value="no_reply">未回覆才寄</option>
                            <option value="always">一律接續寄</option>
                          </select>
                        </span>
                      )}
                      {steps.length > 1 && <button className="rm" onClick={() => removeStep(i)}>✕ 移除</button>}
                    </div>
                    <input className="in subj" value={s.subject} onChange={(e) => updateStep(i, { subject: e.target.value })} placeholder="主旨（可用 {{品牌名}} 變數）" />
                    <RichArea html={s.bodyHtml} onChange={(h) => updateStep(i, { bodyHtml: h })} placeholder="在這裡直接寫這封信的內容，反白文字可套用格式…" />
                  </div>
                ))}
                <button className="addstep" onClick={addStep}>＋ 新增一封（自動出現編輯器）</button>
              </div>

              {msg && <div className={`msg ${msg.ok ? 'ok' : 'bad'}`}>{msg.ok ? '✓' : '✕'} {msg.text}</div>}

              <div className="savebar">
                <span className="muted small">共 {steps.length} 封 · 存檔後可到「電子報發送」選第 1 封寄給名單來啟動</span>
                <button className="btn ghost" onClick={closeEditor}>關閉</button>
                <button className="btn solid" onClick={save} disabled={saving}>{saving ? '儲存中…' : editingId ? '更新流程' : '建立流程'}</button>
              </div>
            </>
          )}
        </section>
      </div>

      <div className="foot"><a href="/outreach/automation">← 自動化總覽（排程/跟進/節流）</a><a href="/outreach/newsletter">電子報發送 →</a></div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; min-height: 100vh; padding: 22px 22px 60px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 23px; margin: 0; }
        header p { margin: 4px 0 14px; font-size: 12.5px; color: #8a8472; line-height: 1.6; max-width: 720px; }
        .muted { color: #9a9384; } .small { font-size: 12px; }
        .note { background: #faf3df; border: 1px solid #e8dcae; color: #8a6d1f; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; margin-bottom: 14px; }
        .grid { display: grid; grid-template-columns: 240px 1fr; gap: 16px; }
        @media (max-width: 820px) { .grid { grid-template-columns: 1fr; } }
        .side { display: flex; flex-direction: column; gap: 10px; }
        .btn { border: none; border-radius: 999px; padding: 9px 18px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn.solid { background: #4a6b3f; color: #fff; } .btn.solid:disabled { opacity: .5; }
        .btn.ghost { background: #fffdf8; border: 1px solid #d9d3c4; color: #4a6b3f; }
        .btn.w { width: 100%; }
        .flist { display: flex; flex-direction: column; gap: 6px; }
        .fitem { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 12px; padding: 11px 13px; cursor: pointer; }
        .fitem.on { border-color: #4a6b3f; background: #eef0e6; }
        .fname { font-size: 13.5px; font-weight: 700; }
        .fmeta { display: flex; align-items: center; gap: 8px; font-size: 11px; color: #9a9384; margin-top: 5px; }
        .dot { border-radius: 999px; padding: 1px 8px; background: #f0ece1; cursor: pointer; }
        .dot.a { background: #e8f2e8; color: #3f6b3f; }
        .del { margin-left: auto; border: none; background: none; color: #a4452f; cursor: pointer; font-size: 11px; }
        .editor { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; min-height: 300px; }
        .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 60px 20px; color: #9a9384; text-align: center; }
        .in { border: 1px solid #d9d3c4; border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; box-sizing: border-box; }
        .in.name { width: 100%; font-size: 15px; font-weight: 700; margin-bottom: 14px; }
        .in.subj { width: 100%; margin: 8px 0; }
        .in.tiny { width: 52px; padding: 4px 6px; margin: 0 5px; text-align: center; }
        .in.sel { padding: 4px 8px; font-size: 12.5px; margin-left: 4px; }
        .steps { display: flex; flex-direction: column; gap: 12px; }
        .step { border: 1px solid #e3ded3; border-left: 4px solid #4a6b3f; border-radius: 10px; padding: 12px; background: #fcfbf5; }
        .shead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .sno { font-size: 13px; font-weight: 700; background: #4a6b3f; color: #fff; border-radius: 999px; padding: 2px 11px; }
        .stime { font-size: 12px; color: #6e7a6d; display: flex; align-items: center; flex-wrap: wrap; }
        .rm { margin-left: auto; border: none; background: none; color: #a4452f; cursor: pointer; font-size: 12px; }
        .addstep { border: 1px dashed #b9b29e; background: transparent; color: #4a6b3f; border-radius: 10px; padding: 11px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .addstep:hover { background: #eef0e6; }
        .rte-wrap { border: 1px solid #d9d3c4; border-radius: 8px; overflow: hidden; background: #fff; }
        .rte-tools { display: flex; gap: 4px; align-items: center; padding: 6px 8px; border-bottom: 1px solid #eee4d5; background: #fcfbf5; flex-wrap: wrap; }
        .rte-tools button { border: 1px solid #d9d3c4; background: #fff; border-radius: 6px; min-width: 26px; height: 26px; font-size: 12px; cursor: pointer; color: #5a6b4f; }
        .rte-tools .sw { min-width: 20px; width: 20px; height: 20px; border-radius: 5px; border: 1px solid rgba(0,0,0,.15); }
        .rte { min-height: 110px; padding: 10px 12px; font-size: 14px; line-height: 1.7; outline: none; white-space: pre-wrap; word-break: break-word; }
        .rte:empty:before { content: attr(data-ph); color: #b1ab98; }
        .msg { padding: 8px 12px; border-radius: 9px; font-size: 13px; margin: 12px 0 0; }
        .msg.ok { background: #e8f2e8; color: #3f6b3f; } .msg.bad { background: #f6e2da; color: #a4452f; }
        .savebar { display: flex; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
        .savebar .muted { flex: 1; min-width: 180px; }
        .foot { display: flex; justify-content: space-between; font-size: 13px; margin-top: 16px; }
        .foot a { color: #4a6b3f; text-decoration: none; }
      `}</style>
    </div>
  );
}
