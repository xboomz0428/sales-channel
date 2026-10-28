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
  language?: string | null;
}

const COUNTRY_LIST = [
  { code: 'TW', label: '台灣', flag: '🇹🇼', lang: 'zh' },
  { code: 'JP', label: '日本', flag: '🇯🇵', lang: 'ja' },
  { code: 'UK', label: '英國', flag: '🇬🇧', lang: 'en' },
  { code: 'CA', label: '加拿大', flag: '🇨🇦', lang: 'en' },
] as const;
type NewsCountry = 'TW' | 'JP' | 'UK' | 'CA';

const LANG_NAME: Record<string, string> = { zh: '中文', ja: '日文', en: '英文' };
interface SendResult {
  campaignId?: string;
  total: number;        // 本次選取
  sent: number;         // 成功
  failed: number;       // 失敗
  queued: number;       // 剩餘排隊（額度用盡或中斷）
  skipped: number;      // 排除重複
  cleaned: number;      // 無效信箱
  noEmail?: number;     // 名單沒有 Email
  unprocessed: number;  // 分段寄出時中斷的次數（非收件人數）
  capReached?: boolean; // 今日額度用盡
  background?: boolean; // 已交由伺服器背景寄出（Phase 2）
}
// 群發活動（來自 /api/outreach/campaigns，統計即時彙整）
interface CampaignRow {
  id: string; name: string; template_name: string | null; created_at: string; status: string | null;
  requested: number; skipped: number; cleaned: number; total: number;
  sent: number; failed: number; queued: number; sending: number; opened: number; clicked: number;
}

const STAGE_LABEL: Record<string, string> = {
  new: '新名單', contacted: '已聯繫', sampling: '打樣中', quoting: '報價中',
  negotiating: '議約中', won: '成交', lost: '流失',
};

export default function NewsletterPage() {
  const [country, setCountry] = useState<NewsCountry>('TW');
  const [translating, setTranslating] = useState<string | null>(null); // targetLang being translated
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
  const [groupId, setGroupId] = useState('');
  const [groups, setGroups] = useState<{ id: string; name: string; industries: string[]; brandCount?: number }[]>([]);
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [skipDup, setSkipDup] = useState(true); // 略過已寄送過相同模板的收件人
  const [removing, setRemoving] = useState(false);
  const [previewFull, setPreviewFull] = useState(false); // 全視窗預覽模板
  // ① 排程寄送
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [scheduling, setScheduling] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfg, setCfg] = useState<{ mode: string; fromEmail: string | null; providerLabel?: string; dailyCap?: number; usedToday?: number; remainingToday?: number } | null>(null);
  const [testSending, setTestSending] = useState(false);
  // 手動新增
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  // manualList 不再需要前端暫存，手動名單已持久化到資料庫，從 recipients API 取回
  // 發送紀錄
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<{ id: string; to_email: string; subject: string | null; status: string; sent_at: string | null; open_count: number; click_count: number; error_detail?: string | null; brands?: { name?: string } | null }[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [histPage, setHistPage] = useState(1);        // 發送紀錄分頁
  const [histPageSize, setHistPageSize] = useState(100); // 每頁筆數

  // 寄信設定狀態（真實 / 模擬）
  const refreshCfg = () => { fetch('/api/outreach/email-config').then((r) => r.json()).then(setCfg).catch(() => {}); };
  useEffect(refreshCfg, []);

  // 群發活動：進行中的（還有排隊）顯示在頁面上方，可隨時「繼續寄送」；重新整理也不會消失
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [quota, setQuota] = useState<{ dailyCap: number; usedToday: number; remainingToday: number } | null>(null);
  const [resuming, setResuming] = useState<string | null>(null);
  const loadCampaigns = () => {
    fetch('/api/outreach/campaigns?limit=10')
      .then((r) => r.json())
      .then((d) => { setCampaigns(d.campaigns || []); if (d.quota) setQuota(d.quota); })
      .catch(() => {});
  };
  useEffect(loadCampaigns, []);
  const activeCampaigns = campaigns.filter((c) => (c.queued || 0) + (c.sending || 0) > 0);
  // 有進行中活動時每 6 秒輪詢進度（伺服器在背景寄，頁面只負責顯示）
  const activeCount = activeCampaigns.length;
  useEffect(() => {
    if (activeCount === 0) return;
    const t = setInterval(() => { loadCampaigns(); refreshCfg(); }, 6000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCount]);

  // 載入產業群組（供群發鎖定）
  useEffect(() => {
    fetch('/api/industry-groups').then((r) => r.json()).then((d) => { if (d.success) setGroups(d.data); }).catch(() => {});
  }, []);

  const currentLang = COUNTRY_LIST.find((c) => c.code === country)?.lang ?? 'zh';

  // 將目前篩選組成 query
  const buildRecipientParams = () => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    const grp = groups.find((g) => g.id === groupId);
    if (grp && grp.industries.length) p.set('industries', grp.industries.join(','));
    else if (industry) p.set('industry', industry);
    if (stage) p.set('stage', stage);
    if (source) p.set('source', source);
    p.set('country', country);
    return p;
  };

  // 載入發送紀錄
  const loadHistory = () => {
    fetch('/api/outreach/email-dashboard?light=1')
      .then((r) => r.json())
      .then((d) => { setHistory(d.messages || []); setHistPage(1); })
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
        fetch(`/api/outreach/recipients?${buildRecipientParams().toString()}`)
          .then((r) => r.json())
          .then((d) => { setRecipients(d.recipients || []); });
      }
    } catch { /* 新增失敗 */ }
  };

  // 載入名單(隨搜尋/篩選)
  useEffect(() => {
    setLoading(true);
    fetch(`/api/outreach/recipients?${buildRecipientParams().toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const list = d.recipients || [];
        setRecipients(list);
        // 安全性：切換群組/產業/搜尋等篩選後，把「已選」收斂成只保留目前清單內的對象，
        // 避免上一次「全選」殘留，導致畫面像選了小群組、實際卻寄給整批名單。
        const ids = new Set(list.map((r: Recipient) => r.id));
        setSelected((prev) => {
          const n = new Set<string>();
          prev.forEach((id) => { if (ids.has(id)) n.add(id); });
          return n.size === prev.size ? prev : n;
        });
        if (d.industries?.length) setIndustries(d.industries);
        if (d.stages) setStages(d.stages);
        if (d.sources) setSources(d.sources);
        if (typeof d.totalBrands === 'number') setTotalBrands(d.totalBrands);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, industry, groupId, stage, source, groups]);

  // 載入電子報模板（依語言過濾）
  useEffect(() => {
    fetch(`/api/outreach/templates?channel=EM&language=${currentLang}`)
      .then((r) => r.json())
      .then((d) => setTemplates((d.templates || []).filter((t: Template) => t.body_html)));
    setTplId('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

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
  // 每段 10 封：SMTP 逐封約 10 秒，10 封 ≈ 100 秒，遠低於 API 300 秒上限，不會被中斷
  const BATCH_SIZE = 10;

  // 「繼續寄送」：觸發伺服器背景寄送（自我接力），立即返回；進度由輪詢更新
  const resumeCampaign = async (c: CampaignRow) => {
    if (resuming) return;
    setResuming(c.id);
    try {
      const res = await fetch(`/api/outreach/campaigns/${c.id}/kick`, { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) alert(d.error || '觸發失敗');
      else if (d.kicked === false && d.reason === 'cap') alert('今日寄送額度已用完，明天早上 8 點會自動續寄。');
      loadCampaigns();
      refreshCfg();
    } catch {
      alert('連線失敗');
    } finally {
      // 保留幾秒「已觸發」狀態，避免連點
      setTimeout(() => setResuming(null), 8000);
    }
  };
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  async function doSend() {
    setSending(true);
    setConfirm(false);
    try {
      // 品牌 ID 和手動收件人分開處理
      const brandIds = [...selected].filter((id) => !id.startsWith('manual_'));
      const manualIds = [...selected].filter((id) => id.startsWith('manual_'));
      const manualRecips = manualIds
        .map((id) => recipients.find((r) => r.id === id))
        .filter((r): r is Recipient => !!r && !!r.email);

      const total = brandIds.length + manualRecips.length;
      setProgress({ done: 0, total });

      // 1) 建立「群發活動」並把全部收件人一次入佇列（只寫資料庫、瞬間完成；關掉視窗也不遺失）
      const cRes = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          templateId: tplId,
          brandIds,
          manualEmails: manualRecips.map((r) => ({ name: r.name, email: r.email! })),
          skipDuplicates: skipDup,
        }),
      });
      const c = await cRes.json().catch(() => ({}));
      if (!cRes.ok || !c.campaignId) { alert(c.error || '建立群發活動失敗'); return; }

      // 2) 伺服器已在背景開始寄出（自我接力，關掉視窗也會繼續）；這裡只呈現入佇列結果，進度由上方橫幅輪詢
      setResult({
        campaignId: c.campaignId, total,
        sent: 0, failed: 0, queued: c.queued || 0,
        skipped: c.skipped || 0, cleaned: c.cleaned || 0, noEmail: c.noEmail || 0,
        unprocessed: 0, background: !!c.background,
      });
      setSelected(new Set());
      loadHistory();
      loadCampaigns();
      refreshCfg();
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

  // 重寄失敗/退信的郵件（黑名單封鎖的會被擋下並說明原因）
  async function resendMessage(id: string) {
    setResendingId(id);
    try {
      const res = await fetch('/api/outreach/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messageId: id }),
      });
      const d = await res.json().catch(() => ({}));
      if (d.success) alert('✓ 已重寄成功');
      else alert(d.error || '重寄失敗');
      loadHistory();
    } catch { alert('連線失敗'); }
    finally { setResendingId(null); }
  }

  // 寄測試信：把目前模板寄到指定信箱（不略過重複、不影響名單），確認版面後再群發
  async function sendTest() {
    if (!tplId) { alert('請先選擇模板'); return; }
    const to = prompt('測試信寄到哪個信箱？', cfg?.fromEmail || '');
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(to.trim())) { if (to !== null) alert('信箱格式不正確'); return; }
    setTestSending(true);
    try {
      const res = await fetch('/api/outreach/newsletter/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, manualEmails: [{ name: '測試', email: to.trim() }], skipDuplicates: false }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && (d.sent || 0) > 0) alert(`✓ 測試信已寄到 ${to.trim()}，請到信箱確認版面`);
      else alert(d.error || (d.cleaned ? '信箱被判定無效（語法/MX 檢查未過）' : '測試寄送失敗，請確認寄信設定'));
      loadHistory();
    } catch { alert('連線失敗'); }
    finally { setTestSending(false); }
  }

  // AI 翻譯模板
  const translateTemplate = async (targetLang: string) => {
    if (!tplId) { alert('請先選擇要翻譯的模板'); return; }
    if (!window.confirm(`確定將目前模板翻譯成${LANG_NAME[targetLang]}？系統會建立一份新模板。`)) return;
    setTranslating(targetLang);
    try {
      const res = await fetch('/api/outreach/translate-template', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ templateId: tplId, targetLang }),
      });
      const json = await res.json();
      if (json.success) {
        // 切到目標語言頁籤並重新載入模板（英文預設切到英國頁籤，UK/CA 共用同一份英文模板）
        const newCountry = targetLang === 'ja' ? 'JP' : 'UK';
        setCountry(newCountry);
        // 模板會因 country 改變重新載入，切換後自動選新模板
        setTimeout(() => setTplId(json.id), 600);
        alert(`✓ 翻譯完成：「${json.name}」`);
      } else {
        alert(json.error || '翻譯失敗');
      }
    } catch { alert('連線失敗'); }
    finally { setTranslating(null); }
  };

  return (
    <div className="wrap">
      <header>
        <h1>電子報發送</h1>
        <p>選名單 → 選模板 → 預覽 → 批量寄送</p>
      </header>

      {/* 國家頁籤 */}
      <div className="countrytabs">
        {COUNTRY_LIST.map((c) => (
          <button
            key={c.code}
            className={`ctab${country === c.code ? ' active' : ''}`}
            onClick={() => { setCountry(c.code); setSelected(new Set()); setIndustry(''); setGroupId(''); }}
          >
            {c.flag} {c.label}
          </button>
        ))}
        <span className="ctab-hint">依國家切換名單與模板語言</span>
      </div>

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

      {/* 進行中的群發活動：還有排隊的，可隨時繼續寄送（重新整理也會顯示） */}
      {activeCampaigns.length > 0 && (
        <div className="activecamp">
          {activeCampaigns.map((c) => {
            const done = c.sent + c.failed;
            const pct = c.total ? Math.round((done / c.total) * 100) : 0;
            const when = new Date(c.created_at).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
            return (
              <div key={c.id} className="acrow">
                <div className="acinfo">
                  <strong>📨 進行中：{c.name}</strong>
                  <span className="muted small">
                    {when} 建立 · 已寄 {c.sent}{c.failed ? ` · 失敗 ${c.failed}` : ''} · <b style={{ color: '#8a6d1f' }}>排隊 {c.queued}</b> / 共 {c.total}
                    {c.skipped ? ` · 排除重複 ${c.skipped}` : ''}{c.cleaned ? ` · 無效 ${c.cleaned}` : ''}
                  </span>
                  <div className="actrack"><div className="acfill" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="acact">
                  {quota && <span className="muted small">今日還可寄 <b>{quota.remainingToday}</b> / {quota.dailyCap}</span>}
                  <button
                    className="btn solid small"
                    disabled={sending || !quota || quota.remainingToday <= 0}
                    onClick={() => resumeCampaign(c)}
                    title={quota && quota.remainingToday <= 0 ? '今日額度已用完，明天早上 8 點會自動續寄' : '在今日額度內把排隊的寄出'}
                  >
                    {resuming === c.id ? '已觸發，背景寄送中…' : c.sending > 0 ? '⏳ 背景寄送中（再觸發）' : '▶ 繼續寄送'}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="muted small achint">伺服器在背景自動寄出（每 6 秒更新進度），<b>關掉視窗也會繼續</b>；超出每日上限的留在佇列，<b>每天早上 8 點自動續寄</b>。若進度停住可按「繼續寄送」再觸發。</div>
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
            <select className="in" value={groupId} onChange={(e) => { setGroupId(e.target.value); if (e.target.value) setIndustry(''); }} title="依產業群組鎖定（管理：產業群組頁）">
              <option value="">產業群組（全部）</option>
              {groups.map((g) => (<option key={g.id} value={g.id}>◳ {g.name}（{g.brandCount ?? 0}）</option>))}
            </select>
          </div>
          <div className="filters">
            <select className="in" value={industry} disabled={!!groupId} onChange={(e) => setIndustry(e.target.value)} title={groupId ? '已選群組，單一產業停用' : ''}>
              <option value="">{groupId ? '（已用群組）' : '全部產業'}</option>
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
          <div className="phead">
            <strong>電子報模板</strong>
            <span className="count">{LANG_NAME[currentLang]} · {templates.length} 個</span>
          </div>
          <select className="in" value={tplId} onChange={(e) => setTplId(e.target.value)}>
            <option value="">選擇模板…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <div className="muted small">
              此語言（{LANG_NAME[currentLang]}）尚無模板。可先選中文模板後按「AI 翻譯」自動產生，或到 <a href="/outreach/email-editor">編輯器</a> 建立。
            </div>
          )}
          {/* AI 翻譯按鈕（在中文頁籤選好模板後，可一鍵翻成日文 / 英文；英文版 UK 與 CA 共用） */}
          {tplId && country === 'TW' && (
            <div className="transbtn-row">
              <span className="muted small">翻譯此模板：</span>
              {[
                { lang: 'ja', label: '🇯🇵 日文' },
                { lang: 'en', label: '🇬🇧🇨🇦 英文' },
              ].map((t) => (
                <button key={t.lang} className="btn ghost small" disabled={!!translating} onClick={() => translateTemplate(t.lang)}>
                  {translating === t.lang ? 'AI 翻譯中…' : `AI 翻譯 → ${t.label}`}
                </button>
              ))}
            </div>
          )}
          {tpl && (
            <div className="subj-row">
              <div className="subj">主旨:{tpl.subject || '(無主旨)'}</div>
              {tpl.body_html && (
                <button className="btn ghost small" onClick={() => setPreviewFull(true)} title="跳出全視窗預覽完整模板">
                  ⛶ 放大預覽
                </button>
              )}
            </div>
          )}
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
      {historyOpen && (() => {
        const totalPages = Math.max(1, Math.ceil(history.length / histPageSize));
        const page = Math.min(histPage, totalPages);
        const start = (page - 1) * histPageSize;
        const pageRows = history.slice(start, start + histPageSize);
        const showPager = history.length > 100;
        return (
        <div className="histpanel">
          <div className="phead">
            <strong>發送紀錄</strong>
            <span className="count">{history.length} 筆</span>
          </div>
          {showPager && (
            <div className="histpager">
              <div className="pgsize">
                每頁
                <select className="pgsel" value={histPageSize} onChange={(e) => { setHistPageSize(Number(e.target.value)); setHistPage(1); }}>
                  {[100, 200, 400, 1000].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                筆
              </div>
              <div className="pgnav">
                <button className="pgbtn" disabled={page <= 1} onClick={() => setHistPage(page - 1)}>← 上一頁</button>
                <span className="pginfo">第 {page}/{totalPages} 頁（第 {start + 1}–{Math.min(start + histPageSize, history.length)} 筆）</span>
                <button className="pgbtn" disabled={page >= totalPages} onClick={() => setHistPage(page + 1)}>下一頁 →</button>
              </div>
            </div>
          )}
          {history.length === 0 ? (
            <div className="muted" style={{ textAlign: 'center', padding: 20 }}>尚無發送紀錄</div>
          ) : (
            <table className="histtable">
              <thead>
                <tr><th>收件人</th><th>主旨</th><th>狀態</th><th>開信</th><th>點擊</th><th>時間</th></tr>
              </thead>
              <tbody>
                {pageRows.map((m) => {
                  const st = { sent: '已寄出', delivered: '已送達', read: '已開信', replied: '已回覆', failed: '失敗', bounced: '退信', queued: '排隊', draft: '草稿', sending: '寄送中' }[m.status] || m.status;
                  const isFail = ['failed', 'bounced'].includes(m.status);
                  const stColor = isFail ? '#a4452f' : ['read', 'replied'].includes(m.status) ? '#2f7d6b' : '#4a6b3f';
                  return (
                    <tr key={m.id}>
                      <td>{m.brands?.name || m.to_email}</td>
                      <td className="subj">{m.subject || '—'}</td>
                      <td>
                        <span style={{ color: stColor, fontWeight: 600 }} title={isFail && m.error_detail ? m.error_detail : undefined}>{st}</span>
                        {isFail && m.error_detail && (
                          <div className="errdetail" title={m.error_detail}>{m.error_detail.length > 42 ? `${m.error_detail.slice(0, 42)}…` : m.error_detail}</div>
                        )}
                        {isFail && (
                          <button className="resendbtn" disabled={resendingId === m.id} onClick={() => resendMessage(m.id)}>
                            {resendingId === m.id ? '重寄中…' : '↻ 重寄'}
                          </button>
                        )}
                      </td>
                      <td>{m.open_count || 0}</td>
                      <td>{m.click_count || 0}</td>
                      <td className="muted">{m.sent_at ? m.sent_at.slice(5, 16).replace('T', ' ') : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {showPager && (
            <div className="pgnav pgbottom">
              <button className="pgbtn" disabled={page <= 1} onClick={() => { setHistPage(page - 1); }}>← 上一頁</button>
              <span className="pginfo">第 {page}/{totalPages} 頁</span>
              <button className="pgbtn" disabled={page >= totalPages} onClick={() => { setHistPage(page + 1); }}>下一頁 →</button>
            </div>
          )}
        </div>
        );
      })()}

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
        {cfg && typeof cfg.remainingToday === 'number' && cfg.dailyCap ? (
          <span className="quota" title={`每日上限 ${cfg.dailyCap} 封（設定頁可調），今日已寄 ${cfg.usedToday}。超出的會排隊，由每天早上的自動化補寄。`}>
            今日還可寄 <b>{cfg.remainingToday}</b> 封
          </span>
        ) : null}
        <label className="dupchk" title="若收件人先前已收過此模板，預設略過不重複寄送">
          <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} />
          略過已寄過此模板
        </label>
        <a className="autolink" href="/outreach/automation" title="排程清單、自動跟進、節流設定">⚙ 自動化</a>
        <button className="btn ghost" disabled={!tplId || testSending} onClick={sendTest} title="先寄一封到自己的信箱確認版面，再群發">
          {testSending ? '測試中…' : '✉ 寄測試信'}
        </button>
        <button className="btn ghost" disabled={!canSend || sending} onClick={() => { setScheduleOpen(true); }}>
          🕒 排程
        </button>
        <button className="btn solid" disabled={!canSend || sending} onClick={() => setConfirm(true)}>
          {sending ? '寄送中…' : '寄送'}
        </button>
      </div>

      {/* 排程對話框 */}
      {/* 全視窗模板預覽 */}
      {previewFull && tpl?.body_html && (
        <div className="overlay" onClick={() => setPreviewFull(false)}>
          <div className="previewmodal" onClick={(e) => e.stopPropagation()}>
            <div className="pmhead">
              <div className="pmtitle">
                <strong>{tpl.name}</strong>
                <span className="muted small">主旨：{tpl.subject || '(無主旨)'}</span>
              </div>
              <button className="pmclose" onClick={() => setPreviewFull(false)} title="關閉預覽">✕</button>
            </div>
            <iframe title="full-preview" srcDoc={tpl.body_html} className="pmframe" />
          </div>
        </div>
      )}

      {scheduleOpen && (
        <div className="overlay" onClick={() => setScheduleOpen(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>排程寄送</h3>
            <p>把「<strong>{tpl?.name}</strong>」排定在指定時間自動寄給 <strong>{selected.size}</strong> 位。</p>
            <input
              className="in"
              type="datetime-local"
              value={scheduleAt}
              min={(() => { const d = new Date(Date.now() + 60000 - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); })()}
              onChange={(e) => setScheduleAt(e.target.value)}
              style={{ marginTop: 8 }}
            />
            <p className="muted small" style={{ marginTop: 8 }}>
              ⏰ 排程由「每天早上 8 點（台灣時間）」的自動化統一執行：到期的排程會在當天早上 8 點寄出，並套用每日上限。
              若要立即寄送請直接按「寄送」。{skipDup ? '已開啟略過重複。' : ''}
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
            <h3>{result.background ? '已開始背景寄送' : result.queued > 0 ? '本次已寄出一部分' : '寄送完成'}</h3>
            <p className="muted small" style={{ textAlign: 'center', marginTop: -2 }}>
              本次選取 {result.total} 位{result.campaignId ? '・已記錄為一筆群發活動（可在郵件儀表板查看）' : ''}
            </p>
            <div className="rstat">
              {result.background ? (
                <>
                  <div><b style={{ color: '#2f7d4a' }}>{result.queued}</b><span>已入佇列</span></div>
                  <div><b style={{ color: '#8a6d1f' }}>{result.skipped}</b><span>排除重複</span></div>
                  <div><b>{result.cleaned + (result.noEmail || 0)}</b><span>無效／無 Email</span></div>
                  <div><b>{cfg?.remainingToday ?? '—'}</b><span>今日還可寄</span></div>
                </>
              ) : (
                <>
                  <div><b style={{ color: '#2f7d4a' }}>{result.sent}</b><span>成功</span></div>
                  <div><b style={{ color: result.failed > 0 ? '#a4452f' : undefined }}>{result.failed}</b><span>失敗</span></div>
                  <div><b style={{ color: '#8a6d1f' }}>{result.skipped}</b><span>排除重複</span></div>
                  <div><b style={{ color: result.queued > 0 ? '#b08d3f' : undefined }}>{result.queued}</b><span>排隊中</span></div>
                </>
              )}
            </div>
            {result.background && (
              <p className="small" style={{ textAlign: 'center', lineHeight: 1.7, color: '#2f4a3a', background: '#e8f1e6', borderRadius: 8, padding: '8px 10px' }}>
                伺服器正在<strong>背景自動寄出</strong>，<strong>關掉視窗也會繼續</strong>。進度請看頁面上方「📨 進行中」橫幅（每 6 秒更新）或郵件儀表板「群發活動」。
                {cfg?.dailyCap ? <>每日上限 {cfg.dailyCap} 封，超出的明天早上 8 點自動續寄{result.queued > (cfg.remainingToday ?? 0) ? `（約需 ${Math.ceil(result.queued / cfg.dailyCap)}～${Math.ceil(result.queued / cfg.dailyCap) + 1} 天）` : ''}。</> : null}
              </p>
            )}
            {(result.cleaned > 0 || (result.noEmail || 0) > 0) && (
              <p className="muted small" style={{ textAlign: 'center' }}>
                {result.cleaned > 0 ? `已自動剔除 ${result.cleaned} 個無效信箱（語法錯誤或網域查無 MX）` : ''}
                {result.cleaned > 0 && (result.noEmail || 0) > 0 ? '；' : ''}
                {(result.noEmail || 0) > 0 ? `${result.noEmail} 位名單沒有 Email` : ''}
                ，皆不計入失敗。
              </p>
            )}
            <p className="muted small" style={{ textAlign: 'center', lineHeight: 1.6 }}>
              「排除重複」= 這 {result.skipped} 位先前已收過<strong>此模板</strong>或已在佇列，本次未重寄{skipDup ? '' : '（本次已關閉略過重複）'}。
            </p>
            {!result.background && result.queued > 0 && (
              <p className="small" style={{ textAlign: 'center', lineHeight: 1.6, color: '#8a6d1f', background: '#faf3df', borderRadius: 8, padding: '8px 10px' }}>
                {result.capReached ? (
                  <>今日寄送額度已用完（每日上限 {cfg?.dailyCap ?? '—'} 封）。剩餘 <strong>{result.queued}</strong> 封已安全排隊，<strong>每天早上 8 點自動續寄</strong>（約需 {cfg?.dailyCap ? Math.ceil(result.queued / cfg.dailyCap) : '—'} 天）；明天也可回本頁按「▶ 繼續寄送」。</>
                ) : (
                  <>剩餘 <strong>{result.queued}</strong> 封仍在佇列（連線中斷或尚未寄完）。可按頁面上方「▶ 繼續寄送」，或等每天早上 8 點自動續寄。關掉視窗不會遺失。</>
                )}
              </p>
            )}
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
        .histpanel { background: #fffdf8; border: 1px solid #e3ded3; border-radius: 14px; padding: 16px; margin-top: 16px; max-height: 72vh; overflow-y: auto; }
        .histpager { position: sticky; top: -16px; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; background: #fffdf8; padding: 8px 0; border-bottom: 1px solid #eee6d6; margin: 0 0 4px; }
        .pgsize { font-size: 12px; color: #6b6b60; display: flex; align-items: center; gap: 6px; }
        .pgsel { border: 1px solid #d9d3c4; border-radius: 7px; padding: 5px 8px; font-size: 13px; font-family: inherit; background: #fff; cursor: pointer; }
        .pgnav { display: flex; align-items: center; gap: 8px; }
        .pgnav.pgbottom { justify-content: center; margin-top: 12px; }
        .pgbtn { border: 1px solid #d9d3c4; background: #fffdf8; color: #4a6b3f; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; }
        .pgbtn:disabled { opacity: 0.4; cursor: default; }
        .pginfo { font-size: 12px; color: #8a8472; white-space: nowrap; }
        .histtable { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .histtable th { text-align: left; font-size: 11px; color: #8a8472; font-weight: 500; padding: 6px 6px; border-bottom: 1px solid #e3ded3; }
        .histtable td { font-size: 12px; padding: 8px 6px; border-bottom: 1px solid #f0ece1; }
        .histtable .subj { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .errdetail { font-size: 10.5px; color: #a4452f; opacity: 0.8; max-width: 220px; line-height: 1.4; margin-top: 2px; }
        .resendbtn { border: 1px solid #d9b3a8; background: #fbeee9; color: #a4452f; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; font-family: inherit; margin-top: 3px; }
        .resendbtn:hover { background: #f6e2da; }
        .resendbtn:disabled { opacity: 0.5; cursor: default; }
        .subj { font-size: 13px; margin: 10px 0 8px; color: #4a4a40; }
        .previewbox { border: 1px solid #e3ded3; border-radius: 10px; overflow: hidden; height: 420px; background: #f3f0e7; margin-top: 10px; }
        .frame { width: 100%; height: 100%; border: none; }
        .sendbar { position: fixed; left: 0; right: 0; bottom: 0; background: #fffdf8; border-top: 1px solid #e3ded3; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
        .summary { font-size: 14px; flex: 1; }
        .rmsel { border: 1px solid #d9b3a8; background: #fbeee9; color: #a4452f; border-radius: 8px; padding: 7px 12px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .rmsel:hover { background: #f6e2da; }
        .rmsel:disabled { opacity: 0.5; cursor: default; }
        .quota { font-size: 12px; color: #5a6b4f; background: #eef0e6; border-radius: 999px; padding: 5px 12px; white-space: nowrap; }
        .quota b { color: #3f6b3f; }
        /* 進行中的群發活動（還有排隊）*/
        .activecamp { background: #fffdf8; border: 1px solid #e8dcae; border-left: 4px solid #b08d3f; border-radius: 12px; padding: 12px 16px; margin-bottom: 14px; }
        .acrow { display: flex; align-items: center; gap: 14px; padding: 6px 0; flex-wrap: wrap; }
        .acrow + .acrow { border-top: 1px dashed #efe6cf; }
        .acinfo { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 4px; }
        .acinfo strong { font-size: 14px; color: #2f3d2f; }
        .actrack { height: 8px; background: #f0ece1; border-radius: 999px; overflow: hidden; max-width: 420px; }
        .acfill { height: 100%; background: linear-gradient(90deg, #d9b45a, #b08d3f); border-radius: 999px; transition: width 300ms; }
        .acact { display: flex; align-items: center; gap: 10px; }
        .btn.small { padding: 8px 14px; font-size: 13px; }
        .achint { margin-top: 6px; }
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
        /* 主旨列 + 放大預覽按鈕 */
        .subj-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
        .subj-row .subj { margin: 0; flex: 1; min-width: 0; }
        /* 全視窗模板預覽 */
        .previewmodal { background: #fffdf8; border-radius: 14px; width: 100%; max-width: 720px; height: 90vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 70px rgba(0,0,0,.3); }
        .pmhead { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #e3ded3; flex-shrink: 0; }
        .pmtitle { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
        .pmtitle strong { font-family: 'Noto Serif TC', serif; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pmclose { border: 1px solid #d9d3c4; background: #fffdf8; color: #6b6b60; width: 34px; height: 34px; border-radius: 9px; cursor: pointer; font-size: 16px; flex-shrink: 0; }
        .pmframe { flex: 1; width: 100%; border: none; background: #f3f0e7; }
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
        /* 國家頁籤 */
        .countrytabs { display: flex; gap: 6px; align-items: center; margin-bottom: 14px; flex-wrap: wrap; }
        .ctab { border: 1px solid #d9d3c4; background: transparent; color: #5a6b4f; border-radius: 8px; padding: 6px 14px; font-size: 13px; cursor: pointer; font-family: inherit; }
        .ctab.active { border-color: #4a6b3f; background: #eef0e6; color: #4a6b3f; font-weight: 700; }
        .ctab-hint { font-size: 11px; color: #b0a892; margin-left: 6px; }
        /* AI 翻譯 */
        .transbtn-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; flex-wrap: wrap; }
        .btn.ghost.small { padding: 6px 12px; font-size: 12px; }
      `}</style>
    </div>
  );
}
