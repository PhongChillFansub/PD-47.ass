// v0.1.0 21aug26
// alpha mode
// Chức năng: chuyên xử lí lưu trữ trên chrome.storage.local.
// Quy ước chung (xem pipeline.txt):
// - storage.js là nơi DUY NHẤT ghi chrome.storage.local; module khác cần lưu thì gọi qua đây.
// - Lỗi do input / nghiệp vụ → trả result-object { success, data | error } (KHÔNG throw);
//   lỗi lập trình / trạng thái không hợp lệ → throw.
// - Mọi thao tác read→modify→write đều chạy qua hàng đợi ghi private (enqueueWrite) để tránh
//   race: 2 lời gọi chồng nhau đọc cùng 1 giá trị cũ rồi ghi đè mất cập nhật của nhau.
// - Thuần đọc (getSourceList, getConfig, useSubData...) chạy ngoài queue; riêng getSubDataList
//   phải đi qua queue 1 lần duy nhất để migrate chỉ mục cache (xem ensureSubIndexRaw).
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
 * Tự migrate 1 lần từ dữ liệu cũ khi key này chưa tồn tại (xem ensureSubIndexRaw). */
const SUBTITLE_INDEX_KEY = "ASSCEE_subIndex";
/** Lưu các thiết đặt/dữ liệu điều khiển của người dùng */
const USER_CONFIG_KEY = "ASSCEE_config";
/** Lưu các dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị */
const RENDERER_STAT_KEY = "ASSCEE_renderData"; 
/** Khoảng cách tối thiểu giữa 2 lần flush rendererStat xuống storage (~4 lần/giây). */
const RENDERER_STAT_FLUSH_INTERVAL_MS = 250;

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

/** Chuẩn hóa URL nguồn để so sánh trùng lặp: trim + lowercase phần scheme://host,
 * GIỮ NGUYÊN path/query (path phân biệt hoa-thường). Không dùng cho việc lưu — chỉ để so sánh.
 * @param {string} url
 * @returns {string} URL đã chuẩn hóa (chuỗi rỗng nếu không phải string)
 */
function normalizeSourceUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  // Tách phần "scheme://host" khỏi phần còn lại (path/query/hash) rồi chỉ lowercase phần đầu.
  const match = trimmed.match(/^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)([\s\S]*)$/i);
  return match ? match[1].toLowerCase() + match[2] : trimmed;
}
/**  Hàm kiểm tra URL 
 * @param {string} url
 * @returns {boolean} test
*/
function validateSourceUrl(url) {
  if (typeof url !== "string") return false;
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
 * @param {*} source thô: { url, type, folderName, folderId }
 * @returns {Promise<Object>} { success: true, data } khi thành công (data = nguồn đã thêm,
 *   gồm id ổn định + savedAt); { success: false, error, url } khi input sai / trùng lặp
 */
export async function addSource(source = {}) {
  // Check typeof trước rồi mới .trim(): optional chaining chỉ chặn null/undefined,
  // ko chặn number/object nên `source?.url?.trim()` cũ có thể throw TypeError.
  if (typeof source?.url !== "string" || !source.url.trim()) {
    utils.warn(`storage: Nguồn ko hợp lệ: ${source?.url}`);
    return { success: false, error: "Dữ liệu nguồn không hợp lệ hoặc URL trống", url: source?.url };
  }
  const normalizedUrl = normalizeSourceUrl(source.url);
  if (!validateSourceUrl(normalizedUrl)) {
    utils.warn(`storage: URL không được hỗ trợ: ${source.url}`);
    return {
      success: false,
      error: "Chỉ hỗ trợ thư mục GitHub hoặc Google Drive",
      url: source.url
    };
  }
  // read→modify→write: chạy trong queue để 2 lời gọi chồng nhau không đọc chung 1 bản cũ.
  return enqueueWrite(async () => {
    const sources = await getSourceList(); // hàm getSourceList đã fallback array trống
    // Migrate nhẹ dữ liệu cũ: nguồn lưu trước khi có `id` được gán id 1 lần
    // để vẫn xóa được bằng removeSource(id), không bị "mắc kẹt" trong danh sách.
    let migrated = false;
    const withIds = sources.map(item => {
      if (item && typeof item === "object" && (typeof item.id !== "string" || !item.id)) {
        migrated = true;
        return { ...item, id: crypto.randomUUID() };
      }
      return item;
    });
    // Kiểm tra trùng lặp bằng URL ĐÃ CHUẨN HÓA (trim + lowercase scheme/host, path giữ nguyên)
    if (withIds.some(item => normalizeSourceUrl(item?.url) === normalizedUrl)) {
      // Vẫn lưu id vừa gán cho nguồn cũ dù không thêm nguồn mới.
      if (migrated) await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: withIds });
      utils.warn(`storage: Nguồn đã tồn tại: ${source.url}`);
      return { success: false, error: "Nguồn này đã tồn tại trong danh sách", url: source.url };
    }  
    const createdSource = {
      ...source,
      id: crypto.randomUUID(), // định danh ổn định — savedAt chỉ là metadata
      savedAt: Date.now()
    };
    const updated = [...withIds, createdSource];
    await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: updated });
    utils.log(`storage: Đã thêm nguồn: ${source.folderName}`);
    return { success: true, data: createdSource };
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
 * KHÔNG còn xóa theo savedAt — 2 nguồn thêm cùng 1 ms (cùng savedAt) vẫn là 2 nguồn riêng biệt.
 * (cũng spread thay vì pop/push do bộ nhớ là array thay vì obj)
 * @param {string} id id của nguồn cần xóa
 * @returns {Promise<Object>} { success: true, data } khi xóa được (data = danh sách nguồn còn lại);
 *   { success: false, error } khi id sai hoặc không tìm thấy nguồn
 */
export async function removeSource(id) {
  if (typeof id !== "string" || !id.trim()) {
    utils.warn(`storage: id nguồn ko hợp lệ: ${id}`);
    return { success: false, error: "id nguồn không hợp lệ hoặc trống" };
  }
  return enqueueWrite(async () => {
    const sources = await getSourceList();
    const updated = sources.filter(item => item?.id !== id);
    const deleted = sources.filter(item => item?.id === id);
    if (deleted.length === 0) {
      utils.warn(`storage: Không tìm thấy nguồn có id: ${id}`);
      return { success: false, error: `Không tìm thấy nguồn có id: ${id}` };
    }
    await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: updated });
    utils.log(`storage: Đã xóa ${deleted.length} nguồn:\n   ${deleted.map(item => item?.url).join('\n   ')}`);
    return { success: true, data: updated };
  });
}
/** Hàm lưu dữ liệu file sub (obj) dựa trên videoId. Đồng thời cập nhật chỉ mục nhẹ
 * ASSCEE_subIndex (chỉ fileObj + id + thời gian, KHÔNG chứa parsedData) để getSubDataList đọc nhanh.
 * @param {string} videoId đầu vào
 * @param {*} subtitleObj đầu vào dạng subObj (quy định trong file background.js, xem pipeline.txt)
 * @returns {Promise<Object>} { success: true, data: videoId } khi lưu xong;
 *   { success: false, error } khi input không hợp lệ (KHÔNG throw — theo quy ước lỗi chung)
 */
export async function addSubData(videoId, subtitleObj = {}) {
    if (typeof videoId !== "string" || !videoId) {
      return { success: false, error: "videoId không hợp lệ hoặc trống" };
    }
    // Chỉ lưu dữ liệu subtitleObj chứa parsedData (xem pipeline.txt)
    // Lưu ý: typeof null === "object" nên phải check thêm null, nếu ko sẽ lưu cache rỗng.
    if (!subtitleObj || typeof subtitleObj !== "object" || Array.isArray(subtitleObj) ||
        subtitleObj.parsedData === null || typeof subtitleObj.parsedData !== "object") { 
        return { success: false, error: "Dữ liệu file sub lưu cache không hợp lệ" }; 
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
      const index = await ensureSubIndexRaw();
      index[videoId] = buildCacheEntry(toSave, videoId);
      await chrome.storage.local.set({ [SUBTITLE_INDEX_KEY]: index });
    });
    utils.log(`storage: Đã lưu cache sub obj cho vid: ${videoId}.`);
    return { success: true, data: videoId };
}
/** Hàm lấy toàn bộ danh sách dữ liệu sub đang được lưu cache.
 * CHỈ đọc phần nhẹ (fileObj + id + thời gian) từ chỉ mục ASSCEE_subIndex,
 * KHÔNG đọc parsedData (phần này nặng ~7MB/file).
 * Muốn lấy parsedData thì dùng useSubData().
 * @param {string} searchId Id của video cần lấy dữ liệu (nếu để trống thì trả về tất cả)
 * @returns {Promise<Array>} Mảng chứa các obj { videoId, cachedId, cachedAt, ...fileObj }
 */
export async function getSubDataList(searchId = "") {
  // Thuần đọc TRỪ lần migrate đầu tiên: index chưa tồn tại → ensureSubIndexRaw quét 1 lần
  // build lại rồi lưu (qua queue vì là read→modify→write trên key chung).
  const index = await enqueueWrite(ensureSubIndexRaw);
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
/** Đọc chỉ mục ASSCEE_subIndex; nếu key CHƯA tồn tại (cache từ trước khi có chỉ mục)
 * thì quét storage 1 lần build lại rồi lưu — migrate nhẹ, chỉ tốn 1 lần duy nhất.
 * CHỈ được gọi bên trong queue (read→modify→write trên key chung).
 * @returns {Promise<Object>} index: { [videoId]: { ...fileObj, videoId, cachedId, cachedAt } }
 */
async function ensureSubIndexRaw() {
  const data = await chrome.storage.local.get(SUBTITLE_INDEX_KEY);
  const raw = data?.[SUBTITLE_INDEX_KEY];
  // Index đã tồn tại (kể cả {} hợp lệ sau khi người dùng xóa hết cache) → dùng luôn.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  // Index chưa có: quét các key ASSCEE_subData_* để build lại.
  // Lưu ý: get(null) đọc cả parsedData (~7MB/file) — chấp nhận vì chỉ xảy ra 1 lần.
  const allData = await chrome.storage.local.get(null);
  const index = {};
  for (const [key, value] of Object.entries(allData)) {
    if (!key.startsWith(`${SUBTITLE_DATA_KEY_BASE}_`)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue; // guard data hỏng
    const videoId = key.slice(SUBTITLE_DATA_KEY_BASE.length + 1); // Lấy videoId gốc từ key (chính xác hơn replace)
    index[videoId] = buildCacheEntry(value, videoId);
  }
  await chrome.storage.local.set({ [SUBTITLE_INDEX_KEY]: index });
  return index;
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
 * @returns {Promise<Object>} { success: true, data: videoId } khi xóa xong;
 *   { success: false, error } khi videoId sai hoặc không có dữ liệu để xóa
 */
export async function removeSubData(videoId) {
  if (typeof videoId !== "string" || !videoId) {
    utils.warn(`storage: videoId trống, ko có obj để xóa.`);
    return { success: false, error: "videoId không hợp lệ hoặc trống" };
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
      return { success: false, error: `Không có dữ liệu cache cho vid: ${videoId}` };
    }
    // Tiến hành xóa key cụ thể này khỏi chrome.storage.local
    await chrome.storage.local.remove(subKey);
    const index = await ensureSubIndexRaw();
    delete index[videoId];
    await chrome.storage.local.set({ [SUBTITLE_INDEX_KEY]: index });
    utils.log(`storage: Đã xóa cache sub obj của vid: ${videoId}.`);
    return { success: true, data: videoId };
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
 * @returns {Promise<Object>} { success: true, data } khi ghi xong (data = bản sao config mới);
 *   { success: false, error } khi key/value không hợp lệ
 */
export async function setConfig(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    utils.warn(`storage (setConfig): key ko hợp lệ: `, key);
    return { success: false, error: "key config không hợp lệ hoặc trống" };
  }
  if (!isValidConfigValue(value)) {
    utils.warn(`storage (setConfig): value ko hợp lệ: `, value);
    return { success: false, error: "value config không hợp lệ (chỉ chấp nhận string/number/boolean)" };
  }
  return enqueueWrite(async () => {
    const config = await getConfig(); // getConfig trả bản sao nông → sửa thoải mái
    config[key] = value;
    await chrome.storage.local.set({ [USER_CONFIG_KEY]: config });
    utils.log(`storage: Đã cập nhật. config[${key}] = ${value}`);
    return { success: true, data: { ...config } };
  });
}

// ==================== renderer stat: throttle + queue ====================
// Renderer (fps/nps/dfps/subTitle) có thể gọi 30–60 lần/giây; chrome.storage.local.set mỗi
// frame = serialize JSON + I/O liên tục, tốn và dễ race. Chiến lược: giữ giá trị mới nhất
// trong bộ nhớ (pending), flush qua queue tối đa ~4 lần/giây (setTimeout + khoảng cách tối
// thiểu). Queue đảm bảo KHÔNG MẤT cập nhật, throttle đảm bảo ÍT lần ghi.
// (Cân nhắc sau này, nếu stat tốc độ cao không cần persist: chuyển sang chrome.runtime
// message + onChanged — nhưng throttle trước là đủ.)
// Lưu ý: pending nằm trong bộ nhớ service worker — SW bị kill trước khi flush thì mất phần
// chưa ghi. Chấp nhận được vì đây chỉ là dữ liệu hiển thị tức thời.
let rendererStatView = null;    // bản xem mới nhất (stored + pending) để trả ngay, ko cần đọc lại storage
let rendererStatPending = null; // phần cập nhật chưa flush xuống storage
let rendererStatTimer = null;   // setTimeout đang chờ flush (null = chưa có lịch)
let rendererStatLastFlush = 0;  // thời điểm flush gần nhất (ms)
/** Hàm lấy dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm)
 * @returns {Promise<Object>} Bản sao nông của object chứa các thuộc tính fps, nps, dfps, subTitle
 */
export async function getRendererStat() {
  const data = await chrome.storage.local.get(RENDERER_STAT_KEY);
  const raw = data?.[RENDERER_STAT_KEY];
  const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  // Gộp thêm phần pending chưa flush để bản xem trong bộ nhớ luôn là mới nhất.
  rendererStatView = rendererStatPending ? { ...stored, ...rendererStatPending } : stored;
  const snapshot = { ...rendererStatView };
  utils.log(`storage: Lấy rendererData:`, snapshot);
  return snapshot;
}
/** Hàm cập nhật dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm).
 * Gộp ngay vào bộ nhớ và hẹn flush (≤ ~4 lần/giây) — KHÔNG ghi storage mỗi lần gọi.
 * @param {*} newData dạng object, chứa các thuộc tính fps, nps, dfps, subTitle
 * @returns {Promise<Object>} { success: true, data } khi nhận xong (data = bản xem mới nhất
 *   gồm cả phần chưa flush); { success: false, error } khi newData không phải object
 */
export async function setRendererStat(newData = {}) {
  // typeof null === "object" nên phải check thêm null
  if (typeof newData !== "object" || newData === null || Array.isArray(newData)) {
    utils.warn(`storage (setRendererStat): newData ko hợp lệ: `, newData);
    return { success: false, error: "newData không hợp lệ (cần object)" };
  }
  if (rendererStatView === null) await getRendererStat(); // khởi tạo bản xem 1 lần duy nhất
  rendererStatPending = { ...rendererStatPending, ...newData };
  rendererStatView = { ...rendererStatView, ...newData };
  scheduleRendererStatFlush();
  const snapshot = { ...rendererStatView };
  utils.log(`storage: Đã nhận rendererData (sẽ flush):`, snapshot);
  return { success: true, data: snapshot };
}
/** Hẹn 1 lần flush; nếu đã có lịch thì bỏ qua (pending sẽ được gộp hết vào lần flush đó). */
function scheduleRendererStatFlush() {
  if (rendererStatTimer !== null) return;
  const delay = Math.max(0, rendererStatLastFlush + RENDERER_STAT_FLUSH_INTERVAL_MS - Date.now());
  rendererStatTimer = setTimeout(() => {
    rendererStatTimer = null;
    rendererStatLastFlush = Date.now();
    flushRendererStat().catch(err => utils.warn(`storage: flush rendererStat thất bại:`, err));
  }, delay);
}
/** Flush pending xuống storage qua queue: đọc bản lưu MỚI NHẤT trong task rồi gộp phần chốt
 * (snapshot) — phần pending đến sau khi chốt vẫn được giữ lại cho lần flush kế tiếp. */
function flushRendererStat() {
  if (!rendererStatPending) return Promise.resolve();
  const snapshot = rendererStatPending;
  rendererStatPending = null;
  return enqueueWrite(async () => {
    const data = await chrome.storage.local.get(RENDERER_STAT_KEY);
    const raw = data?.[RENDERER_STAT_KEY];
    const stored = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const updated = { ...stored, ...snapshot };
    await chrome.storage.local.set({ [RENDERER_STAT_KEY]: updated });
    // Gộp thêm phần pending mới đến trong lúc flush vào bản xem (nó sẽ được flush lần sau).
    rendererStatView = { ...updated, ...rendererStatPending };
    utils.log(`storage: Đã flush rendererData:`, updated);
  });
}
