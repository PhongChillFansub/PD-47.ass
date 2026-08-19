// v0.1.0 19aug26
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