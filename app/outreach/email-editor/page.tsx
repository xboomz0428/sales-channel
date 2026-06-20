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
