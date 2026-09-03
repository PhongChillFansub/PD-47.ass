// v0.1.0 22aug26 
// beta mode (đã viết xong, sửa lỗi khi chạy)
// Chức năng: xử lí ban đầu, giai đoạn từ danh sách link thư mục nguồn đến giai đoạn có file sub thô (rawText)
// export: fetchSubtitleFileList (danh sách link thư mục nguồn → chỉ mục source.fileList),
//         searchSubtitleFile (tìm trong chỉ mục source.fileList → candidates),
//         fetchSubtitleText (từ link file sub tới rawText)
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
      throw new Error(`HTTP error! status: ${response.status}`);  // throw trong try nên đi ra catch
    }
    const text = await response.text();
    if (type !== 'folder' && !validateSubtitleContent(text)) {  // throw trong try nên đi ra catch
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
 *   `caseSensitive` = true chỉ ở bản "chính xác" sinh ra từ token `#`.
 * - Token `#X` mở rộng thành 2 token liền kề trong cùng nhóm: `{value,false}`
 *   (bản thường, có fuzzy) rồi `{value,true}` (khớp nguyên chuỗi con đúng
 *   hoa/thường, không fuzzy). Xem `scoreSearchToken`.
 * - Nhóm (group): các token nằm giữa hai dấu `|` (hoặc cả query nếu không có `|`).
 *   Trong một nhóm, từng token được chấm riêng rồi cộng điểm (thiếu token
 *   không hủy nhóm). Nhiều nhóm thì `matchSubtitle` lấy nhóm điểm cao nhất.
 *
 * Ví dụ `a b | #"One Piece" #ID` →
 * ```
 * [
 *   [ { value: "a", caseSensitive: false },
 *     { value: "b", caseSensitive: false } ],
 *   [ { value: "One Piece", caseSensitive: false },
 *     { value: "One Piece", caseSensitive: true },
 *     { value: "ID", caseSensitive: false },
 *     { value: "ID", caseSensitive: true } ]
 * ]
 * ```
 *
 * Cú pháp:
 * - `hello world`     → một nhóm, hai token; đủ cả hai = đủ, chỉ một = chưa đủ
 * - `"one piece"`     → một token cụm từ (giữ dấu cách)
 * - `#Hello`          → `Hello` (thường) + `#Hello` (khớp nguyên đúng hoa thường)
 * - `#"Hello World"`  → cụm từ, tương tự `#Hello`
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

      if (!value) continue;

      tokens.push({ value, caseSensitive: false });
      // `#X` được coi như tìm cả `X #X`: bản thường (hoa/thường tự do, có
      // fuzzy) để file vẫn xuất hiện khi không khớp đúng case, và bản `#`
      // (khớp nguyên chuỗi con đúng hoa/thường, không fuzzy) để ưu tiên
      // file khớp chính xác.
      if (caseSensitive) tokens.push({ value, caseSensitive: true });
    }

    // Chú ý: Chỉ push vào group khi tokens có phần tử => Bỏ qua nhóm rỗng (VD: `a | | b` → 2 nhóm, không có nhóm rỗng)
    // Chạy hết while rồi mới đến dòng này, nên ko cần lo lắng về việc bỏ sót token nào.
    if (tokens.length) groups.push(tokens);
  }

  return groups;
};

/** [arena.ai] Gấp chuẩn hóa chuỗi để so khớp "chịu lệch": chữ thường + bỏ dấu
 * tiếng Việt (ê→e, đ→d, ơ→o, ...). Tên file là chuẩn, token của end-user có
 * thể sai chính tả / thiếu dấu nên mọi so khớp mềm đều chạy trên bản gấp này.
 *
 * @param {string} text
 * @returns {string}
 */
const foldText = text =>
  String(text)
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

/** [arena.ai] Khoảng cách Levenshtein giữa `pattern` và đoạn con tốt nhất của
 * `text` (approximate string matching): token được phép khớp vào một đoạn bất
 * kỳ của tên file, chịu thêm/xoá/đổi ký tự.
 *
 * @param {string} pattern token (đã gấp)
 * @param {string} text tên file (đã gấp)
 * @param {number} [maxDist] trần lỗi; vượt thì trả maxDist+1 (không cần số đúng)
 * @returns {number} số thao tác tối thiểu (0 = khớp nguyên một đoạn con)
 */
const editDistanceSubstring = (pattern, name, maxDist = Infinity) => {
  const m = pattern.length;
  const n = name.length;
  if (!m) return 0;
  if (maxDist === 0) return name.includes(pattern) ? 0 : 1;
  // pattern dài hơn text hơn k ký tự → dù khớp cả text vẫn thiếu
  if (m - n > maxDist) return maxDist + 1;
  if (!n) return m;

  // Chỉ dùng một hàng DP thay vì hai hàng prev/cur.
  // Uint32Array tự khởi tạo toàn bộ phần tử bằng 0.
  const row = new Uint32Array(n + 1);
  let best = m;

  for (let i = 1; i <= m; i++) {
    let diagonal = row[0];
    row[0] = i;
    best = i;

    const patternChar = pattern[i - 1];

    for (let j = 1; j <= n; j++) {
      const above = row[j];

      const replace =
        diagonal + (patternChar === name[j - 1] ? 0 : 1);
      const remove = above + 1;
      const insert = row[j - 1] + 1;

      const value =
        replace < remove
          ? (replace < insert ? replace : insert)
          : (remove < insert ? remove : insert);

      row[j] = value;
      diagonal = above;

      if (value < best) best = value;
    }

    // Không còn khả năng nằm trong ngưỡng cho phép.
    if (best > maxDist) return maxDist + 1;
  }

  return best;
};
/** [arena.ai] Số lỗi (khoảng cách Levenshtein) tối đa để token vẫn tính là
 * "khớp": không quá 33% độ dài token đã gấp, hoặc 0 nếu token quá ngắn (dưới 3 ký tự).
 *
 * @param {number} length độ dài token đã gấp
 * @returns {number}
 */
const maxAllowedDistance = length => length < 3 ? 0 : Math.floor(length / 3);

/** [arena.ai] Điểm một token trên tên file — tên file là chuẩn, token có thể sai.
 * - Token `#...` (phân biệt hoa thường): khớp nguyên chuỗi con đúng case → `{ score: 2n, exact: true }`,
 *   không → `{ score: 0, exact: false }` (không fuzzy).
 * - Token thường: gấp chuẩn hóa rồi tìm khoảng cách Levenshtein nhỏ nhất tới
 *   một đoạn con của tên file:
 *   + Vượt ngưỡng (distance > maxAllowedDistance) → `{ score: 0, exact: false }`.
 *   + Khớp chính xác (distance === 0) → `{ score: 2n, exact: true }`.
 *   + Khớp gần đúng / na ná (0 < distance <= maxDist) → `{ score: 2n - 2·distance, exact: false }`.
 *
 * @param {string} name tên file gốc (cho token case-sensitive)
 * @param {string} nameFolded tên file đã gấp chuẩn hóa
 * @param {{value: string, caseSensitive: boolean}} token
 * @returns {{ score: number, exact: boolean }}
 */
const scoreSearchToken = (name, nameFolded, token) => {
  const { value, caseSensitive } = token;
  const n = value.length;
  if (!n) return { score: 0, exact: false };

  if (caseSensitive) {
    const exact = name.includes(value);
    return { score: exact ? 2 * n : 0, exact };
  }

  const pattern = foldText(value);
  const maxDist = maxAllowedDistance(pattern.length);
  const distance = editDistanceSubstring(pattern, nameFolded, maxDist);
  if (distance > maxDist) return { score: 0, exact: false };

  return {
    score: 2 * n - 2 * distance,
    exact: distance === 0
  };
};

/** Thưởng khi khớp CHÍNH XÁC 100% mọi token của nhóm. Lớn hơn mọi điểm chưa đủ hoặc khớp mờ. */
const SEARCH_COMPLETE_BONUS = 1_000_000;

/** Mỗi token khớp (chính xác hoặc gần đúng) cộng 1000 — `Math.floor(score / 1000)` ≈ số từ khớp. */
const SEARCH_TOKEN_BAND = 1000;

/** [arena.ai] Thưởng cụm liền mạch dài nhất (không cộng chồng cụm con).
 * Query `hello my world` trên "hello my" → +8; trên "hello my world" → +14.
 *
 * @param {string} name
 * @param {string} nameFolded
 * @param {Array<{value: string, caseSensitive: boolean}>} tokens
 * @param {number[]} tokenScores
 * @returns {number}
 */
const scorePhraseRuns = (name, nameFolded, tokens, tokenScores) => {
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
        : nameFolded.includes(foldText(phrase));
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
 * Không có token nào khớp → 0. Có token khớp:
 * `(khớp chính xác 100% ? 1_000_000 : 0) + số_từ * 1000 + chất_lượng`.
 * - Mức 1: Không có từ nào khớp (khoảng cách > maxDist) → trả về 0 (ẩn file).
 * - Mức 2: Khớp 1 phần hoặc có từ na ná → điểm ở dải `1xxx`, `2xxx`...
 * - Mức 2.5: Đủ số từ nhưng có từ na ná / sai chính tả → điểm ở dải `4xxx` (vd query 4 từ).
 * - Mức 3: Khớp CHÍNH XÁC 100% mọi token (distance === 0) → +1_000_000 (dải >= 1_000_000).
 *
 * @param {string} name
 * @param {string} nameFolded
 * @param {Array<{value: string, caseSensitive: boolean}>} tokens
 * @returns {number}
 */
const scoreSearchGroup = (name, nameFolded, tokens) => {
  const tokenResults = tokens.map(token =>
    scoreSearchToken(name, nameFolded, token)
  );
  const tokenScores = tokenResults.map(r => r.score);
  const matched = tokenScores.reduce((n, s) => n + (s ? 1 : 0), 0);

  if (!matched) return 0;

  const quality =
    tokenScores.reduce((a, b) => a + b, 0) +
    scorePhraseRuns(name, nameFolded, tokens, tokenScores);

  // Chỉ cộng SEARCH_COMPLETE_BONUS (1_000_000) khi 100% mọi token đều khớp chính xác (distance === 0)
  const completeExact = tokenResults.every(r => r.exact);

  return (completeExact ? SEARCH_COMPLETE_BONUS : 0) +
    matched * SEARCH_TOKEN_BAND +
    quality;
};

/** [arena.ai] Chấm điểm khớp tên file sub với từ khóa tìm kiếm.
 *
 * Trả về số ≥ 0 (dùng `if (!score)` để ẩn file không khớp):
 * - `0`           — không khớp từ nào
 * - `1`           — không có từ khóa (hiện tất cả, cùng hạng)
 * - `< 1_000_000` — khớp 1 phần hoặc có từ khớp gần đúng (na ná Levenshtein)
 * - `>= 1_000_000`— khớp chính xác 100% mọi token; cộng thêm chất lượng để xếp hạng
 *
 * Tên file là chuẩn, token có thể gõ lệch: `pece`/`piec`/`piêc`/`piecce` đều
 * khớp `piece` (điểm giảm theo khoảng cách Levenshtein), `1` khớp `01`.
 * Query `hello my world`:
 * - `hello my world` (khớp cả 3 từ chính xác) → đủ 100%, ~1_003_038
 * - `hello my` / `my world` (khớp chính xác 2 từ) → 2 từ liền, 2022
 * - `hello world` (khớp chính xác 2 từ) → 2 từ hổng giữa, 2020
 * - `hello` (khớp 1 từ) → 1 từ, 1010
 * - `helo my world` (1 từ gõ sai na ná, 2 từ đúng) → 3 từ, không bonus 1M, ~3030
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

  const nameFolded = foldText(name);
  let best = 0;

  for (const group of groups) {
    const score = scoreSearchGroup(name, nameFolded, group);
    if (score > best) best = score;
  }

  return best;
};

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
 *     cdnUrl?: string,
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
 *   cdnUrl?: string,
 *   folderUrl: string,
 *   sourceType: string,
 *   groupName: string,
 *   score: number
 * }>>} candidates có `score > 0`, xếp điểm giảm dần, hòa thì `groupName` rồi `fileName`
 */
export async function searchSubtitleFile(sources, searchKey) {
  if (!Array.isArray(sources) || !sources.length) {
    utils.log('fetcher: searchSubtitleFile(): không có source nào.');
    return [];
  }

  const candidates = [];

  for (const source of sources) {
    const files = source?.fileList;
    if (!Array.isArray(files) || !files.length) continue;

    for (const file of files) {
      const fileName = file?.fileName || '';
      const folderName = source.name || file.groupName || '';
      const score = matchSubtitle(`${folderName} ${fileName}`.trim(), searchKey);

      if (!score) continue;

      candidates.push({
        ...file,
        groupName: folderName,
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
    `fetcher: searchSubtitleFile(): ${candidates.length} file` +
      ` (query = ${JSON.stringify(searchKey ?? '')}).`
  );

  return candidates;
}

/** [arena.ai] Tải toàn bộ text một file sub từ candidate.fetchUrl / cdnUrl.
 *
 * Dùng loggedFetch (timeout, HTTP, validate chữ ký ASS). Lỗi → null
 * + utils.warn, không throw. File > 10MB chỉ cảnh báo, vẫn trả text.
 * Dung lượng đo bằng UTF-8 của text đã tải (không phụ thuộc Content-Length).
 * Ưu tiên cdnUrl (jsDelivr) nếu có, fallback fetchUrl (raw / gdrive).
 *
 * @param {{
 *   id?: string,
 *   fileName?: string,
 *   fetchUrl?: string,
 *   cdnUrl?: string
 * }} candidate file trong chỉ mục / kết quả fetchSubtitleFile
 * @returns {Promise<string|null>} text file .ass, hoặc null nếu thất bại
 */
export async function fetchSubtitleText(candidate) {
  const id = candidate?.id ?? 'undefined';
  const fileName = candidate?.fileName ?? 'undefined';

  // Ưu tiên cdnUrl (GitHub -> jsDelivr), fallback fetchUrl (raw / gdrive)
  const primaryUrl = candidate?.cdnUrl || candidate?.fetchUrl;
  const fallbackUrl = candidate?.cdnUrl ? candidate?.fetchUrl : null;

  if (!primaryUrl) {
    utils.warn(
      `fetcher: fetchSubtitleText(): thiếu fetchUrl/cdnUrl (${id}, ${fileName}).`
    );
    return null;
  }

  let text = await loggedFetch(primaryUrl, id, 'file');

  // cdn fail (cache trễ, 404, bị chặn) -> thử lại raw
  if (!text && fallbackUrl && fallbackUrl !== primaryUrl) {
    utils.warn(`fetcher: fetchSubtitleText(): cdnUrl fail, fallback raw ${id}.`);
    text = await loggedFetch(fallbackUrl, id, 'file');
  }

  if (!text) {
    utils.warn(
      `fetcher: fetchSubtitleText(): không tải được ${id}, ${fileName}.`
    );
    return null;
  }

  const byteSize = new TextEncoder().encode(text).length;
  if (byteSize > SUBTITLE_SIZE_WARN) {
    utils.warn(
      `fetcher: fetchSubtitleText(): file ${id}, ${fileName} > 10MB` +
        ` (${(byteSize / (1024 * 1024)).toFixed(2)} MB).`
    );
  }

  utils.log(`fetcher: fetchSubtitleText(): xong file ${fileName}.`);
  return text;
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
 *     cdnUrl?: string,
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
 *     cdnUrl: string,
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

    // Chuẩn bị cdnUrl (jsDelivr) - dùng cho fetchSubtitleText ưu tiên
    // branch có thể chứa '/' (VD: feat/new) -> encode từng đoạn, giữ '/'
    const encodedBranch = branch.split('/').map(encodePathSegment).join('/');
    for (const item of items) {
      if (item.type !== 'file') continue; // Bỏ qua thư mục con và submodule
      if (!item.name.toLowerCase().endsWith('.ass')) continue;

      const encodedFileName = encodePathSegment(item.name);
      const cdnPath = encodedPath ? `${encodedPath}/${encodedFileName}` : encodedFileName;
      const cdnUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${encodedBranch}/${cdnPath}`;

      source.fileList.push({
        id: item.sha,
        fileName: item.name,
        fetchUrl: item.download_url,
        cdnUrl,
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

/** [arena.ai] Tải và lập chỉ mục danh sách thư mục nguồn 
 *
 * Nhận danh sách link thư mục nguồn (GitHub hoặc Google Drive), tự nhận
 * diện loại nguồn theo link rồi gọi đúng MỘT lần `scanGitHub()` hoặc
 * `scanGDrive()` cho từng link. Các nguồn hợp lệ được quét song song để tổng
 * thời gian không bị cộng dồn theo từng request. Link trùng sau khi chuẩn hóa
 * (VD: khác dạng `u/0/`, dư dấu `/` cuối, query khác nhau) được bỏ qua để mỗi
 * nguồn chỉ tạo một request — tránh tốn giới hạn GitHub API 60 lần/giờ.
 *
 * Hàm KHÔNG tự lưu cache: kết quả trả về chính là đầu ra của các hàm scan
 * (`{url, folderId, sourceType, name, savedAt, fileList}`) để nơi gọi (VD:
 * background) tự quyết định lưu vào chrome.storage.local. Muốn quét lại từ
 * đầu thì gọi lại hàm này.
 *
 * Link không hợp lệ (không phải GitHub/GDrive), hoặc scan trả về `fileList`
 * rỗng (quét thất bại / thư mục không có file `.ass` nào) → bỏ qua + log
 * warn, các link còn lại vẫn chạy tiếp. Hàm không throw.
 *
 * @param {Array<string|{url: string}>} [urls=[]] danh sách link thư mục
 * nguồn. Mỗi phần tử là chuỗi URL, hoặc object có trường `url`.
 * @returns {Promise<Array<{
 *   url: string,
 *   folderId: string,
 *   sourceType: 'gdrive'|'github',
 *   name: string,
 *   savedAt: number,
 *   fileList: Array<{
 *     id: string,
 *     fileName: string,
 *     fetchUrl: string,
 *     cdnUrl?: string,
 *     folderUrl: string,
 *     sourceType: 'gdrive'|'github',
 *     groupName: string
 *   }>
 * }>>} Mảng source đã lập chỉ mục (mỗi source có `fileList` không rỗng),
 * sẵn sàng truyền thẳng vào `searchSubtitleFile(sources, searchKey)`.
 */
export async function fetchSubtitleFileList(urls = []) {
  if (!Array.isArray(urls)) {
    utils.warn(
      'fetcher: fetchSubtitleFileList(): urls ko phải mảng, trả về [].'
    );
    return [];
  }

  const seenUrls = new Set();
  const scanTasks = [];

  for (const item of urls) {
    const rawUrl = typeof item === 'string' ? item : item?.url;
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
      utils.warn('fetcher: fetchSubtitleFileList(): bỏ qua link rỗng.', item);
      continue;
    }

    const gdrive = normalizeGDriveUrl(rawUrl);
    const source = gdrive ?? normalizeGitHubUrl(rawUrl);
    // Sau dòng này source là object {url đã chuẩn hóa, folderId} hoặc null nếu link ko hợp lệ.

    if (!source) {
      utils.warn(
        `fetcher: fetchSubtitleFileList(): bỏ qua link ko hợp lệ (${rawUrl}).`
      );
      continue;
    }

    // Không quét lại cùng một URL đã chuẩn hóa.
    if (seenUrls.has(source.url)) continue;
    seenUrls.add(source.url);

    scanTasks.push(gdrive ? scanGDrive(source) : scanGitHub(source));
  }

  // Các hàm scan tự bắt lỗi và trả source có fileList rỗng khi thất bại.
  const scannedSources = await Promise.all(scanTasks);
  const sources = scannedSources.filter(source => {
    if (Array.isArray(source.fileList) && source.fileList.length) return true;

    utils.warn(
      `fetcher: fetchSubtitleFileList(): bỏ qua ${source.sourceType} ` +
        `${source.url} (quét thất bại hoặc ko có file .ass).`
    );
    return false;
  });

  const fileCount = sources.reduce(
    (n, s) => n + (s.fileList?.length ?? 0),
    0
  );

  utils.log(
    `fetcher: fetchSubtitleFileList(): xong, ${sources.length} source ` +
      `(${fileCount} file .ass).`
  );

  return sources;
}