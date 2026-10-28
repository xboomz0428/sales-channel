'use client';

import { Fragment, useEffect, useState } from 'react';

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

// 群發活動（/api/outreach/campaigns：每次群發一筆，統計即時彙整）
interface CampaignRow {
  id: string; name: string; template_name: string | null; created_at: string; status: string | null;
  requested: number; skipped: number; cleaned: number; total: number;
  sent: number; failed: number; queued: number; sending: number; opened: number; clicked: number; replied: number;
}
interface CampaignDetail {
  campaign: CampaignRow;
  messages: Msg[];
  skipped: { id: string; name: string; industry?: string | null; email?: string | null }[];
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
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null); // 展開中的日期
  const [dayMsgs, setDayMsgs] = useState<Msg[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  // 群發活動清單 + 展開明細
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [campOpen, setCampOpen] = useState<string | null>(null);
  const [campDetail, setCampDetail] = useState<CampaignDetail | null>(null);
  const [campLoading, setCampLoading] = useState(false);
  const loadCampaigns = () => {
    fetch('/api/outreach/campaigns?limit=30').then((r) => r.json()).then((d) => setCampaigns(d.campaigns || [])).catch(() => {});
  };
  useEffect(() => { loadCampaigns(); }, []);
  // 有活動在背景寄送時，每 8 秒刷新清單（與展開中的明細）
  const runningCount = campaigns.filter((c) => c.queued + c.sending > 0).length;
  useEffect(() => {
    if (runningCount === 0) return;
    const t = setInterval(() => {
      loadCampaigns();
      if (campOpen) fetch(`/api/outreach/campaigns/${campOpen}`).then((r) => r.json()).then((d) => { if (d.campaign) setCampDetail(d); }).catch(() => {});
    }, 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runningCount, campOpen]);
  const toggleCampaign = async (id: string) => {
    if (campOpen === id) { setCampOpen(null); return; }
    setCampOpen(id);
    setCampLoading(true);
    setCampDetail(null);
    try {
      const d = await fetch(`/api/outreach/campaigns/${id}`).then((r) => r.json());
      if (d.campaign) setCampDetail(d);
    } catch { /* ignore */ }
    setCampLoading(false);
  };

  // 點擊每日長條 → 展開/收合當天寄送明細（當天完整名單，含內容）
  const toggleDay = async (day: string) => {
    if (dayOpen === day) { setDayOpen(null); return; }
    setDayOpen(day);
    setDayLoading(true);
    setDayMsgs([]);
    try {
      const d = await fetch(`/api/outreach/email-dashboard?day=${day.slice(0, 10)}`).then((r) => r.json());
      setDayMsgs(d.messages || []);
    } catch { setDayMsgs([]); }
    setDayLoading(false);
  };

  const loadData = () => {
    fetch('/api/outreach/email-dashboard')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };
  useEffect(() => { loadData(); }, []);

  const scanBounces = async () => {
    if (scanning) return;
    setScanning(true);
    setScanMsg(null);
    try {
      const res = await fetch('/api/outreach/scan-bounces', { method: 'POST' });
      const j = await res.json();
      if (j.success) {
        setScanMsg(`✓ 掃描完成：硬退信 ${j.hard} 封（已永久排除）、軟退信 ${j.soft} 封、掃描 ${j.scanned} 封退信通知`);
        loadData();
      } else {
        setScanMsg(`✕ ${j.error || '掃描失敗'}`);
      }
    } catch {
      setScanMsg('✕ 連線失敗');
    } finally {
      setScanning(false);
    }
  };

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
        <div className="hrow">
          <div>
            <h1>Email 儀表板</h1>
            <p>近 14 日寄送成效 · 開信與點擊追蹤</p>
          </div>
          <button className="scanbtn" onClick={scanBounces} disabled={scanning} title="讀取信箱裡的退信通知，把無效信箱加入黑名單，下次寄送自動排除">
            {scanning ? '掃描中…' : '🧹 立即掃描退信'}
          </button>
        </div>
        {scanMsg && <div className={`scanmsg ${scanMsg.startsWith('✓') ? 'ok' : 'err'}`}>{scanMsg}</div>}
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

          {/* 群發活動：每次群發一列，永久保存 選取/排除重複/無效/已寄/排隊/失敗/開信/點擊 */}
          <div className="card camp">
            <div className="ck">群發活動 <span className="rkhint">每次群發一列 · 點擊展開當次明細</span></div>
            {campaigns.length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>尚無群發活動</div>
            ) : (
              <table className="camptable">
                <thead>
                  <tr>
                    <th>活動</th><th>日期</th><th style={{ minWidth: 150 }}>進度</th>
                    <th>選取</th><th>排除重複</th><th>無效</th><th>已寄</th><th>失敗</th><th>排隊</th>
                    <th>開信率</th><th>點擊率</th><th>狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => {
                    const done = c.sent + c.failed;
                    const pct = c.total ? Math.round((done / c.total) * 100) : 0;
                    const openRate = c.sent ? Math.round((c.opened / c.sent) * 1000) / 10 : 0;
                    const clickRate = c.sent ? Math.round((c.clicked / c.sent) * 1000) / 10 : 0;
                    const running = (c.queued + c.sending) > 0;
                    const isOpen = campOpen === c.id;
                    return (
                      <Fragment key={c.id}>
                        <tr className={`camprow ${isOpen ? 'on' : ''}`} onClick={() => toggleCampaign(c.id)}>
                          <td>
                            <span className="caret">{isOpen ? '▾' : '▸'}</span><strong>{c.name}</strong>
                            {c.template_name && c.template_name !== c.name && <div className="muted small">{c.template_name}</div>}
                          </td>
                          <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(c.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}</td>
                          <td>
                            <div className="ctrack"><div className="cfill" style={{ width: `${pct}%` }} /></div>
                            <div className="muted small">{done}/{c.total}（{pct}%）</div>
                          </td>
                          <td>{c.requested}</td>
                          <td>{c.skipped}</td>
                          <td>{c.cleaned}</td>
                          <td style={{ color: '#2f7d4a', fontWeight: 700 }}>{c.sent}</td>
                          <td style={{ color: c.failed ? '#a4452f' : undefined }}>{c.failed}</td>
                          <td style={{ color: c.queued ? '#8a6d1f' : undefined, fontWeight: c.queued ? 700 : undefined }}>{c.queued}</td>
                          <td>{openRate}%</td>
                          <td>{clickRate}%</td>
                          <td><span className="badge" style={{ background: running ? '#b08d3f' : '#4a6b3f' }}>{running ? '進行中' : '完成'}</span></td>
                        </tr>
                        {isOpen && (
                          <tr className="campdetailrow">
                            <td colSpan={12}>
                              {campLoading ? (
                                <div className="muted" style={{ padding: 12 }}>載入中…</div>
                              ) : campDetail ? (
                                <div className="campdetail">
                                  <div className="dstats">
                                    {([
                                      ['選取', campDetail.campaign.requested], ['排除重複', campDetail.campaign.skipped], ['無效信箱', campDetail.campaign.cleaned],
                                      ['入佇列', campDetail.campaign.total], ['已寄', campDetail.campaign.sent], ['失敗', campDetail.campaign.failed],
                                      ['排隊', campDetail.campaign.queued], ['開信', campDetail.campaign.opened], ['點擊', campDetail.campaign.clicked],
                                    ] as const).map(([k, v]) => (
                                      <div key={k} className="dstat"><b>{v}</b><span>{k}</span></div>
                                    ))}
                                  </div>
                                  {campDetail.skipped.length > 0 && (
                                    <details className="skiplist">
                                      <summary>排除重複 {campDetail.skipped.length} 位（先前已收過此模板，或已在佇列）</summary>
                                      <div className="skipchips">
                                        {campDetail.skipped.map((s) => (
                                          <span key={s.id} className="chip">{s.name}{s.email ? ` · ${s.email}` : ''}</span>
                                        ))}
                                      </div>
                                    </details>
                                  )}
                                  <table className="ddtable">
                                    <thead><tr><th>名單</th><th>主旨</th><th>狀態</th><th>開信</th><th>點擊</th><th>時間</th></tr></thead>
                                    <tbody>
                                      {campDetail.messages.map((m) => {
                                        const s = STATUS[m.status] || STATUS.draft;
                                        return (
                                          <tr key={m.id} className="static">
                                            <td>{m.brands?.name || m.to_email || '—'}</td>
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
                              ) : null}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="chart card">
            <div className="ck">每日寄送量</div>
            <div className="hbars">
              {(data?.daily || []).slice().reverse().map((d) => (
                <div key={d.day}>
                  <div
                    className={`hbarrow clickable ${dayOpen === d.day ? 'on' : ''}`}
                    onClick={() => toggleDay(d.day)}
                    title={`${d.day.slice(5, 10)} 寄${d.sent} 開${d.opened} 點${d.clicked}（點擊看當天明細）`}
                  >
                    <span className="hbarlabel">
                      <span className="caret">{dayOpen === d.day ? '▾' : '▸'}</span>
                      {parseInt(d.day.slice(5, 7))}/{parseInt(d.day.slice(8, 10))}
                    </span>
                    <div className="hbartrack">
                      <div className="hbarfill" style={{ width: `${(d.sent / maxSent) * 100}%` }} />
                    </div>
                    <span className="hbarval">{d.sent}</span>
                  </div>
                  {dayOpen === d.day && (
                    <div className="daydetail">
                      {dayLoading ? (
                        <div className="muted" style={{ padding: 14, textAlign: 'center' }}>載入中…</div>
                      ) : dayMsgs.length === 0 ? (
                        <div className="muted" style={{ padding: 14, textAlign: 'center' }}>當天無寄送明細</div>
                      ) : (
                        <>
                          <div className="ddhead">{d.day.slice(0, 10)} 寄送儀表板 · 共 {dayMsgs.length} 筆（點任一列看內容）</div>
                          {(() => {
                            const ok = dayMsgs.filter((m) => ['sent', 'delivered', 'read', 'replied'].includes(m.status)).length;
                            const fl = dayMsgs.filter((m) => m.status === 'failed').length;
                            const bo = dayMsgs.filter((m) => m.status === 'bounced').length;
                            const qu = dayMsgs.filter((m) => ['queued', 'sending'].includes(m.status)).length;
                            const op = dayMsgs.filter((m) => (m.open_count || 0) > 0).length;
                            const cl = dayMsgs.filter((m) => (m.click_count || 0) > 0).length;
                            const rate = (n: number) => (ok ? Math.round((n / ok) * 1000) / 10 : 0);
                            return (
                              <div className="dstats">
                                <div className="dstat"><b>{dayMsgs.length}</b><span>總筆數</span></div>
                                <div className="dstat"><b style={{ color: '#2f7d4a' }}>{ok}</b><span>成功寄出</span></div>
                                <div className="dstat"><b style={{ color: fl ? '#a4452f' : undefined }}>{fl}</b><span>失敗</span></div>
                                <div className="dstat"><b style={{ color: bo ? '#a4452f' : undefined }}>{bo}</b><span>退信</span></div>
                                <div className="dstat"><b style={{ color: qu ? '#8a6d1f' : undefined }}>{qu}</b><span>排隊／寄送中</span></div>
                                <div className="dstat"><b>{op}</b><span>開信 {rate(op)}%</span></div>
                                <div className="dstat"><b>{cl}</b><span>點擊 {rate(cl)}%</span></div>
                              </div>
                            );
                          })()}
                          <table className="ddtable">
                            <thead>
                              <tr><th>名單</th><th>主旨</th><th>狀態</th><th>開信</th><th>點擊</th><th>時間</th></tr>
                            </thead>
                            <tbody>
                              {dayMsgs.map((m) => {
                                const s = STATUS[m.status] || STATUS.draft;
                                return (
                                  <tr key={m.id} onClick={() => setOpen(m)}>
                                    <td>{m.brands?.name || m.to_email || '—'}</td>
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
                        </>
                      )}
                    </div>
                  )}
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

          {/* 模板成效排行（依開信率，至少寄 5 封才參與排名）*/}
          {(() => {
            const all = data?.byTemplate || [];
            const ranked = [...all]
              .filter((r) => r.sent >= 5 && r.template !== '（無模板）')
              .sort((a, b) => (b.openRate - a.openRate) || (b.clickRate - a.clickRate));
            if (ranked.length === 0) return null;
            const medal = ['🥇', '🥈', '🥉'];
            const bestClick = Math.max(...ranked.map((r) => r.clickRate));
            return (
              <div className="card">
                <div className="ck">模板成效排行 <span className="rkhint">依開信率（≥5 封）</span></div>
                <table>
                  <thead><tr><th>名次</th><th>模板</th><th>寄送</th><th>開信率</th><th>點擊率</th><th>回覆率</th></tr></thead>
                  <tbody>
                    {ranked.map((r, i) => (
                      <tr key={i} className={i === 0 ? 'rk1' : ''}>
                        <td className="rkno">{medal[i] || `#${i + 1}`}</td>
                        <td className="subj">{r.template}</td>
                        <td>{r.sent}</td>
                        <td><b>{r.openRate}%</b></td>
                        <td className={r.clickRate === bestClick && bestClick > 0 ? 'rkbest' : ''}>{r.clickRate}%</td>
                        <td>{r.replyRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}

          {/* 依模板分析 */}
          {(data?.byTemplate?.length || 0) > 0 && (
            <div className="card">
              <div className="ck">依模板成效（依寄送量）</div>
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
        .hrow { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
        .scanbtn { border: 1px solid #cdd6bf; background: #eef0e6; color: #4a6b3f; border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .scanbtn:hover { background: #e3ecdf; }
        .scanbtn:disabled { opacity: 0.55; cursor: default; }
        .scanmsg { margin: 0 0 16px; padding: 9px 13px; border-radius: 10px; font-size: 13px; }
        .scanmsg.ok { background: #e8f2e8; color: #3f6b3f; border: 1px solid #cdd6bf; }
        .scanmsg.err { background: #fbeee9; color: #a4452f; border: 1px solid #e2c4ba; }
        .muted { color: #9a9384; }
        .cards { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; margin-bottom: 18px; }
        @media (max-width: 760px) { .cards { grid-template-columns: repeat(2, 1fr); } }
        .card { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 18px; }
        .ck { font-size: 14px; color: #8a8472; font-weight: 500; }
        .rkhint { font-size: 11px; color: #b0a892; font-weight: 400; }
        .rkno { font-size: 16px; white-space: nowrap; }
        .rk1 { background: #fbf7e8; }
        .rkbest { color: #2f7d6b; font-weight: 700; }
        .cv { font-family: 'Noto Serif TC', serif; font-size: 32px; font-weight: 700; margin: 6px 0; }
        .cs { font-size: 13px; color: #a59f8e; }
        .chart { margin-bottom: 18px; }
        .hbars { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
        .hbarrow { display: flex; align-items: center; gap: 12px; }
        .hbarlabel { font-size: 36px; font-weight: 700; color: #c0392b; font-family: 'Noto Serif TC', serif; min-width: 56px; text-align: right; flex-shrink: 0; }
        .hbartrack { flex: 1; height: 28px; background: #f0ece1; border-radius: 999px; overflow: hidden; }
        .hbarfill { height: 100%; background: linear-gradient(90deg, #6f8c5f, #4a6b3f); border-radius: 999px; min-width: 4px; transition: width 400ms; }
        .hbarval { font-size: 16px; font-weight: 700; color: #2f3d2f; min-width: 30px; }
        .hbarrow.clickable { cursor: pointer; padding: 4px 8px; margin: 0 -8px; border-radius: 10px; transition: background 120ms; }
        .hbarrow.clickable:hover { background: #f4f1e7; }
        .hbarrow.on { background: #eef3e9; }
        .hbarlabel .caret { font-size: 14px; color: #8a8472; margin-right: 6px; vertical-align: middle; }
        .daydetail { margin: 6px 0 10px; border: 1px solid #e3ded3; border-radius: 12px; background: #fcfbf6; overflow: hidden; }
        .ddhead { font-size: 12px; color: #6b6b60; padding: 10px 14px; border-bottom: 1px solid #efe9db; background: #f6f3ea; }
        .ddtable { margin: 0; }
        .ddtable th { font-size: 12px; padding: 7px 12px; border-bottom: 1px solid #e3ded3; }
        .ddtable td { font-size: 13px; padding: 8px 12px; }
        /* 當天 / 活動 統計卡 */
        .dstats { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
        .dstat { flex: 1 1 96px; min-width: 96px; background: #fff; border: 1px solid #eee6d6; border-radius: 10px; padding: 8px 10px; text-align: center; }
        .dstat b { display: block; font-family: 'Noto Serif TC', serif; font-size: 20px; color: #2f3d2f; }
        .dstat span { font-size: 11px; color: #8a8472; }
        /* 群發活動 */
        .camp { margin-bottom: 18px; }
        .camptable th { white-space: nowrap; }
        .camptable td { font-size: 14px; }
        .camprow .caret { font-size: 12px; color: #8a8472; margin-right: 6px; }
        .camprow.on { background: #eef3e9; }
        .ctrack { height: 8px; background: #f0ece1; border-radius: 999px; overflow: hidden; width: 140px; }
        .cfill { height: 100%; background: linear-gradient(90deg, #6f8c5f, #4a6b3f); border-radius: 999px; }
        .campdetailrow > td { padding: 0; background: #fcfbf6; }
        .campdetail { border-top: 1px solid #e3ded3; }
        .campdetail tbody tr.static { cursor: default; }
        .campdetail tbody tr.static:hover { background: transparent; }
        .skiplist { margin: 0 12px 10px; font-size: 13px; }
        .skiplist summary { cursor: pointer; color: #8a6d1f; font-weight: 600; }
        .skipchips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
        .chip { font-size: 12px; background: #f3eddf; color: #6b5330; border-radius: 999px; padding: 3px 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th { text-align: left; font-size: 13px; color: #8a8472; font-weight: 600; padding: 8px 10px; border-bottom: 2px solid #e3ded3; }
        td { font-size: 15px; padding: 11px 10px; border-bottom: 1px solid #f0ece1; }
        tbody tr { cursor: pointer; }
        tbody tr:hover { background: #f8f6ee; }
        .subj { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        /* 手機：表格密度縮減，過寬時卡片內水平捲動（不撐破頁面） */
        @media (max-width: 767px) {
          .card { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          th { font-size: 12px; padding: 7px 7px; }
          td { font-size: 13px; padding: 9px 7px; }
          .subj { max-width: 130px; }
        }
        .badge { color: #fff; font-size: 13px; padding: 3px 11px; border-radius: 999px; font-weight: 600; white-space: nowrap; display: inline-block; }
        thead th, tbody td { white-space: nowrap; }
        .subj { white-space: nowrap; }
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
