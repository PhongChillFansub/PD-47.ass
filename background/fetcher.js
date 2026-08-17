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
const validateSubtitleContent = text => 
  !!text && VALID_FILE_SIGNATURE.some(sig => text.includes(sig));

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
const loggedFetch = async (
  url,
  id = "undefined",
  type = "undefined"
) => {
  utils.log(`fetcher: ${type}: ${id}.`, url);
  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text = await response.text();
    if (type !== 'folder' && !validateSubtitleContent(text)) {
      throw new Error("Invalid subtitle content");
    }
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

  return searchKey
    .split("|")
    .map(k => k.trim())
    .filter(Boolean)
    .some(key =>
      key.startsWith("#")
        ? name.includes(key.slice(1)) // Nếu key bắt đầu bằng # thì phân biệt hoa thường
        : nameLower.includes(key.toLowerCase()) // Ngược lại thì không phân biệt hoa thường
    );
}

/** [arena.ai] Chuẩn hóa URL thư mục Google Drive.
 *
 * Hỗ trợ các dạng:
 * - `https://drive.google.com/drive/folders/{folderId}`
 * - `https://drive.google.com/drive/u/{number}/folders/{folderId}`
 *
 * Query, fragment và dấu gạch chéo sau ID không được đưa vào `folderId`.
 *
 * @param {string} url - URL thư mục Google Drive cần chuẩn hóa.
 * @returns {{url: string, folderId: string}|null} Object chứa URL thư mục
 * chuẩn hóa và ID thư mục; trả về `null` nếu URL không chứa ID hợp lệ.
 */
const normalizeGDriveUrl = url => {
  const folderId = url?.match(
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/
  )?.[1]?.replace(/\/+$/, '');

  return folderId
    ? {
        url: `https://drive.google.com/drive/folders/${folderId}`,
        folderId
      }
    : null;
}

/** [arena.ai] Quét các file phụ đề ASS trong một thư mục Google Drive công khai.
 *
 * Hàm nhận object nguồn đã được chuẩn hóa, sửa trực tiếp object đó rồi trả
 * lại cùng một tham chiếu. Trang `embeddedfolderview` được dùng để lấy tên
 * thư mục và danh sách file. Tên thư mục ưu tiên thẻ `og:title`, sau đó mới
 * dùng thẻ `title`; các hậu tố/tiền tố "Google Drive" trong `title` sẽ bị bỏ.
 *
 * Chỉ các file có phần mở rộng `.ass` (không phân biệt hoa/thường) được thêm
 * vào `fileList`. Nếu fetch hoặc parse thất bại, `fileList` là mảng rỗng và
 * `name` giữ giá trị mặc định `undefined_GDrive`.
 *
 * @param {{url: string, folderId: string}} source - Object nguồn Google Drive
 * cần quét. `url` là URL thư mục đã chuẩn hóa và `folderId` là ID thư mục.
 * @returns {Promise<{
 *   url: string,
 *   folderId: string,
 *   sourceType: 'gdrive',
 *   name: string,
 *   savedAt: number,
 *   fileList: Array<{
 *     id: string,
 *     fileName: string,
 *     fetchUrl: string,
 *     folderUrl: string,
 *     sourceType: 'gdrive',
 *     groupName: string
 *   }>
 * }>} Chính object `source` đầu vào sau khi được bổ sung thông tin thư mục,
 * thời điểm quét và danh sách file ASS.
 */
async function scanGDrive(source) {
  source.sourceType = 'gdrive';
  source.name = 'undefined_GDrive';
  source.fileList = [];

  const { folderId } = source;

  if (!folderId) {
    utils.error(
      `fetcher: Lỗi scanGDrive: Cố tình chạy scanGDrive mà ko có folderId?`
    );
    source.savedAt = Date.now();
    return source;
  }

  try {
    const html = await loggedFetch(
      `https://drive.google.com/embeddedfolderview?id=${folderId}`,
      folderId,
      'folder'
    );

    source.savedAt = Date.now();

    if (!html) return source;

    // Lấy tên thư mục bằng phương pháp quét đa tầng (fallback).
    const ogTitleMatch = html.match(
      /<meta property="og:title" content="([^"]+)"/i
    );

    const titleMatch = html.match(
      /<title>([\s\S]*?)<\/title>/i
    );

    let extractedName = ogTitleMatch?.[1]?.trim() || '';

    if (!extractedName && titleMatch?.[1]) {
      extractedName = titleMatch[1]
        .trim()
        .replace(/\s*-\s*Google\s+Drive/i, '')
        .replace(/Google\s+Drive\s*-\s*/i, '')
        .trim();
    }

    source.name =
      utils.decodeHTML(extractedName).trim() ||
      'undefined_GDrive';

    const regex =
      /href="[^"]*\/file\/d\/([a-zA-Z0-9_-]+)[^"]*"[^>]*>(?:(?!<\/a>)[\s\S])*?<div class="flip-entry-title">([^<]+)<\/div>/g;

    for (const match of html.matchAll(regex)) {
      const [, id, name] = match;
      const fileName = utils.decodeHTML(name);

      if (!fileName.toLowerCase().endsWith('.ass')) {
        continue;
      }

      source.fileList.push({
        id,
        fileName,
        fetchUrl: `https://docs.google.com/uc?export=download&id=${id}`,
        folderUrl: source.url,
        sourceType: 'gdrive',
        groupName: source.name
      });
    }

    return source;
  } catch (err) {
    utils.error('Lỗi quét Google Drive', err);
    return source;
  }
}

/** [arena.ai] Chuẩn hóa URL thư mục GitHub.
 *
 * Chỉ hỗ trợ URL dạng:
 * `https://github.com/{owner}/{repo}/tree/{branch}/{path}`.
 *
 * `folderId` là định danh thư mục theo cấu trúc
 * `{owner}/{repo}/{branch}/{path}` và không chứa dấu gạch chéo ở cuối.
 *
 * @param {string} url - URL thư mục GitHub cần chuẩn hóa.
 * @returns {{url: string, folderId: string}|null} Object chứa URL thư mục
 * chuẩn hóa và định danh thư mục; trả về `null` nếu URL sai định dạng.
 */
const normalizeGitHubUrl = url => {
  const match = url?.match(
    /github\.com\/([^/?#]+)\/([^/?#]+)\/tree\/([^/?#]+)\/?(.*)/
  );

  if (!match) return null;

  const [, owner, repo, branch, path] = match;

  return {
    url: `https://github.com/${owner}/${repo}/tree/${branch}/${path}`
      .replace(/\/+$/, ""),
    folderId: `${owner}/${repo}/${branch}/${path}`
      .replace(/\/+$/, "")
  };
};

/** [arena.ai] Quét các file phụ đề ASS trong một thư mục GitHub công khai.
 *
 * Hàm nhận object nguồn đã được chuẩn hóa bởi `normalizeGitHubUrl()`, sửa
 * trực tiếp object đó rồi trả lại cùng một tham chiếu (giống `scanGDrive`).
 * Danh sách file lấy qua GitHub Contents API; request không kèm token bị
 * GitHub giới hạn 60 lần/giờ theo IP nên tránh gọi liên tục.
 *
 * `source.name` có dạng `{repo}/{path}` (VD: `PD-47.ass/subs/anime`); nếu
 * URL trỏ vào root repo thì `name` chỉ là tên repo. Chỉ các file có phần
 * mở rộng `.ass` (không phân biệt hoa/thường) được thêm vào `fileList`.
 * Nếu fetch hoặc parse thất bại, `fileList` là mảng rỗng và `name` giữ
 * giá trị mặc định `undefined_GitHub`.
 *
 * @param {{url: string, folderId: string}} source - Object nguồn GitHub cần
 * quét. `url` là URL thư mục đã chuẩn hóa và `folderId` là định danh
 * `{owner}/{repo}/{branch}/{path}`.
 * @returns {Promise<{
 *   url: string,
 *   folderId: string,
 *   sourceType: 'github',
 *   name: string,
 *   savedAt: number,
 *   fileList: Array<{
 *     id: string,
 *     fileName: string,
 *     fetchUrl: string,
 *     folderUrl: string,
 *     sourceType: 'github',
 *     groupName: string
 *   }>
 * }>} Chính object `source` đầu vào sau khi được bổ sung thông tin thư mục,
 * thời điểm quét và danh sách file ASS.
 */
async function scanGitHub(source) {
  source.sourceType = 'github';
  source.name = 'undefined_GitHub';
  source.fileList = [];

  const { folderId } = source;

  if (!folderId) {
    utils.error(
      `fetcher: Lỗi scanGitHub: Cố tình chạy scanGitHub mà ko có folderId?`
    );
    source.savedAt = Date.now();
    return source;
  }

  try {
    // folderId = owner/repo/branch/path, path có thể chứa nhiều cấp con.
    const [owner, repo, branch, ...pathSegments] = folderId.split('/');
    // Encode từng cấp path (chứ không encode cả chuỗi) để giữ dấu / phân
    // cách cấp. Decode trước khi encode lại để tránh double-encode vì
    // folderId giữ nguyên path như trong URL gốc (VD: "Anime%20XYZ").
    const encodePathSegment = segment => {
      try { return encodeURIComponent(decodeURIComponent(segment)); }
      catch { return encodeURIComponent(segment); }
    };
    const encodedPath = pathSegments.map(encodePathSegment).join('/');

    const text = await loggedFetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
      folderId,
      'folder'
    );

    source.savedAt = Date.now();

    if (!text) return source;

    const items = JSON.parse(text);

    if (!Array.isArray(items)) {
      // GitHub API trả về object thay vì array (URL trỏ nhầm vào 1 file...).
      utils.warn(
        `fetcher: GitHub API ko trả về array (folder: ${folderId}).`
      );
      return source;
    }

    // Tên hiển thị: repo/path (root repo thì chỉ tên repo), decode từng cấp
    // cho dễ đọc (VD: "Anime%20XYZ" -> "Anime XYZ").
    const decodedPath = pathSegments
      .map(segment => {
        try { return decodeURIComponent(segment); } catch { return segment; }
      })
      .join('/');
    source.name = decodedPath ? `${repo}/${decodedPath}` : repo;

    for (const item of items) {
      if (item.type !== 'file') continue; // Bỏ qua thư mục con và submodule
      if (!item.name.toLowerCase().endsWith('.ass')) continue;

      source.fileList.push({
        id: item.sha,
        fileName: item.name,
        fetchUrl: item.download_url,
        folderUrl: source.url,
        sourceType: 'github',
        groupName: source.name
      });
    }

    return source;
  } catch (err) {
    utils.error('Lỗi quét GitHub', err);
    return source;
  }
}