'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { C } from '@/lib/design'

interface GovSource {
  id: string; label: string; industry: string; format: string
  hasPhone: boolean; datasetUrl: string; defaultUrl?: string; phase: number; needsApplication?: boolean; note?: string
}
interface LogLine { ok?: boolean; text: string }
interface DoneData { dryRun?: boolean; parsed?: number; imported?: number; duplicate?: number; sample?: { name: string }[] }
interface StreamMsg { type?: string; ok?: boolean; text?: string; data?: DoneData }

const PHASE_LABEL: Record<number, string> = {
  1: 'Phase 1 ·免申請、有電話', 2: 'Phase 2 ·需申請', 3: 'Phase 3 ·人民團體', 4: 'Phase 4 ·宗教/醫護',
}
const MAP_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: '名稱（必填）' }, { key: 'phone', label: '電話' },
  { key: 'address', label: '地址' }, { key: 'owner', label: '負責人' },
  { key: 'sub', label: '次分類' }, { key: 'tax_id', label: '統一編號' },
]

export default function GovImportPage() {
  const [sources, setSources] = useState<GovSource[]>([])
  const [sel, setSel] = useState<string>('')        // gov id | 'custom'
  const [url, setUrl] = useState('')
  const [max, setMax] = useState(5000)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  // 自訂 CSV
  const [cIndustry, setCIndustry] = useState('')
  const [cCsv, setCCsv] = useState('')
  const [cMap, setCMap] = useState<Record<string, string>>({})
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetch('/api/import/gov').then(r => r.json()).then(d => setSources(d.sources || [])) }, [])
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  const source = sources.find(s => s.id === sel)
  const isCustom = sel === 'custom'

  const cHeaders = useMemo(() => {
    const first = cCsv.split(/\r?\n/).find(l => l.trim())
    if (!first) return []
    const h = first.charCodeAt(0) === 0xfeff ? first.slice(1) : first
    return h.split(',').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean)
  }, [cCsv])

  function reset() { setUrl(''); setLog([]); setSummary(null); setCCsv(''); setCMap({}); setCIndustry('') }

  async function run(dryRun: boolean) {
    if (running) return
    const payload: Record<string, unknown> = { dryRun, max }
    if (isCustom) {
      if (!cCsv.trim() || !cMap.name) return
      Object.assign(payload, { source: 'custom', csv: cCsv, industry: cIndustry, mapping: cMap })
    } else {
      if (!source || !url.trim()) return
      Object.assign(payload, { source: sel, url: url.trim() })
    }
    setRunning(true); setLog([]); setSummary(null)
    try {
      const res = await fetch('/api/import/gov', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.body) { setLog([{ ok: false, text: '無回應' }]); return }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''
      for (;;) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true }); let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue
          let m: StreamMsg; try { m = JSON.parse(line) as StreamMsg } catch { continue }
          if (m.type === 'done') {
            const d = m.data || {}
            setSummary(d.dryRun
              ? `試跑：可匯入 ${d.parsed} 筆${d.sample?.length ? `（範例：${d.sample.map(s => s.name).slice(0, 3).join('、')}…）` : ''}`
              : `完成：新增 ${d.imported} 筆、重複略過 ${d.duplicate} 筆`)
          } else if (m.type === 'error') setLog(l => [...l, { ok: false, text: `✕ ${m.text}` }])
          else setLog(l => [...l, { ok: m.ok, text: m.text ?? '' }])
        }
      }
    } catch (e) { setLog(l => [...l, { ok: false, text: `✕ ${e instanceof Error ? e.message : '失敗'}` }]) }
    finally { setRunning(false) }
  }

  const phases = [1, 3, 4, 2]
  const canRun = isCustom ? (!!cCsv.trim() && !!cMap.name) : (!!source && !!url.trim())

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '20px clamp(12px, 3vw, 28px)' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>政府資料匯入</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            選來源 → 貼上資料集的下載網址 → 試跑 → 正式匯入。匯進來的名單與 Google Places 共用，可在名單頁一起篩選。
          </p>
        </div>

        {phases.map(p => {
          const list = sources.filter(s => s.phase === p)
          if (!list.length) return null
          return (
            <div key={p} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>{PHASE_LABEL[p] || `Phase ${p}`}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                {list.map(s => {
                  const on = sel === s.id; const locked = !!s.needsApplication
                  return (
                    <button key={s.id} disabled={locked} onClick={() => { if (!locked) { setSel(s.id); reset(); setUrl(s.defaultUrl || '') } }}
                      style={{
                        textAlign: 'left', padding: 14, borderRadius: 14, cursor: locked ? 'not-allowed' : 'pointer',
                        border: `1.5px solid ${on ? C.primary : C.border}`, background: on ? C.p50 : C.surface, opacity: locked ? 0.6 : 1,
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{s.label}</span>
                        {locked
                          ? <span style={{ fontSize: 10, color: C.muted, background: C.surf2, padding: '2px 6px', borderRadius: 6 }}>需申請</span>
                          : s.hasPhone
                            ? <span style={{ fontSize: 10, color: C.success, background: C.successBg, padding: '2px 6px', borderRadius: 6 }}>含電話</span>
                            : <span style={{ fontSize: 10, color: C.accentDk, background: C.warningBg, padding: '2px 6px', borderRadius: 6 }}>需爬蟲補</span>}
                        <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', textTransform: 'uppercase' }}>{s.format}</span>
                      </div>
                      {s.note && <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{s.note}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* 自訂 CSV */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Phase 5 ·自訂匯入</div>
          <button onClick={() => { setSel('custom'); reset() }}
            style={{ textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer', border: `1.5px solid ${isCustom ? C.primary : C.border}`, background: isCustom ? C.p50 : C.surface }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>自訂 CSV 匯入</span>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>BNI 名片、展覽名冊等自己的名單，貼上 CSV 並對應欄位即可匯入。</div>
          </button>
        </div>

        {/* ── 政府來源操作面板 ── */}
        {source && !isCustom && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: C.text }}><strong>{source.label}</strong><span style={{ color: C.muted }}>　→ 寫入產業「{source.industry}」</span></div>
            <div style={{ background: C.p50, border: `1px solid ${C.p100}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: C.text }}>
              ① 開啟資料集頁取得最新下載連結（政府網址常變動）：{' '}
              <a href={source.datasetUrl} target="_blank" rel="noreferrer" style={{ color: C.primary, fontWeight: 600 }}>{source.datasetUrl}</a>
              <br />② 把 {source.format.toUpperCase()} 下載網址貼到下方，先「試跑」確認解析正確，再「正式匯入」。
            </div>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder={`貼上 ${source.format.toUpperCase()} 下載網址（https://…）`}
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: C.bg }} />
            <Controls running={running} canRun={canRun} max={max} setMax={setMax} run={run} />
          </div>
        )}

        {/* ── 自訂 CSV 操作面板 ── */}
        {isCustom && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={cIndustry} onChange={e => setCIndustry(e.target.value)} placeholder="產業標籤（例：BNI人脈、展覽名單）"
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, background: C.bg }} />
            <textarea value={cCsv} onChange={e => setCCsv(e.target.value)} placeholder="貼上 CSV（第一行為欄位標題）" rows={6}
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: 'ui-monospace, monospace', background: C.bg, resize: 'vertical' }} />
            {cHeaders.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                {MAP_FIELDS.map(f => (
                  <label key={f.key} style={{ fontSize: 12, color: C.muted, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {f.label}
                    <select value={cMap[f.key] || ''} onChange={e => setCMap(m => ({ ...m, [f.key]: e.target.value }))}
                      style={{ padding: '7px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: C.surface }}>
                      <option value="">（無）</option>
                      {cHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
            <Controls running={running} canRun={canRun} max={max} setMax={setMax} run={run} />
          </div>
        )}

        {(summary || log.length > 0) && (source || isCustom) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {summary && <div style={{ background: C.successBg, border: `1px solid ${C.success}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.text, fontWeight: 600 }}>{summary}</div>}
            {log.length > 0 && (
              <div ref={logRef} style={{ maxHeight: 260, overflowY: 'auto', background: '#2B3A36', borderRadius: 10, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, monospace', lineHeight: 1.7 }}>
                {log.map((l, i) => <div key={i} style={{ color: l.ok === false ? '#E5A88F' : l.ok ? '#A9D6B0' : '#C9D4CC' }}>{l.text}</div>)}
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          沒有電話的來源（禮儀社公司登記、部分寺廟）可到「比對中心」用官網爬蟲補 Email / LINE / IG / 電話；有統編者會由 GCIS 比對補負責人與登記資料。
        </div>
      </div>
    </div>
  )
}

function Controls({ running, canRun, max, setMax, run }: {
  running: boolean; canRun: boolean; max: number; setMax: (n: number) => void; run: (d: boolean) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <label style={{ fontSize: 12, color: C.muted }}>最多匯入</label>
      <input type="number" value={max} onChange={e => setMax(Number(e.target.value) || 5000)}
        style={{ width: 90, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
      <div style={{ flex: 1 }} />
      <button onClick={() => run(true)} disabled={running || !canRun}
        style={{ padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.primary}`, background: C.surface, color: C.primary, fontWeight: 600, fontSize: 13, cursor: running ? 'wait' : 'pointer', opacity: canRun ? 1 : 0.5 }}>試跑</button>
      <button onClick={() => run(false)} disabled={running || !canRun}
        style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: C.primary, color: '#fff', fontWeight: 600, fontSize: 13, cursor: running ? 'wait' : 'pointer', opacity: canRun ? 1 : 0.5 }}>{running ? '處理中…' : '正式匯入'}</button>
    </div>
  )
}
