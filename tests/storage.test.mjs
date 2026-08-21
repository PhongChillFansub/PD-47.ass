// Bộ test cho background/storage.js — chạy bằng `node --test tests/` (hoặc `npm test`).
// Mock chrome.storage.local bằng Map trong bộ nhớ (xem createMockChrome bên dưới).
// Phủ các case của mục 1–7 trong kế hoạch cải tiến storage.js (21aug26):
//   1. chỉ mục nhẹ ASSCEE_subIndex   2. throttle setRendererStat   3. id ổn định cho source
//   4. hàng đợi ghi chống race      5. không mutate object caller   6. chiến lược lỗi nhất quán
//   7. getConfig trả bản sao
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import * as storage from "../background/storage.js";

// Giảm noise log của utils.js khi chạy test (giữ console.error để vẫn thấy lỗi thật).
console.log = () => {};
console.warn = () => {};

const GITHUB_URL = "https://github.com/owner/repo/tree/main";
const GITHUB_URL_2 = "https://github.com/owner/repo2/tree/main";
const DRIVE_URL = "https://drive.google.com/drive/folders/abcDEF";
const SUBTITLE_DATA_KEY_BASE = "ASSCEE_subData";
const SUBTITLE_INDEX_KEY = "ASSCEE_subIndex";
const SUBTITLE_SOURCES_KEY = "ASSCEE_sourceList";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mock chrome.storage.local.
 * - set()/remove() LUÔN clone (mô phỏng serialize khi ghi vào chrome.storage thật).
 * - get() clone theo `cloneOnGet` (mặc định true = giống chrome thật: mỗi lần get trả bản mới).
 *   Chế độ `cloneOnGet: false` (get trả tham chiếu) dùng để test các điểm BẮT BUỘC phải
 *   trả bản sao — nếu code quên clone, test sẽ fail.
 * @returns {{store: Map, counts: Object, local: Object}}
 */
function createMockChrome({ cloneOnGet = true } = {}) {
  const store = new Map();
  const counts = { get: 0, getNull: 0, set: 0, remove: 0, getKeys: [] };
  const copy = (value) => (cloneOnGet ? structuredClone(value) : value);
  return {
    store,
    counts,
    storage: {
      local: {
        async get(key) {
          counts.get += 1;
          counts.getKeys.push(key);
          const result = {};
          if (key === null || key === undefined) {
            counts.getNull += 1;
            for (const [k, v] of store) result[k] = copy(v);
            return result;
          }
          for (const k of Array.isArray(key) ? key : [key]) {
            if (store.has(k)) result[k] = copy(store.get(k));
          }
          return result;
        },
        async set(items) {
          counts.set += 1;
          for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v));
        },
        async remove(key) {
          counts.remove += 1;
          for (const k of Array.isArray(key) ? key : [key]) store.delete(k);
        },
      },
    },
  };
}

let mock;

beforeEach(() => {
  mock = createMockChrome();
  globalThis.chrome = mock;
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ==================== Mục 3: id ổn định cho source ====================

test("addSource: thêm nguồn hợp lệ → success, có id UUID + savedAt", async () => {
  const res = await storage.addSource({ url: GITHUB_URL, folderName: "Repo" });
  assert.equal(res.success, true);
  assert.equal(res.data.url, GITHUB_URL);
  assert.match(res.data.id, UUID_RE);
  assert.equal(typeof res.data.savedAt, "number");
  const sources = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].id, res.data.id);
});

test("addSource: không mutate object của caller (không gán id/savedAt lên object gốc)", async () => {
  const src = { url: GITHUB_URL, folderName: "Repo" };
  await storage.addSource(src);
  assert.equal("id" in src, false);
  assert.equal("savedAt" in src, false);
});

test("addSource: chặn trùng khi host/scheme khác case hoặc URL bị thừa khoảng trắng", async () => {
  const first = await storage.addSource({ url: GITHUB_URL });
  assert.equal(first.success, true);
  const hostCase = await storage.addSource({ url: "HTTPS://GITHUB.COM/owner/repo/tree/main" });
  assert.equal(hostCase.success, false);
  const padded = await storage.addSource({ url: `   ${GITHUB_URL}   ` });
  assert.equal(padded.success, false);
  assert.equal((await storage.getSourceList()).length, 1);
});

test("addSource: path phân biệt hoa-thường → 2 nguồn khác nhau", async () => {
  await storage.addSource({ url: GITHUB_URL });
  const res = await storage.addSource({ url: "https://github.com/owner/repo/tree/MAIN" });
  assert.equal(res.success, true);
  assert.equal((await storage.getSourceList()).length, 2);
});

test("addSource: input sai (url không phải string/trống/không hỗ trợ) → {success:false}, không throw", async () => {
  const badInputs = [
    undefined,
    {},
    { url: 123 },
    { url: null },
    { url: "   " },
    { url: "https://example.com/some/folder" },
  ];
  for (const bad of badInputs) {
    const res = await storage.addSource(bad);
    assert.equal(res.success, false);
  }
  assert.equal((await storage.getSourceList()).length, 0);
});

test("addSource: 2 lời gọi đồng thời khác URL → không mất cập nhật (queue)", async () => {
  const [r1, r2] = await Promise.all([
    storage.addSource({ url: GITHUB_URL }),
    storage.addSource({ url: GITHUB_URL_2 }),
  ]);
  assert.equal(r1.success, true);
  assert.equal(r2.success, true);
  assert.equal((await storage.getSourceList()).length, 2);
});

test("removeSource: xóa theo id — 2 nguồn cùng savedAt không bị xóa nhầm", async () => {
  await storage.addSource({ url: GITHUB_URL, folderName: "A" });
  await storage.addSource({ url: GITHUB_URL_2, folderName: "B" });
  const sources = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(sources.length, 2);
  // Ép 2 nguồn cùng savedAt (mô phỏng thêm trong cùng 1 ms) — id vẫn khác nhau.
  sources[0].savedAt = 12345;
  sources[1].savedAt = 12345;
  mock.store.set(SUBTITLE_SOURCES_KEY, sources);

  const res = await storage.removeSource(sources[0].id);
  assert.equal(res.success, true);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].id, sources[1].id);

  const remaining = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].savedAt, 12345); // nguồn còn lại không bị đụng tới
});

test("removeSource: id sai/không tìm thấy → {success:false}, không throw", async () => {
  for (const bad of [undefined, null, 123, "", "   "]) {
    const res = await storage.removeSource(bad);
    assert.equal(res.success, false);
  }
  const unknown = await storage.removeSource("no-such-id");
  assert.equal(unknown.success, false);
});

test("removeSource: dữ liệu cũ chưa có id được gán id khi thêm nguồn mới → vẫn xóa được", async () => {
  // Mô phỏng nguồn lưu từ trước khi có tính năng id.
  mock.store.set(SUBTITLE_SOURCES_KEY, [{ url: GITHUB_URL, folderName: "Legacy", savedAt: 1 }]);
  const res = await storage.addSource({ url: GITHUB_URL_2, folderName: "New" });
  assert.equal(res.success, true);
  const sources = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(sources.length, 2);
  const legacy = sources.find((s) => s.folderName === "Legacy");
  assert.match(legacy.id, UUID_RE);
  const rem = await storage.removeSource(legacy.id);
  assert.equal(rem.success, true);
  assert.equal(rem.data.length, 1);
});

// ==================== Mục 5 + 1: addSubData clone input + chỉ mục nhẹ ====================

test("addSubData: lưu thành công, KHÔNG mutate object của caller, cập nhật chỉ mục nhẹ", async () => {
  const subObj = { fileObj: { fileName: "x.ass" }, parsedData: [[1, 2]] };
  const res = await storage.addSubData("abc", subObj);
  assert.equal(res.success, true);
  assert.equal(res.data, "abc");
  assert.equal("cachedAt" in subObj, false); // không gán cachedAt lên object người gọi

  const saved = mock.store.get(`${SUBTITLE_DATA_KEY_BASE}_abc`);
  assert.equal(typeof saved.cachedAt, "number");
  assert.deepEqual(saved.parsedData, [[1, 2]]);

  const index = mock.store.get(SUBTITLE_INDEX_KEY);
  assert.ok(index.abc);
  assert.equal(index.abc.videoId, "abc");
  assert.equal("parsedData" in index.abc, false); // chỉ mục không chứa phần nặng
});

test("addSubData: cachedId giữ id gốc lúc cache, videoId là id hiện tại", async () => {
  await storage.addSubData("newid", {
    fileObj: { fileName: "y.ass" },
    videoId: "orig",
    parsedData: [],
  });
  const index = mock.store.get(SUBTITLE_INDEX_KEY);
  assert.equal(index.newid.videoId, "newid");
  assert.equal(index.newid.cachedId, "orig");
});

test("addSubData: input không hợp lệ → {success:false}, không throw (mục 6)", async () => {
  const badInputs = [
    [undefined, { parsedData: [] }],
    [null, { parsedData: [] }],
    ["", { parsedData: [] }],
    [123, { parsedData: [] }],
    ["x", {}],
    ["x", null],
    ["x", { parsedData: null }],
    ["x", { parsedData: "text" }],
  ];
  for (const [vid, obj] of badInputs) {
    const res = await storage.addSubData(vid, obj);
    assert.equal(res.success, false);
  }
  assert.equal(mock.store.has(`${SUBTITLE_DATA_KEY_BASE}_x`), false);
});

test("getSubDataList: đọc từ chỉ mục — đúng shape, không chứa parsedData, không đọc key sub", async () => {
  await storage.addSubData("a", { fileObj: { fileName: "a.ass" }, parsedData: [["a"]] });
  await storage.addSubData("b", { fileObj: { fileName: "b.ass" }, parsedData: [["b"]] });

  const beforeGetKeys = mock.counts.getKeys.length;
  const list = await storage.getSubDataList();
  assert.equal(list.length, 2);
  for (const item of list) {
    assert.equal("parsedData" in item, false);
    assert.ok(typeof item.cachedAt === "number");
    assert.ok(["a", "b"].includes(item.videoId));
  }
  // Chỉ đọc key chỉ mục (get(1 key)), không đọc get(null) hay các key sub nặng.
  const newGetKeys = mock.counts.getKeys.slice(beforeGetKeys);
  assert.deepEqual(newGetKeys, [SUBTITLE_INDEX_KEY]);
  assert.equal(mock.counts.getNull, 1); // chỉ 1 lần migrate (khi add sub đầu tiên), không quét lại
});

test("getSubDataList(searchId): lọc đúng 1 video, chấp nhận prefix '#', trả [] nếu không có", async () => {
  await storage.addSubData("abc", { fileObj: { fileName: "a.ass" }, parsedData: [] });
  const byId = await storage.getSubDataList("abc");
  assert.equal(byId.length, 1);
  assert.equal(byId[0].videoId, "abc");
  const byHash = await storage.getSubDataList("#abc");
  assert.equal(byHash.length, 1);
  const missing = await storage.getSubDataList("zzz");
  assert.deepEqual(missing, []);
});

test("getSubDataList: migrate dữ liệu cũ (cache chưa có chỉ mục) đúng 1 lần", async () => {
  // Seed trực tiếp: dữ liệu cache kiểu cũ + 1 key không liên quan (phải bị bỏ qua).
  mock.store.set(`${SUBTITLE_DATA_KEY_BASE}_old1`, {
    fileObj: { fileName: "f1.ass" },
    videoId: "orig1",
    parsedData: [{ text: "nặng" }],
    cachedAt: 111,
  });
  mock.store.set("OTHER_IRRELEVANT_KEY", { whatever: true });

  const list = await storage.getSubDataList();
  assert.equal(list.length, 1);
  const entry = list[0];
  assert.equal(entry.videoId, "old1");
  assert.equal(entry.cachedId, "orig1");
  assert.equal(entry.cachedAt, 111);
  assert.equal(entry.fileName, "f1.ass");
  assert.equal("parsedData" in entry, false);

  assert.ok(mock.store.has(SUBTITLE_INDEX_KEY));
  assert.equal(mock.counts.getNull, 1);
  await storage.getSubDataList(); // lần sau không quét lại nữa
  assert.equal(mock.counts.getNull, 1);
});

test("removeSubData: xóa cả key sub lẫn mục trong chỉ mục", async () => {
  await storage.addSubData("vid1", { fileObj: { fileName: "a.ass" }, parsedData: [] });
  const res = await storage.removeSubData("vid1");
  assert.equal(res.success, true);
  assert.equal(res.data, "vid1");
  assert.equal(mock.store.has(`${SUBTITLE_DATA_KEY_BASE}_vid1`), false);
  const index = mock.store.get(SUBTITLE_INDEX_KEY);
  assert.ok(index && !("vid1" in index));

  const again = await storage.removeSubData("vid1");
  assert.equal(again.success, false);
  assert.equal((await storage.removeSubData("")).success, false);
  assert.equal((await storage.removeSubData(123)).success, false);
});

test("useSubData: trả toàn bộ subObj (gồm parsedData), null nếu không có", async () => {
  await storage.addSubData("vid1", { fileObj: { fileName: "a.ass" }, parsedData: [{ t: 1 }] });
  const full = await storage.useSubData("vid1");
  assert.equal(full.fileObj.fileName, "a.ass");
  assert.equal(typeof full.cachedAt, "number");
  assert.deepEqual(full.parsedData, [{ t: 1 }]);
  assert.equal(await storage.useSubData("nope"), null);
});

// ==================== Mục 7 + 4: getConfig bản sao + setConfig queue ====================

test("getConfig: trả bản sao — sửa object trả về không ảnh hưởng storage", async () => {
  mock = createMockChrome({ cloneOnGet: false }); // get trả tham chiếu → test thật sự "bắt" code quên clone
  globalThis.chrome = mock;
  await storage.setConfig("theme", "dark");

  const cfg = await storage.getConfig();
  assert.deepEqual(cfg, { theme: "dark" });
  cfg.theme = "light";
  cfg.extra = true;

  const again = await storage.getConfig();
  assert.equal(again.theme, "dark");
  assert.equal(again.extra, undefined);

  const full = await storage.getConfig(123); // key không phải string → trả toàn bộ (bản sao)
  full.theme = "mutated";
  assert.equal((await storage.getConfig("theme")), "dark");
});

test("getConfig: đọc từng key, trả null cho key vắng mặt", async () => {
  assert.deepEqual(await storage.getConfig(), {});
  assert.equal(await storage.getConfig("missing"), null);
  await storage.setConfig("theme", "dark");
  assert.equal(await storage.getConfig("theme"), "dark");
});

test("setConfig: ghi key hợp lệ, chặn key/value không hợp lệ bằng {success:false}", async () => {
  const ok = await storage.setConfig("theme", "dark");
  assert.equal(ok.success, true);
  assert.equal(ok.data.theme, "dark");

  await storage.setConfig("n", 42);
  await storage.setConfig("b", true);
  assert.deepEqual(await storage.getConfig(), { theme: "dark", n: 42, b: true });

  for (const badValue of [undefined, null, {}, [], () => {}]) {
    const res = await storage.setConfig("k", badValue);
    assert.equal(res.success, false);
  }
  for (const badKey of [undefined, null, 123, "", "   "]) {
    const res = await storage.setConfig(badKey, 1);
    assert.equal(res.success, false);
  }
  assert.deepEqual(await storage.getConfig(), { theme: "dark", n: 42, b: true });
});

test("setConfig: 2 lời gọi đồng thời → không mất cập nhật (queue)", async () => {
  const [a, b] = await Promise.all([storage.setConfig("a", 1), storage.setConfig("b", 2)]);
  assert.equal(a.success, true);
  assert.equal(b.success, true);
  assert.deepEqual(await storage.getConfig(), { a: 1, b: 2 });
});

// ==================== Mục 2 + 4: throttle + queue cho rendererStat ====================

test("getRendererStat: storage trống → {}", async () => {
  assert.deepEqual(await storage.getRendererStat(), {});
});

test("setRendererStat: input không phải object → {success:false} (undefined → mặc định {})", async () => {
  for (const bad of [null, "x", 123, []]) {
    const res = await storage.setRendererStat(bad);
    assert.equal(res.success, false);
  }
  // undefined dùng giá trị mặc định {} (giữ API cũ) → hợp lệ
  assert.equal((await storage.setRendererStat(undefined)).success, true);
  assert.deepEqual(await storage.getRendererStat(), {});
});

test("setRendererStat: gộp (merge) thay vì ghi đè, trả ngay giá trị mới nhất", async () => {
  const r1 = await storage.setRendererStat({ fps: 60 });
  assert.equal(r1.success, true);
  assert.equal(r1.data.fps, 60);
  const r2 = await storage.setRendererStat({ nps: 2 });
  assert.equal(r2.data.fps, 60); // giữ cập nhật trước đó dù chưa flush
  assert.equal(r2.data.nps, 2);
  await sleep(400); // chờ flush
  const stat = await storage.getRendererStat();
  assert.equal(stat.fps, 60);
  assert.equal(stat.nps, 2);
  assert.equal(mock.counts.set, 1); // chỉ 1 lần ghi cho 2 lời gọi liên tiếp
});

test("setRendererStat: gọi N lần liên tiếp → flush gộp 1 lần, giá trị cuối cùng đúng", async () => {
  const before = mock.counts.set;
  const calls = [];
  for (let i = 0; i < 20; i++) calls.push(storage.setRendererStat({ [`f${i}`]: i }));
  await Promise.all(calls);
  await sleep(400);
  assert.equal(mock.counts.set - before, 1); // 20 lời gọi → chỉ 1 lần ghi storage
  const stat = await storage.getRendererStat();
  for (let i = 0; i < 20; i++) assert.equal(stat[`f${i}`], i);
});

test("setRendererStat: flush giới hạn ~4 lần/giây khi gọi trải dài", async () => {
  for (let i = 0; i < 10; i++) {
    await storage.setRendererStat({ [`k${i}`]: i });
    await sleep(100);
  }
  await sleep(600); // chờ flush cuối cùng
  const writes = mock.counts.set;
  assert.ok(writes >= 2, `flush quá ít: ${writes}`);
  assert.ok(writes <= 6, `flush vượt giới hạn lần/giây: ${writes}`);
  const stat = await storage.getRendererStat();
  for (let i = 0; i < 10; i++) assert.equal(stat[`k${i}`], i);
});

// ==================== Khác ====================

test("getSourceList: storage trống → mảng rỗng", async () => {
  assert.deepEqual(await storage.getSourceList(), []);
});

test("enqueueWrite KHÔNG được export (queue để private trong storage.js)", async () => {
  assert.equal(typeof storage.enqueueWrite, "undefined");
});
