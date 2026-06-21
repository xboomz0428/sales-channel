'use client';

import { useMemo, useState } from 'react';

type BlockType = 'heading' | 'text' | 'image' | 'button' | 'divider' | 'spacer';
interface Block {
  id: string;
  type: BlockType;
  text?: string;
  url?: string; // image src / button link
  alt?: string;
}

const uid = () => Math.random().toString(36).slice(2, 9);

const STARTER: Block[] = [
  { id: uid(), type: 'heading', text: 'HeroHerb 好漢草' },
  { id: uid(), type: 'text', text: '您好,這是一封來自好漢草的問候。' },
  { id: uid(), type: 'button', text: '看看我們的產品', url: 'https://heroherb.co' },
];

interface Preset { name: string; subject: string; blocks: Block[] }
const PRESETS: Preset[] = [
  {
    name: '初次開發',
    subject: '{{品牌名}} 您好——來自好漢草的合作邀請',
    blocks: [
      { id: uid(), type: 'heading', text: '您好，我是好漢草的業務夥伴' },
      { id: uid(), type: 'text', text: '注意到貴公司在市場上的用心經營，想與您分享我們的天然草本產品線。\n\n好漢草專注台灣在地草本原料，從產地到成品一條龍管理，品質穩定、交期準確。我們已服務超過 200 家通路，涵蓋養生館、禮儀業、宮廟、長照機構等。' },
      { id: uid(), type: 'text', text: '如果您有興趣了解，我們很樂意寄送免費樣品供您體驗。\n不知道方便的聯繫方式是？期待有機會合作。' },
      { id: uid(), type: 'button', text: '瀏覽產品目錄', url: 'https://heroherb.co/products' },
      { id: uid(), type: 'text', text: '好漢草 HeroHerb\n業務團隊 敬上' },
    ],
  },
  {
    name: '二次跟進',
    subject: '再次問候——好漢草樣品寄送確認',
    blocks: [
      { id: uid(), type: 'heading', text: '您好，前次的信不知道有沒有收到？' },
      { id: uid(), type: 'text', text: '上週我寄了一封關於好漢草草本產品合作的信，不確定是否被淹沒在信箱中。\n\n簡單重提：我們提供天然艾草淨化包、草本足浴包、空間噴霧等產品，適合作為貴公司的加值服務或轉售商品。' },
      { id: uid(), type: 'text', text: '若方便，回覆這封信告訴我寄送地址，我會安排樣品給您體驗。\n若目前沒有需求也沒關係，感謝您的時間！' },
      { id: uid(), type: 'button', text: '了解更多', url: 'https://heroherb.co' },
    ],
  },
  {
    name: '產品介紹',
    subject: '好漢草產品系列——天然草本，安心使用',
    blocks: [
      { id: uid(), type: 'heading', text: '好漢草產品系列' },
      { id: uid(), type: 'text', text: '我們的核心產品線涵蓋三大類：' },
      { id: uid(), type: 'text', text: '🌿 艾草淨化包\n台灣製造、PLA 環保包裝，適合禮廳、宮廟、居家使用。\n\n🦶 草本足浴包\n多種配方（薑黃暖身、艾草放鬆、薄荷清涼），養生館最愛。\n\n🌸 空間噴霧\n天然精油基底，不刺鼻、不殘留，提升空間質感。' },
      { id: uid(), type: 'button', text: '索取樣品', url: 'https://heroherb.co/sample' },
      { id: uid(), type: 'divider' },
      { id: uid(), type: 'text', text: '所有產品皆通過 SGS 檢驗，符合食品安全衛生管理法規範。' },
    ],
  },
  {
    name: '產品提案',
    subject: '為 {{品牌名}} 量身打造的草本方案',
    blocks: [
      { id: uid(), type: 'heading', text: '專屬合作提案' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n根據貴公司的產業特性與客群，我為您規劃了以下合作方案：' },
      { id: uid(), type: 'text', text: '📋 方案內容\n・推薦產品：（依產業填入）\n・建議零售價 / 通路價：（填入）\n・最低起訂量：50 組\n・交期：下單後 7-10 個工作天' },
      { id: uid(), type: 'text', text: '💡 合作優勢\n・首批訂購享 85 折\n・免費提供展示架與 POP 文宣\n・定期補貨，免囤貨壓力' },
      { id: uid(), type: 'button', text: '查看完整提案', url: 'https://heroherb.co/proposal' },
      { id: uid(), type: 'text', text: '期待與您進一步討論，祝商祺！' },
    ],
  },
  {
    name: '合作討論',
    subject: '關於合作細節的討論',
    blocks: [
      { id: uid(), type: 'heading', text: '合作細節討論' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n感謝您對好漢草產品的興趣！根據我們先前的交流，整理以下幾點供您確認：' },
      { id: uid(), type: 'text', text: '1. 產品規格：（待確認）\n2. 數量與交期：（待確認）\n3. 付款方式：月結 30 天 / 貨到付款\n4. 物流配送：全台宅配，滿 5,000 免運' },
      { id: uid(), type: 'text', text: '如有任何調整或其他需求，歡迎直接回覆此信。\n方便的話，是否能安排一通電話詳談？' },
      { id: uid(), type: 'button', text: '預約通話時段', url: 'https://calendly.com/heroherb' },
    ],
  },
  {
    name: '節慶問候',
    subject: '{{節慶名}} 快樂！好漢草祝福您',
    blocks: [
      { id: uid(), type: 'heading', text: '{{節慶名}} 快樂 🎉' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n值此佳節，好漢草團隊衷心祝福您與團隊身體健康、事業興旺！' },
      { id: uid(), type: 'text', text: '趁這個時節，提供一個好消息：\n\n🎁 節慶限定優惠\n・全品項 9 折（至月底）\n・滿 10,000 加贈精選禮盒一組\n・客製化節慶包裝免費升級' },
      { id: uid(), type: 'button', text: '查看節慶優惠', url: 'https://heroherb.co/festival' },
      { id: uid(), type: 'divider' },
      { id: uid(), type: 'text', text: '好漢草 HeroHerb 敬賀' },
    ],
  },
  {
    name: '報價單',
    subject: '好漢草報價單——{{品牌名}}',
    blocks: [
      { id: uid(), type: 'heading', text: '報價單' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n以下是您詢問的產品報價：' },
      { id: uid(), type: 'text', text: '┌─────────────────────────────┐\n│ 品名　　　　│ 規格　│ 單價　│ 數量 │\n├─────────────────────────────┤\n│ 艾草淨化包　│ 30入　│ $XXX　│ 　　 │\n│ 草本足浴包　│ 20入　│ $XXX　│ 　　 │\n│ 空間噴霧　　│ 250ml │ $XXX　│ 　　 │\n└─────────────────────────────┘' },
      { id: uid(), type: 'text', text: '📌 報價有效期：30 天\n📌 付款條件：月結 30 天\n📌 運費：滿 5,000 免運\n📌 交期：確認後 7-10 個工作天' },
      { id: uid(), type: 'text', text: '如需調整品項或數量，請直接回覆此信。\n確認後我會寄送正式訂購單。' },
      { id: uid(), type: 'button', text: '線上確認訂單', url: 'https://heroherb.co/order' },
    ],
  },
  {
    name: '收款通知',
    subject: '好漢草——應收帳款提醒',
    blocks: [
      { id: uid(), type: 'heading', text: '帳款提醒' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n依據我們的合作記錄，以下帳款已到期或即將到期，煩請安排付款：' },
      { id: uid(), type: 'text', text: '📄 帳款明細\n・訂單編號：（填入）\n・出貨日期：（填入）\n・應付金額：NT$ （填入）\n・付款期限：（填入）' },
      { id: uid(), type: 'text', text: '匯款資訊：\n銀行：（填入）\n戶名：好漢草有限公司\n帳號：（填入）\n\n匯款後煩請回覆告知末五碼，以便對帳。感謝您！' },
      { id: uid(), type: 'button', text: '查看帳單明細', url: 'https://heroherb.co/invoice' },
    ],
  },
  {
    name: '樣品寄送通知',
    subject: '您的好漢草樣品已出貨！',
    blocks: [
      { id: uid(), type: 'heading', text: '樣品已為您出貨 📦' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n感謝您的興趣！您的免費體驗樣品已於今日出貨，預計 1-2 個工作天送達。' },
      { id: uid(), type: 'text', text: '📦 寄送內容\n・（樣品品項 1）\n・（樣品品項 2）\n・產品目錄 & 價目表' },
      { id: uid(), type: 'text', text: '收到後歡迎與我分享使用心得，我們可以進一步討論適合貴公司的合作方案。' },
      { id: uid(), type: 'button', text: '瀏覽完整產品線', url: 'https://heroherb.co/products' },
    ],
  },
  {
    name: '感謝成交',
    subject: '感謝合作！好漢草歡迎您',
    blocks: [
      { id: uid(), type: 'heading', text: '感謝您的信任 🤝' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n非常感謝您選擇好漢草作為合作夥伴！您的首批訂單已確認，我們會全力確保品質與交期。' },
      { id: uid(), type: 'text', text: '✅ 後續服務\n・專屬業務窗口，隨時為您服務\n・定期新品試用與市場情報分享\n・行銷素材支援（產品照片、文案）\n・季度回顧與銷售建議' },
      { id: uid(), type: 'text', text: '有任何問題，隨時聯繫我。期待長期合作！' },
      { id: uid(), type: 'button', text: '加入 LINE 聯繫', url: 'https://line.me/R/ti/p/@heroherb' },
    ],
  },
  {
    name: '客戶回訪',
    subject: '好久不見！好漢草近期有新品上市',
    blocks: [
      { id: uid(), type: 'heading', text: '好久不見 👋' },
      { id: uid(), type: 'text', text: '{{品牌名}} 您好，\n\n好一陣子沒有聯繫了，想關心一下之前供貨的產品銷售狀況如何？\n\n順便跟您分享，我們最近推出了幾款新品，可能適合貴公司：' },
      { id: uid(), type: 'text', text: '🆕 新品推薦\n・（新品 1）——簡述\n・（新品 2）——簡述\n\n現有客戶首批訂購享優惠價，歡迎回覆索取樣品。' },
      { id: uid(), type: 'button', text: '查看新品', url: 'https://heroherb.co/new' },
    ],
  },
];

// ── 產生 email-safe HTML(table 版面 + inline 樣式)──────────────
function renderEmailHtml(blocks: Block[], subject: string): string {
  const esc = (s = '') =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const rows = blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
          return `<tr><td style="padding:8px 0;font-family:'Noto Serif TC',serif;font-size:24px;font-weight:700;color:#2f3d2f;">${esc(b.text)}</td></tr>`;
        case 'text':
          return `<tr><td style="padding:8px 0;font-family:'Noto Sans TC',sans-serif;font-size:15px;line-height:1.7;color:#3a3a3a;">${esc(b.text).replace(/\n/g, '<br/>')}</td></tr>`;
        case 'image':
          return b.url
            ? `<tr><td style="padding:10px 0;"><img src="${esc(b.url)}" alt="${esc(b.alt)}" style="width:100%;max-width:600px;border-radius:8px;display:block;"/></td></tr>`
            : '';
        case 'button':
          return `<tr><td style="padding:14px 0;"><a href="${esc(b.url) || '#'}" style="display:inline-block;background:#4a6b3f;color:#fff;text-decoration:none;padding:12px 26px;border-radius:999px;font-family:'Noto Sans TC',sans-serif;font-size:15px;">${esc(b.text)}</a></td></tr>`;
        case 'divider':
          return `<tr><td style="padding:10px 0;"><hr style="border:none;border-top:1px solid #e3ded3;"/></td></tr>`;
        case 'spacer':
          return `<tr><td style="height:24px;"></td></tr>`;
        default:
          return '';
      }
    })
    .join('');

  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f3f0e7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0e7;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#fffdf8;border-radius:14px;padding:32px;">
${rows}
<tr><td style="padding-top:20px;font-family:'Noto Sans TC',sans-serif;font-size:11px;color:#9a9384;">HeroHerb 好漢草 · 若不想再收到信件,請<a href="{{unsubscribe}}" style="color:#9a9384;">點此退訂</a></td></tr>
</table>
</td></tr></table></body></html>`;
}

const BLOCK_LABEL: Record<BlockType, string> = {
  heading: '標題',
  text: '內文',
  image: '圖片',
  button: '按鈕',
  divider: '分隔線',
  spacer: '間距',
};

export default function EmailEditorPage() {
  const [subject, setSubject] = useState('來自好漢草的問候');
  const [name, setName] = useState('電子報母版');
  const [blocks, setBlocks] = useState<Block[]>(STARTER);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const html = useMemo(() => renderEmailHtml(blocks, subject), [blocks, subject]);

  // 套用預設樣板：複製 blocks 並重新產生 id，避免共用參照
  const loadPreset = (p: Preset) => {
    setSubject(p.subject);
    setName(`${p.name}範本`);
    setBlocks(p.blocks.map((b) => ({ ...b, id: uid() })));
    setMsg(`已套用「${p.name}」樣板`);
  };

  const add = (type: BlockType) =>
    setBlocks((b) => [...b, { id: uid(), type, text: type === 'button' ? '按我' : '', url: '' }]);
  const update = (id: string, patch: Partial<Block>) =>
    setBlocks((b) => b.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setBlocks((b) => b.filter((x) => x.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setBlocks((b) => {
      const i = b.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= b.length) return b;
      const next = [...b];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function saveTemplate() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/outreach/templates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          channel: 'EM',
          subject,
          body: blocks.map((b) => b.text).filter(Boolean).join('\n') || '(圖文電子報)',
          bodyHtml: html,
        }),
      });
      const data = await res.json();
      setMsg(res.ok ? '✓ 已存成模板' : `✗ ${data.error || '存檔失敗'}`);
    } catch {
      setMsg('✗ 連線失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="wrap">
      <header className="bar">
        <div>
          <h1>電子報編輯器</h1>
          <p>圖文拖放排版 · 即時預覽 · 存成可寄送的 HTML 模板</p>
        </div>
        <div className="actions">
          <input className="in name" value={name} onChange={(e) => setName(e.target.value)} placeholder="模板名稱" />
          <button className="btn ghost" onClick={() => navigator.clipboard.writeText(html)}>
            匯出 HTML
          </button>
          <button className="btn solid" onClick={saveTemplate} disabled={saving}>
            {saving ? '儲存中…' : '存成模板'}
          </button>
        </div>
      </header>
      {msg && <div className="toast">{msg}</div>}

      <div className="presets">
        <span className="plabel-inline">範本：</span>
        {PRESETS.map((p) => (
          <button key={p.name} className="preset" onClick={() => loadPreset(p)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="grid">
        {/* 編輯欄 */}
        <section className="panel">
          <label className="field">
            <span>主旨</span>
            <input className="in" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>

          <div className="adders">
            {(Object.keys(BLOCK_LABEL) as BlockType[]).map((t) => (
              <button key={t} className="chip" onClick={() => add(t)}>
                ＋{BLOCK_LABEL[t]}
              </button>
            ))}
          </div>

          <div className="blocks">
            {blocks.map((b, i) => (
              <div key={b.id} className="block">
                <div className="bhead">
                  <span className="tag">{BLOCK_LABEL[b.type]}</span>
                  <div className="bctl">
                    <button onClick={() => move(b.id, -1)} disabled={i === 0}>↑</button>
                    <button onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1}>↓</button>
                    <button className="del" onClick={() => remove(b.id)}>✕</button>
                  </div>
                </div>
                {(b.type === 'heading' || b.type === 'text' || b.type === 'button') && (
                  <textarea
                    className="in ta"
                    rows={b.type === 'text' ? 3 : 1}
                    value={b.text}
                    placeholder={b.type === 'button' ? '按鈕文字' : '輸入文字'}
                    onChange={(e) => update(b.id, { text: e.target.value })}
                  />
                )}
                {(b.type === 'button' || b.type === 'image') && (
                  <input
                    className="in"
                    value={b.url}
                    placeholder={b.type === 'image' ? '圖片網址 https://…' : '連結網址 https://…(會被追蹤)'}
                    onChange={(e) => update(b.id, { url: e.target.value })}
                  />
                )}
                {b.type === 'image' && (
                  <input
                    className="in"
                    value={b.alt}
                    placeholder="圖片替代文字(alt)"
                    onChange={(e) => update(b.id, { alt: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 預覽欄 */}
        <section className="preview">
          <div className="plabel">即時預覽</div>
          <iframe title="preview" srcDoc={html} className="frame" />
        </section>
      </div>

      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@600;700&display=swap');
        .wrap {
          font-family: 'Noto Sans TC', sans-serif;
          color: #2f3d2f;
          background: #f3f0e7;
          min-height: 100vh;
          padding: 20px;
        }
        .bar {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 16px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        h1 {
          font-family: 'Noto Serif TC', serif;
          font-size: 24px;
          margin: 0;
        }
        .bar p {
          margin: 4px 0 0;
          font-size: 12px;
          color: #8a8472;
        }
        .actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .btn {
          border: none;
          border-radius: 999px;
          padding: 9px 18px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
        }
        .btn.solid {
          background: #4a6b3f;
          color: #fff;
        }
        .btn.solid:disabled {
          opacity: 0.5;
        }
        .btn.ghost {
          background: #fffdf8;
          border: 1px solid #d9d3c4;
          color: #4a6b3f;
        }
        .toast {
          background: #2f3d2f;
          color: #fff;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          margin-bottom: 12px;
          width: fit-content;
        }
        .presets {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          align-items: center;
          margin-bottom: 16px;
          background: #fffdf8;
          border: 1px solid #e3ded3;
          border-radius: 12px;
          padding: 12px 14px;
        }
        .plabel-inline {
          font-size: 12px;
          color: #8a8472;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .preset {
          border: 1px solid #cdd6bf;
          background: #f4f6ee;
          color: #4a6b3f;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 13px;
          cursor: pointer;
          font-family: inherit;
          transition: all 120ms;
        }
        .preset:hover {
          background: #4a6b3f;
          color: #fff;
          border-color: #4a6b3f;
        }
        .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 18px;
        }
        @media (max-width: 860px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
        .panel,
        .preview {
          background: #fffdf8;
          border: 1px solid #e3ded3;
          border-radius: 14px;
          padding: 18px;
        }
        .field {
          display: block;
          margin-bottom: 14px;
        }
        .field span {
          font-size: 12px;
          color: #8a8472;
          display: block;
          margin-bottom: 5px;
        }
        .in {
          width: 100%;
          border: 1px solid #d9d3c4;
          border-radius: 8px;
          padding: 9px 11px;
          font-size: 14px;
          font-family: inherit;
          background: #fff;
          box-sizing: border-box;
        }
        .in:focus {
          outline: 2px solid #b9c9ad;
          border-color: transparent;
        }
        .name {
          width: 150px;
        }
        .ta {
          resize: vertical;
          margin-bottom: 6px;
        }
        .adders {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-bottom: 14px;
        }
        .chip {
          border: 1px dashed #b9b29e;
          background: transparent;
          color: #5a6b4f;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
        }
        .chip:hover {
          background: #eef0e6;
        }
        .blocks {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .block {
          border: 1px solid #e3ded3;
          border-radius: 10px;
          padding: 11px;
          background: #fcfbf5;
        }
        .bhead {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .tag {
          font-size: 11px;
          background: #eef0e6;
          color: #5a6b4f;
          padding: 3px 9px;
          border-radius: 999px;
        }
        .bctl button {
          border: none;
          background: #eee9dc;
          border-radius: 6px;
          width: 26px;
          height: 26px;
          margin-left: 4px;
          cursor: pointer;
          font-size: 13px;
        }
        .bctl button:disabled {
          opacity: 0.35;
        }
        .bctl .del {
          background: #f0dcd6;
          color: #a4452f;
        }
        .preview {
          padding: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .plabel {
          font-size: 12px;
          color: #8a8472;
          padding: 10px 14px;
          border-bottom: 1px solid #e3ded3;
        }
        .frame {
          width: 100%;
          height: 640px;
          border: none;
          background: #f3f0e7;
        }
      `}</style>
    </div>
  );
}
