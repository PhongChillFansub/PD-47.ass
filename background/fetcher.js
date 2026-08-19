// v0.1.0 16aug26
// Chức năng: xử lí ban đầu, giai đoạn từ danh sách link thư mục nguồn đến giai đoạn có file sub thô (rawText)
// export: fetchSubtitleText (từ link file sub tới rawText),
//         fetchSubtitleFile (tìm trong chỉ mục source.fileList → candidates)
/** Nhận logger(message, type = 'info', extra = undefined) */
import * as utils from './utils.js';

/** Tối đa 60 giây kết nối và nhận dữ liệu. Dùng cho hàm fetchWithTimeout(). */
const FETCH_TIMEOUT = 60000;

/** Cảnh báo (không từ chối) khi file sub lớn hơn ngưỡng này. Ở đây là 10MB */
const SUBTITLE_SIZE_WARN = 10 * 1024 * 1024;

/** Chỉ nhận file sub V4+ tạo bằng Aegisub? */
const VALID_FILE_SIGNATURE = ["[Script Info]", "[V4+ Styles]", "[Events]"];

/** kiểm tra dữ liệu hợp lệ. Trả về boolean */
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

/** [arena.ai] Fetch với log */
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

/** [arena.ai] Tách query thành các nhóm OR (`|`) và token (khoảng trắng).
 * Token không còn AND-chết: thiếu từ chỉ tụt điểm, không về 0.
 *
 * Cấu trúc trả về: `groups` là mảng các nhóm; mỗi nhóm là mảng token.
 * - Token: một đơn vị tìm kiếm. Mỗi token = `{ value, caseSensitive }`.
 *   `value` là chuỗi cần tìm trong tên (một từ, hoặc cả cụm nếu bọc `"`).
 *   `caseSensitive` = true khi token (hoặc cụm) bắt đầu bằng `#`.
 * - Nhóm (group): các token nằm giữa hai dấu `|` (hoặc cả query nếu không có `|`).
 *   Trong một nhóm, từng token được chấm riêng rồi cộng điểm (thiếu token
 *   không hủy nhóm). Nhiều nhóm thì `matchSubtitle` lấy nhóm điểm cao nhất.
 *
 * Ví dụ `a b | #"One Piece" #ID` →
 * ```
 * [
 *   [ { value: "a", caseSensitive: false },
 *     { value: "b", caseSensitive: false } ],
 *   [ { value: "One Piece", caseSensitive: true },
 *     { value: "ID", caseSensitive: true } ]
 * ]
 * ```
 *
 * Cú pháp:
 * - `hello world`     → một nhóm, hai token; đủ cả hai = đủ, chỉ một = chưa đủ
 * - `"one piece"`     → một token cụm từ (giữ dấu cách)
 * - `#Hello`          → phân biệt hoa thường
 * - `#"Hello World"`  → cụm từ phân biệt hoa thường
 * - `a b | c`         → hai nhóm; lấy nhóm điểm cao hơn
 *
 * @param {string} searchKey
 * @returns {Array<Array<{value: string, caseSensitive: boolean}>>}
 */
const parseSearchQuery = searchKey => {
  const groups = [];

  for (const rawGroup of String(searchKey).split('|')) {
    const tokens = [];
    const re = /#?"([^"]*)"|#?[^\s|]+/g;
    let m;

    while ((m = re.exec(rawGroup))) {
      const raw = m[0];
      const caseSensitive = raw.charAt(0) === '#';
      const body = caseSensitive ? raw.slice(1) : raw;
      const value = body.startsWith('"')
        ? (m[1] ?? '')
        : body;

      if (value) tokens.push({ value, caseSensitive });
    }

    if (tokens.length) groups.push(tokens);
  }

  return groups;
};

/** [arena.ai] Điểm một token trên tên file.
 * - Không tìm thấy substring → 0
 * - Tìm thấy → `length + số ký tự trùng cả hoa/thường` ở cửa sổ khớp tốt nhất
 *   (vd. "hello" khớp "hello" = 10, khớp "hEllO" = 8, khớp "HELLO" = 5)
 *
 * @param {string} name
 * @param {string} nameLower
 * @param {{value: string, caseSensitive: boolean}} token
 * @returns {number}
 */
const scoreSearchToken = (name, nameLower, token) => {
  const { value, caseSensitive } = token;
  const n = value.length;
  if (!n) return 0;

  if (caseSensitive) {
    return name.includes(value) ? n + n : 0;
  }

  const needle = value.toLowerCase();
  let best = 0;
  let from = 0;

  while (from + n <= nameLower.length) {
    const idx = nameLower.indexOf(needle, from);
    if (idx < 0) break;

    let exact = 0;
    for (let i = 0; i < n; i++) {
      if (name.charAt(idx + i) === value.charAt(i)) exact++;
    }

    const score = n + exact;
    if (score > best) best = score;
    if (exact === n) break;
    from = idx + 1;
  }

  return best;
};

/** Thưởng khi khớp đủ mọi token của nhóm. Lớn hơn mọi điểm chưa đủ. */
const SEARCH_COMPLETE_BONUS = 1_000_000;

/** Mỗi token khớp nguyên cộng 1000 — `Math.floor(score / 1000)` ≈ số từ khớp đủ. */
const SEARCH_TOKEN_BAND = 1000;

/** Trần dải gần khớp (không có từ nào là substring nguyên). */
const SEARCH_NEAR_MAX = 999;

/** [arena.ai] Gần khớp một token: đoạn con dài nhất của token xuất hiện trong tên
 * (chưa đủ cả từ). Cần ≥ max(2, ceil(n/2)) ký tự — "hello" cần ≥ 3,
 * "my" (n=2) không có gần khớp (chỉ tính khi đủ cả từ).
 *
 * Điểm = độ dài đoạn + số ký tự đúng case. 0 nếu không đủ ngưỡng.
 *
 * @param {string} name
 * @param {string} nameLower
 * @param {{value: string, caseSensitive: boolean}} token
 * @returns {number}
 */
const scorePartialToken = (name, nameLower, token) => {
  const { value, caseSensitive } = token;
  const n = value.length;
  if (n < 2) return 0;

  const minKeep = Math.max(2, Math.ceil(n / 2));
  const needle = caseSensitive ? value : value.toLowerCase();
  const hay = caseSensitive ? name : nameLower;

  let bestLen = 0;
  let bestExact = 0;

  for (let len = n - 1; len >= minKeep; len--) {
    for (let start = 0; start + len <= n; start++) {
      const idx = hay.indexOf(needle.slice(start, start + len));
      if (idx < 0) continue;

      let exact = len;
      if (!caseSensitive) {
        exact = 0;
        for (let i = 0; i < len; i++) {
          if (name.charAt(idx + i) === value.charAt(start + i)) exact++;
        }
      }

      if (len > bestLen || (len === bestLen && exact > bestExact)) {
        bestLen = len;
        bestExact = exact;
      }
    }
    if (bestLen === len) break;
  }

  return bestLen ? bestLen + bestExact : 0;
};

/** [arena.ai] Thưởng cụm liền mạch dài nhất (không cộng chồng cụm con).
 * Query `hello my world` trên "hello my" → +8; trên "hello my world" → +14.
 *
 * @param {string} name
 * @param {string} nameLower
 * @param {Array<{value: string, caseSensitive: boolean}>} tokens
 * @param {number[]} tokenScores
 * @returns {number}
 */
const scorePhraseRuns = (name, nameLower, tokens, tokenScores) => {
  let bonus = 0;
  let i = 0;

  while (i < tokens.length) {
    if (!tokenScores[i]) {
      i++;
      continue;
    }

    let j = i;
    while (j + 1 < tokens.length && tokenScores[j + 1]) {
      const slice = tokens.slice(i, j + 2);
      const phrase = slice.map(t => t.value).join(' ');
      const sensitive = slice.every(t => t.caseSensitive);
      const hit = sensitive
        ? name.includes(phrase)
        : nameLower.includes(phrase.toLowerCase());
      if (!hit) break;
      j++;
    }

    if (j > i) {
      bonus += tokens.slice(i, j + 1).map(t => t.value).join(' ').length;
    }
    i = j + 1;
  }

  return bonus;
};

/** [arena.ai] Điểm một nhóm token.
 *
 * Không đủ 1 từ nguyên → `2 … 999`. Có từ nguyên →
 * `(đủ ? 1_000_000 : 0) + số_từ * 1000 + chất_lượng`.
 *
 * @param {string} name
 * @param {string} nameLower
 * @param {Array<{value: string, caseSensitive: boolean}>} tokens
 * @returns {number}
 */
const scoreSearchGroup = (name, nameLower, tokens) => {
  const tokenScores = tokens.map(token =>
    scoreSearchToken(name, nameLower, token)
  );
  const matched = tokenScores.reduce((n, s) => n + (s ? 1 : 0), 0);

  if (!matched) {
    let near = 0;
    for (const token of tokens) {
      near += scorePartialToken(name, nameLower, token);
    }
    if (!near) return 0;
    return Math.min(SEARCH_NEAR_MAX, 1 + near);
  }

  const quality =
    tokenScores.reduce((a, b) => a + b, 0) +
    scorePhraseRuns(name, nameLower, tokens, tokenScores);

  const complete = matched === tokens.length;
  return (complete ? SEARCH_COMPLETE_BONUS : 0) +
    matched * SEARCH_TOKEN_BAND +
    quality;
};

/** [arena.ai] Chấm điểm khớp tên file sub với từ khóa tìm kiếm.
 *
 * Trả về số ≥ 0 (dùng `if (!score)` để ẩn file không khớp):
 * - `0`           — không khớp từ nào
 * - `1`           — không có từ khóa (hiện tất cả, cùng hạng)
 * - `< 1_000_000` — đúng nhưng chưa đủ (thiếu token)
 * - `>= 1_000_000`— đủ mọi token; cộng thêm chất lượng để xếp hạng
 *
 * Query `hello my world` (đúng case):
 * - `hello my world` → đủ, ~1_003_038
 * - `hello my` / `my world` → chưa đủ, 2 từ liền, 2022
 * - `hello world` → chưa đủ, 2 từ hổng giữa, 2020
 * - `hello` → chưa đủ, 1 từ, 1010
 *
 * @param {string} name tên file sub
 * @param {string} searchKey từ khóa tìm kiếm hoặc ID video
 * @returns {number} điểm ưu tiên
 */
const matchSubtitle = (name, searchKey) => {
  if (searchKey == null) return 1;
  const trimmed = String(searchKey).trim();
  if (!trimmed) return 1;
  if (!name) return 0;

  const groups = parseSearchQuery(trimmed);
  if (!groups.length) return 1;

  const nameLower = name.toLowerCase();
  let best = 0;

  for (const group of groups) {
    const score = scoreSearchGroup(name, nameLower, group);
    if (score > best) best = score;
  }

  return best;
};

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
    const decodedPath = pathSegments.map(utils.decodeURISegment).join('/');
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

/** [arena.ai] Tìm file sub trong chỉ mục đã quét (`source.fileList`).
 *
 * Không gọi `scanGDrive` / `scanGitHub`. Giả định mỗi source đã có `name`
 * và `fileList`. Điểm = `matchSubtitle(`${name} ${fileName}`, searchKey)`
 * — token có thể nằm ở tên folder, tên file, hoặc cả hai.
 *
 * @param {Array<{
 *   name?: string,
 *   fileList?: Array<{
 *     id: string,
 *     fileName: string,
 *     fetchUrl: string,
 *     folderUrl: string,
 *     sourceType: string,
 *     groupName: string
 *   }>
 * }>} sources danh sách thư mục nguồn đã lập chỉ mục
 * @param {string} [searchKey] từ khóa hoặc ID video; rỗng / bỏ qua → mọi file (score = 1)
 * @returns {Promise<Array<{
 *   id: string,
 *   fileName: string,
 *   fetchUrl: string,
 *   folderUrl: string,
 *   sourceType: string,
 *   groupName: string,
 *   score: number
 * }>>} candidates có `score > 0`, xếp điểm giảm dần, hòa thì `groupName` rồi `fileName`
 */
export async function fetchSubtitleFile(sources, searchKey) {
  if (!Array.isArray(sources) || !sources.length) {
    utils.log('fetcher: fetchSubtitleFile(): không có source nào.');
    return [];
  }

  const candidates = [];

  for (const source of sources) {
    const files = source?.fileList;
    if (!Array.isArray(files) || !files.length) continue;

    const groupName = source.name || '';

    for (const file of files) {
      const fileName = file?.fileName || '';
      const folderName = groupName || file.groupName || '';
      const score = matchSubtitle(`${folderName} ${fileName}`.trim(), searchKey);

      if (!score) continue;

      candidates.push({
        ...file,
        groupName: folderName || file.groupName,
        score
      });
    }
  }

  candidates.sort((a, b) =>
    b.score - a.score ||
    String(a.groupName || '').localeCompare(String(b.groupName || '')) ||
    String(a.fileName || '').localeCompare(String(b.fileName || ''))
  );

  utils.log(
    `fetcher: fetchSubtitleFile(): ${candidates.length} file` +
      ` (query = ${JSON.stringify(searchKey ?? '')}).`
  );

  return candidates;
}

/** [arena.ai] Tải toàn bộ text một file sub từ candidate.fetchUrl.
 *
 * Dùng loggedFetch (timeout, HTTP, validate chữ ký ASS). Lỗi → null
 * + utils.warn, không throw. File > 10MB chỉ cảnh báo, vẫn trả text.
 * Dung lượng đo bằng UTF-8 của text đã tải (không phụ thuộc Content-Length).
 *
 * @param {{
 *   id?: string,
 *   fileName?: string,
 *   fetchUrl?: string
 * }} candidate file trong chỉ mục / kết quả fetchSubtitleFile
 * @returns {Promise<string|null>} text file .ass, hoặc null nếu thất bại
 */
export async function fetchSubtitleText(candidate) {
  const id = candidate?.id ?? 'undefined';
  const fileName = candidate?.fileName ?? 'undefined';

  if (!candidate?.fetchUrl) {
    utils.warn(
      `fetcher: fetchSubtitleText(): thiếu fetchUrl (${id}, ${fileName}).`
    );
    return null;
  }

  const text = await loggedFetch(candidate.fetchUrl, id, 'file');

  if (!text) {
    utils.warn(
      `fetcher: fetchSubtitleText(): không tải được ${id}, ${fileName}.`
    );
    return null;
  }

  const byteSize = new TextEncoder().encode(text).length;
  if (byteSize > SUBTITLE_SIZE_WARN) {
    utils.warn(
      `fetcher: fetchSubtitleText(): ${id}, ${fileName} > 10MB` +
        ` (${(byteSize / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  utils.log(`fetcher: fetchSubtitleText(): xong ${fileName}.`);
  return text;
}