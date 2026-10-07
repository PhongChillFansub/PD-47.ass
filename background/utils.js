// v0.1.0 07oct26
"use strict";
const extensionName = "PD-47.ass";
const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};
/** Logger chuẩn hóa cho background
 * @param {*} message 
 * @param {*} type 
 * @param {*} extra 
 */
export function logger(message, type = 'info', ...extra) {
  console[type || 'log'](`[${Date.now()} ${extensionName}] ${message}`, ...extra);
}
/** Log (logger) chuẩn hóa cho background
 * @param {*} message 
 * @param  {...any} extra 
 */
export function log(message, ...extra) {logger(message, 'log', ...extra);}
/** Warn (logger) chuẩn hóa cho background
 * @param {*} message 
 * @param  {...any} extra 
 */
export function warn(message, ...extra) {logger(message, 'warn', ...extra);}
/** Error (logger) chuẩn hóa cho background
 * @param {*} message 
 * @param  {...any} extra 
 */
export function error(message, ...extra) {logger(message, 'error', ...extra);}
/** [ChatGPT] Decodes common HTML entities and numeric character references.
 *
 * Supports:
 * - Named entities: `&amp;`, `&lt;`, `&gt;`, etc.
 * - Decimal entities: `&#65;`
 * - Hexadecimal entities: `&#x41;`
 *
 * @param {string} text - The text containing HTML entities.
 * @returns {string} The decoded text.
 */
export function decodeHTML (text) {
  return text?.replace(/&([^;]+);/g, (match, entity) => {
    if (entity[0] !== '#') return HTML_ENTITIES[entity] ?? match;
    const hex = entity[1]?.toLowerCase() === 'x';
    const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isNaN(code) ? match : String.fromCodePoint(code);
  }) ?? '';
}
/** [arena.ai] Decode an toàn một đoạn (segment) trong URI path.
 *
 * `decodeURIComponent()` chuẩn sẽ throw nếu đoạn chứa ký tự `%` không hợp lệ
 * (VD: "PD100%.ass"); hàm này trả về nguyên văn đoạn cũ trong trường hợp đó.
 *
 * @param {string} segment - Đoạn path cần decode (giữa 2 dấu `/`).
 * @returns {string} Đoạn đã decode, hoặc nguyên văn nếu không decode được.
 */
export function decodeURISegment(segment) {
  if (typeof segment !== 'string') return '';
  try { return decodeURIComponent(segment); }
  catch { return segment; }
}
/** [arena.ai] Encode an toàn một đoạn (segment) trong URI path.
 *
 * Decode trước rồi encode lại để tránh double-encode: input chủ yếu đến từ
 * URL gốc nên thường đã encode sẵn (VD: "Anime%20XYZ" vào ra vẫn là
 * "Anime%20XYZ", không phải "Anime%2520XYZ"). Đổi lại, tên chứa `%` literal
 * hiếm gặp sẽ bị hiểu nhầm là đã encode — chấp nhận được.
 *
 * @param {string} segment - Đoạn path cần encode (giữa 2 dấu `/`).
 * @returns {string} Đoạn đã encode, luôn dùng được trong URL.
 */
export function encodeURISegment(segment) {
  return encodeURIComponent(decodeURISegment(segment));
}
/** Chuyển chuỗi màu và alpha Aegisub sang định dạng rgba() dùng cho CSS.
 * Hỗ trợ các định dạng màu &HAABBGGRR, &HBBGGRR&, #RRGGBB[AA] và alpha &HAA&.
 * 
 * Chú ý: nếu đầu vào là alpha, xử lí như màu đỏ (r: alpha, g: 0, b: 0, a: 0). Do đó phải lấy dữ liệu của r thay vì a)
 * 
 * Các trường hợp rác trả về [null, null, null, null]
 * @param {string} raw Chuỗi màu đầu vào.
 * @returns {Object<{r: number, g: number, b: number, a: number}>} Object đầu ra {r, g, b, a}. Nếu đầu vào ko chứa dữ liệu, đầu ra là null (vd: #RRGGBB -> [r, g, b, null])
 */
export function parseAegisubHex(raw) {
	if (typeof raw !== 'string') return {r: null, g: null, b: null, a: null};
	const s = String(raw).trim();
	/** Xử lí trong trường hợp html */
	const html = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
	if (html) {
		const h = html[1];
		return {
			r: Number.parseInt(h.slice(0, 2), 16),
			g: Number.parseInt(h.slice(2, 4), 16),
			b: Number.parseInt(h.slice(4, 6), 16),
			a: h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 0,
		};
	}
	const hex = s.replace(/[^0-9a-f]/gi, '');
	if (hex === '') return {r: null, g: null, b: null, a: null};
	// Đưa về dạng AABBGGRR. (2 chữ số -> RR (alpha đọc như AA); 6 c.số -> BBGGRR, 8 -> AABBGGRR)
	const hex8 = hex.padStart(8, '0');
	const a = (255 - Number.parseInt(hex8.slice(0, 2), 16)) / 255;
	const b = Number.parseInt(hex8.slice(2, 4), 16);
	const g = Number.parseInt(hex8.slice(4, 6), 16);
	const r = Number.parseInt(hex8.slice(6, 8), 16);
	if ([r,g,b,a].some(v => v !== null && Number.isNaN(v))) return {r: null, g: null, b: null, a: null};
	return {r, g, b, a};
}
/**
 * Chuyển đổi màu hex Aegisub sang định dạng rgba() cho CSS
 * @param {string|Object<{r: number, g: number, b: number, a: number}>} raw 
 * @returns {string|null} Chuỗi rgba(r, g, b, a) hoặc null nếu đầu vào không hợp lệ
 */
export function hexToRgba(raw) {
	if (raw == null || (typeof raw !== 'string' && typeof raw !== 'object')) return null;
	const {r, g, b, a} = (typeof raw === 'string') ? parseAegisubHex(raw) : raw;
	if (r == null || g == null || b == null || a == null) return null;
	return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}
/**
 * Chuyển đổi alpha hex Aegisub sang giá trị alpha cho CSS
 * @param {string|Object<{r: number, g: number, b: number, a: number}>} raw Ở đây chỉ nhận r.
 * @returns {number|null} Giá trị alpha (r, thô) hoặc null nếu đầu vào không hợp lệ
 */
export function hexToAlpha(raw) {
	if (raw == null || (typeof raw !== 'string' && typeof raw !== 'object')) return null;
	const {r, g, b, a} = (typeof raw === 'string') ? parseAegisubHex(raw) : raw;
	if (r == null) return null;
	return r;
}
/** [arena.ai] Chuyển giá trị đậm (style.bold hoặc \b) sang font-weight CSS.
 *
 * Ánh xạ theo ngữ nghĩa ASS của \b (như libass, hoặc học lỏm weizhenye/ASS):
 * - style.bold (boolean, ĐÃ chuẩn hóa): true → '700', false → '400'.
 * - tag \b (number): 0 → '400' (tắt), 1 → '700' (bật),
 *   số khác → giữ nguyên trọng số (\b300 → '300', hợp variable font).
 *
 * Rác / undefined / âm → '400' (coi như normal). Lưu ý: field Bold THÔ của ASS
 * là 0/-1 — phải chuẩn hóa về boolean TRƯỚC khi gọi (validateAndNormalizeStyle
 * đã làm); hàm này KHÔNG hiểu -1 là đậm (âm → '400').
 *
 * @param {boolean|number} b Giá trị đậm: boolean (style.bold) hoặc số của \b.
 * @returns {string} font-weight CSS: '400' | '700' | '<trọng số>'.
 */
export function boldToWeight(b) {
	const n = b === true ? 1 : b === false ? 0 : Number(b);
	if (!Number.isFinite(n) || n < 0) return '400';
	if (n === 0) return '400';
	if (n === 1) return '700';
	return String(n);
}
/** [arena.ai] Hàm quản lí padding và margin âm (của segmentSubCss) để bù cho outline (viền) trong CSS.
 * Xử lí \bord (style.outline) → phần CSS liên quan viền/nở hộp của segment.
 *
 * \bord mang HAI nghĩa tuỳ borderStyle, nhưng CẢ HAI đều phát cùng một bộ key (không rẽ nhánh):
 *  - borderStyle 1: viền stroke quanh glyph. -webkit-text-stroke vẽ CÂN GIỮA đường bao
 *    (½ trong, ½ ngoài) còn \bord vẽ HOÀN TOÀN ra ngoài → đặt 2n, kèm paint-order
 *    'stroke fill markers' để fill che nửa trong → nửa ngoài đúng n px như Aegisub (ADR 0007).
 *  - borderStyle 3: \bord là độ NỞ của nền box → padding n.
 *
 * Vì sao phát cả 4 thứ cùng lúc mà không cần biết borderStyle hay display:
 *  - Hình học sai chế độ là VÔ HÌNH, với điều kiện trục SƠN luôn phát đủ cặp
 *    (-webkit-text-stroke-color, background-color): bs1 → (outlineColour, transparent),
 *    bs3 → (transparent, outlineColour). Thiếu một vế là stroke/nền thừa lộ ra ngay.
 *  - Tập key CỐ ĐỊNH ở mọi ca → merge/tái dùng node không bao giờ rò key cũ.
 *
 * BÙ MARGIN ÂM cả 4 phía: padding của hộp CHIẾM CHỖ
 * trong luồng nên phải trừ lại, nếu không mỗi mối nối giữa 2 segment giãn thêm 2n. Đúng ở cả
 * hai loại node, vì margin DỌC bị bỏ qua trên inline non-replaced (CSS 2.1 §8.3) còn trên
 * inline-block thì nó kéo margin box về trùng content box (baseline không xê dịch). Nền vẫn
 * được VẼ đủ phần nở vì vùng padding nằm trong vùng tô background — đúng hiệu ứng union của
 * libass: hộp to ra, VỊ TRÍ CHỮ KHÔNG ĐỔI.
 *
 * padding/margin là BỘ ĐÔI NGUYÊN TỬ — luôn phát cùng nhau, cấm tách lẻ (ghi đè một phần còn
 * tệ hơn không ghi). Dùng shorthand cho cả hai; KHÔNG trộn longhand margin-left/right vào cùng
 * object, vì trong object JS shorthand và longhand là hai key khác nhau, không đè nhau.
 *
 * --outline-width giữ số GỐC n (CHƯA ×2) theo quy ước: var = THÔ, property = ĐÃ NẤU.
 *
 * Ép kiểu bằng Number() cho đồng bộ với boldToWeight: chuỗi số ('6') vẫn nhận.
 * Âm / NaN / Infinity / rác không ép được → 0. LƯU Ý: true → 1 (Number(true) === 1);
 * đầu vào lẽ ra luôn là number đã qua validateAndNormalizeStyle, boolean là dấu hiệu sai chỗ gọi.
 * 
 * @param {number} bord Chú ý: ko nhận "6px" -> 0; chỉ nhận số hoặc string thuần số.
 * @param {number} playResY Chiều cao PlayResY của video, dùng để scale sang cqh. (đã fallback ở đầu parser)
 * @returns {{'-webkit-text-stroke-width': string, 'padding': string, 'margin': string, '--outline-width': string}}
 */
export function outlineToCss(bord, playResY) {
	const v = Number(bord);
	const n = Number.isFinite(v) && v > 0 ? v : 0;    // \bord âm / NaN / rác → 0
	const py = Number(playResY);
	const k = 100 / (Number.isFinite(py) && py); // PlayRes px → cqh
	const cqh = (x) => `${+(x * k).toFixed(4)}cqh`;   // +() cắt số 0 thừa; -0 → '0'
	return {
		'-webkit-text-stroke-width': cqh(2 * n),
		'padding': cqh(n),
		'margin': cqh(-n),
		'--outline-width': cqh(n),
	};
}
/** [Manual edit] Chuyển đổi underline/strikeOut sang text-decoration CSS
 * 
 * Chú ý: khi dùng cho các tag \u, \s trong tagProcess, phải đọc lại --underline/strikeOut từ style nếu ko phải tag xử lí.
 * (vd: gọi hàm này để xử lí \u thì phải đọc --strikeOut từ style, vì \u ko thay đổi strikeOut)
 * @param {boolean} underline
 * @param {boolean} strikeOut
 * @returns {string} text-decoration CSS: 'underline', 'line-through', 'underline line-through', hoặc 'none' nếu cả hai false
 */
export function decorationToCss(underline, strikeOut) {
	return [underline ? 'underline' : '', strikeOut ? 'line-through' : '']
		.filter(Boolean).join(' ') || 'none';
}
/** [Copilot] Chuyển đổi shadow và blur sang filter CSS
 * 
 * Chú ý: khi dùng cho các tag \*shad, \blur, \4c, \4a trong tagProcess, phải đọc lại --shadow-x/y/blur/4c/4a từ style nếu ko phải tag xử lí.
 * (vd: gọi hàm này để xử lí \blur thì phải đọc --shadow-x/y, --4c, --4a từ style, vì \blur ko thay đổi shadow hay các màu)
 * @param {string|number} shadowX Giá trị shadow X (px)
 * @param {string|number} shadowY Giá trị shadow Y (px)
 * @param {string|number} blur Giá trị blur (px)
 * @param {string} color Giá trị màu shadow (CSS color)
 * @returns {string} filter CSS: 'drop-shadow(...) blur(...)' hoặc 'none' nếu shadowX/Y = 0 và blur = 0
 */
export function shadBlurToCss(shadowX, shadowY, blur, color) {
	const sx = Number(shadowX);
	const sy = Number(shadowY);
	const b = Number(blur);
	if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(b)) return 'none';
	if (sx === 0 && sy === 0 && b === 0) return 'none';
	const dropShadow = `drop-shadow(${sx}px ${sy}px ${color})`;
	const blurFilter = b > 0 ? `blur(${b}px)` : '';
	return [dropShadow, blurFilter].filter(Boolean).join(' ');
}
