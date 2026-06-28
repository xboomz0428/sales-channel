// 產生 6 產業 × 4 階段 EDM 模板 + 跟進序列的 SQL（不需連線，只輸出 SQL 到 stdout）
// 用法：node scripts/seed_edm.mjs > scripts/seed_edm.sql
const BRAND_GREEN = "#2E4535", ACCENT = "#5A8266", CREAM = "#fffdf8", PAGE = "#f3f0e7";

// 共用 email 版型（與系統寄送風格一致）
function wrap({ heading, intro, bullets = [], cta, ctaNote = "", ps = "" }) {
  const bulletHtml = bullets.length
    ? `<table role="presentation" width="100%" style="margin:14px 0;"><tr><td style="background:#f5f3ee;border-radius:10px;padding:12px 16px;">` +
      bullets.map((b) => `<div style="font-size:14px;color:#3a3a3a;line-height:1.9;">・${b}</div>`).join("") +
      `</td></tr></table>` : "";
  const ctaHtml = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 6px;"><tr><td style="border-radius:999px;background:${BRAND_GREEN};"><a href="{{cta_url}}" style="display:inline-block;padding:13px 30px;color:#fff;text-decoration:none;font-size:15px;font-weight:700;font-family:'Noto Sans TC',sans-serif;">${cta}</a></td></tr></table>${ctaNote ? `<div style="font-size:12px;color:#9a9384;">${ctaNote}</div>` : ""}` : "";
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;background:${PAGE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:${CREAM};border-radius:14px;overflow:hidden;">
<tr><td style="background:${BRAND_GREEN};padding:22px 32px;">
  <div style="font-size:18px;font-weight:800;color:#fff;font-family:'Noto Serif TC',serif;">好漢草 HeroHerb</div>
  <div style="font-size:12px;color:#9DC4A8;margin-top:3px;">漢方良品 · 草本的溫度，暖身也暖心</div>
</td></tr>
<tr><td style="padding:30px 32px;font-family:'Noto Sans TC',sans-serif;">
  <div style="font-size:20px;font-weight:700;color:${BRAND_GREEN};line-height:1.5;font-family:'Noto Serif TC',serif;">${heading}</div>
  <div style="font-size:15px;color:#3a3a3a;line-height:1.85;margin-top:14px;">${intro}</div>
  ${bulletHtml}
  ${ctaHtml}
  ${ps ? `<div style="font-size:13px;color:#6e7a6d;line-height:1.8;margin-top:16px;border-top:1px solid #e7e2d6;padding-top:14px;">${ps}</div>` : ""}
</td></tr>
<tr><td style="padding:16px 32px;background:#faf8f3;border-top:1px solid #ece7db;font-size:11px;color:#9a9384;line-height:1.7;">
  威斯邁國際有限公司 · 好漢草 HeroHerb｜service@wesmilegood.com｜www.heroherb.co<br/>
  若不需再收到此類資訊，請<a href="{{unsubscribe}}" style="color:#9a9384;">點此取消訂閱</a>。
</td></tr>
</table></td></tr></table></body></html>`;
}

// 6 產業設定（pain 痛點 / value 價值 / story 故事 / urgency 急迫 / repurchase 回購 / product 主打）
const INDS = [
  {
    key: "產後護理", label: "月子中心／產後護理之家", product: "足沐湯浴包・好室淨境噴霧・淨身平安皂",
    pain: "產後媽媽手腳冰冷、夜不成眠；月子房需要清新且讓人安心的氛圍",
    value: "睡前一杯漢方足浴，幫媽媽暖身好眠；淨境噴霧讓房間清新——讓「被細心照顧」成為媽媽口碑",
    bullets: ["睡前足浴：舒緩產後痠痛、幫助入睡", "好室淨境噴霧：中和月子房異味、空氣清新", "淨身平安皂：溫和潔淨、無色無味，敏感肌也安心"],
    story: "一家產後護理之家導入睡前足浴儀式後，媽媽反映夜眠變好，Google 評論開始出現「很貼心、很用心」，自然帶來轉介。",
    urgency: "坐月子有明顯的旺季（生育集中月份），首批備足庫存，旺季才不會缺貨、把客人讓給隔壁。",
    repurchase: "依入住房數，足浴包與噴霧用量穩定，建議每月固定補貨，避免旺季斷貨。",
  },
  {
    key: "長照", label: "長照中心／護理之家", product: "足浴包・大風草擦澡包・淨境噴霧",
    pain: "臥床長輩循環差、肢體僵硬；擦澡與環境異味是日常照護痛點",
    value: "漢方足浴與擦澡包，提升長輩舒適度與家屬信任；淨境噴霧改善空間氣味，讓參訪家屬印象加分",
    bullets: ["足浴包：促進循環、舒緩僵硬，長輩好放鬆", "大風草湯浴擦澡包：臥床長輩擦澡也能溫熱舒爽", "淨境噴霧：中和異味，提升參訪家屬觀感"],
    story: "一家護理之家把漢方足浴納入每週活動後，長輩參與度提高、家屬看見『有溫度的照顧』，續住意願與口碑同步上升。",
    urgency: "評鑑與家屬參訪旺季前先導入，能在最關鍵時刻呈現照護品質；首批合作享通路價。",
    repurchase: "依床位數量，擦澡包與足浴包為穩定耗材，建議設定月補貨提醒，照護不中斷。",
  },
  {
    key: "養生足療", label: "養生館／足底按摩／足浴", product: "足沐湯浴包（勇/眠/輕/暖）・感溫摺疊足浴袋",
    pain: "服務同質化、客單價難拉高、回客率卡關",
    value: "用漢方足浴做差異化加值，提高客單與停留時間；分證型（痠痛/助眠/循環）讓師傅好推薦",
    bullets: ["足好勇 PLUS：勞動／運動後痠痛舒緩", "足好眠 PLUS：晚上不好入睡的客人", "足好輕 PLUS：外食多、循環不佳", "感溫摺疊足浴袋：長效保溫、好收納"],
    story: "一家養生館把足浴包做成 NT$150 的加價服務，客人停留多 15 分鐘、客單提升，師傅依證型推薦也更專業，月增營收。",
    urgency: "換季是足浴需求高峰，先鋪貨＋培訓話術，旺季才能立刻變現；本月首批進貨享通路專案。",
    repurchase: "依來客量，足浴包是高頻耗材，建議依用量設定回購週期，旺季前加量。",
  },
  {
    key: "越式洗髮", label: "越式洗髮", product: "好室淨境噴霧・足沐湯浴包",
    pain: "等待時間客人無聊、店內香氛與體驗差異化不足",
    value: "用香氛噴霧營造記憶點、用泡腳填滿等待時間，提升體驗與好評、創造加價空間",
    bullets: ["好室淨境噴霧：打造店內專屬香氛記憶點", "足沐湯浴包：洗髮等待時加值泡腳，體驗升級", "差異化體驗：讓客人想拍照、想再來"],
    story: "一家越式洗髮在等待區加入泡腳服務、店內用淨境噴霧，客人主動打卡分享，Google 評論變多，回客明顯提升。",
    urgency: "體驗升級越早做越快累積口碑；本月合作享首批通路價＋香氛試用組。",
    repurchase: "噴霧與足浴包依門市人流穩定消耗，建議月補貨，維持一致體驗。",
  },
  {
    key: "禮儀公司", label: "禮儀公司／生命禮儀", product: "艾草淨身平安包・淨身平安皂・淨境噴霧",
    pain: "場所淨化、家屬關懷與儀式質感的細節需求",
    value: "以漢方艾草做淨化儀式與家屬關懷，提升服務的莊重與溫度、形塑專業口碑",
    bullets: ["艾草淨身平安包：淨化、安定的儀式用途", "淨身平安皂：溫和潔淨、莊重得宜", "好室淨境噴霧：場所空間清新淨化"],
    story: "一家禮儀公司在服務流程加入艾草淨化與家屬關懷小物，家屬感受到細膩與尊重，轉介與好評隨之而來。",
    urgency: "節氣與民俗旺季前先備妥淨化用品，關鍵時刻不缺貨；首批合作享通路價。",
    repurchase: "淨化用品為穩定耗材，建議依場次量設定月補貨。",
  },
  {
    key: "宮廟", label: "宮廟／公廟", product: "艾草淨身平安包（媽祖/虎爺）・平安皂・淨境噴霧（艾草祈安/沉木祈定）",
    pain: "結緣品同質化、香火旺季備貨與淨化儀式需求",
    value: "艾草祈安系列做結緣品與淨化，提升信眾體驗與廟方形象；分媽祖/虎爺更貼合信仰情境",
    bullets: ["艾草淨身平安包（媽祖／虎爺）：淨化、節慶、結緣", "淨身平安皂：信眾結緣好攜帶", "淨境噴霧（艾草祈安／沉木祈定）：殿內空間淨化"],
    story: "一間宮廟把艾草平安包做成結緣品，信眾反應熱烈、初一十五補貨頻繁，廟方形象與香油收入同步提升。",
    urgency: "初一十五、節慶、進香旺季前先備足結緣品，避免熱門時段缺貨；首批結緣享通路價。",
    repurchase: "結緣品依香火旺季波動，建議節慶前加量、平時月補貨。",
  },
];

const stages = (ind) => [
  {
    no: "①", stage: "初次問候", focus: "破冰",
    subject: `給「${ind.label}」的一份實用小禮：${ind.product.split("・")[0]}的應用`,
    heading: `${ind.label}，您好`,
    intro: `我是好漢草的承辦〔報價業務〕。這封信不為推銷，而是想先送您一份《${ind.label}・漢方草本應用指南》——${ind.value}。`,
    bullets: ind.bullets,
    cta: "免費索取應用指南", ctaNote: "零承諾，純分享。回信或點按即可。",
    ps: `草本的溫度，暖身也暖心。我相信也能溫暖您與服務對象之間的關係。`,
  },
  {
    no: "②", stage: "實證故事", focus: "互動",
    subject: `他們這樣做，口碑就起來了——${ind.label}的一個小改變`,
    heading: `一個真實的小改變`,
    intro: ind.story,
    bullets: ["導入前：服務同質、回客率卡關", "導入後：體驗升級、好評變多、自然轉介"],
    cta: "預約 15 分鐘，看適不適合您", ctaNote: "只聊您的情況，不強迫合作。",
    ps: `如果這個方向您有興趣，我可以先寄一份體驗包到您的場所，讓您和服務對象先試用。`,
  },
  {
    no: "③", stage: "限時通路專案", focus: "成交",
    subject: `本月通路專案：首批進貨優惠，只到月底`,
    heading: `${ind.label}通路專案 · 限時`,
    intro: `${ind.urgency}　本月與好漢草首批合作，享<strong>通路專案價＋門市陳列物料</strong>，名額有限。`,
    bullets: ["首批進貨享通路專案價", "附門市／場所陳列與介紹話術", "獨家品項優先供應"],
    cta: "立即索取通路報價", ctaNote: "報價有效至本月底，晚一步等於把旺季讓給同業。",
    ps: `回信告訴我您的場所規模，我直接幫您試算最划算的首批組合。`,
  },
  {
    no: "④", stage: "回購關懷", focus: "維護",
    subject: `這週是補貨好時機——別等缺貨才補`,
    heading: `${ind.label}・補貨提醒`,
    intro: `感謝您採用好漢草。${ind.repurchase}`,
    bullets: ["依用量預估，本週為補貨好時機", "旺季前加量，避免熱門時段斷貨", "需要可一併更新陳列素材"],
    cta: "一鍵補貨同品項", ctaNote: "也可回信告訴我這期用量，我幫您調整建議量。",
    ps: `若客人有新的回饋，也歡迎讓我知道，我們可以一起把服務做得更好。`,
  },
];

const esc = (s) => s.replace(/'/g, "''");
const lines = [];
lines.push("-- 自動產生：6 產業 × 4 階段 EDM 模板 + 跟進序列（跟進序列預設停用，審閱後再啟用）");
lines.push("begin;");

for (const ind of INDS) {
  for (const st of stages(ind)) {
    const name = `【${ind.key}】${st.no} ${st.stage}`;
    const html = wrap({ heading: st.heading, intro: st.intro, bullets: st.bullets, cta: st.cta, ctaNote: st.ctaNote, ps: st.ps });
    const bodyText = `${st.heading}\n\n${st.intro.replace(/<[^>]+>/g, "")}\n\n${st.bullets.map((b) => "・" + b).join("\n")}\n\n${st.cta}`;
    lines.push(
      `insert into outreach_templates (name, channel, industry, product_focus, subject, body, body_html, is_active) values (` +
      `'${esc(name)}','EM','${esc(ind.label)}','${esc(ind.product)}','${esc(st.subject)}','${esc(bodyText)}','${esc(html)}',true) ` +
      `on conflict do nothing;`
    );
  }
}

// 跟進序列（A→B、B→C），預設停用
for (const ind of INDS) {
  const t = (no) => `(select id from outreach_templates where name='【${ind.key}】${no}' order by created_at desc limit 1)`;
  lines.push(`insert into followup_rules (name, trigger_template_id, followup_template_id, days_after, condition, active) values ('【${ind.key}】跟進 ①→②', ${t("① 初次問候")}, ${t("② 實證故事")}, 3, 'no_open', false);`);
  lines.push(`insert into followup_rules (name, trigger_template_id, followup_template_id, days_after, condition, active) values ('【${ind.key}】跟進 ②→③', ${t("② 實證故事")}, ${t("③ 限時通路專案")}, 4, 'no_open', false);`);
}

lines.push("commit;");
process.stdout.write(lines.join("\n") + "\n");
