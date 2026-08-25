// Bộ test cho background/storage.js — chạy bằng `node --test tests/` (hoặc `npm test`).
// Mock chrome.storage.local bằng Map trong bộ nhớ (xem createMockChrome bên dưới).
// add/set/remove trả "" khi thành công, chuỗi lỗi (truthy) khi thất bại.
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
const RENDERER_STAT_KEY = "ASSCEE_renderData";

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

// ==================== id ổn định cho source ====================

test("addSource: thêm nguồn hợp lệ → \"\", có storageId UUID, savedAt KHÔNG do storage gán", async () => {
  const res = await storage.addSource({ url: GITHUB_URL, name: "Repo" });
  assert.equal(res, "");
  const sources = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].url, GITHUB_URL);
  assert.match(sources[0].storageId, UUID_RE);
  // savedAt là metadata do fetcher gán (trước khi gọi addSource), KHÔNG phải của storage.
  assert.equal("savedAt" in sources[0], false);
});

test("addSource: gán storageId lên object của caller (mutate là chủ ý)", async () => {
  const src = { url: GITHUB_URL, name: "Repo" };
  await storage.addSource(src);
  assert.match(src.storageId, UUID_RE); // storage gán storageId trực tiếp lên object người gọi
  assert.equal("savedAt" in src, false); // savedAt vẫn do fetcher gán, không phải storage
});

test("addSource: chặn trùng chính xác URL (storage KHÔNG tự normalize)", async () => {
  // Hợp đồng: fetcher đã chuẩn hóa URL trước khi gọi addSource, nên
  // storage so sánh nguyên URL, không trim/lowercase lại để bắt "gần trùng".
  const first = await storage.addSource({ url: GITHUB_URL });
  assert.equal(first, "");
  const dup = await storage.addSource({ url: GITHUB_URL });
  assert.equal(dup, "storage: addSource(): Nguồn này đã tồn tại trong danh sách");
  assert.equal((await storage.getSourceList()).length, 1);
});

test("addSource: path phân biệt hoa-thường → 2 nguồn khác nhau", async () => {
  await storage.addSource({ url: GITHUB_URL });
  const res = await storage.addSource({ url: "https://github.com/owner/repo/tree/MAIN" });
  assert.equal(res, "");
  assert.equal((await storage.getSourceList()).length, 2);
});

test("addSource: input sai (url không phải string/trống/không hỗ trợ) → chuỗi lỗi, không throw", async () => {
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
    assert.equal(res, "storage: addSource(): URL không chuẩn");
  }
  assert.equal((await storage.getSourceList()).length, 0);
});

test("addSource: 2 lời gọi đồng thời khác URL → không mất cập nhật (queue)", async () => {
  const [r1, r2] = await Promise.all([
    storage.addSource({ url: GITHUB_URL }),
    storage.addSource({ url: GITHUB_URL_2 }),
  ]);
  assert.equal(r1, "");
  assert.equal(r2, "");
  assert.equal((await storage.getSourceList()).length, 2);
});

test("removeSource: xóa theo storageId — 2 nguồn cùng savedAt không bị xóa nhầm", async () => {
  await storage.addSource({ url: GITHUB_URL, name: "A" });
  await storage.addSource({ url: GITHUB_URL_2, name: "B" });
  const sources = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(sources.length, 2);
  // Ép 2 nguồn cùng savedAt (mô phỏng thêm trong cùng 1 ms) — storageId vẫn khác nhau.
  sources[0].savedAt = 12345;
  sources[1].savedAt = 12345;
  mock.store.set(SUBTITLE_SOURCES_KEY, sources);

  const res = await storage.removeSource(sources[0].storageId);
  assert.equal(res, "");
  const remaining = mock.store.get(SUBTITLE_SOURCES_KEY);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].storageId, sources[1].storageId);
  assert.equal(remaining[0].savedAt, 12345); // nguồn còn lại không bị đụng tới
});

test("removeSource: id sai/không tìm thấy → chuỗi lỗi, không throw", async () => {
  for (const bad of [undefined, null, 123, "", "   "]) {
    const res = await storage.removeSource(bad);
    assert.equal(res, "storage: removeSource(): id nguồn không hợp lệ hoặc trống");
  }
  const unknown = await storage.removeSource("no-such-id");
  assert.equal(unknown, "storage: removeSource(): Không tìm thấy nguồn có id: no-such-id");
});

// ==================== addSubData clone input + chỉ mục nhẹ ====================

test("addSubData: lưu thành công, KHÔNG mutate object của caller, cập nhật chỉ mục nhẹ", async () => {
  const subObj = { fileObj: { fileName: "x.ass" }, parsedData: [[1, 2]] };
  const res = await storage.addSubData("abc", subObj);
  assert.equal(res, "");
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

test("addSubData: input không hợp lệ → chuỗi lỗi, không throw", async () => {
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
    assert.ok(res);
    assert.notEqual(res, "");
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
  assert.equal(mock.counts.getNull, 0);
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

test("getSubDataList: thiếu chỉ mục → [] (không quét key sub cũ)", async () => {
  mock.store.set(`${SUBTITLE_DATA_KEY_BASE}_old1`, {
    fileObj: { fileName: "f1.ass" },
    videoId: "orig1",
    parsedData: [{ text: "nặng" }],
    cachedAt: 111,
  });
  mock.store.set("OTHER_IRRELEVANT_KEY", { whatever: true });

  const list = await storage.getSubDataList();
  assert.deepEqual(list, []);
  assert.equal(mock.store.has(SUBTITLE_INDEX_KEY), false);
  assert.equal(mock.counts.getNull, 0);
});

test("removeSubData: xóa cả key sub lẫn mục trong chỉ mục", async () => {
  await storage.addSubData("vid1", { fileObj: { fileName: "a.ass" }, parsedData: [] });
  const res = await storage.removeSubData("vid1");
  assert.equal(res, "");
  assert.equal(mock.store.has(`${SUBTITLE_DATA_KEY_BASE}_vid1`), false);
  const index = mock.store.get(SUBTITLE_INDEX_KEY);
  assert.ok(index && !("vid1" in index));

  const again = await storage.removeSubData("vid1");
  assert.ok(again);
  assert.notEqual(again, "");
  assert.equal(await storage.removeSubData(""), "storage: removeSubData(): videoId không hợp lệ hoặc trống");
  assert.equal(await storage.removeSubData(123), "storage: removeSubData(): videoId không hợp lệ hoặc trống");
});

test("useSubData: trả toàn bộ subObj (gồm parsedData), null nếu không có", async () => {
  await storage.addSubData("vid1", { fileObj: { fileName: "a.ass" }, parsedData: [{ t: 1 }] });
  const full = await storage.useSubData("vid1");
  assert.equal(full.fileObj.fileName, "a.ass");
  assert.equal(typeof full.cachedAt, "number");
  assert.deepEqual(full.parsedData, [{ t: 1 }]);
  assert.equal(await storage.useSubData("nope"), null);
});

// ==================== getConfig bản sao + setConfig queue ====================

test("getConfig: trả bản sao — sửa object trả về không ảnh hưởng storage", async () => {
  mock = createMockChrome({ cloneOnGet: false }); // get trả tham chiếu → test thật sự "bắt" code quên clone
  globalThis.chrome = mock;
  assert.equal(await storage.setConfig("theme", "dark"), "");

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

test("setConfig: ghi key hợp lệ, chặn key/value không hợp lệ bằng chuỗi lỗi", async () => {
  const ok = await storage.setConfig("theme", "dark");
  assert.equal(ok, "");
  assert.equal(await storage.getConfig("theme"), "dark");

  await storage.setConfig("n", 42);
  await storage.setConfig("b", true);
  assert.deepEqual(await storage.getConfig(), { theme: "dark", n: 42, b: true });

  for (const badValue of [undefined, null, {}, [], () => {}]) {
    const res = await storage.setConfig("k", badValue);
    assert.equal(res, "value config không hợp lệ (chỉ chấp nhận string/number/boolean)");
  }
  for (const badKey of [undefined, null, 123, "", "   "]) {
    const res = await storage.setConfig(badKey, 1);
    assert.equal(res, "key config không hợp lệ hoặc trống");
  }
  assert.deepEqual(await storage.getConfig(), { theme: "dark", n: 42, b: true });
});

test("setConfig: 2 lời gọi đồng thời → không mất cập nhật (queue)", async () => {
  const [a, b] = await Promise.all([storage.setConfig("a", 1), storage.setConfig("b", 2)]);
  assert.equal(a, "");
  assert.equal(b, "");
  assert.deepEqual(await storage.getConfig(), { a: 1, b: 2 });
});

// ==================== cooldown lastTimeSet cho rendererStat ====================

test("getRendererStat: storage trống → {}", async () => {
  assert.deepEqual(await storage.getRendererStat(), {});
});

test("setRendererStat: input không phải object → chuỗi lỗi (undefined → mặc định {})", async () => {
  for (const bad of [null, "x", 123, []]) {
    const res = await storage.setRendererStat(bad);
    assert.equal(res, "newData không hợp lệ (cần object)");
  }
  // undefined dùng giá trị mặc định {} (giữ API cũ) → hợp lệ
  assert.equal(await storage.setRendererStat(undefined), "");
  assert.deepEqual(await storage.getRendererStat(), {});
});

test("setRendererStat: gộp (merge) khi hết cooldown; gọi sớm → bỏ data", async () => {
  const r1 = await storage.setRendererStat({ fps: 60 });
  assert.equal(r1, "");
  const r2 = await storage.setRendererStat({ nps: 2 });
  assert.equal(r2, "Chưa hết thời gian chờ");
  const mid = await storage.getRendererStat();
  assert.equal(mid.fps, 60);
  assert.equal(mid.nps, undefined);
  assert.equal("lastTimeSet" in mid, false);

  await sleep(550);
  const r3 = await storage.setRendererStat({ nps: 2 });
  assert.equal(r3, "");
  const stat = await storage.getRendererStat();
  assert.equal(stat.fps, 60);
  assert.equal(stat.nps, 2);
  assert.equal("lastTimeSet" in stat, false);
  assert.equal(typeof mock.store.get(RENDERER_STAT_KEY).lastTimeSet, "number");
});

test("setRendererStat: gọi N lần liên tiếp → chỉ ghi lần đầu, các lần sau bị cooldown", async () => {
  const before = mock.counts.set;
  const calls = [];
  for (let i = 0; i < 20; i++) calls.push(storage.setRendererStat({ [`f${i}`]: i }));
  const results = await Promise.all(calls);
  assert.equal(results[0], "");
  assert.ok(results.slice(1).every((r) => r === "Chưa hết thời gian chờ"));
  assert.equal(mock.counts.set - before, 1);
  const stat = await storage.getRendererStat();
  assert.equal(stat.f0, 0);
  assert.equal(stat.f1, undefined);
});

test("setRendererStat: caller không ghi đè được lastTimeSet để né cooldown", async () => {
  assert.equal(await storage.setRendererStat({ fps: 1 }), "");
  const bypass = await storage.setRendererStat({ fps: 99, lastTimeSet: 0 });
  assert.equal(bypass, "Chưa hết thời gian chờ");
  assert.equal((await storage.getRendererStat()).fps, 1);
});

test("setRendererStat: sau cooldown ghi lại được, lastTimeSet không lộ ra getRendererStat", async () => {
  assert.equal(await storage.setRendererStat({ fps: 10 }), "");
  await sleep(550);
  assert.equal(await storage.setRendererStat({ fps: 20 }), "");
  const stat = await storage.getRendererStat();
  assert.equal(stat.fps, 20);
  assert.equal("lastTimeSet" in stat, false);
});

// ==================== Khác ====================

test("getSourceList: storage trống → mảng rỗng", async () => {
  assert.deepEqual(await storage.getSourceList(), []);
});

test("enqueueWrite KHÔNG được export (queue để private trong storage.js)", async () => {
  assert.equal(typeof storage.enqueueWrite, "undefined");
});
