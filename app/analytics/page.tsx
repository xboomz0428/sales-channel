'use client'

import { useEffect, useMemo, useState } from 'react'
import { C, STAGE_CFG } from '@/lib/design'

// ── 型別 ────────────────────────────────────────────────────
interface IndustryConversion {
  industry:                string
  total:                   number
  contacted:               number
  in_pipeline:             number
  closed:                  number
  contact_rate:            number
  close_rate:              number
  close_from_contact_rate: number
  total_mrr_potential:     number
  avg_mrr_per_lead:        number
  realized_mrr:            number
  avg_score:               number
  phone_coverage_pct:      number
  priority_score:          number
}

interface FunnelRow {
  industry:      string
  stage:         string
  stage_no:      number
  count:         number
  avg_score:     number
  mrr_potential: number
  has_phone:     number
  has_email:     number
}

interface ActionItem {
  id:                 string
  name:               string
  industry:           string
  stage:              string
  phone?:             string
  email?:             string
  total_score:        number
  grade:              string
  mrr_estimate_max:   number
  days_since_contact: number
}

interface FunnelData {
  conversion: IndustryConversion[]
  funnel:     FunnelRow[]
  actionList: ActionItem[]
}

// ── 格式化 ──────────────────────────────────────────────────
const fmrr = (n?: number) => {
  if (!n) return '—'
  return n >= 10000 ? `$${(n / 10000).toFixed(0)}萬` : `$${n.toLocaleString()}`
}
const fpct = (n?: number) => (n != null ? `${n}%` : '—')

// 中文階段 → design.ts 階段色（與全站 Pipeline 一致）
const STAGES = ['新名單', '已聯繫', '打樣中', '報價中', '議約中', '成交']
const STAGE_KEY: Record<string, keyof typeof STAGE_CFG> = {
  新名單: 'new', 已聯繫: 'contacted', 打樣中: 'sampling',
  報價中: 'quoting', 議約中: 'negotiating', 成交: 'won',
}
const stageColor = (zh: string) => STAGE_CFG[STAGE_KEY[zh] ?? 'new'].color

const GRADE: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  hot:  { emoji: '🔥', label: 'Hot',  color: '#B5483A', bg: C.dangerBg },
  warm: { emoji: '♨', label: 'Warm', color: C.accentDk, bg: C.warningBg },
  cool: { emoji: '🌡', label: 'Cool', color: C.muted,   bg: C.surf2 },
  cold: { emoji: '🧊', label: 'Cold', color: '#9AA3A0', bg: C.surf2 },
}

const priorityColor = (s: number) =>
  s >= 25 ? C.danger : s >= 18 ? C.accent : s >= 10 ? C.warning : C.sage

// ── 小元件 ──────────────────────────────────────────────────
function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 12, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent ?? C.text, marginTop: 4, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function Bar({ pct, color, h = 6 }: { pct: number; color: string; h?: number }) {
  return (
    <div style={{ width: '100%', height: h, background: C.surf2, borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 999, transition: 'width .4s' }} />
    </div>
  )
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function FunnelAnalyticsPage() {
  const [data, setData]         = useState<FunnelData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab]           = useState<'overview' | 'funnel' | 'actions'>('overview')

  useEffect(() => {
    fetch('/api/analytics/funnel')
      .then(r => r.json())
      .then(d => { if (d.error) setErr(d.error); else setData(d); setLoading(false) })
      .catch(e => { setErr(String(e)); setLoading(false) })
  }, [])

  const conversion = useMemo(() => data?.conversion ?? [], [data])
  const funnel     = useMemo(() => data?.funnel ?? [], [data])
  const actionList = data?.actionList ?? []

  // 各產業 Email 覆蓋率（從 funnel 階段資料彙整）
  const emailCov = useMemo(() => {
    const m: Record<string, { mail: number; total: number }> = {}
    for (const r of funnel) {
      const e = (m[r.industry] ??= { mail: 0, total: 0 })
      e.mail += r.has_email || 0
      e.total += r.count || 0
    }
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(m)) out[k] = v.total ? Math.round((v.mail / v.total) * 100) : 0
    return out
  }, [funnel])

  // 總覽 KPI
  const kpi = useMemo(() => {
    const sum = (f: (r: IndustryConversion) => number) => conversion.reduce((s, r) => s + (f(r) || 0), 0)
    return {
      total: sum(r => r.total),
      contacted: sum(r => r.contacted),
      pipeline: sum(r => r.in_pipeline),
      closed: sum(r => r.closed),
      mrr: sum(r => r.total_mrr_potential),
      markets: conversion.length,
    }
  }, [conversion])

  const maxTotal = Math.max(...conversion.map(r => r.total), 1)
  const selectedFunnel = funnel.filter(r => r.industry === selected)
  const selectedConv   = conversion.find(r => r.industry === selected)

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
      分析中…
    </div>
  )

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '20px clamp(12px, 3vw, 28px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* 頁首 */}
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>漏斗分析</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            哪個垂直市場轉換率最高、MRR 潛力最大、資源該往哪裡投
          </p>
        </div>

        {err && (
          <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, color: C.accentDk, borderRadius: 12, padding: 12, fontSize: 13 }}>
            載入失敗：{err}
          </div>
        )}

        {/* KPI 列 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Kpi label="總名單" value={kpi.total.toLocaleString()} sub={`${kpi.markets} 個垂直市場`} />
          <Kpi label="已聯繫" value={kpi.contacted.toLocaleString()} sub={kpi.total ? `${Math.round((kpi.contacted / kpi.total) * 100)}% 接觸率` : '—'} accent={C.primary} />
          <Kpi label="進行中商機" value={kpi.pipeline.toLocaleString()} sub="打樣～議約" accent={C.accentDk} />
          <Kpi label="已成交" value={kpi.closed.toLocaleString()} accent={C.success} />
          <Kpi label="MRR 潛力上限" value={fmrr(kpi.mrr)} sub="月經常性收入" accent={C.accentDk} />
        </div>

        {/* Tab 切換 */}
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${C.border}` }}>
          {([
            { key: 'overview', label: '📊 市場優先度' },
            { key: 'funnel',   label: '🔽 各市場漏斗' },
            { key: 'actions',  label: `⚡ 本週行動清單${actionList.length ? ` (${actionList.length})` : ''}` },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{
                padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: 'transparent', border: 'none',
                borderBottom: `2px solid ${tab === t.key ? C.primary : 'transparent'}`,
                color: tab === t.key ? C.text : C.muted,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab 1：市場優先度 ── */}
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: C.p50, border: `1px solid ${C.p100}`, borderRadius: 12, padding: '10px 12px', fontSize: 12, color: C.text }}>
              <strong>資源優先度</strong> = 成交率 × 2 ＋ 月MRR均值 / 1000 ＋ 電話覆蓋率 × 0.3，分數越高代表投入同樣資源回報越高
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
                  <thead>
                    <tr style={{ background: C.surf2, color: C.muted, fontSize: 11 }}>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600 }}>垂直市場</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>名單數</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>聯繫率</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>成交率</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>電話</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>Email</th>
                      <th style={{ textAlign: 'center', padding: '10px 10px', fontWeight: 600 }}>月MRR均值</th>
                      <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, width: 130 }}>優先度</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversion.map((row, i) => (
                      <tr key={row.industry}
                        onClick={() => { setSelected(row.industry); setTab('funnel') }}
                        style={{ borderTop: `1px solid ${C.border}`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.p50)}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              width: 22, height: 22, borderRadius: 999, display: 'inline-flex', alignItems: 'center',
                              justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff',
                              background: i === 0 ? C.danger : i === 1 ? C.accent : i === 2 ? C.warning : C.sage,
                            }}>{i + 1}</span>
                            <span style={{ fontWeight: 600, color: C.text }}>{row.industry}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, color: C.text }}>{row.total.toLocaleString()}</div>
                          <div style={{ width: 56, margin: '4px auto 0' }}><Bar pct={(row.total / maxTotal) * 100} color={C.primary} h={4} /></div>
                        </td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: row.contact_rate >= 30 ? C.success : C.muted, fontWeight: 600 }}>{fpct(row.contact_rate)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: row.close_rate > 0 ? C.success : '#C7CDC6', fontWeight: 600 }}>{fpct(row.close_rate)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: C.muted }}>{fpct(row.phone_coverage_pct)}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', color: C.muted }}>{fpct(emailCov[row.industry])}</td>
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: C.text }}>{fmrr(row.avg_mrr_per_lead)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1 }}><Bar pct={Math.min(row.priority_score * 3, 100)} color={priorityColor(row.priority_score)} /></div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, width: 30, textAlign: 'right' }}>{row.priority_score}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {conversion.slice(0, 4).map(row => (
                <div key={row.industry} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                  <div style={{ fontSize: 12, color: C.muted }}>{row.industry}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginTop: 2 }}>{fmrr(row.total_mrr_potential)}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    MRR 潛力上限{row.realized_mrr ? <span style={{ color: C.success }}>（已實現 {fmrr(row.realized_mrr)}）</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab 2：各市場漏斗 ── */}
        {tab === 'funnel' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {conversion.map(row => (
                <button key={row.industry} onClick={() => setSelected(row.industry)}
                  style={{
                    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    border: `1px solid ${selected === row.industry ? C.primary : C.border}`,
                    background: selected === row.industry ? C.primary : C.surface,
                    color: selected === row.industry ? '#fff' : C.text,
                  }}>
                  {row.industry}
                </button>
              ))}
            </div>

            {selected && selectedConv ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
                  <Kpi label="總名單" value={selectedConv.total.toLocaleString()} />
                  <Kpi label="成交率" value={fpct(selectedConv.close_rate)} accent={C.success} />
                  <Kpi label="月MRR均值" value={fmrr(selectedConv.avg_mrr_per_lead)} accent={C.accentDk} />
                  <Kpi label="電話覆蓋" value={fpct(selectedConv.phone_coverage_pct)} />
                </div>

                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 14px' }}>{selected} 銷售漏斗</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {STAGES.map((stage, i) => {
                      const row = selectedFunnel.find(r => r.stage === stage)
                      const cnt = row?.count ?? 0
                      const prevCnt = i > 0
                        ? (selectedFunnel.find(r => r.stage === STAGES[i - 1])?.count ?? 0)
                        : (selectedConv.total ?? 1)
                      const dropRate = prevCnt > 0 && i > 0 ? Math.round((1 - cnt / prevCnt) * 100) : null
                      const barWidth = Math.max((cnt / (selectedConv.total || 1)) * 100, 1.5)
                      return (
                        <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 52, textAlign: 'right', fontSize: 12, color: C.muted, flexShrink: 0 }}>{stage}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ height: 30, background: C.surf2, borderRadius: 8, overflow: 'hidden' }}>
                              <div style={{ width: `${barWidth}%`, height: '100%', background: stageColor(stage), borderRadius: 8, display: 'flex', alignItems: 'center', padding: '0 8px', transition: 'width .5s' }}>
                                {cnt > 0 && <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>{cnt}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ width: 50, textAlign: 'right', fontSize: 12, flexShrink: 0 }}>
                            {dropRate !== null && dropRate > 0
                              ? <span style={{ color: C.danger }}>-{dropRate}%</span>
                              : cnt === 0 ? <span style={{ color: '#C7CDC6' }}>0</span> : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, textAlign: 'center' }}>
                    {[
                      { label: '接觸率', value: fpct(selectedConv.contact_rate), color: C.primary },
                      { label: '接觸→成交', value: fpct(selectedConv.close_from_contact_rate), color: C.accentDk },
                      { label: '整體成交率', value: fpct(selectedConv.close_rate), color: C.success },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 11, color: C.muted }}>{s.label}</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 36, textAlign: 'center', color: C.muted }}>
                點選上方垂直市場查看漏斗詳情
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3：本週行動清單 ── */}
        {tab === 'actions' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: C.dangerBg, border: `1px solid ${C.danger}`, borderRadius: 12, padding: '10px 12px', fontSize: 12, color: C.accentDk }}>
              依熱度評分排序，優先聯繫 Hot 名單中有電話且最久未聯繫的客戶
            </div>

            {actionList.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 36, textAlign: 'center', color: C.muted, fontSize: 13 }}>
                目前無 Hot/Warm 名單。<br />
                <span style={{ fontSize: 12 }}>名單熱度來自 Email 開信/點擊互動（engagement_score），開始外聯後就會自動排出每日必打清單。</span>
              </div>
            ) : (
              actionList.map((item, i) => {
                const g = GRADE[item.grade] ?? GRADE.cold
                return (
                  <div key={item.id} style={{ background: C.surface, border: `1px solid ${item.grade === 'hot' ? C.danger : C.border}`, borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#C7CDC6', width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: g.color, background: g.bg, borderRadius: 8, padding: '3px 8px', flexShrink: 0 }}>{g.emoji} {g.label}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2, fontSize: 12, color: C.muted }}>
                        <span>{item.industry}</span><span>·</span><span>{item.stage}</span>
                        {item.days_since_contact > 0 && (
                          <><span>·</span><span style={{ color: item.days_since_contact > 14 ? C.danger : C.muted }}>{item.days_since_contact}天未聯繫</span></>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{item.total_score}分</div>
                      <div style={{ fontSize: 11, color: C.muted }}>{fmrr(item.mrr_estimate_max)}/月</div>
                    </div>
                    {item.phone && (
                      <a href={`tel:${item.phone}`} style={{ flexShrink: 0, padding: '8px 12px', background: C.success, color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: 9, textDecoration: 'none' }}>
                        📞 {item.phone}
                      </a>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
