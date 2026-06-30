'use client'

import { useEffect, useRef, useState } from 'react'
import { C } from '@/lib/design'

interface GovSource {
  id: string; label: string; industry: string; format: 'csv' | 'json'
  hasPhone: boolean; datasetUrl: string; note?: string
}

interface LogLine { ok?: boolean; text: string }

export default function GovImportPage() {
  const [sources, setSources] = useState<GovSource[]>([])
  const [sel, setSel] = useState<string>('')
  const [url, setUrl] = useState('')
  const [max, setMax] = useState(5000)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState<LogLine[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/import/gov').then(r => r.json()).then(d => setSources(d.sources || []))
  }, [])

  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight) }, [log])

  const source = sources.find(s => s.id === sel)

  async function run(dryRun: boolean) {
    if (!source || !url.trim() || running) return
    setRunning(true); setLog([]); setSummary(null)
    try {
      const res = await fetch('/api/import/gov', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: sel, url: url.trim(), dryRun, max }),
      })
      if (!res.body) { setLog([{ ok: false, text: '無回應' }]); return }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1)
          if (!line.trim()) continue
          let m: any; try { m = JSON.parse(line) } catch { continue }
          if (m.type === 'done') {
            const d = m.data || {}
            setSummary(d.dryRun
              ? `試跑：可匯入 ${d.parsed} 筆${d.sample?.length ? `（範例：${d.sample.map((s: any) => s.name).slice(0, 3).join('、')}…）` : ''}`
              : `完成：新增 ${d.imported} 筆、重複略過 ${d.duplicate} 筆`)
          } else if (m.type === 'error') {
            setLog(l => [...l, { ok: false, text: `✕ ${m.text}` }])
          } else {
            setLog(l => [...l, { ok: m.ok, text: m.text }])
          }
        }
      }
    } catch (e) {
      setLog(l => [...l, { ok: false, text: `✕ ${e instanceof Error ? e.message : '失敗'}` }])
    } finally {
      setRunning(false)
    }
  }

  const card = (s: GovSource) => {
    const on = sel === s.id
    return (
      <button key={s.id} onClick={() => { setSel(s.id); setUrl(''); setLog([]); setSummary(null) }}
        style={{
          textAlign: 'left', padding: 14, borderRadius: 14, cursor: 'pointer',
          border: `1.5px solid ${on ? C.primary : C.border}`, background: on ? C.p50 : C.surface,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{s.label}</span>
          {s.hasPhone
            ? <span style={{ fontSize: 10, color: C.success, background: C.successBg, padding: '2px 6px', borderRadius: 6 }}>含電話</span>
            : <span style={{ fontSize: 10, color: C.accentDk, background: C.warningBg, padding: '2px 6px', borderRadius: 6 }}>需爬蟲補電話</span>}
          <span style={{ fontSize: 10, color: C.muted, marginLeft: 'auto', textTransform: 'uppercase' }}>{s.format}</span>
        </div>
        {s.note && <div style={{ fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>{s.note}</div>}
      </button>
    )
  }

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '20px clamp(12px, 3vw, 28px)' }}>
      <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>政府資料匯入</h1>
          <p style={{ fontSize: 13, color: C.muted, margin: '4px 0 0' }}>
            Phase 1 — 免申請、CSV/JSON 直接匯入的來源。匯進來的名單與 Google Places 共用，可在名單頁一起篩選。
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
          {sources.map(card)}
        </div>

        {source && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 13, color: C.text }}>
              <strong>{source.label}</strong>
              <span style={{ color: C.muted }}>　→ 寫入產業「{source.industry}」</span>
            </div>
            <div style={{ background: C.p50, border: `1px solid ${C.p100}`, borderRadius: 10, padding: '8px 12px', fontSize: 12, color: C.text }}>
              ① 開啟資料集頁取得最新下載連結（政府網址常變動）：{' '}
              <a href={source.datasetUrl} target="_blank" rel="noreferrer" style={{ color: C.primary, fontWeight: 600 }}>
                {source.datasetUrl}
              </a>
              <br />② 把 {source.format.toUpperCase()} 的「下載網址」貼到下方，先「試跑」確認解析正確，再「正式匯入」。
            </div>

            <input value={url} onChange={e => setUrl(e.target.value)} placeholder={`貼上 ${source.format.toUpperCase()} 下載網址（https://…）`}
              style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: C.bg }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 12, color: C.muted }}>最多匯入</label>
              <input type="number" value={max} onChange={e => setMax(Number(e.target.value) || 5000)}
                style={{ width: 90, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13 }} />
              <div style={{ flex: 1 }} />
              <button onClick={() => run(true)} disabled={running || !url.trim()}
                style={{ padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.primary}`, background: C.surface, color: C.primary, fontWeight: 600, fontSize: 13, cursor: running ? 'wait' : 'pointer', opacity: !url.trim() ? 0.5 : 1 }}>
                試跑
              </button>
              <button onClick={() => run(false)} disabled={running || !url.trim()}
                style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: C.primary, color: '#fff', fontWeight: 600, fontSize: 13, cursor: running ? 'wait' : 'pointer', opacity: !url.trim() ? 0.5 : 1 }}>
                {running ? '處理中…' : '正式匯入'}
              </button>
            </div>

            {summary && (
              <div style={{ background: C.successBg, border: `1px solid ${C.success}`, borderRadius: 10, padding: '10px 12px', fontSize: 13, color: C.text, fontWeight: 600 }}>
                {summary}
              </div>
            )}

            {log.length > 0 && (
              <div ref={logRef} style={{ maxHeight: 260, overflowY: 'auto', background: '#2B3A36', borderRadius: 10, padding: 12, fontSize: 12, fontFamily: 'ui-monospace, monospace', lineHeight: 1.7 }}>
                {log.map((l, i) => (
                  <div key={i} style={{ color: l.ok === false ? '#E5A88F' : l.ok ? '#A9D6B0' : '#C9D4CC' }}>{l.text}</div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7 }}>
          匯入後沒有電話的來源（如禮儀社公司登記），可到「比對中心」用官網爬蟲補 Email / LINE / IG / 電話；有統編的會由 GCIS 比對補負責人與登記資料。
        </div>
      </div>
    </div>
  )
}
