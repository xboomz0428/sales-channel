// node --test tests/bounce-scan.test.mjs
// 退信掃描的分頁／去重純函式測試（不連資料庫、不連 IMAP）。
// 輸入形狀對照生產呼叫點：
//  - IMAP：imapflow client.search(..., { uid: true }) 回傳 number[]；client.mailbox.uidValidity 為 bigint（gmailImap.ts 以 String() 轉字串）
//  - app_settings：getSettings() 回 Record<string, string>，水位存成字串 "<uidValidity>:<uid>"
//  - 寄出紀錄：supabase .select("id, to_email").range(from, to) 回 { data: {id, to_email}[] | null, error }，單次最多 1000 列
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOUNCE_WATERMARK_KEY,
  parseWatermark,
  formatWatermark,
  effectiveSinceUid,
  selectNewUids,
  chunk,
  nextWatermark,
  safeProcessedUids,
  fetchAllPages,
  buildSentIndex,
  runScanLoop,
} from "../lib/outreach/bounceScanCore.ts";

const UIDVALIDITY = String(1n); // gmailImap.ts: String(client.mailbox.uidValidity)，uidValidity 是 bigint

test("水位字串解析：正常值、空值、格式錯誤", () => {
  assert.deepEqual(parseWatermark("1:4321"), { uidValidity: "1", uid: 4321 });
  assert.equal(parseWatermark(undefined), null);
  assert.equal(parseWatermark(""), null);
  assert.equal(parseWatermark("abc"), null);
  assert.equal(parseWatermark("1:-5"), null);
  assert.equal(formatWatermark({ uidValidity: "1", uid: 7 }), "1:7");
  assert.equal(BOUNCE_WATERMARK_KEY, "BOUNCE_SCAN_WATERMARK");
});

test("UIDVALIDITY 不同 → 舊水位失效（sinceUid=0）", () => {
  const w = parseWatermark("1:500");
  assert.equal(effectiveSinceUid(w, "1"), 500);
  assert.equal(effectiveSinceUid(w, "2"), 0);
  assert.equal(effectiveSinceUid(null, "1"), 0);
});

test("selectNewUids：只取大於水位、由小到大、取最舊的 max 封", () => {
  // imapflow 回傳的 UID 陣列（數字），模擬亂序與重複
  const uids = [105, 101, 103, 102, 104, 103];
  assert.deepEqual(selectNewUids(uids, 0, 10), [101, 102, 103, 104, 105]);
  assert.deepEqual(selectNewUids(uids, 102, 10), [103, 104, 105]);
  assert.deepEqual(selectNewUids(uids, 0, 2), [101, 102]);
  assert.deepEqual(selectNewUids([], 0, 500), []);
  assert.deepEqual(selectNewUids(uids, 105, 500), []);
});

test("chunk：500 封每批 100 → 5 批", () => {
  const uids = Array.from({ length: 500 }, (_, i) => i + 1);
  const batches = chunk(uids, 100);
  assert.equal(batches.length, 5);
  assert.ok(batches.every((b) => b.length === 100));
  assert.deepEqual(batches.flat(), uids);
  assert.deepEqual(chunk([1, 2, 3], 100), [[1, 2, 3]]);
});

test("同一批退信通知掃兩次：第二次不會再選到（不重複計數）", () => {
  // 第一次掃描：尚無水位
  const settings = {}; // getSettings() 回傳的 map
  const searchResult = [9001, 9002, 9003]; // client.search 回傳
  let mark = parseWatermark(settings[BOUNCE_WATERMARK_KEY]);
  const first = selectNewUids(searchResult, mark?.uid ?? 0, 500);
  assert.deepEqual(first, [9001, 9002, 9003]);
  mark = nextWatermark(mark, UIDVALIDITY, first);
  settings[BOUNCE_WATERMARK_KEY] = formatWatermark(mark); // saveSettings 寫回字串

  // 第二次掃描：Gmail 搜尋仍回傳同樣 3 封（newer_than:7d 視窗內）
  const mark2 = parseWatermark(settings[BOUNCE_WATERMARK_KEY]);
  const second = selectNewUids(searchResult, effectiveSinceUid(mark2, UIDVALIDITY), 500);
  assert.deepEqual(second, []);

  // 新退信進來 → 只選到新的那封
  const third = selectNewUids([...searchResult, 9010], effectiveSinceUid(mark2, UIDVALIDITY), 500);
  assert.deepEqual(third, [9010]);

  // 對照組：舊版無水位、每次都 slice(-max) → 兩次都選到同 3 封
  const oldPick = (uids, max) => uids.slice(-max);
  assert.deepEqual(oldPick(searchResult, 80), oldPick(searchResult, 80));
  assert.equal(oldPick(searchResult, 80).length, 3);
});

test("超過 max 的退信：本次處理最舊 150 封，水位只推進到第 150 封，下次接續", () => {
  const uids = Array.from({ length: 320 }, (_, i) => 1000 + i);
  const firstRun = selectNewUids(uids, 0, 150);
  const mark = nextWatermark(null, UIDVALIDITY, firstRun);
  assert.equal(mark.uid, 1149);
  const secondRun = selectNewUids(uids, mark.uid, 150);
  assert.equal(secondRun.length, 150);
  assert.equal(secondRun[0], 1150);
  assert.equal(selectNewUids(uids, 1299, 150).length, 20);
});

test("中途出錯：水位只推進到已處理完的通知之前", () => {
  // fetchedUids 含被內容過濾掉的非退信信（201、204）
  const fetched = [200, 201, 202, 203, 204, 205];
  const noticeUids = [200, 202, 203, 205];
  // 處理完前 2 封通知（200、202），第 3 封（203）出錯
  const done = safeProcessedUids(fetched, noticeUids, 2);
  assert.deepEqual(done, [200, 201, 202]);
  assert.equal(nextWatermark({ uidValidity: "1", uid: 150 }, "1", done).uid, 202);
  // 全部處理完
  assert.deepEqual(safeProcessedUids(fetched, noticeUids, 4), fetched);
  // 沒有任何通知（全是非退信信）
  assert.deepEqual(safeProcessedUids([300, 301], [], 0), [300, 301]);
  // 水位不倒退
  assert.equal(nextWatermark({ uidValidity: "1", uid: 999 }, "1", [10]).uid, 999);
  // UIDVALIDITY 變了 → 從 0 起算
  assert.equal(nextWatermark({ uidValidity: "1", uid: 999 }, "2", [10]).uid, 10);
});

/** 模擬 PostgREST：.range(from, to) 一次最多回 1000 列 */
function fakeTable(rows, maxRows = 1000) {
  const calls = [];
  const fetchPage = async (from, to) => {
    calls.push([from, to]);
    const end = Math.min(to + 1, from + maxRows);
    return { data: rows.slice(from, end), error: null };
  };
  return { fetchPage, calls };
}

test("寄出紀錄分頁：3500 列（每天 500 封 × 7 天）全部讀到；舊版單次查詢只到 1000 列", async () => {
  const rows = Array.from({ length: 3500 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    to_email: `user${i}@example.com`,
  }));
  const { fetchPage, calls } = fakeTable(rows);
  const all = await fetchAllPages(fetchPage, 1000);
  assert.equal(all.length, 3500);
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999], [3000, 3999]]);

  const { sentSet } = buildSentIndex(all);
  assert.ok(sentSet.has("user3499@example.com"));

  // 對照組：舊版不分頁 → PostgREST 只回前 1000 列，第 1001 列之後的收件人比對不到
  const old = (await fakeTable(rows).fetchPage(0, Number.MAX_SAFE_INTEGER)).data;
  assert.equal(old.length, 1000);
  assert.equal(buildSentIndex(old).sentSet.has("user3499@example.com"), false);
});

test("分頁剛好整除：多打一頁空頁後結束；查詢錯誤會丟錯而非當成沒資料", async () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), to_email: `a${i}@x.com` }));
  const { fetchPage, calls } = fakeTable(rows);
  assert.equal((await fetchAllPages(fetchPage, 1000)).length, 2000);
  assert.equal(calls.length, 3);

  await assert.rejects(
    fetchAllPages(async () => ({ data: null, error: { message: "timeout" } })),
    /timeout/,
  );
  assert.deepEqual(await fetchAllPages(async () => ({ data: [], error: null })), []);
});

test("buildSentIndex：大小寫與空白正規化；同信箱多封時取排序在前（最新）的那封", () => {
  const rows = [
    { id: "new", to_email: " Foo@Example.com " },
    { id: "old", to_email: "foo@example.com" },
    { id: "x", to_email: null },
  ];
  const { sentSet, idByEmail } = buildSentIndex(rows);
  assert.deepEqual([...sentSet], ["foo@example.com"]);
  assert.equal(idByEmail.get("foo@example.com"), "new");
});

// ── runScanLoop：輸入形狀照 scanBounces 呼叫點 ──
// notices：fetchBounceNotices 回傳的 { uid: number, text: string }[]；fetchedUids：number[]（含被內容過濾掉的非退信信）
// processNotice：寫入失敗時 throw（scanBounces 檢查 supabase { error } 與 addToBlacklist 的 { ok:false }）
// checkpoint：收到可推進水位的 UID，回傳 null（成功）或錯誤字串（saveSettings 重試後仍失敗）
const notice = (uid) => ({ uid, text: `Final-Recipient: rfc822; u${uid}@example.com

Status: 5.1.1` });

/** 模擬 scanBounces 的 checkpoint：nextWatermark → 存成字串，記錄每次存的值 */
function fakeStore(prev = null, failTimes = 0) {
  const saves = [];
  let fails = failTimes;
  const settings = {};
  if (prev) settings[BOUNCE_WATERMARK_KEY] = formatWatermark(prev);
  const checkpoint = async (doneUids) => {
    const mark = nextWatermark(prev, "1", doneUids);
    if (fails > 0) { fails--; return "儲存退信掃描進度失敗"; }
    settings[BOUNCE_WATERMARK_KEY] = formatWatermark(mark);
    saves.push(mark.uid);
    return null;
  };
  return { checkpoint, saves, settings };
}

test("寫入失敗：該封不算處理完、立即中止，水位停在前一封", async () => {
  const notices = [notice(301), notice(302), notice(303), notice(304)];
  const fetchedUids = [300, 301, 302, 303, 304]; // 300 是被過濾掉的非退信信
  const store = fakeStore({ uidValidity: "1", uid: 299 });
  const touched = [];
  const r = await runScanLoop({
    notices, fetchedUids, deadline: Number.MAX_SAFE_INTEGER, checkpoint: store.checkpoint,
    processNotice: async (n) => {
      touched.push(n.uid);
      if (n.uid === 303) throw new Error("寫入黑名單失敗：fetch failed"); // 模擬 Supabase 暫時錯誤
    },
  });
  assert.equal(r.stoppedBy, "error");
  assert.equal(r.processed, 2);
  assert.deepEqual(touched, [301, 302, 303]); // 304 沒被處理
  assert.match(r.error, /UID 303/);
  assert.equal(parseWatermark(store.settings[BOUNCE_WATERMARK_KEY]).uid, 302);
  // 下次掃描從 303 開始重讀
  assert.deepEqual(selectNewUids(fetchedUids, 302, 150), [303, 304]);
});

test("第一封就寫入失敗：水位不前進", async () => {
  const store = fakeStore({ uidValidity: "1", uid: 50 });
  const r = await runScanLoop({
    notices: [notice(51), notice(52)], fetchedUids: [51, 52], deadline: Number.MAX_SAFE_INTEGER,
    checkpoint: store.checkpoint,
    processNotice: async () => { throw new Error("更新寄送紀錄失敗"); },
  });
  assert.equal(r.processed, 0);
  assert.equal(parseWatermark(store.settings[BOUNCE_WATERMARK_KEY]).uid, 50);
});

test("時間預算到了：提早停止、回傳已處理數、水位存到已處理的最後一封", async () => {
  const notices = Array.from({ length: 10 }, (_, i) => notice(1000 + i));
  const fetchedUids = notices.map((n) => n.uid);
  let clock = 0; // 每處理一封耗時 10 秒；預算 60 秒
  const store = fakeStore(null);
  const r = await runScanLoop({
    notices, fetchedUids, deadline: 60_000, now: () => clock, checkpoint: store.checkpoint,
    processNotice: async () => { clock += 10_000; },
  });
  assert.equal(r.stoppedBy, "budget");
  assert.equal(r.processed, 6);
  assert.equal(parseWatermark(store.settings[BOUNCE_WATERMARK_KEY]).uid, 1005);
  assert.equal(r.error, undefined);
});

test("每 25 封存一次水位（中途被平台中止時，至少保住最後一次 checkpoint）", async () => {
  const notices = Array.from({ length: 60 }, (_, i) => notice(i + 1));
  const store = fakeStore(null);
  const r = await runScanLoop({
    notices, fetchedUids: notices.map((n) => n.uid), deadline: Number.MAX_SAFE_INTEGER,
    checkpoint: store.checkpoint, checkpointEvery: 25, processNotice: async () => {},
  });
  assert.equal(r.stoppedBy, "done");
  assert.equal(r.processed, 60);
  assert.deepEqual(store.saves, [25, 50, 60]);
});

test("存水位失敗：記在 error、不中止處理；之後的 checkpoint 成功仍會存", async () => {
  const notices = Array.from({ length: 30 }, (_, i) => notice(i + 1));
  const store = fakeStore(null, 1); // 第一次 checkpoint（第 25 封）失敗
  const r = await runScanLoop({
    notices, fetchedUids: notices.map((n) => n.uid), deadline: Number.MAX_SAFE_INTEGER,
    checkpoint: store.checkpoint, checkpointEvery: 25, processNotice: async () => {},
  });
  assert.equal(r.processed, 30);
  assert.match(r.error, /儲存退信掃描進度失敗/);
  assert.deepEqual(store.saves, [30]);
});
