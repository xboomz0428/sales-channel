'use client';

import { useEffect, useState } from 'react';

interface Msg {
  id: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  body_html: string | null;
  status: string;
  open_count: number;
  click_count: number;
  sent_at: string | null;
  error_detail: string | null;
  brands?: { name?: string } | null;
}
interface Daily {
  day: string;
  sent: number;
  failed: number;
  bounced: number;
  opened: number;
  clicked: number;
}
interface SegStat {
  industry?: string;
  template?: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  failed: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
}
interface Data {
  totals: Record<string, number>;
  daily: Daily[];
  messages: Msg[];
  byIndustry?: SegStat[];
  byTemplate?: SegStat[];
  funnel?: { sent: number; opened: number; clicked: number; replied: number };
}

const STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: '草稿', color: '#9a9384' },
  queued: { label: '排隊', color: '#b08d3f' },
  sending: { label: '寄送中', color: '#b08d3f' },
  sent: { label: '已寄出', color: '#4a6b3f' },
  delivered: { label: '已送達', color: '#4a6b3f' },
  read: { label: '已開信', color: '#2f7d6b' },
  replied: { label: '已回覆', color: '#2f6bb0' },
  failed: { label: '失敗', color: '#a4452f' },
  bounced: { label: '退信', color: '#a4452f' },
};

export default function EmailDashboardPage() {
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState<Msg | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/outreach/email-dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const t = data?.totals || {};
  const maxSent = Math.max(1, ...(data?.daily || []).map((d) => d.sent));

  const cards = [
    { k: '寄送', v: t.sent || 0, sub: `失敗 ${t.failed || 0}` },
    { k: '開信率', v: `${t.openRate || 0}%`, sub: `${t.opened || 0} 封` },
    { k: '點擊率', v: `${t.clickRate || 0}%`, sub: `${t.clicked || 0} 封` },
    { k: '退信', v: t.bounced || 0, sub: '需清名單' },
    { k: '回覆', v: t.replied || 0, sub: '熱名單' },
  ];

  return (
    <div className="wrap">
      <header>
        <h1>Email 儀表板</h1>
        <p>近 14 日寄送成效 · 開信與點擊追蹤</p>
      </header>

      {loading ? (
        <div className="muted">載入中…</div>
      ) : (
        <>
          <div className="cards">
            {cards.map((c) => (
              <div key={c.k} className="card">
                <div className="ck">{c.k}</div>
                <div className="cv">{c.v}</div>
                <div className="cs">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="chart card">
            <div className="ck">每日寄送量</div>
            <div className="hbars">
              {(data?.daily || []).slice().reverse().map((d) => (
                <div key={d.day} className="hbarrow" title={`${d.day.slice(5, 10)} 寄${d.sent} 開${d.opened} 點${d.clicked}`}>
                  <span className="hbarlabel">{parseInt(d.day.slice(5, 7))}/{parseInt(d.day.slice(8, 10))}</span>
                  <div className="hbartrack">
                    <div className="hbarfill" style={{ width: `${(d.sent / maxSent) * 100}%` }} />
                  </div>
                  <span className="hbarval">{d.sent}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 轉換漏斗 */}
          {data?.funnel && data.funnel.sent > 0 && (
            <div className="card">
              <div className="ck">轉換漏斗</div>
              <div className="funnel">
                {([['寄送', data.funnel.sent, '#6f8c5f'], ['開信', data.funnel.opened, '#2f7d6b'], ['點擊', data.funnel.clicked, '#b08d3f'], ['回覆', data.funnel.replied, '#2f6bb0']] as const).map(([label, n, color]) => {
                  const pct = data.funnel!.sent ? Math.round((n / data.funnel!.sent) * 100) : 0;
                  return (
                    <div key={label} className="fstep">
                      <div className="flabel">{label}<b>{n}</b></div>
                      <div className="ftrack"><div className="ffill" style={{ width: `${pct}%`, background: color }} /></div>
                      <div className="fpct">{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 依產業分析 */}
          {(data?.byIndustry?.length || 0) > 0 && (
            <div className="card">
              <div className="ck">依產業成效</div>
              <table>
                <thead><tr><th>產業</th><th>寄送</th><th>開信率</th><th>點擊率</th><th>回覆率</th></tr></thead>
                <tbody>
                  {data!.byIndustry!.map((r) => (
                    <tr key={r.industry}>
                      <td>{r.industry}</td><td>{r.sent}</td><td>{r.openRate}%</td><td>{r.clickRate}%</td><td>{r.replyRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 依模板分析 */}
          {(data?.byTemplate?.length || 0) > 0 && (
            <div className="card">
              <div className="ck">依模板成效</div>
              <table>
                <thead><tr><th>模板</th><th>寄送</th><th>開信率</th><th>點擊率</th><th>回覆率</th></tr></thead>
                <tbody>
                  {data!.byTemplate!.map((r, i) => (
                    <tr key={i}>
                      <td className="subj">{r.template}</td><td>{r.sent}</td><td>{r.openRate}%</td><td>{r.clickRate}%</td><td>{r.replyRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <div className="ck">最近寄送</div>
            <table>
              <thead>
                <tr>
                  <th>名單</th><th>主旨</th><th>狀態</th><th>開信</th><th>點擊</th><th>時間</th>
                </tr>
              </thead>
              <tbody>
                {(data?.messages || []).map((m) => {
                  const s = STATUS[m.status] || STATUS.draft;
                  return (
                    <tr key={m.id} onClick={() => setOpen(m)}>
                      <td>{m.brands?.name || '—'}</td>
                      <td className="subj">{m.subject || '(無主旨)'}</td>
                      <td><span className="badge" style={{ background: s.color }}>{s.label}</span></td>
                      <td>{m.open_count || 0}</td>
                      <td>{m.click_count || 0}</td>
                      <td className="muted">{m.sent_at ? m.sent_at.slice(5, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="dhead">
              <div>
                <div className="ck">{open.brands?.name || '—'} · {open.to_email}</div>
                <strong>{open.subject || '(無主旨)'}</strong>
              </div>
              <button onClick={() => setOpen(null)}>✕</button>
            </div>
            <div className="dmeta">
              開信 {open.open_count || 0} · 點擊 {open.click_count || 0}
              {open.error_detail ? ` · 錯誤:${open.error_detail}` : ''}
            </div>
            {open.body_html ? (
              <iframe title="content" srcDoc={open.body_html} className="cframe" />
            ) : (
              <pre className="ctext">{open.body || '(無內容)'}</pre>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@700&display=swap');
        .wrap { font-family: 'Noto Sans TC', sans-serif; background: #f3f0e7; height: 100vh; overflow-y: auto; box-sizing: border-box; padding: 22px; color: #2f3d2f; }
        .funnel { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
        .fstep { display: flex; align-items: center; gap: 12px; }
        .flabel { width: 80px; font-size: 15px; color: #6e7a6d; display: flex; justify-content: space-between; }
        .flabel b { color: #2f3d2f; font-size: 16px; }
        .ftrack { flex: 1; height: 20px; background: #f0ece1; border-radius: 999px; overflow: hidden; }
        .ffill { height: 100%; border-radius: 999px; transition: width 400ms; }
        .fpct { width: 48px; text-align: right; font-size: 15px; font-weight: 600; color: #6e7a6d; }
        h1 { font-family: 'Noto Serif TC', serif; font-size: 24px; margin: 0; }
        header p { margin: 4px 0 18px; font-size: 14px; color: #8a8472; }
        .muted { color: #9a9384; }
        .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 18px; }
        @media (max-width: 760px) { .cards { grid-template-columns: repeat(2, 1fr); } }
        .card { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 18px; }
        .ck { font-size: 14px; color: #8a8472; font-weight: 500; }
        .cv { font-family: 'Noto Serif TC', serif; font-size: 32px; font-weight: 700; margin: 6px 0; }
        .cs { font-size: 13px; color: #a59f8e; }
        .chart { margin-bottom: 18px; }
        .hbars { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
        .hbarrow { display: flex; align-items: center; gap: 12px; }
        .hbarlabel { font-size: 36px; font-weight: 700; color: #c0392b; font-family: 'Noto Serif TC', serif; min-width: 56px; text-align: right; flex-shrink: 0; }
        .hbartrack { flex: 1; height: 28px; background: #f0ece1; border-radius: 999px; overflow: hidden; }
        .hbarfill { height: 100%; background: linear-gradient(90deg, #6f8c5f, #4a6b3f); border-radius: 999px; min-width: 4px; transition: width 400ms; }
        .hbarval { font-size: 16px; font-weight: 700; color: #2f3d2f; min-width: 30px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; font-size: 13px; color: #8a8472; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #e3ded3; }
        td { font-size: 15px; padding: 11px 10px; border-bottom: 1px solid #f0ece1; }
        tbody tr { cursor: pointer; }
        tbody tr:hover { background: #f8f6ee; }
        .subj { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .badge { color: #fff; font-size: 13px; padding: 3px 11px; border-radius: 999px; font-weight: 600; }
        .overlay { position: fixed; inset: 0; background: rgba(40, 44, 36, 0.4); display: flex; justify-content: flex-end; }
        .drawer { width: min(560px, 94vw); background: #fffdf8; height: 100%; padding: 22px; overflow: auto; display: flex; flex-direction: column; }
        .dhead { display: flex; justify-content: space-between; gap: 12px; }
        .dhead button { border: none; background: #eee9dc; border-radius: 8px; width: 34px; height: 34px; cursor: pointer; font-size: 16px; }
        .dmeta { font-size: 14px; color: #8a8472; margin: 10px 0 14px; }
        .cframe { flex: 1; min-height: 460px; border: 1px solid #e3ded3; border-radius: 10px; background: #f3f0e7; }
        .ctext { white-space: pre-wrap; font-size: 15px; line-height: 1.7; background: #fcfbf5; border: 1px solid #e3ded3; border-radius: 10px; padding: 16px; }
      `}</style>
    </div>
  );
}
