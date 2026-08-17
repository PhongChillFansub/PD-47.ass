// v0.1.0 16aug26
// Chức năng: xử lí ban đầu, giai đoạn từ danh sách link thư mục nguồn đến giai đoạn có file sub thô (rawText)
// export: fetchSubtitleText (từ link file sub tới rawText), 
//         fetchSubtitleFile (từ danh sách link thư mục nguồn đến danh sách link file sub)
/** Nhận logger(message, type = 'info', extra = undefined) */
import * as utils from './utils.js';
/** Tối đa 60 giây kết nối và nhận dữ liệu. Dùng cho hàm fetchWithTimeout(). */
const FETCH_TIMEOUT = 60000;
/** Chỉ nhận file sub V4+ tạo bằng Aegisub? */
const VALID_FILE_SIGNATURE = ["[Script Info]", "[V4+ Styles]", "[Events]"];
/** [ChatGPT] kiểm tra dữ liệu hợp lệ. Trả về boolean */
const validateSubtitleContent = text => !!text && VALID_FILE_SIGNATURE.some(sig => text.includes(sig));
/** [ChatGPT] Fetch with timeout. */
const fetchWithTimeout = async url => {
  // Tạo một AbortController để hủy fetch nếu quá thời gian
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};
/** Fetch với log */
const loggedFetch = async (url, id = "undefined", type = "undefined") => {
  utils.log(`fetcher: ${type}: ${id}.`, url);
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    if (!validateSubtitleContent(text)) throw new Error("Invalid subtitle content");
    return text;
  } catch (err) {
    utils.error(`fetcher: Lỗi fetch ${type}: ${id}.`, err.message);
    return null;
  }
};
/** Hàm khớp tìm kiếm. Phân tách băng |, bỏ khoảng trắng, bỏ rỗng, phân biệt hoa thường nếu key bắt đầu bằng #.
 * @param {*} name tên tìm kiếm
 * @param {*} searchKey từ khóa tìm kiếm
 * @returns {boolean} boolean trả kết quả khớp tìm kiếm
 */
const matchSubtitle = (name, searchKey) => {
  if (!searchKey) return true; // Không có từ khóa -> hiển thị tất cả
  if (!name) return false; // Tên file trống -> bỏ qua
  const nameLower = name.toLowerCase();
  return searchKey.split("|").map(k => k.trim()).filter(Boolean).some(key =>
    key.startsWith("#")
      ? name.includes(key.slice(1)) // Nếu key bắt đầu bằng # thì phân biệt hoa thường
      : nameLower.includes(key.toLowerCase()) // Ngược lại thì không phân biệt hoa thường
  );
}
/** [ChatGPT] Chuẩn hóa link GDrive 
 * Hỗ trợ các dạng:
 * - https://drive.google.com/drive/folders/{folderId}
 * - https://drive.google.com/drive/u/{number}/folders/{folderId}
 *
 * @param {string} url - URL thư mục Google Drive cần chuẩn hóa.
 * @returns {[string, string]|null} Mảng gồm:
 * - URL thư mục Google Drive đã chuẩn hóa.
 * - ID của thư mục (`folderId`).
 * 
 * hoặc `null` nếu không tìm thấy `folderId`.
 */
const normalizeGDriveUrl = url => {
  const folderId = url?.match(
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/
  )?.[1];
  return folderId
  ? [`https://drive.google.com/drive/folders/${folderId}`, folderId]
  : null;
}
/** [ChatGPT] Chuẩn hóa link GitHub 
 * Chỉ hỗ trợ URL dạng:
 * https://github.com/{owner}/{repo}/tree/{branch}/{path}
 *
 * @param {string} url - URL thư mục GitHub cần chuẩn hóa.
 * @returns {[string, string]|null} Mảng gồm:
 * - URL thư mục GitHub đã chuẩn hóa.
 * - Đường dẫn định danh theo cấu trúc
 *   `{owner}/{repo}/{branch}/{path}`.
 * 
 * nếu URL không đúng định dạng.
 */
const normalizeGitHubUrl = url => {
  const match = url?.match(
    /github\.com\/([^/?#]+)\/([^/?#]+)\/tree\/([^/?#]+)\/?(.*)/
  );
  if (!match) return null;
  const [, owner, repo, branch, path] = match;
  return [
    `https://github.com/${owner}/${repo}/tree/${branch}/${path}`.replace(/\/+$/, ""), 
    `${owner}/${repo}/${branch}/${path}`.replace(/\/+$/, "")
  ];
};

