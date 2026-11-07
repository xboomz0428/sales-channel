'use client';

import { useEffect, useMemo, useState } from 'react';

interface Row {
  id: string;
  email: string;
  reason: string | null;
  fail_count: number | null;
  soft_count: number | null;
  blocked: boolean;
  bounce_type: string | null;
  last_fail: string | null;
  created_at: string | null;
}

const KIND_LABEL: Record<string, string> = {
  hard: '硬退信',
  soft: '軟退信',
  failed: '寄送失敗',
  manual: '手動加入',
};
const KIND_COLOR: Record<string, string> = {
  hard: '#a4452f',
  soft: '#b08d3f',
  failed: '#8a6d1f',
  manual: '#4a6b3f',
};

const PAGE_SIZE = 50;

function fmt(ts: string | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function BlacklistPage() {
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [qApplied, setQApplied] = useState('');
  const [blocked, setBlocked] = useState<'' | 'true' | 'false'>('');
  const [kind, setKind] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newReason, setNewReason] = useState('');
  const [adding, setAdding] = useState(false);
  // 每次操作後 +1 觸發重新讀取
  const [nonce, setNonce] = useState(0);
  // 目前查詢條件；result.key 與之不同即代表載入中（切換條件時取消前一次請求，不讓舊結果蓋回畫面）
  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (qApplied) p.set('q', qApplied);
    if (blocked) p.set('blocked', blocked);
    if (kind) p.set('kind', kind);
    return p.toString();
  }, [page, qApplied, blocked, kind]);
  const reqKey = `${qs}#${nonce}`;
  const [result, setResult] = useState<{ key: string; items: Row[]; total: number }>({ key: '', items: [], total: 0 });
  const { items, total } = result;
  const loading = result.key !== reqKey;

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/outreach/blacklist?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || '讀取失敗');
        setResult({ key: reqKey, items: j.items || [], total: j.total || 0 });
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError') return;
        setResult((r) => ({ ...r, key: reqKey }));
        setMsg(`✕ ${e.message || '連線失敗'}`);
      });
    return () => ctrl.abort();
  }, [qs, reqKey]);

  const reload = () => setNonce((n) => n + 1);

  // 搜尋框輸入停 300ms 才查詢，並回到第 1 頁
  useEffect(() => {
    const t = setTimeout(() => { setQApplied(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const call = async (method: string, url: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || '操作失敗');
    return j;
  };

  const toggle = async (r: Row) => {
    if (busy) return;
    setBusy(r.id);
    setMsg(null);
    try {
      await call('PATCH', '/api/outreach/blacklist', { id: r.id, blocked: !r.blocked });
      setMsg(r.blocked ? `✓ 已解除封鎖 ${r.email}（累計次數歸零，之後會恢復寄送）` : `✓ 已重新封鎖 ${r.email}`);
      reload();
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const remove = async (r: Row) => {
    if (busy) return;
    if (!window.confirm(`確定要從黑名單刪除 ${r.email}？\n刪除後此信箱會恢復寄送，累計紀錄也會一併清除。`)) return;
    setBusy(r.id);
    setMsg(null);
    try {
      await call('DELETE', `/api/outreach/blacklist?id=${encodeURIComponent(r.id)}`);
      setMsg(`✓ 已刪除 ${r.email}`);
      reload();
    } catch (e) {
      setMsg(`✕ ${(e as Error).message}`);
    }
    setBusy(null);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);
    setMsg(null);
    try {
      const j = await call('POST', '/api/outreach/blacklist', { email, reason: newReason.trim() || undefined });
      setMsg(j.created ? `✓ 已加入黑名單：${email}` : `✓ ${email} 原本就在名單中，已改為手動封鎖`);
      setNewEmail('');
      setNewReason('');
      reload();
    } catch (err) {
      setMsg(`✕ ${(err as Error).message}`);
    }
    setAdding(false);
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="wrap">
      <header>
        <h1>退信黑名單</h1>
        <p>已封鎖的信箱，寄送與收件人名單會自動排除 · 軟退信累計 3 次才封鎖，未達門檻顯示為「觀察中」</p>
      </header>

      <form className="card addform" onSubmit={add}>
        <div className="ck">手動加入排除名單</div>
        <div className="addrow">
          <input type="email" required placeholder="name@example.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <input type="text" placeholder="原因（選填，例如：對方要求不要再寄）" value={newReason} onChange={(e) => setNewReason(e.target.value)} maxLength={300} />
          <button type="submit" className="btn" disabled={adding || !newEmail.trim()}>{adding ? '加入中…' : '＋ 加入並封鎖'}</button>
        </div>
      </form>

      {msg && <div className={`scanmsg ${msg.startsWith('✓') ? 'ok' : 'err'}`}>{msg}</div>}

      <div className="card">
        <div className="toolbar">
          <input className="search" type="search" placeholder="搜尋 Email…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={blocked} onChange={(e) => { setBlocked(e.target.value as '' | 'true' | 'false'); setPage(1); }}>
            <option value="">全部狀態</option>
            <option value="true">已封鎖</option>
            <option value="false">觀察中</option>
          </select>
          <select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
            <option value="">全部類型</option>
            <option value="hard">硬退信</option>
            <option value="soft">軟退信</option>
            <option value="failed">寄送失敗</option>
            <option value="manual">手動加入</option>
          </select>
          <span className="total">共 <b>{total}</b> 筆</span>
        </div>

        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Email</th><th>類型</th><th>累計次數</th><th>狀態</th><th>最後原因</th><th>更新時間</th><th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={7} className="muted">載入中…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={7} className="muted">沒有符合條件的信箱</td></tr>
              ) : items.map((r) => {
                const k = r.bounce_type || '';
                const count = k === 'soft' ? (r.soft_count || 0) : (r.fail_count || 0) + (r.soft_count || 0);
                return (
                  <tr key={r.id} className={loading ? 'dim' : undefined}>
                    <td className="email">{r.email}</td>
                    <td><span className="badge" style={{ background: KIND_COLOR[k] || '#8a8472' }}>{KIND_LABEL[k] || k || '—'}</span></td>
                    <td title={`軟退信 ${r.soft_count || 0} 次／硬退信或寄送失敗 ${r.fail_count || 0} 次`}>{count}</td>
                    <td>{r.blocked ? <span className="st on">已封鎖</span> : <span className="st watch">觀察中</span>}</td>
                    <td className="reason" title={r.reason || ''}>{r.reason || '—'}</td>
                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmt(r.last_fail || r.created_at)}</td>
                    <td className="ops">
                      <button className="mini" disabled={busy === r.id} onClick={() => toggle(r)}>{r.blocked ? '解除封鎖' : '重新封鎖'}</button>
                      <button className="mini danger" disabled={busy === r.id} onClick={() => remove(r)}>刪除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button className="mini" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ 上一頁</button>
          <span className="muted">第 {page} / {pages} 頁</span>
          <button className="mini" disabled={page >= pages || loading} onClick={() => setPage((p) => Math.min(pages, p + 1))}>下一頁 ›</button>
        </div>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; height: 100vh; overflow-y: auto; box-sizing: border-box; padding: 22px; color: #2f3d2f; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 24px; margin: 0; }
        header p { margin: 4px 0 18px; font-size: 14px; color: #8a8472; }
        .muted { color: #9a9384; }
        .card { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
        .ck { font-size: 14px; color: #8a8472; font-weight: 500; margin-bottom: 10px; }
        .addrow, .toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        input, select { font-family: inherit; font-size: 14px; border: 1px solid #ddd6c6; border-radius: 10px; padding: 8px 12px; background: #fff; color: #2f3d2f; }
        .addrow input[type='email'] { flex: 1 1 220px; }
        .addrow input[type='text'] { flex: 2 1 260px; }
        .search { flex: 1 1 220px; }
        .total { margin-left: auto; font-size: 14px; color: #8a8472; }
        .total b { color: #2f3d2f; font-family: 'Noto Serif TC', serif; font-size: 18px; }
        .btn { border: 1px solid #cdd6bf; background: #eef0e6; color: #4a6b3f; border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .btn:hover { background: #e3ecdf; }
        .btn:disabled { opacity: 0.55; cursor: default; }
        .mini { border: 1px solid #ddd6c6; background: #fff; color: #4a6b3f; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .mini:hover { background: #f4f1e7; }
        .mini:disabled { opacity: 0.5; cursor: default; }
        .mini.danger { color: #a4452f; border-color: #e2c4ba; }
        .scanmsg { margin: 0 0 16px; padding: 9px 13px; border-radius: 10px; font-size: 13px; }
        .scanmsg.ok { background: #e8f2e8; color: #3f6b3f; border: 1px solid #cdd6bf; }
        .scanmsg.err { background: #fbeee9; color: #a4452f; border: 1px solid #e2c4ba; }
        .tablewrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; font-size: 13px; color: #8a8472; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #e3ded3; white-space: nowrap; }
        td { font-size: 14px; padding: 10px; border-bottom: 1px solid #f0ece1; vertical-align: middle; }
        tbody tr:hover { background: #f8f6ee; }
        tr.dim { opacity: 0.55; }
        .email { font-weight: 600; word-break: break-all; }
        .reason { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #6b6b60; }
        .badge { display: inline-block; color: #fff; font-size: 12px; font-weight: 600; border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
        .st { font-size: 12px; font-weight: 700; border-radius: 999px; padding: 3px 10px; white-space: nowrap; }
        .st.on { background: #fbeee9; color: #a4452f; }
        .st.watch { background: #fbf7e8; color: #8a6d1f; }
        .ops { text-align: right; white-space: nowrap; }
        .ops .mini + .mini { margin-left: 6px; }
        .pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 14px; font-size: 13px; }
        @media (max-width: 767px) {
          .wrap { padding: 16px; }
          th { font-size: 12px; padding: 7px; }
          td { font-size: 13px; padding: 8px 7px; }
          .reason { max-width: 140px; }
          .total { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}
