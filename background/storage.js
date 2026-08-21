// v0.1.0 21aug26
// alpha mode
// Chức năng: chuyên xử lí lưu trữ trên chrome.storage.local.
/** Nhận logger(message, type = 'info', extra = undefined) */
import * as utils from './utils.js'; 
/** Dùng trong 3 hàm export với link folder: addSource, getSourceList, removeSource
 * 
 * Lưu tất cả obj folder trong 1 key. */
const SUBTITLE_SOURCES_KEY = "ASSCEE_sourceList"; 
/** 4 hàm với file sub: addSubData, getSubDataList, useSubData, removeSubData
 * 
 * Lưu các file sub trong key riêng biệt (do 1 file sub, thuần text đã có thể nặng đến 7MB) */
const SUBTITLE_DATA_KEY_BASE = "ASSCEE_subData"; 
/** Lưu các thiết đặt/dữ liệu điều khiển của người dùng */
const USER_CONFIG_KEY = "ASSCEE_config";
/** Lưu các dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị */
const RENDERER_STAT_KEY = "ASSCEE_renderData"; 
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
 * @returns {Promise<Object>} { success: true, data } khi thành công; { success: false, error, url } khi thất bại
 */
export async function addSource(source = {}) {
  // Check typeof trước rồi mới .trim(): optional chaining chỉ chặn null/undefined,
  // ko chặn number/object nên `source?.url?.trim()` cũ có thể throw TypeError.
  if (typeof source?.url !== "string" || !source.url.trim()) {
    utils.warn(`storage: Nguồn ko hợp lệ: ${source?.url}`);
    return { success: false, error: "Dữ liệu nguồn không hợp lệ hoặc URL trống", url: source?.url };
  }
  if (!validateSourceUrl(source.url)) {
    utils.warn(`storage: URL không được hỗ trợ: ${source.url}`);
    return {
      success: false,
      error: "Chỉ hỗ trợ thư mục GitHub hoặc Google Drive",
      url: source.url
    };
  }
  const sources = await getSourceList(); // Lấy danh sách nguồn đã có để kiểm tra trùng lặp (hàm getSourceList đã fallback array trống)
  // Kiểm tra trùng lặp
  if (sources.some(item => item.url === source.url)) {
    utils.warn(`storage: Nguồn đã tồn tại: ${source?.url}`);
    return { success: false, error: "Nguồn này đã tồn tại trong danh sách", url: source.url };
  }  
  const createdSource = {
    ...source,
    savedAt: Date.now()
  };
  const updated = [...sources, createdSource];
  await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: updated });
  utils.log(`storage: Đã thêm nguồn: ${source.folderName}`);
  return { success: true, data: createdSource };
}
/** Hàm lấy danh sách nguồn
 * @returns danh sách URL folder (dạng array).
 */
export async function getSourceList() {
  const data = await chrome.storage.local.get(SUBTITLE_SOURCES_KEY);
  const sources = data[SUBTITLE_SOURCES_KEY];
  // Nếu là mảng thì trả về mảng, nếu chưa có dữ liệu (undefined/null) thì trả về mảng rỗng []
  return Array.isArray(sources) ? sources : [];
}
/** Hàm loại bỏ nguồn dựa trên thời gian. (cũng spread thay vì pop/push do bộ nhớ là array thay vì obj)
 * @param {number|string} time savedAt của nguồn cần xóa (chấp nhận string để linh hoạt khi lấy từ popup)
 * @returns {Promise<Array>} danh sách nguồn còn lại sau khi xóa
 */
export async function removeSource(time) {
  const sources = await getSourceList();
  // Chuẩn hóa time về number MỘT LẦN rồi so sánh strict ở cả 2 filter,
  // tránh bug cũ: filter giữ lại dùng `!==` còn filter đếm dùng `==`
  // (khi time là string thì nguồn bị log "Đã xóa" nhưng vẫn nằm lại trong storage).
  const t = Number(time); // NaN nếu time rỗng → không xóa gì
  const updated = sources.filter(s => Number(s.savedAt) !== t);
  const deleted = sources.filter(s => Number(s.savedAt) === t);
  await chrome.storage.local.set({ [SUBTITLE_SOURCES_KEY]: updated });
  utils.log(`storage: Đã xóa ${deleted.length} nguồn:\n   ${deleted.map(item => item.url).join('\n   ')}`);
  return updated;
}
/** Hàm lưu dữ liệu file sub (obj) dựa trên videoId
 * @param {*} videoId đầu vào
 * @param {*} subtitleObj đầu vào dạng subObj (quy định trong file background.js, xem pipeline.txt)
 * @returns {Promise<void>} Ko có đầu ra trực tiếp. subObj là đầu ra gián tiếp (dạng tham chiếu)
 */
export async function addSubData(videoId, subtitleObj = {}) {
    // Chỉ lưu dữ liệu subtitleObj chứa parsedData (xem pipeline.txt)
    // Lưu ý: typeof null === "object" nên phải check thêm null, nếu ko sẽ lưu cache rỗng.
    if (!videoId || subtitleObj.parsedData === null || typeof subtitleObj.parsedData !== "object") { 
        throw new Error("Dữ liệu file sub lưu cache không hợp lệ"); 
    }
    subtitleObj.cachedAt = Date.now()
    const subKey = `${SUBTITLE_DATA_KEY_BASE}_${videoId}`
    // cấu trúc key: ASSCEE_subData_<videoId>
    await chrome.storage.local.set({ [subKey]: subtitleObj });
    // Luôn luôn ghi đè
    utils.log(`storage: Đã lưu cache sub obj cho vid: ${videoId}.`);
}
/** Hàm lấy toàn bộ danh sách dữ liệu sub đang được lưu cache
 * CHỈ đọc phần nhẹ (fileObj + id + thời gian), KHÔNG đọc parsedData (phần này nặng).
 * Muốn lấy parsedData thì dùng useSubData().
 * @param {string} searchId Id của video cần lấy dữ liệu (nếu để trống thì trả về tất cả)
 * @returns {Promise<Array>} Mảng chứa các obj { videoId, cachedId, cachedAt, ...fileObj }
 */
export async function getSubDataList(searchId = "") {
  // Nếu có searchId: chỉ đọc đúng key của video đó, tránh tải toàn bộ cache nặng
  // (get(null) trước đây phải đọc cả parsedData của mọi file sub ~7MB/file).
  if (searchId) {
    const id = searchId.startsWith('#') ? searchId.slice(1) : searchId;
    const subKey = `${SUBTITLE_DATA_KEY_BASE}_${id}`;
    const data = await chrome.storage.local.get(subKey);
    const value = data?.[subKey];
    const cacheList = [];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      cacheList.push(buildCacheEntry(value, id));
    }
    utils.log(`storage: Kết quả tìm kiếm cache cho ${searchId}:`, cacheList);
    return cacheList;
  }
  // Không có searchId: lấy toàn bộ rồi lọc các key có tiền tố SUBTITLE_DATA_KEY_BASE+"_"
  const allData = await chrome.storage.local.get(null);
  const cacheList = []; // 1. Chuyển thành Mảng trống
  for (const [key, value] of Object.entries(allData)) {
    if (!key.startsWith(`${SUBTITLE_DATA_KEY_BASE}_`)) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue; // guard data hỏng
    const videoId = key.slice(SUBTITLE_DATA_KEY_BASE.length + 1); // Lấy videoId gốc từ key (chính xác hơn replace)
    // 2. Sử dụng .push() để thêm đối tượng trực tiếp vào mảng
    cacheList.push(buildCacheEntry(value, videoId));
  }
  utils.log(`storage: Kết quả tìm kiếm cache cho ${searchId}:`, cacheList);
  return cacheList; // Trả về mảng dạng: [ { videoId, cachedId, cachedAt, ...fileObj }, ... ]
}

/** Gom 1 entry cache thành obj nhẹ để getSubDataList trả về (chỉ fileObj, ko parsedData).
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
/** Hàm lấy dữ liệu file sub (obj) dựa trên videoId
 * @param {*} videoId đầu vào
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
 * @param {string} videoId 
 * @returns {Promise<boolean>} true nếu xóa thành công, false nếu ko có hành động xóa nào
 */
export async function removeSubData(videoId) {
  if (!videoId) {
    utils.warn(`storage: videoId trống, ko có obj để xóa.`);
    return false;
  }
  // Xác định đúng key dựa trên videoId tương tự như hàm useSubData
  const subKey = `${SUBTITLE_DATA_KEY_BASE}_${videoId}`;
  // Kiểm tra xem dữ liệu có tồn tại trước khi xóa (để hiển thị log chính xác)
  const data = await chrome.storage.local.get(subKey);
  if (!data[subKey]) {
    utils.warn(`storage: obj ${videoId} ko có dữ liệu để xóa.`);
    return false;
  }
  // Tiến hành xóa key cụ thể này khỏi chrome.storage.local
  await chrome.storage.local.remove(subKey);
  utils.log(`storage: Đã xóa cache sub obj của vid: ${videoId}.`);
  return true;
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
/** Hàm lấy cấu hình người dùng hoặc một khóa cụ thể trong config.
 * Nếu key falsy hoặc không phải string thì trả về toàn bộ object config.
 * @param {string|null|undefined} key
 * @returns {Promise<Record<string, any>|string|number|boolean|null>} Giá trị của khóa, hoặc toàn bộ object config
 */
export async function getConfig(key = null) {
  // Lấy dữ liệu từ storage. Trả về object trống nếu dữ liệu ko có/ko chuẩn hóa
  const data = await chrome.storage.local.get(USER_CONFIG_KEY);
  const raw = data?.[USER_CONFIG_KEY];
  const config = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const output = (!key || typeof key !== "string") 
    ? config 
    : Object.hasOwn(config, key) 
      ? config[key] 
      : null
  // Trả về object config do key = null hoặc không phải string chuẩn
  // Nếu là string chuẩn, kiểm tra nếu config có key đó, nếu ko có key thì trả null.
  utils.log(`storage: Lấy config[${key}]: ${output}`);
  return output;
}
/** Hàm cập nhật config người dùng.
 * @param {string} key nếu config ko có key đó đặt mới. Nếu key ko phải string thì ko ghi gì, warn.
 * @param {string|number|boolean} value lọc theo isValidConfigValue
 * @returns Trả về getConfig()
 */
export async function setConfig(key, value) {
  if (typeof key !== "string" || !key.trim()) {
    utils.warn(`storage (setConfig): key ko hợp lệ: `, key);
    return false;
  }
  if (!isValidConfigValue(value)) {
    utils.warn(`storage (setConfig): value ko hợp lệ: `, value);
    return false;
  }
  const config = await getConfig();
  config[key] = value;
  await chrome.storage.local.set({ [USER_CONFIG_KEY]: config });
  utils.log(`storage: Đã cập nhật. config[${key}] = ${value}`);
  return true;
}
/** Hàm lấy dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm)
 * @returns {Promise<Object>} Object chứa các thuộc tính fps, nps, dfps, subTitle
 */
export async function getRendererStat() {
  const data = await chrome.storage.local.get(RENDERER_STAT_KEY);
  const raw = data?.[RENDERER_STAT_KEY];
  const rendererData = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  utils.log(`storage: Lấy rendererData:`, rendererData);
  return rendererData;
}
/** Hàm cập nhật dữ liệu render (fps, nps, dfps, subTitle) để popup hiển thị (cho renderer làm)
 * @param {*} newData dạng object, chứa các thuộc tính fps, nps, dfps, subTitle
 * @returns rendererData mới sau khi cập nhật
 */
export async function setRendererStat(newData = {}) {
  // typeof null === "object" nên phải check thêm null
  if (typeof newData !== "object" || newData === null || Array.isArray(newData)) {
    utils.warn(`storage (setRendererStat): newData ko hợp lệ: `, newData);
    return getRendererStat();
  }
  const currentData = await getRendererStat();
  const updatedData = { ...currentData, ...newData };
  await chrome.storage.local.set({ [RENDERER_STAT_KEY]: updatedData });
  utils.log(`storage: Đã cập nhật rendererData:`, updatedData);
  return getRendererStat();
}