// v0.1.0 23oct26
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
 * Phân tích một CSS `rgba(r, g, b, a)` đã được parser lưu trong style để
 * tagProcess có thể giữ RGB của style khi override chỉ thay alpha. Hàm cũng
 * nhận object kênh màu nội bộ để các caller không cần serialize rồi parse lại.
 *
 * Chỉ hỗ trợ cú pháp `rgba()` bốn thành phần, phân cách bằng dấu phẩy — đúng
 * định dạng mà `hexToRgba()` phát ra. CSS màu khác (`rgb()`, tên màu, `var()`
 * và `transparent`) trả về `null` vì chúng không cho đủ bốn kênh số để nấu
 * alpha override an toàn.
 *
 * @param {string|{r: number, g: number, b: number, a?: number}|null|undefined} raw CSS rgba hoặc các kênh màu.
 * @returns {{r: number, g: number, b: number, a: number}|null} Các kênh màu số, hoặc `null` khi input không hợp lệ/không hỗ trợ.
 */
export function parseCssRgba(raw) {
	if (raw && typeof raw === 'object'
		&& Number.isFinite(raw.r) && Number.isFinite(raw.g) && Number.isFinite(raw.b)) {
		return { r: raw.r, g: raw.g, b: raw.b, a: Number.isFinite(raw.a) ? raw.a : 1 };
	}
	if (typeof raw !== 'string') return null;
	const match = /^rgba\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)$/i.exec(raw.trim());
	if (!match) return null;
	const r = Number(match[1]);
	const g = Number(match[2]);
	const b = Number(match[3]);
	const a = Number(match[4]);
	if (![r, g, b, a].every(Number.isFinite)) return null;
	return { r, g, b, a };
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
/** [Manual edit] Xử lí chung kiểu viền (bao quanh chữ hoặc hộp) và áp màu (\3c, \3a)
 * @param {number} borderStyle Kiểu viền: 1 (viền chữ), 3 (hộp màu outline), 4 (hộp màu nền).
 * @param {string|null} outlineColor Màu viền (\3c)
 * @param {string|null} backColour Màu nền (\4c)
 * @returns {{
 *   '--color3': string,
 *   '--border-style': number,
 *   'background-color': string,
 *   '-webkit-text-stroke-color': string
 * }}
 */
export function outlineStyleToCss(borderStyle, outlineColor, backColour) {
	const isBoxStyle = borderStyle === 3 || borderStyle === 4;
	return {
		'--color3': outlineColor ?? 'transparent',
		'--border-style': borderStyle,
		'background-color': (
			borderStyle === 3 ? outlineColor
				: borderStyle === 4 ? backColour
					: 'transparent'
		) ?? 'transparent',
		'-webkit-text-stroke-color': isBoxStyle
			? 'transparent'
			: outlineColor ?? 'transparent',
	};
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
/** [Manual edit] Xử lí chung \u, \s trong thuộc tính decoration của CSS
 * @param {boolean} underline 
 * @param {boolean} strikeOut
 * @returns {string}
 */
export function decorationToCss(underline, strikeOut) {
	return [underline ? 'underline' : '', strikeOut ? 'line-through' : '']
		.filter(Boolean).join(' ') || 'none';
}
/** [Manual edit] Chuyển đổi shadow và blur sang filter CSS.
 * Chú ý: khi dùng cho các tag \*shad, \blur, \4c, \4a trong tagProcess, phải đọc lại --shadow-x/y/blur/4c/4a từ style nếu ko phải tag xử lí.
 * (vd: gọi hàm này để xử lí \blur thì phải đọc --shadow-x/y, --4c, --4a từ style, vì \blur ko thay đổi shadow hay các màu)
 * @param {number} shadowX Giá trị shadow X số thuần
 * @param {number} shadowY Giá trị shadow Y số thuần
 * @param {number} blur Giá trị blur số thuần
 * @param {string} color Màu 4
 * @returns {string} filter CSS: 'drop-shadow(...) blur(...)' hoặc 'none' nếu shadowX/Y = 0 và blur = 0
 */
export function shadBlurToCss(shadowX, shadowY, blur, color, playResX, playResY, layoutResX, layoutResY, ScaledBorderAndShadow) {
	const xValue = Number.isFinite(Number(shadowX)) ? Number(shadowX) : 0;
	const yValue = Number.isFinite(Number(shadowY)) ? Number(shadowY) : 0;
	const blurValue = Number.isFinite(Number(blur)) ? Number(blur) : 0;
	const hasShadow = xValue !== 0 || yValue !== 0;
	const hasBlur = blurValue > 0;
	if (!hasShadow && !hasBlur) return 'none';
	const shadowResX = ScaledBorderAndShadow ? playResX : layoutResX;
	const shadowResY = ScaledBorderAndShadow ? playResY : layoutResY;
	const toCqw = (value, resolution) => Number(resolution) > 0
		? `calc(${value / resolution} * 100cqw)`
		: `${value}px`;
	const toCqh = (value, resolution) => Number(resolution) > 0
		? `calc(${value / resolution} * 100cqh)`
		: `${value}px`;
	return [
		hasShadow
			? `drop-shadow(${toCqw(xValue, shadowResX)} ${toCqh(yValue, shadowResY)} ${color})`
			: '',
		hasBlur
			? `blur(${toCqh(blurValue, layoutResY)})`
			: '',
	].filter(Boolean).join(' ');
	// Chỉ dùng filter: drop-shadow(...) blur(...) để render shadow/blur,
	// không dùng text-shadow vì text-shadow không render đúng với viền (borderStyle 1) của ASS.
}
/** [Manual edit] Chuẩn hóa ASS alignment và trả về vị trí tương đối của anchor.
 * - horizontal: 0 = left, 0.5 = center, 1 = right
 * - vertical: 0 = top, 0.5 = middle, 1 = bottom
 *
 * @param {number|string} value Dữ liệu từ alignment của style hoặc \an
 * @return {{
 *   an: number,
 *   horizontal: number,
 *   vertical: number
 * }}
 */
export function resolveAlignment(value) {
	let an = Number(value);
	if (!Number.isInteger(an) || an < 1 || an > 9) an = 5;
	const column = (an - 1) % 3;        // 0 left, 1 center, 2 right
	const row = Math.floor((an - 1) / 3); // 0 bottom, 1 middle, 2 top
	const horizontal = column / 2;
	const vertical = 1 - row / 2;
	return {
		// Để debug, chắc thế?
		an, 
		// Tỉ lệ tính từ left / top.
		horizontal, // 0, 0.5, 1
		vertical, // 1, 0.5, 0
	};
}
/** [Manual edit] Chuyển đổi default alignment/style margin sang CSS.
 * 
 * Trình tự áp dụng tag override 2.2: \an (override/style-based) -> \pos hoặc \move (lấy đầu) -> \org
 * 
 * Chú ý: origin là của lineSub, của segmentSub cần xử lí riêng.
 * @param {parsedDataFormat.style} style
 * @param {number} playResX
 * @param {number} playResY
 * @return {{
 *   left: string,
 *   top: string,
 *   '--align-x': number,
 *   '--align-y': number,
 *   '--origin-delta-x': number,
 *   '--origin-delta-y': number,
 *   '--origin': string,
 *   'max-width': string,
 *   translate: string
 * }}
 */
export function alignmentToCss(style, playResX, playResY) {
	const px = Number(playResX);
	const py = Number(playResY);
	// if (!Number.isFinite(px) || px <= 0) throw new RangeError(`Invalid PlayResX: ${playResX}`);
	// if (!Number.isFinite(py) || py <= 0) throw new RangeError(`Invalid PlayResY: ${playResY}`);
	const marginValue = (value) => {
		const n = Number(value);
		return Number.isInteger(n) && n >= 0 ? n : 0;
	};
	const marginLPct = marginValue(style.marginL) / px * 100;
	const marginRPct = marginValue(style.marginR) / px * 100;
	const marginVPct = marginValue(style.marginV) / py * 100;
	const alignment = resolveAlignment(style.alignment);
	const safeWidthPct = 100 - marginLPct - marginRPct;
	// x=0: MarginL
	// x=.5: center của safe area
	// x=1: 100cqw - MarginR
	const leftPct = marginLPct + safeWidthPct * alignment.horizontal;
	// y=1: 100cqh - MarginV
	// y=.5: 50cqh
	// y=0: MarginV
	const topPct = (marginVPct + (100 - marginVPct * 2) * alignment.vertical);
	return {
		left: `${leftPct}cqw`,	// \pos, \move sẽ override chỗ này, \org phải đọc chỗ này
		top: `${topPct}cqh`,	// \pos, \move sẽ override chỗ này, \org phải đọc chỗ này
		'--align-x': alignment.horizontal,
		'--align-y': alignment.vertical,
		// Hướng dẫn: trong segment, \org sẽ override 2 biến như thế này.
		// origin-delta phải tính chênh lệch giữa dữ liệu thô (\org) và vị trí của segment.
		'--origin-delta-x': 0,
		'--origin-delta-y': 0,
		// Lưu lại cách xử lí origin cho segment. 
		// Chú ý: parent của lineSub (khung sub) phải có thuộc tính "container-type: size;" 
		// để segment dùng cqw/cqh chuẩn
		'--origin': [
			`calc(var(--align-x) * 100% + var(--origin-delta-x) * 100cqw)`,
			`calc(var(--align-y) * 100% + var(--origin-delta-y) * 100cqh)`,
		].join(' '),
		// width: 'fit-content', // đưa vào globalCss.
		'max-width': `calc(100cqw - ${marginLPct}cqw - ${marginRPct}cqw)`,
		translate: [
			`calc(var(--align-x) * -100%)`,
			`calc(var(--align-y) * -100%)`,
		].join(' '),	// \an sẽ override chỗ này
		// Các tag \an, \pos, \move, \org đều là tag của toàn line (2.2, 2.1).
		// clip sẽ thêm độc lập vào lineSub riêng.
	};
}
/** [Manual edit] Các thuộc tính cố định cho node CSS.
 * 
 * Chú ý: đã khóa wrapStyle = 2 (ko có tính năng tự động xuống dòng)
 */
export const globalCss = {
	/** Giữ các node ko gây ảnh hưởng đến flow của trang */
	'position': 'absolute',
	/** Ghi thay cho xử lí alignment */
	'width': 'fit-content',
	/** Không có tính năng tự động xuống dòng (để đổi lấy tính năng xoay \fr*) */
	'white-space': 'pre',
		// 'white-space': (wrapStyle === 2 ? 'pre' : 'pre-wrap'), // WrapStyle 2: không word wrap
		// 'word-break': 'keep-all',
		// 'overflow-wrap': 'break-word',
		// 'text-wrap': (wrapStyle === 3 ? 'balance' : wrapStyle === 1 ? 'wrap' : 'pretty'),
	/** Khóa paint-order cho mọi borderStyle. */
	'paint-order': 'stroke fill markers', 
};
/** [Manual edit] Xử lí chung \fr*, \fsc* trong thuộc tính transform của CSS.
 * 
 * Thứ tự trong thuộc tính: perspective -> rotateY -> rotateX -> rotateZ -> scaleX -> scaleY 
 * 
 * (CSS đọc từ phải sang trái, nên scaleY xử lí trước)
 * @param {number} scaleX đơn vị %
 * @param {number} scaleY đơn vị %
 * @param {number} angleX đơn vị deg
 * @param {number} angleY đơn vị deg
 * @param {number} angleZ đơn vị deg
 * @param {number} layoutResY đơn vị px, dùng để tính perspective (layoutRes)
 * @returns {{transform?: string}} Object CSS rỗng khi mọi transform là identity.
 */
export function scaleAngleToCss(scaleX, scaleY, angleX, angleY, angleZ, layoutResY) {
	const parts = [];
	const fscx = Number(scaleX);
	const fscy = Number(scaleY);
	const frx = Number(angleX);
	const fry = Number(angleY);
	const frz = Number(angleZ);
	if ((Number.isFinite(frx) && frx !== 0) || (Number.isFinite(fry) && fry !== 0)) {
		const perspective = 312.5 / Number(layoutResY) * 100;
		if (Number.isFinite(perspective) && perspective > 0) {
			parts.push(`perspective(${perspective}cqh)`);
		}
	}
	if (Number.isFinite(fry) && fry !== 0) {
		parts.push(`rotateY(${-fry}deg)`);
	}
	if (Number.isFinite(frx) && frx !== 0) {
		parts.push(`rotateX(${-frx}deg)`);
	}
	if (Number.isFinite(frz) && frz !== 0) {
		parts.push(`rotateZ(${-frz}deg)`);
	}
	if (Number.isFinite(fscx) && fscx !== 100) {
		parts.push(`scaleX(${fscx/100})`);
	}
	if (Number.isFinite(fscy) && fscy !== 100) {
		parts.push(`scaleY(${fscy/100})`);
	}
	return parts.length > 0
		? { transform: parts.join(' ') }
		: {};

}
/** [Manual edit] Xử lí chung \bord (ko hỗ trợ \*bord), \*shad cho CSS.
 * @param {number} outlineWidth px (\bord)
 * @param {number} playResY px
 * @param {number} layoutResY px
 * @param {boolean} [ScaledBorderAndShadow=false] Nếu true, dùng playResY; nếu không, dùng layoutResY.
 * @returns {{'--outline': number, '-webkit-text-stroke-width': string, padding: string, margin: string}}
 */
export function outlineWidthToCss(outlineWidth, playResY, layoutResY, ScaledBorderAndShadow) {
	const scaledWidth = outlineWidth / (ScaledBorderAndShadow ? playResY : layoutResY);
	return {
		'--outline': outlineWidth,
		'-webkit-text-stroke-width': `calc(${scaledWidth} * 2 * 100cqh)`,
		'padding': `calc(${scaledWidth} * 100cqh)`,
		'margin': `calc(${scaledWidth} * 100cqh)`,
	}
}
