'use client';

import { useEffect, useState } from 'react';

interface Template { id: string; name: string }
interface Schedule {
  id: string; templateName: string; subject: string | null; count: number;
  scheduledAt: string; status: string; result: { sent?: number; failed?: number; queued?: number } | null; note: string | null;
}
interface Rule {
  id: string; name: string; triggerTemplateId: string; followupTemplateId: string;
  triggerName: string; followupName: string; daysAfter: number; condition: string; active: boolean;
}

const COND_LABEL: Record<string, string> = { no_open: '未開信', no_reply: '未回覆', always: '一律寄送' };
const STATUS_LABEL: Record<string, string> = { pending: '待寄送', sending: '寄送中', done: '已完成', canceled: '已取消' };

export default function AutomationPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  // 新增規則表單
  const [rName, setRName] = useState('');
  const [rTrig, setRTrig] = useState('');
  const [rFu, setRFu] = useState('');
  const [rDays, setRDays] = useState(3);
  const [rCond, setRCond] = useState('no_open');
  const [saving, setSaving] = useState(false);

  const loadAll = () => {
    fetch('/api/outreach/templates?channel=EM').then((r) => r.json()).then((d) => setTemplates((d.templates || []).filter((t: any) => t.body_html)));
    fetch('/api/outreach/schedule').then((r) => r.json()).then((d) => setSchedules(d.data || []));
    fetch('/api/outreach/followup-rules').then((r) => r.json()).then((d) => setRules(d.data || []));
  };
  useEffect(loadAll, []);

  const cancelSchedule = async (id: string) => {
    if (!window.confirm('取消這筆排程？')) return;
    await fetch('/api/outreach/schedule', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    setSchedules((p) => p.map((s) => s.id === id ? { ...s, status: 'canceled' } : s));
  };

  const addRule = async () => {
    if (!rName.trim() || !rTrig || !rFu) { alert('請填寫規則名稱、觸發模板、跟進模板'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/outreach/followup-rules', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: rName.trim(), triggerTemplateId: rTrig, followupTemplateId: rFu, daysAfter: rDays, condition: rCond }),
      });
      const j = await res.json();
      if (j.success) { setRName(''); setRTrig(''); setRFu(''); setRDays(3); setRCond('no_open'); loadAll(); }
      else alert(j.error || '新增失敗');
    } finally { setSaving(false); }
  };

  const toggleRule = async (r: Rule) => {
    await fetch('/api/outreach/followup-rules', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: r.id, active: !r.active }) });
    setRules((p) => p.map((x) => x.id === r.id ? { ...x, active: !x.active } : x));
  };
  const deleteRule = async (id: string) => {
    if (!window.confirm('刪除這條跟進規則？')) return;
    await fetch('/api/outreach/followup-rules', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    setRules((p) => p.filter((x) => x.id !== id));
  };

  const upcoming = schedules.filter((s) => s.status === 'pending' || s.status === 'sending');
  const past = schedules.filter((s) => s.status === 'done' || s.status === 'canceled');

  return (
    <div className="wrap">
      <header>
        <h1>電子報自動化</h1>
        <p>排程寄送 · 自動跟進序列 · 寄送節流（節流與 LINE 通知請至「API 設定」）</p>
      </header>

      {/* 排程清單 */}
      <section className="panel">
        <div className="phead"><strong>🕒 排程寄送</strong><span className="count">待寄 {upcoming.length}</span></div>
        {upcoming.length === 0 ? (
          <div className="muted small">目前沒有待寄送的排程。可在「電子報發送」頁選好名單與模板後按「🕒 排程」。</div>
        ) : (
          <table className="t">
            <thead><tr><th>模板</th><th>收件數</th><th>排定時間</th><th>狀態</th><th></th></tr></thead>
            <tbody>
              {upcoming.map((s) => (
                <tr key={s.id}>
                  <td>{s.templateName}</td>
                  <td>{s.count}</td>
                  <td>{new Date(s.scheduledAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status] || s.status}</span></td>
                  <td>{s.status === 'pending' && <button className="link danger" onClick={() => cancelSchedule(s.id)}>取消</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {past.length > 0 && (
          <details className="pastdetails">
            <summary>已完成 / 已取消（{past.length}）</summary>
            <table className="t">
              <tbody>
                {past.slice(0, 30).map((s) => (
                  <tr key={s.id}>
                    <td>{s.templateName}</td>
                    <td className="muted">{new Date(s.scheduledAt).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                    <td><span className={`badge ${s.status}`}>{STATUS_LABEL[s.status] || s.status}</span></td>
                    <td className="muted">{s.result ? `成功 ${s.result.sent || 0}・失敗 ${s.result.failed || 0}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      {/* 自動跟進序列 */}
      <section className="panel">
        <div className="phead"><strong>🔁 自動跟進序列</strong><span className="count">{rules.length} 條規則</span></div>
        <p className="muted small">寄出觸發模板後，經過設定天數仍符合條件（未開信／未回覆）的收件人，系統會自動寄出跟進模板。每位只會跟進一次。</p>

        <div className="ruleform">
          <input className="in" placeholder="規則名稱，如：開發信3天跟進" value={rName} onChange={(e) => setRName(e.target.value)} />
          <div className="frow">
            <label>觸發模板
              <select className="in" value={rTrig} onChange={(e) => setRTrig(e.target.value)}>
                <option value="">選擇…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label>跟進模板
              <select className="in" value={rFu} onChange={(e) => setRFu(e.target.value)}>
                <option value="">選擇…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          </div>
          <div className="frow">
            <label>幾天後
              <input className="in" type="number" min={1} value={rDays} onChange={(e) => setRDays(parseInt(e.target.value) || 3)} />
            </label>
            <label>條件
              <select className="in" value={rCond} onChange={(e) => setRCond(e.target.value)}>
                <option value="no_open">未開信</option>
                <option value="no_reply">未回覆</option>
                <option value="always">一律寄送</option>
              </select>
            </label>
            <button className="btn solid" disabled={saving} onClick={addRule}>{saving ? '新增中…' : '＋ 新增規則'}</button>
          </div>
        </div>

        {rules.length > 0 && (
          <table className="t">
            <thead><tr><th>規則</th><th>觸發 → 跟進</th><th>天數</th><th>條件</th><th>啟用</th><th></th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="muted">{r.triggerName} → {r.followupName}</td>
                  <td>{r.daysAfter} 天</td>
                  <td>{COND_LABEL[r.condition] || r.condition}</td>
                  <td><button className={`toggle ${r.active ? 'on' : ''}`} onClick={() => toggleRule(r)}>{r.active ? '啟用中' : '已停用'}</button></td>
                  <td><button className="link danger" onClick={() => deleteRule(r.id)}>刪除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="foot">
        <a href="/outreach/newsletter">← 回電子報發送</a>
        <a href="/settings">節流與 LINE 通知設定 →</a>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; min-height: 100vh; padding: 22px 22px 60px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 23px; margin: 0; }
        header p { margin: 4px 0 16px; font-size: 12px; color: #8a8472; }
        .muted { color: #9a9384; }
        .small { font-size: 12px; line-height: 1.6; }
        .panel { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; margin-bottom: 16px; }
        .phead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .count { font-size: 12px; background: #eef0e6; color: #4a6b3f; padding: 3px 10px; border-radius: 999px; }
        .in { border: 1px solid #d9d3c4; border-radius: 8px; padding: 9px 11px; font-size: 14px; font-family: inherit; background: #fff; box-sizing: border-box; width: 100%; }
        .t { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .t th { text-align: left; font-size: 11px; color: #8a8472; font-weight: 500; padding: 6px; border-bottom: 1px solid #e3ded3; }
        .t td { font-size: 13px; padding: 8px 6px; border-bottom: 1px solid #f0ece1; }
        .badge { font-size: 11px; padding: 2px 8px; border-radius: 999px; }
        .badge.pending { background: #eef2f6; color: #4a6b8f; }
        .badge.sending { background: #fdf4e3; color: #8a6d1f; }
        .badge.done { background: #e8f2e8; color: #3f6b3f; }
        .badge.canceled { background: #f3eded; color: #9a8484; }
        .link { border: none; background: none; cursor: pointer; font-size: 12px; font-family: inherit; padding: 0; }
        .link.danger { color: #a4452f; }
        .pastdetails { margin-top: 12px; font-size: 12px; }
        .pastdetails summary { cursor: pointer; color: #8a8472; }
        .ruleform { background: #fcfbf5; border: 1px solid #e3ded3; border-radius: 10px; padding: 12px; margin: 10px 0; display: flex; flex-direction: column; gap: 10px; }
        .frow { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
        .frow label { font-size: 12px; color: #5a6b4f; display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 140px; }
        .btn { border: none; border-radius: 999px; padding: 9px 20px; font-size: 14px; cursor: pointer; font-family: inherit; }
        .btn.solid { background: #4a6b3f; color: #fff; }
        .btn.solid:disabled { opacity: .5; }
        .toggle { border: 1px solid #cdd6bf; background: #f3eded; color: #9a8484; border-radius: 999px; padding: 3px 12px; font-size: 12px; cursor: pointer; font-family: inherit; }
        .toggle.on { background: #e8f2e8; color: #3f6b3f; border-color: #cdd6bf; }
        .foot { display: flex; justify-content: space-between; font-size: 13px; }
        .foot a { color: #4a6b3f; text-decoration: none; }
      `}</style>
    </div>
  );
}
