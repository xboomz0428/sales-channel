// node --test tests/followup-core.test.mjs
// 直接 import TS（Node 22.18+ 內建 type stripping）。
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  followupCutoffIso,
  selectFollowupTargets,
  planFollowups,
  enqueueFollowupPlan,
  MAX_ENQUEUE_PER_RULE,
} from "../lib/outreach/followupCore.ts";

// ── 測試資料：形狀對齊正式 outreach_messages / followup_rules 欄位 ──
const EDM1 = "a1b2c3d4-0000-4000-8000-000000001111"; // 觸發模板（2026_1111_EDM_1）
const EDM2 = "a1b2c3d4-0000-4000-8000-000000002222"; // 跟進模板（2026_1111_EDM_2）
const RULE_ID = "f0f0f0f0-0000-4000-8000-00000000aaaa";

const uuid = (prefix, i) => `${prefix}-0000-4000-8000-${String(i).padStart(12, "0")}`;

function makeRule(over = {}) {
  return {
    id: RULE_ID,
    name: "2026_1111活動_EDM 3封信漏斗",
    trigger_template_id: EDM1,
    followup_template_id: EDM2,
    days_after: 4,
    condition: "always",
    active: true,
    created_at: "2026-11-06T02:00:00.000Z",
    flow_id: null,
    ...over,
  };
}

/** n 封原始信，sent_at 自 2026-11-06T01:17:45Z 起每秒一封（同一天寄出） */
function makeOrigins(n, over = () => ({})) {
  const base = Date.parse("2026-11-06T01:17:45Z");
  return Array.from({ length: n }, (_, i) => ({
    id: uuid("0e1e2e3e", i),
    brand_id: uuid("b0b0b0b0", i),
    to_email: `buyer${i}@example.com`,
    open_count: 0,
    status: "sent",
    sent_at: new Date(base + i * 1000).toISOString(),
    template_id: EDM1,
    channel: "EM",
    direction: "out",
    ...over(i),
  }));
}

// ── 1. cutoff：台灣日曆日語意 ─────────────────────────────
test("cutoff：now=11/10 08:00(台灣)、days=4 → 台灣 11/7 00:00", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const cutoff = followupCutoffIso(now, 4);
  assert.equal(cutoff, "2026-11-06T16:00:00.000Z");
  assert.ok("2026-11-06T01:17:45.000Z" < cutoff, "台灣 11/6 09:17 寄出 → 11/10 應符合");
  assert.ok(!("2026-11-06T16:30:00.000Z" < cutoff), "台灣 11/7 00:30 寄出 → 11/10 不應符合");
});

test("舊算法對照：now − 4×24h 下，台灣 11/6 09:17 那封在 11/10 早上 8 點不符合", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const oldCutoff = new Date(now.getTime() - 4 * 86400_000).toISOString(); // 舊 route.ts 邏輯（.lte）
  assert.equal(oldCutoff, "2026-11-06T00:00:00.000Z");
  const sentAt = "2026-11-06T01:17:45.000Z";
  assert.equal(sentAt <= oldCutoff, false, "舊算法：不符合（要等到第 5 天）");
  assert.equal(sentAt < followupCutoffIso(now, 4), true, "新算法：符合");
});

test("cutoff：days_after 為 0 / null / 負數 / 非數字時當作 3", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const three = followupCutoffIso(now, 3);
  assert.equal(three, "2026-11-07T16:00:00.000Z");
  for (const d of [0, null, -2, undefined, "abc", Number.NaN]) assert.equal(followupCutoffIso(now, d), three);
});

test("cutoff：台灣午夜前後 UTC 換日邊界", () => {
  // 台灣 11/10 23:59 = UTC 11/10 15:59 → 今日仍是 11/10
  assert.equal(followupCutoffIso(new Date("2026-11-10T15:59:00Z"), 1), "2026-11-09T16:00:00.000Z");
  // 台灣 11/11 00:01 = UTC 11/10 16:01 → 今日變 11/11
  assert.equal(followupCutoffIso(new Date("2026-11-10T16:01:00Z"), 1), "2026-11-10T16:00:00.000Z");
});

// ── 2. 794 筆、前 200 筆已跟進 ────────────────────────────
/** 舊 route.ts 的選取邏輯：先 .limit(200)（DB 回傳順序），再排除已跟進 */
function oldSelect(rule, allOrigins, followedSet) {
  const origins = allOrigins.slice(0, 200);
  const out = [];
  for (const o of origins) {
    if (followedSet.has(o.id)) continue;
    if (rule.condition === "no_open" && (o.open_count || 0) > 0) continue;
    if (rule.condition === "no_reply" && o.status === "replied") continue;
    if (!o.to_email) continue;
    out.push(o);
  }
  return out;
}

test("794 筆原始信、前 200 筆已跟進 → 新邏輯選出 594；舊邏輯（先 limit 200）選出 0", () => {
  const rule = makeRule();
  const origins = makeOrigins(794);
  const followed = new Set(origins.slice(0, 200).map((o) => o.id));
  const picked = selectFollowupTargets(rule, origins, followed);
  assert.equal(picked.length, 594);
  assert.deepEqual(Object.keys(picked[0]).sort(), ["brand_id", "id", "to_email"]);
  assert.equal(picked[0].id, origins[200].id);
  assert.equal(oldSelect(rule, origins, followed).length, 0, "舊邏輯：其餘 594 人永遠輪不到");
});

// ── 3. 條件 ──────────────────────────────────────────────
test("no_open 排除 open_count>0；always 不排除；無 to_email 排除；no_reply 排除 replied", () => {
  const origins = makeOrigins(6, (i) => ({
    open_count: i === 1 ? 3 : i === 2 ? null : 0,
    to_email: i === 3 ? null : i === 4 ? "" : `buyer${i}@example.com`,
    status: i === 5 ? "replied" : "sent",
  }));
  const ids = (arr) => arr.map((o) => o.id);
  const none = new Set();
  assert.deepEqual(ids(selectFollowupTargets(makeRule({ condition: "no_open" }), origins, none)),
    ids([origins[0], origins[2], origins[5]]));
  assert.deepEqual(ids(selectFollowupTargets(makeRule({ condition: "always" }), origins, none)),
    ids([origins[0], origins[1], origins[2], origins[5]]));
  assert.deepEqual(ids(selectFollowupTargets(makeRule({ condition: "no_reply" }), origins, none)),
    ids([origins[0], origins[1], origins[2]]));
});

// ── 4. 假 supabase-js client ─────────────────────────────
function makeDb({ tables, failSelect, failUpsertCall, existingFollowups = [] } = {}) {
  const calls = { selects: [], inserts: [], upserts: [], updates: [], deletes: [] };
  let upsertCount = 0;
  let batchSeq = 0;
  const existingKeys = new Set(existingFollowups.map((m) => `${m.followup_rule_id}|${m.parent_message_id}`));

  function exec(q) {
    if (q.op === "select") {
      calls.selects.push(q);
      if (failSelect && failSelect(q)) return { data: null, error: { message: "canceling statement due to statement timeout" } };
      let rows = (tables[q.table] || []).filter((r) => q.filters.every(([k, op, v]) =>
        op === "eq" ? r[k] === v : op === "lt" ? r[k] != null && r[k] < v : true));
      for (const [col, asc] of [...q.orders].reverse()) {
        rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (q.range) rows = rows.slice(q.range[0], Math.min(q.range[1] + 1, q.range[0] + 1000)); // PostgREST 上限 1000
      const pick = (r) => Object.fromEntries(q.columns === "*" ? Object.entries(r) : q.columns.split(",").map((c) => c.trim()).map((c) => [c, r[c]]));
      rows = rows.map(pick);
      if (q.single === "maybe") return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }
    if (q.op === "insert") {
      calls.inserts.push(q);
      const id = `batch-${++batchSeq}`;
      return { data: q.single ? { id } : [{ id }], error: null };
    }
    if (q.op === "upsert") {
      upsertCount++;
      calls.upserts.push({ ...q, n: upsertCount });
      if (failUpsertCall === upsertCount) return { data: null, error: { message: "Payload too large" } };
      const out = [];
      for (const r of q.payload) {
        const key = `${r.followup_rule_id}|${r.parent_message_id}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        out.push({ id: `msg-${existingKeys.size}` });
      }
      return { data: out, error: null };
    }
    if (q.op === "update") { calls.updates.push(q); return { data: null, error: null }; }
    if (q.op === "delete") { calls.deletes.push(q); return { data: null, error: null }; }
    throw new Error("unsupported op " + q.op);
  }

  function builder(table) {
    const q = { table, op: null, columns: null, filters: [], orders: [], range: null, payload: null, opts: null, single: null };
    const b = {
      select(cols) { if (!q.op) { q.op = "select"; } q.columns = cols ?? "*"; return b; },
      insert(p) { q.op = "insert"; q.payload = p; return b; },
      upsert(p, opts) { q.op = "upsert"; q.payload = p; q.opts = opts; return b; },
      update(p) { q.op = "update"; q.payload = p; return b; },
      delete() { q.op = "delete"; return b; },
      eq(k, v) { q.filters.push([k, "eq", v]); return b; },
      lt(k, v) { q.filters.push([k, "lt", v]); return b; },
      order(col, o) { q.orders.push([col, o?.ascending !== false]); return b; },
      range(a, z) { q.range = [a, z]; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      single() { q.single = "one"; return b; },
      then(res, rej) { try { return Promise.resolve(exec(q)).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } },
    };
    return b;
  }
  return { db: { from: builder }, calls };
}

const TEMPLATES = [{ id: EDM2, name: "2026_1111_EDM_2", subject: "雙 11 第二封", body: "純文字", body_html: "<html>" + "x".repeat(100) + "</html>" }];
const NOW = new Date("2026-11-10T00:05:00Z");

test("planFollowups：分頁讀完 1500 筆原始信與 1200 筆已跟進（超過 1000 上限）", async () => {
  const rule = makeRule();
  const origins = makeOrigins(1500);
  const followups = origins.slice(0, 1200).map((o, i) => ({
    id: uuid("fffff000", i), followup_rule_id: RULE_ID, parent_message_id: o.id,
    template_id: EDM2, status: "sent", channel: "EM", sent_at: null,
  }));
  const { db, calls } = makeDb({ tables: { followup_rules: [rule], outreach_messages: [...origins, ...followups], outreach_templates: TEMPLATES } });
  const [plan] = await planFollowups(db, NOW);
  assert.equal(plan.error, undefined);
  assert.equal(plan.eligibleOrigins, 1500);
  assert.equal(plan.alreadyFollowed, 1200);
  assert.equal(plan.targets.length, 300);
  assert.equal(plan.targets[0].id, origins[1200].id);
  const originPages = calls.selects.filter((q) => q.table === "outreach_messages" && q.filters.some(([k]) => k === "template_id"));
  assert.equal(originPages.length, 2);
  assert.deepEqual(originPages[0].orders, [["sent_at", true], ["id", true]]);
  assert.ok(originPages[0].filters.some(([k, op, v]) => k === "sent_at" && op === "lt" && v === plan.cutoff));
  assert.ok(originPages[0].filters.some(([k, op, v]) => k === "status" && op === "eq" && v === "sent"));
  const fuPages = calls.selects.filter((q) => q.filters.some(([k]) => k === "followup_rule_id"));
  assert.equal(fuPages.length, 2);
});

test("planFollowups：每條規則最多排入 MAX_ENQUEUE_PER_RULE，取 sent_at 最早的", async () => {
  const origins = makeOrigins(MAX_ENQUEUE_PER_RULE + 150).reverse(); // 打亂輸入順序
  const { db } = makeDb({ tables: { followup_rules: [makeRule()], outreach_messages: origins, outreach_templates: TEMPLATES } });
  const [plan] = await planFollowups(db, NOW);
  assert.equal(plan.targets.length, MAX_ENQUEUE_PER_RULE);
  assert.equal(plan.deferred, 150);
  assert.equal(plan.targets[0].to_email, "buyer0@example.com");
});

test("planFollowups：查詢回 error → 規則標記失敗（不是當成 0 筆）", async () => {
  const origins = makeOrigins(10);
  for (const which of ["template_id", "followup_rule_id"]) {
    const { db } = makeDb({
      tables: { followup_rules: [makeRule()], outreach_messages: origins, outreach_templates: TEMPLATES },
      failSelect: (q) => q.filters.some(([k]) => k === which),
    });
    const [plan] = await planFollowups(db, NOW);
    assert.match(plan.error || "", /statement timeout/, which);
    assert.equal(plan.targets.length, 0);
    const res = await enqueueFollowupPlan(db, [plan], NOW);
    assert.equal(res.length, 0, "失敗規則不可排入");
  }
});

test("planFollowups：模板沒有 body_html → 略過並帶原因；days_after null 當作 3", async () => {
  const { db } = makeDb({
    tables: {
      followup_rules: [makeRule({ days_after: null })],
      outreach_messages: makeOrigins(5),
      outreach_templates: [{ ...TEMPLATES[0], body_html: null }],
    },
  });
  const [plan] = await planFollowups(db, NOW);
  assert.ok(plan.skipReason);
  assert.equal(plan.targets.length, 0);
  assert.equal(plan.cutoff, followupCutoffIso(NOW, 3));
});

async function planFor(n, dbOpts = {}) {
  const { db, calls } = makeDb({ tables: { followup_rules: [makeRule()], outreach_messages: makeOrigins(n), outreach_templates: TEMPLATES }, ...dbOpts });
  const plans = await planFollowups(db, NOW);
  return { db, calls, plans };
}

test("enqueue：建一筆活動、每批 ≤50、upsert 帶 onConflict 與 ignoreDuplicates", async () => {
  const { db, calls, plans } = await planFor(123);
  const [r] = await enqueueFollowupPlan(db, plans, NOW);
  assert.equal(r.queued, 123);
  assert.equal(r.batchId, "batch-1");
  assert.equal(calls.inserts.length, 1);
  const b = calls.inserts[0].payload;
  assert.equal(b.name, "跟進｜2026_1111活動_EDM 3封信漏斗");
  assert.equal(b.channel, "EM");
  assert.equal(b.status, "running");
  assert.equal(b.total, 123);
  assert.equal(b.requested, 123);
  assert.equal(b.template_id, EDM2);
  assert.deepEqual(calls.upserts.map((u) => u.payload.length), [50, 50, 23]);
  for (const u of calls.upserts) {
    assert.deepEqual(u.opts, { onConflict: "followup_rule_id,parent_message_id", ignoreDuplicates: true });
    for (const row of u.payload) {
      assert.equal(row.batch_id, "batch-1");
      assert.equal(row.status, "queued");
      assert.equal(row.followup_rule_id, RULE_ID);
      assert.equal(row.template_id, EDM2);
      assert.ok(row.body_html && row.parent_message_id && row.to_email);
    }
  }
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.deletes.length, 0);
});

test("enqueue：第 2 批失敗 → 後續批次不再送、活動 total 改為已建立數並附錯誤", async () => {
  const { db, calls, plans } = await planFor(180, { failUpsertCall: 2 });
  const [r] = await enqueueFollowupPlan(db, plans, NOW);
  assert.equal(r.queued, 50);
  assert.match(r.error, /Payload too large/);
  assert.equal(calls.upserts.length, 2, "第 3、4 批不可再送");
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].payload.total, 50);
  assert.match(calls.updates[0].payload.note, /Payload too large/);
  assert.equal(calls.updates[0].payload.status, undefined, "仍維持 running");
});

test("enqueue：第 1 批就失敗（0 筆）→ 活動標 error", async () => {
  const { db, calls, plans } = await planFor(80, { failUpsertCall: 1 });
  const [r] = await enqueueFollowupPlan(db, plans, NOW);
  assert.equal(r.queued, 0);
  assert.equal(calls.upserts.length, 1);
  assert.equal(calls.updates[0].payload.status, "error");
  assert.ok(calls.updates[0].payload.finished_at);
});

test("enqueue：全部被唯一索引去重 → 刪除空活動", async () => {
  const origins = makeOrigins(60);
  // 模擬：plan 讀取之後、enqueue 之前，另一次 cron 已排入同一批（DB 端已存在）
  const { db, calls } = makeDb({
    tables: { followup_rules: [makeRule()], outreach_messages: origins, outreach_templates: TEMPLATES },
    existingFollowups: origins.map((o) => ({ followup_rule_id: RULE_ID, parent_message_id: o.id })),
  });
  const plans = await planFollowups(db, NOW);
  assert.equal(plans[0].targets.length, 60);
  const [r] = await enqueueFollowupPlan(db, plans, NOW);
  assert.equal(r.queued, 0);
  assert.equal(r.batchId, null);
  assert.equal(calls.deletes.length, 1);
  assert.deepEqual(calls.deletes[0].filters, [["id", "eq", "batch-1"]]);
});
