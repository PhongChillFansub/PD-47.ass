// v0.1.0 16aug26
"use strict";
const extensionName = "PD-47.ass";
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

const HTML_ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
};
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