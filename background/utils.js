// v0.1.0 16sep26
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
