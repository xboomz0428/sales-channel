'use client'

import { useEffect, useState } from 'react'

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
  industry: string
  stage:    string
  stage_no: number
  count:    number
  avg_score: number
  mrr_potential: number
}

interface ActionItem {
  id:               string
  name:             string
  industry:         string
  stage:            string
  phone?:           string
  email?:           string
  total_score:      number
  grade:            string
  mrr_estimate_max: number
  days_since_contact: number
}

interface FunnelData {
  conversion:  IndustryConversion[]
  funnel:      FunnelRow[]
  actionList:  ActionItem[]
}

// ── 格式化 ──────────────────────────────────────────────────
const fmrr = (n?: number) => {
  if (!n) return '—'
  return n >= 10000 ? `$${(n / 10000).toFixed(0)}萬` : `$${n.toLocaleString()}`
}
const fpct = (n?: number) => n != null ? `${n}%` : '—'

const STAGES = ['新名單', '已聯繫', '打樣中', '報價中', '議約中', '成交']

const PRIORITY_COLOR = (score: number) => {
  if (score >= 15) return 'bg-red-500'
  if (score >= 10) return 'bg-orange-400'
  if (score >= 5)  return 'bg-yellow-400'
  return 'bg-gray-300'
}

const GRADE_EMOJI: Record<string, string> = {
  hot: '🔥', warm: '♨', cool: '🌡', cold: '🧊'
}

// ── 主頁面 ──────────────────────────────────────────────────
export default function FunnelAnalyticsPage() {
  const [data, setData]         = useState<FunnelData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab]           = useState<'overview' | 'funnel' | 'actions'>('overview')

  useEffect(() => {
    fetch('/api/analytics/funnel')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
      <p className="text-[#6E7A6D] animate-pulse">分析中…</p>
    </div>
  )

  const { conversion = [], funnel = [], actionList = [] } = data ?? {}

  // 選取的產業漏斗資料
  const selectedFunnel = funnel.filter(r => r.industry === selected)
  const selectedConv   = conversion.find(r => r.industry === selected)

  // 最大名單數（用來畫相對寬度）
  const maxTotal = Math.max(...conversion.map(r => r.total), 1)

  return (
    <div className="min-h-screen bg-[#F5F0E8] p-4 md:p-6 space-y-6">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* 頁首 */}
        <div>
          <h1 className="text-2xl font-bold text-[#3D4A3A]">漏斗分析</h1>
          <p className="text-sm text-[#6E7A6D] mt-1">
            哪個垂直市場轉換率最高、MRR 潛力最大、資源往哪裡砸
          </p>
        </div>

        {/* Tab 切換 */}
        <div className="flex gap-2 border-b border-gray-200">
          {([
            { key: 'overview', label: '📊 市場優先度' },
            { key: 'funnel',   label: '🔽 各市場漏斗' },
            { key: 'actions',  label: '⚡ 本週行動清單' },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition
                ${tab === t.key
                  ? 'border-[#3D4A3A] text-[#3D4A3A]'
                  : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Tab 1：市場優先度總覽 ── */}
        {tab === 'overview' && (
          <div className="space-y-3">
            {/* 說明 */}
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-700">
              <strong>資源優先度</strong> = 成交率 × 2 + 平均MRR/1000 + 電話覆蓋率 × 0.3
              ，分數越高代表投入同樣資源回報越高
            </div>

            {/* 表格 */}
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-400 uppercase">
                  <tr>
                    <th className="text-left px-4 py-3">垂直市場</th>
                    <th className="text-center px-3 py-3">名單數</th>
                    <th className="text-center px-3 py-3">聯繫率</th>
                    <th className="text-center px-3 py-3">成交率</th>
                    <th className="text-center px-3 py-3">電話覆蓋</th>
                    <th className="text-center px-3 py-3">月MRR均值</th>
                    <th className="text-center px-3 py-3">優先度</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {conversion.map((row, i) => (
                    <tr key={row.industry}
                      onClick={() => { setSelected(row.industry); setTab('funnel') }}
                      className="hover:bg-amber-50 cursor-pointer transition">
                      {/* 排名 + 名稱 */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center
                            text-xs font-bold text-white
                            ${i === 0 ? 'bg-red-500' : i === 1 ? 'bg-orange-400' : i === 2 ? 'bg-yellow-400 text-gray-700' : 'bg-gray-300 text-gray-600'}`}>
                            {i + 1}
                          </span>
                          <span className="font-medium text-[#3D4A3A]">{row.industry}</span>
                        </div>
                      </td>
                      {/* 名單數 + 相對寬度 bar */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold">{row.total.toLocaleString()}</span>
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full bg-[#3D4A3A] rounded-full"
                              style={{ width: `${(row.total / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                      {/* 聯繫率 */}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-semibold ${row.contact_rate >= 30 ? 'text-green-600' : 'text-gray-500'}`}>
                          {fpct(row.contact_rate)}
                        </span>
                      </td>
                      {/* 成交率 */}
                      <td className="px-3 py-3 text-center">
                        <span className={`font-semibold ${row.close_rate >= 5 ? 'text-green-600' : row.close_rate > 0 ? 'text-yellow-600' : 'text-gray-300'}`}>
                          {fpct(row.close_rate)}
                        </span>
                      </td>
                      {/* 電話覆蓋 */}
                      <td className="px-3 py-3 text-center text-gray-500">
                        {fpct(row.phone_coverage_pct)}
                      </td>
                      {/* 月MRR均值 */}
                      <td className="px-3 py-3 text-center font-medium text-[#3D4A3A]">
                        {fmrr(row.avg_mrr_per_lead)}
                      </td>
                      {/* 優先度 bar */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${PRIORITY_COLOR(row.priority_score)}`}
                              style={{ width: `${Math.min(row.priority_score * 4, 100)}%` }} />
                          </div>
                          <span className="text-xs font-bold w-8 text-right text-gray-600">
                            {row.priority_score}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MRR 潛力總覽卡 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {conversion.slice(0, 4).map(row => (
                <div key={row.industry}
                  className="bg-white rounded-xl border border-gray-100 p-3 space-y-1">
                  <p className="text-xs text-gray-400">{row.industry}</p>
                  <p className="text-lg font-bold text-[#3D4A3A]">
                    {fmrr(row.total_mrr_potential)}
                  </p>
                  <p className="text-xs text-gray-400">
                    MRR 潛力上限
                    {row.realized_mrr
                      ? <span className="text-green-600 ml-1">（已實現 {fmrr(row.realized_mrr)}）</span>
                      : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab 2：各市場漏斗 ── */}
        {tab === 'funnel' && (
          <div className="space-y-4">
            {/* 市場選擇 */}
            <div className="flex gap-2 flex-wrap">
              {conversion.map(row => (
                <button key={row.industry}
                  onClick={() => setSelected(row.industry)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition
                    ${selected === row.industry
                      ? 'bg-[#3D4A3A] text-white border-[#3D4A3A]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#3D4A3A]'}`}>
                  {row.industry}
                </button>
              ))}
            </div>

            {selected && selectedConv && (
              <div className="space-y-4">
                {/* 摘要卡 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: '總名單', value: selectedConv.total.toLocaleString() },
                    { label: '成交率', value: fpct(selectedConv.close_rate), highlight: true },
                    { label: '月MRR均值', value: fmrr(selectedConv.avg_mrr_per_lead) },
                    { label: '電話覆蓋', value: fpct(selectedConv.phone_coverage_pct) },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-3">
                      <p className="text-xs text-gray-400">{c.label}</p>
                      <p className={`text-xl font-bold mt-0.5 ${c.highlight ? 'text-green-600' : 'text-[#3D4A3A]'}`}>
                        {c.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* 漏斗視覺化 */}
                <div className="bg-white rounded-xl border border-gray-100 p-4">
                  <h3 className="text-sm font-semibold text-[#3D4A3A] mb-4">
                    {selected} 銷售漏斗
                  </h3>
                  <div className="space-y-2">
                    {STAGES.map((stage, i) => {
                      const row = selectedFunnel.find(r => r.stage === stage)
                      const cnt = row?.count ?? 0
                      const prevCnt = i > 0
                        ? (selectedFunnel.find(r => r.stage === STAGES[i - 1])?.count ?? 0)
                        : (selectedConv?.total ?? 1)
                      const dropRate = prevCnt > 0 && i > 0
                        ? Math.round((1 - cnt / prevCnt) * 100)
                        : null
                      const maxCount = selectedConv?.total || 1
                      const barWidth = Math.max((cnt / maxCount) * 100, 2)

                      const stageColors = [
                        'bg-gray-300',
                        'bg-blue-300',
                        'bg-indigo-400',
                        'bg-amber-400',
                        'bg-orange-500',
                        'bg-green-500',
                      ]

                      return (
                        <div key={stage} className="flex items-center gap-3">
                          {/* 階段名 */}
                          <div className="w-16 text-right text-xs text-gray-500 shrink-0">
                            {stage}
                          </div>
                          {/* Bar */}
                          <div className="flex-1 relative">
                            <div className="h-8 bg-gray-50 rounded-lg overflow-hidden">
                              <div
                                className={`h-full rounded-lg transition-all duration-500 flex items-center px-2 ${stageColors[i]}`}
                                style={{ width: `${barWidth}%` }}>
                                {cnt > 0 && (
                                  <span className="text-white text-xs font-bold">{cnt}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* 流失率 */}
                          <div className="w-16 text-xs text-right shrink-0">
                            {dropRate !== null && dropRate > 0 ? (
                              <span className="text-red-400">-{dropRate}%</span>
                            ) : cnt === 0 ? (
                              <span className="text-gray-300">0筆</span>
                            ) : null}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* 轉換率說明 */}
                  <div className="mt-4 pt-3 border-t border-gray-50 grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <p className="text-gray-400">接觸率</p>
                      <p className="font-semibold text-blue-600">{fpct(selectedConv.contact_rate)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">接觸→成交</p>
                      <p className="font-semibold text-orange-600">{fpct(selectedConv.close_from_contact_rate)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">整體成交率</p>
                      <p className="font-semibold text-green-600">{fpct(selectedConv.close_rate)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!selected && (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
                點選上方垂直市場查看漏斗詳情
              </div>
            )}
          </div>
        )}

        {/* ── Tab 3：本週行動清單 ── */}
        {tab === 'actions' && (
          <div className="space-y-3">
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-700">
              依熱度評分排序，優先聯繫 Hot 名單中有電話且最久未聯繫的客戶
            </div>

            {actionList.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
                目前無 Hot/Warm 名單，請先增加名單或等評分重算
              </div>
            ) : (
              <div className="space-y-2">
                {actionList.map((item, i) => (
                  <div key={item.id}
                    className={`bg-white rounded-xl border p-4 flex items-center gap-4
                      ${item.grade === 'hot' ? 'border-red-200' : 'border-orange-100'}`}>
                    {/* 排名 */}
                    <div className="text-lg font-bold text-gray-300 w-6 text-center shrink-0">
                      {i + 1}
                    </div>

                    {/* 熱度 */}
                    <div className="text-xl shrink-0">{GRADE_EMOJI[item.grade]}</div>

                    {/* 名稱 & 資訊 */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#3D4A3A] truncate">{item.name}</p>
                      <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-gray-400">
                        <span>{item.industry}</span>
                        <span>·</span>
                        <span>{item.stage}</span>
                        {item.days_since_contact > 0 && (
                          <>
                            <span>·</span>
                            <span className={item.days_since_contact > 14 ? 'text-red-400' : ''}>
                              {item.days_since_contact}天未聯繫
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 分數 & MRR */}
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-[#3D4A3A]">{item.total_score}分</p>
                      <p className="text-xs text-gray-400">{fmrr(item.mrr_estimate_max)}/月</p>
                    </div>

                    {/* 電話按鈕 */}
                    {item.phone && (
                      <a href={`tel:${item.phone}`}
                        className="shrink-0 px-3 py-2 bg-green-500 text-white text-xs
                                   font-semibold rounded-lg hover:bg-green-600 transition">
                        📞 {item.phone}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
