// v0.1.0 23aug26
// alpha mode
// Chức năng: chuyên xử lí lưu trữ trên chrome.storage.local.
// Quy ước chung (xem pipeline.txt):
// - storage.js là nơi DUY NHẤT ghi chrome.storage.local; module khác cần lưu thì gọi qua đây.
// - add/set/remove: thành công → "" (falsy); thất bại nghiệp vụ/input → chuỗi lỗi (truthy).
//   Lỗi lập trình / trạng thái không hợp lệ → throw.
// - Mọi thao tác read→modify→write đều chạy qua hàng đợi ghi private (enqueueWrite) để tránh
//   race: 2 lời gọi chồng nhau đọc cùng 1 giá trị cũ rồi ghi đè mất cập nhật của nhau.
// - Thuần đọc (getSourceList, getSubDataList, getConfig, useSubData, getRendererStat)
//   chạy ngoài queue.
/** Nhận logger(message, type = 'info', extra = undefined) */
import * as utils from './utils.js'; 
/** Dùng trong 3 hàm export với link folder: addSource, getSourceList, removeSource
 * 
 * Lưu tất cả obj folder trong 1 key. Mỗi nguồn có `id` (crypto.randomUUID()) làm định danh
 * ổn định — `savedAt` chỉ là metadata, KHÔNG dùng làm identity (2 nguồn thêm cùng 1 ms
 * có thể trùng savedAt). */
const SUBTITLE_SOURCES_KEY = "ASSCEE_sourceList"; 
/** 4 hàm với file sub: addSubData, getSubDataList, useSubData, removeSubData
 * 
 * Lưu các file sub trong key riêng biệt (do 1 file sub, thuần text đã có thể nặng đến 7MB) */
const SUBTITLE_DATA_KEY_BASE = "ASSCEE_subData"; 
/** Chỉ mục NHẸ của cache sub: { [videoId]: { ...fileObj, videoId, cachedId, cachedAt } }.
 * Không chứa parsedData (~7MB/file) → getSubDataList chỉ đọc key này, không đụng key sub.
 * addSubData / removeSubData tạo và cập nhật key này; thiếu key → coi như {}. */
const SUBTITLE_INDEX_KEY = "ASSCEE_subIndex";
/** Lưu các thiết đặt/dữ liệu điều khiển của người dùng */
const USER_CONFIG_KEY = "ASSCEE_config";
/** Lưu các dữ liệu render (fps, nps, dfps, subTitle) + lastTimeSet (mốc cooldown, không trả ra ngoài) */
const RENDERER_STAT_KEY = "ASSCEE_renderData"; 
/** Fallback: khoảng cách tối thiểu giữa 2 lần ghi rendererStat (renderer tự gọi ~1 lần/giây). */
const RENDERER_STAT_COOLDOWN_MS = 500;

// ==================== Hàng đợi ghi (chống race read→modify→write) ====================
// Queue để PRIVATE trong storage.js, KHÔNG export: utils.js là module tiện ích thuần/stateless,
// còn hàng đợi này stateful và gắn với ngữ nghĩa chrome.storage. Module khác muốn ghi storage
// thì gọi qua các hàm export ở đây, không tự viết queue.
// Queue toàn cục serialize hơi quá mức (config vs sourceList không xung đột nhau) nhưng ghi
// hiếm khi xảy ra nên chấp nhận — đơn giản hơn queue per-key.
let writeTail = Promise.resolve();
/** Nối 1 task ghi vào đuôi hàng đợi. `task` là hàm bất đồng bộ; lần fail không làm "chết" chuỗi.
 * @param {() => Promise<any>} task
 * @returns {Promise<any>} kết quả của task (reject nếu chính task đó fail)
 */
function enqueueWrite(task) {
  const run = writeTail.then(task);
  writeTail = run.catch(() => {}); // lần fail không "chết" chuỗi
  return run;
}

/** Hàm kiểm tra URL (fallback sau công đoạn fetch.)
 *
 * Lưu ý: storage KHÔNG chuẩn hóa URL — trách nhiệm đó nằm ở fetcher
 * (`fetchSubtitleFileList` luôn ghim `source.url` bằng URL đã chuẩn hóa
 * trước khi truyền vào `addSource`). So sánh, ko normalize.
 * @param {string} url
 * @returns {boolean} test
*/
function validateSourceUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  url = url.trim();
  // GitHub folder
  const githubRegex =
    /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[^/]+(?:\/.*)?$/i;
  // Google Drive folder
  const driveRegex =
    /^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]+(?:\?.*)?$/i;
  return githubRegex.test(url) || driveRegex.test(url);
}

/** Hàm thêm nguồn (URL của folder GitHub/GDrive) vào bộ nhớ extension.
 * (do bộ nhớ theo dạng array, nên ở đây cập nhật dưới dạng spread, thay vì pop/push)
 * @param {{url: string, [key: string]: any}} source nguồn cần thêm; `url` phải
 *   ĐÃ được chuẩn hóa bởi fetcher (xem `fetchSubtitleFileList`) — storage
 *   không normalize lại, chỉ validate và so khớp trùng nguyên URL.
 * @returns {Promise<string>} "" khi thành công; chuỗi lỗi khi input sai / trùng lặp
 */
export async function addSource(source = {}) {
  // validate fallback.
  if (!validateSourceUrl(source?.url)) {
    utils.warn(`storage: addSource(): URL không chuẩn: ${source?.url}`);
    return "URL không chuẩn";
  }
  // read→modify→write: chạy trong queue để 2 lời gọi chồng nhau không đọc chung 1 bản cũ.
  return enqueueWrite(async () => {
    const sources = await getSourceList(); // hàm getSourceList đã fallback array trống
    // Kiểm tra trùng lặp bằng nguyên URL đã được chuẩn hóa sẵn bởi fetcher
    // (storage không normalize lại — xem chú thích ở validateSourceUrl).
    if (sources.some(item => item?.url === source.url)) {
      utils.warn(`storage: Nguồn đã tồn tại: ${source.url}`);
      return "Nguồn này đã tồn tại trong danh sách";
    }
    const createdSource = {
      ...source,
      id: crypto.randomUUID(), // định danh ổn định — savedAt chỉ là metadata
      savedAt: Date.now()
    };
    await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: [...sources, createdSource] });
    utils.log(`storage: Đã thêm nguồn: ${source.folderName}`);
    return "";
  });
}
/** Hàm lấy danh sách nguồn (thuần đọc, chạy ngoài queue)
 * @returns danh sách URL folder (dạng array). Mỗi nguồn có id (UUID) + savedAt (metadata).
 */
export async function getSourceList() {
  const data = await chrome.storage.local.get(SUBTITLE_SOURCES_KEY);
  const sources = data[SUBTITLE_SOURCES_KEY];
  // Nếu là mảng thì trả về mảng, nếu chưa có dữ liệu (undefined/null) thì trả về mảng rỗng []
  return Array.isArray(sources) ? sources : [];
}
/** Hàm loại bỏ nguồn dựa trên `id` (định danh ổn định gán lúc addSource).
 * KHÔNG xóa theo savedAt — 2 nguồn thêm cùng 1 ms (cùng savedAt) vẫn là 2 nguồn riêng biệt.
 * (cũng spread thay vì pop/push do bộ nhớ là array thay vì obj)
 * @param {string} id id của nguồn cần xóa
 * @returns {Promise<string>} "" khi xóa được; chuỗi lỗi khi id sai hoặc không tìm thấy nguồn
 */
export async function removeSource(id) {
  if (typeof id !== "string" || !id.trim()) {
    utils.warn(`storage: id nguồn ko hợp lệ: ${id}`);
    return "id nguồn không hợp lệ hoặc trống";
  }
  return enqueueWrite(async () => {
    const sources = await getSourceList();
    const updated = sources.filter(item => item?.id !== id);
    const deleted = sources.filter(item => item?.id === id);
    if (deleted.length === 0) {
      utils.warn(`storage: Không tìm thấy nguồn có id: ${id}`);
      return `Không tìm thấy nguồn có id: ${id}`;
    }
    await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: updated });
    utils.log(`storage: Đã xóa ${deleted.length} nguồn:\n   ${deleted.map(item => item?.url).join('\n   ')}`);
    return "";
  });
}
/** Hàm lưu dữ liệu file sub (obj) dựa trên videoId. Đồng thời cập nhật chỉ mục nhẹ
 * ASSCEE_subIndex (chỉ fileObj + id + thời gian, KHÔNG chứa parsedData) để getSubDataList đọc nhanh.
 * @param {string} videoId đầu vào
 * @param {*} subtitleObj đầu vào dạng subObj (quy định trong file background.js, xem pipeline.txt)
 * @returns {Promise<string>} "" khi lưu xong; chuỗi lỗi khi input không hợp lệ
 */
export async function addSubData(videoId, subtitleObj = {}) {
    if (typeof videoId !== "string" || !videoId) {
      return "videoId không hợp lệ hoặc trống";
    }
    // Chỉ lưu dữ liệu subtitleObj chứa parsedData (xem pipeline.txt)
    // Lưu ý: typeof null === "object" nên phải check thêm null, nếu ko sẽ lưu cache rỗng.
    if (!subtitleObj || typeof subtitleObj !== "object" || Array.isArray(subtitleObj) ||
        subtitleObj.parsedData === null || typeof subtitleObj.parsedData !== "object") { 
        return "Dữ liệu file sub lưu cache không hợp lệ"; 
    }
    // Clone nông trước khi lưu: không mutate object của caller (không gán cachedAt lên object gốc).
    // parsedData giữ tham chiếu chung (chỉ ghi, không sửa) — clone sâu tốn ~7MB, không khuyến nghị.
    const toSave = { ...subtitleObj, cachedAt: Date.now() };
    const subKey = `${SUBTITLE_DATA_KEY_BASE}_${videoId}`;
    // cấu trúc key: ASSCEE_subData_<videoId>
    // Bản thân set(subKey) là atomic theo key, NHƯNG cập nhật chỉ mục là read→modify→write trên
    // key CHUNG (ASSCEE_subIndex) → phải chạy trong queue. Đặt chung 1 task để ghi cache hiếm
    // khi xảy ra và reader qua getSubDataList luôn thấy trạng thái nhất quán (trước/sau task).
    await enqueueWrite(async () => {
      await chrome.storage.local.set({ [subKey]: toSave }); // Luôn luôn ghi đè
      const index = await readSubIndex();
      index[videoId] = buildCacheEntry(toSave, videoId);
      await chrome.storage.local.set({ [SUBTITLE_INDEX_KEY]: index });
    });
    utils.log(`storage: Đã lưu cache sub obj cho vid: ${videoId}.`);
    return "";
}
/** Hàm lấy toàn bộ danh sách dữ liệu sub đang được lưu cache.
 * CHỈ đọc phần nhẹ (fileObj + id + thời gian) từ chỉ mục ASSCEE_subIndex,
 * KHÔNG đọc parsedData (phần này nặng ~7MB/file).
 * Muốn lấy parsedData thì dùng useSubData().
 * @param {string} searchId Id của video cần lấy dữ liệu (nếu để trống thì trả về tất cả)
 * @returns {Promise<Array>} Mảng chứa các obj { videoId, cachedId, cachedAt, ...fileObj }
 */
export async function getSubDataList(searchId = "") {
  const index = await readSubIndex();
  // Dựng lại videoId từ KEY của index (chính xác hơn tin trường videoId bên trong entry).
  const cacheList = [];
  for (const [indexVideoId, entry] of Object.entries(index)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue; // guard data hỏng
    cacheList.push({ ...entry, videoId: indexVideoId });
  }
  let result = cacheList;
  if (searchId) {
    const id = searchId.startsWith('#') ? searchId.slice(1) : searchId;
    result = cacheList.filter(item => item.videoId === id);
  }
  utils.log(`storage: Kết quả tìm kiếm cache cho ${searchId}:`, result);
  return result; // Trả về mảng dạng: [ { videoId, cachedId, cachedAt, ...fileObj }, ... ]
}
/** Đọc chỉ mục ASSCEE_subIndex. Thiếu key / sai kiểu → {} (không quét storage, không migrate).
 * @returns {Promise<Object>} index: { [videoId]: { ...fileObj, videoId, cachedId, cachedAt } }
 */
async function readSubIndex() {
  const data = await chrome.storage.local.get(SUBTITLE_INDEX_KEY);
  const raw = data?.[SUBTITLE_INDEX_KEY];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  return {};
}
/** Gom 1 entry cache thành obj nhẹ để lưu chỉ mục / trả về (chỉ fileObj, ko parsedData).
 * @param {Object} value obj sub đã lưu trong storage
 * @param {string} videoId id lấy từ key lưu trữ
 * @returns {Object} { ...fileObj, videoId, cachedId, cachedAt }
 */
function buildCacheEntry(value, videoId) {
  // Spread fileObj lên ĐẦU để giải phóng các thuộc tính bên trong
  // (thuận tiện cho việc ghi cache này sang id khác), chỉ khi nó là object hợp lệ.
  const fileObj = value.fileObj && typeof value.fileObj === "object" && !Array.isArray(value.fileObj)
    ? value.fileObj
    : {};
  return {
    ...fileObj,
    videoId,                  // Ghi đè videoId chuẩn xác lấy từ Key lưu trữ (id mới)
    cachedId: value.videoId || null, // id gốc lúc cache
    cachedAt: value.cachedAt || null
  };
}
/** Hàm lấy dữ liệu file sub (obj) dựa trên videoId (thuần đọc, chạy ngoài queue)
 * @param {string} videoId đầu vào
 * @returns {Promise<Object|null>} toàn bộ subObj đã lưu (gồm fileObj, parsedData, cachedAt) hoặc null nếu ko có
 */
export async function useSubData(videoId) {
  if (!videoId) return null;
  const subKey = `${SUBTITLE_DATA_KEY_BASE}_${videoId}`;
  const data = await chrome.storage.local.get(subKey);
  // Trả về dữ liệu bên trong key đó, nếu không có thì trả về null
  return data[subKey] || null;
}
/** Hàm loại bỏ dữ liệu sub của một videoId cụ thể khỏi cache
 * (xóa cả key ASSCEE_subData_<videoId> lẫn mục tương ứng trong chỉ mục ASSCEE_subIndex).
 * @param {string} videoId 
 * @returns {Promise<string>} "" khi xóa xong; chuỗi lỗi khi videoId sai hoặc không có dữ liệu để xóa
 */
export async function removeSubData(videoId) {
  if (typeof videoId !== "string" || !videoId) {
    utils.warn(`storage: videoId trống, ko có obj để xóa.`);
    return "videoId không hợp lệ hoặc trống";
  }
  // Xác định đúng key dựa trên videoId tương tự như hàm useSubData
  const subKey = `${SUBTITLE_DATA_KEY_BASE}_${videoId}`;
  // Cập nhật chỉ mục là read→modify→write trên key chung → chạy trong queue
  // (xem bình luận ở addSubData). Bản thân remove(subKey) là atomic theo key.
  return enqueueWrite(async () => {
    // Kiểm tra xem dữ liệu có tồn tại trước khi xóa (để hiển thị log chính xác)
    const data = await chrome.storage.local.get(subKey);
    if (!data[subKey]) {
      utils.warn(`storage: obj ${videoId} ko có dữ liệu để xóa.`);
      return `Không có dữ liệu cache cho vid: ${videoId}`;
    }
    // Tiến hành xóa key cụ thể này khỏi chrome.storage.local
    await chrome.storage.local.remove(subKey);
    const index = await readSubIndex();
    delete index[videoId];
    await chrome.storage.local.set({ [SUBTITLE_INDEX_KEY]: index });
    utils.log(`storage: Đã xóa cache sub obj của vid: ${videoId}.`);
    return "";
  });
}
/** Hàm kiểm tra xem nếu giá trị config có hợp lệ. Chỉ chấp nhận string/number/boolean.
 * (không chấp nhận null/undefined vì chrome.storage.local biến undefined thành null
 * khi đọc lại, gây nhầm lẫn với key không tồn tại — getConfig() trả null cho key vắng mặt)
 * @param {string|number|boolean} value Hàm trả về true nếu đúng những loại trên
 * @returns {boolean}
 */
function isValidConfigValue(value) {
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}
/** Hàm lấy cấu hình người dùng hoặc một khóa cụ thể trong config (thuần đọc, chạy ngoài queue).
 * Nếu key falsy hoặc không phải string thì trả về toàn bộ object config (dạng BẢN SAO nông —
 * caller sửa bản sao không ảnh hưởng storage; config chỉ chứa string/number/boolean nên nông là đủ).
 * @param {string|null|undefined} key
 * @returns {Promise<Record<string, any>|string|number|boolean|null>} Giá trị của khóa, hoặc bản sao toàn bộ object config
 */
export async function getConfig(key = null) {
  // Lấy dữ liệu từ storage. Trả về object trống nếu dữ liệu ko có/ko chuẩn hóa
  const data = await chrome.storage.local.get(USER_CONFIG_KEY);
  const raw = data?.[USER_CONFIG_KEY];
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const output = (!key || typeof key !== "string") 
    ? { ...config } // BẢN SAO nông — tránh caller mutate object đang lưu
    : Object.hasOwn(config, key) 
      ? config[key] 
      : null
  // Trả về bản sao object config do key = null hoặc không phải string chuẩn
  // Nếu là string chuẩn, kiểm tra nếu config có key đó, nếu ko có key thì trả null.
  utils.log(`storage: Lấy config[${key}]: ${output}`);
  return output;
}
/** Hàm cập nhật config người dùng (1 key). Chạy trong queue để 2 lời gọi đồng thời
 * không đọc chung 1 bản config cũ rồi ghi đè mất cập nhật của nhau.
 * @param {string} key nếu config ko có key đó đặt mới. Nếu key ko phải string thì ko ghi gì.
 * @param {string|number|boolean} value lọc theo isValidConfigValue
 * @returns {Promise<string>} "" khi ghi xong; chuỗi lỗi khi key/value không hợp lệ
 */
export async function setConfig(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    utils.warn(`storage (setConfig): key ko hợp lệ: `, key);
    return "key config không hợp lệ hoặc trống";
  }
  if (!isValidConfigValue(value)) {
    utils.warn(`storage (setConfig): value ko hợp lệ: `, value);
    return "value config không hợp lệ (chỉ chấp nhận string/number/boolean)";
  }
  return enqueueWrite(async () => {
    const config = await getConfig(); // getConfig trả bản sao nông → sửa thoải mái
    config[key] = value;
    await chrome.storage.local.set({ [USER_CONFIG_KEY]: config });
    utils.log(`storage: Đã cập nhật. config[${key}] = ${value}`);
    return "";
  });
}

// ==================== renderer stat: cooldown trong chính object lưu ====================
// Renderer tự gọi ~1 lần/giây; storage giữ fallback 500ms. Gọi sớm hơn → không ghi, trả chuỗi lỗi.
// lastTimeSet nằm trong ASSCEE_renderData; getRendererStat lọc field này khỏi bản trả về.
/** Hàm lấy dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm)
 * @returns {Promise<Object>} Bản sao nông của object chứa các thuộc tính fps, nps, dfps, subTitle
 */
export async function getRendererStat() {
  const data = await chrome.storage.local.get(RENDERER_STAT_KEY);
  const raw = data?.[RENDERER_STAT_KEY];
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const { lastTimeSet, ...snapshot } = stored; // lastTimeSet chỉ dùng nội bộ
  utils.log(`storage: Lấy rendererData:`, snapshot);
  return snapshot;
}
/** Hàm cập nhật dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm).
 * Ghi ngay xuống storage nếu đã hết cooldown (500ms); nếu chưa → bỏ data, trả chuỗi lỗi.
 * @param {*} newData dạng object, chứa các thuộc tính fps, nps, dfps, subTitle
 * @returns {Promise<string>} "" khi ghi xong; chuỗi lỗi khi input sai hoặc đang cooldown
 */
export async function setRendererStat(newData = {}) {
  // typeof null === "object" nên phải check thêm null
  if (typeof newData !== "object" || newData === null || Array.isArray(newData)) {
    utils.warn(`storage (setRendererStat): newData ko hợp lệ: `, newData);
    return "newData không hợp lệ (cần object)";
  }
  return enqueueWrite(async () => {
    const data = await chrome.storage.local.get(RENDERER_STAT_KEY);
    const raw = data?.[RENDERER_STAT_KEY];
    const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const last = typeof stored.lastTimeSet === "number" ? stored.lastTimeSet : 0;
    if (Date.now() - last < RENDERER_STAT_COOLDOWN_MS) {
      utils.warn(`storage (setRendererStat): chưa hết thời gian chờ`);
      return "Chưa hết thời gian chờ";
    }
    // Bỏ lastTimeSet từ caller (nếu có) — mốc cooldown do storage tự ghi.
    const { lastTimeSet: _ignored, ...incoming } = newData;
    const updated = { ...stored, ...incoming, lastTimeSet: Date.now() };
    await chrome.storage.local.set({ [RENDERER_STAT_KEY]: updated });
    utils.log(`storage: Đã ghi rendererData:`, updated);
    return "";
  });
}
