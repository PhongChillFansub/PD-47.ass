/** v0.1.0 09sep26
 * alpha mode
 * Classify — biến base (đầu ra của processLineText, từng mục { tags, text }) thành lineCss[i] ĐẦY ĐỦ
 * { base, collision, clip } theo struct đích (mục 3 prompt 03sep26; karaoke → delta.data 09sep26).
 *
 * Thứ tự nhóm KHÔNG ĐƯỢC đổi (đã chốt):
 *   2.4 Layout Local (2.4a apply-now rồi 2.4b \\t — bản này) → 2.3 Decoration (session sau) →
 *   2.2 Collision (bản này chỉ signal t) → 2.1 Clip (bản này stub default).
 *
 * QUY ƯỚC CHUNG (KHÔNG bao giờ đổi):
 * - Parser giữ nguyên PlayRes px, KHÔNG đo chữ/scale/collision — việc đó của renderer.
 * - Parser KHÔNG bake snapshot: \\t chỉ lưu metadata nội suy (Cách 1);
 *   renderer resolve theo metadata.mediaTime mỗi tick rVFC.
 * - Tag chạm VỎ dòng → delta.container; đổi RUỘT chữ → delta.text; số liệu thuần → delta.data.
 * - delta.text dùng KEY CSS + value CSS-cooked (khớp styleCss.text của styleParsedToCss) để renderer
 *   áp bằng Object.assign; \\fscx/fscy ghi 'transform' chứa scale của CHÍNH item/entry đó
 *   (gộp transform với style gốc/rotate là việc renderer — đã hỏi/chốt 03sep26).
 * - Mỗi base item GIỮ NGUYÊN mảng tags raw (đã hỏi/chốt 03sep26): nhóm sau (2.3/2.2/2.1) và
 *   renderer/debug đọc lại được tag gốc — vì vậy các hàm nhóm KHÔNG xóa tag khi tiêu thụ.
 *
 * KHÔNG import gì từ './parser.js' (parser.js import classify từ file này → tránh vòng tròn).
 * Dữ liệu cần của style dòng (styleRef) do parser() truyền vào qua classify().
 */
/** Định nghĩa/chú thích anim của 1 mục base (chỉ \\t — karaoke không còn ở đây, 09sep26)
 * @typedef {object} parsedDataFormat.baseItemAnim
 * @property {Array<{t1: number, t2: (number|null), easing: number, target: Object}>} [t] Danh sách
 *   mỗi \\t(...) trong item theo thứ tự: { t1, t2, easing, target }.
 *   - t1/t2: ms, tương đối đầu dòng (Aegisub: \\t dùng ms). t2 = null khi file không ghi t2
 *     (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
 *   - easing: số accel THÔ (default 1 = linear; >1 nhanh dần, <1 chậm dần) — renderer tự map
 *     sang hàm easing (linear/parabola/cubic...); giữ số thô để không mất độ chính xác.
 *   - target: tag nội suy CSS-cooked. KHÔNG chứa apply-now (\\fn/\\r/\\q/\\k*) hay
 *     \\pos/\\move/\\org/\\an (first-win 2.2). Tag 2.3 map khi viết 2.3. KHÔNG \\kt.
 */
/** Định nghĩa/chú thích lineCss[i] sau classify (struct đích — mục 3 prompt 03sep26)
 * @typedef {object} parsedDataFormat.lineCssEntry
 * @property {Array<parsedDataFormat.baseItem>} base Mục base đã classify: mỗi mục giữ nguyên
 *   { tags, text } + thêm { delta?, anim? } (delta/anim chỉ xuất hiện khi có nội dung).
 *   delta.data.k = karaoke { type, startTime, duration } (ms); delta.data.q = WrapStyle override.
 * @property {{t: boolean}} collision Nhóm 2.2 — mức DÒNG (bản này CHỈ signal \\t, chốt 03sep26:
 *   an/pos/move/org để session 2.2 làm đầy). collision.t = true khi dòng có \\t → renderer tự
 *   disable collision (KHÔNG lưu payload \\t ở đây — payload chỉ ở base[i].anim.t).
 * @property {{rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}} clip
 *   Nhóm 2.1 — mức DÒNG, last-wins (bản này STUB default — session 2.1 làm đầy).
 */

import * as utils from './utils.js';
/** Regex nhận diện tag karaoke: \\k / \\K / \\kf / \\ko + duration (số, centisecond trong file).
 * KHÔNG match \\kt (wontfix 09sep26). Nhóm 1 = type, nhóm 2 = duration raw (cs). */
const KARAOKE_RE = /^\\(k[fo]?|K)(\d+(?:\.\d+)?)/;
/** Regex số thuần (cho phần tham số đứng đầu của \\t: t1/t2/accel) */
const NUMERIC_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
/** Tên style fallback khi styleRef thiếu (dùng cho \\r rỗng) — khớp FALLBACK_DEFAULT_STYLE.name */
const FALLBACK_STYLE_NAME = 'Default';
/** [arena.ai] Token có phải số thuần (dùng làm tham số t1/t2/accel của \\t) không? */
function isNumericToken(token) {
	return NUMERIC_TOKEN_RE.test(token);
}
/** [arena.ai] Tách nội dung 1 chuỗi tag (không có ngoặc {}) thành các tag đơn theo '\\' ở mức
 * ngoặc NGOÀI CÙNG — theo dõi depth '()' nên \\clip(...)/\\t(...) không bị tách oan.
 * Bản local (KHÔNG import splitOverrideTags từ parser.js để tránh vòng tròn import).
 *
 * note: hàm này giống hàm splitOverrideTags ở parser.js, nhưng nhân bản để dành cho tags trong \\t.
 * @param {string} text Chuỗi chứa tag, vd "\\fs30\\t(\\clip(0,0,1,1))\\c&HFF&".
 * @returns {string[]} Các tag đơn, mỗi phần tử bắt đầu bằng '\\'.
 */
function splitOverrideTagsTransform(text) {
	const tags = [];
	/** Bỏ tag rác chỉ có mỗi '\\' (2 dấu '\\' liền nhau) — đồng bộ splitOverrideTags ở parser.js. */
	function pushTag(tagChunk) {
		if (tagChunk.length > 1) tags.push(tagChunk);
	}
	let depth = 0;
	let start = -1; // vị trí '\\' mở đầu tag đang dở (ngoài ngoặc)
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '(') { depth++; }
		else if (ch === ')') { if (depth > 0) depth--; }
		else if (ch === '\\' && depth === 0) {
			if (start !== -1) pushTag(text.slice(start, i));
			start = i;
		}
	}
	if (start !== -1) pushTag(text.slice(start));
	return tags;
}
/** [arena.ai] Map 1 tag LAYOUT TĨNH TWEEN (2.4b / ngoài apply-now) thành CSS-cooked.
 * Chỉ xử lí: \\fs \\fscx \\fscy \\fsc \\fsp \\b \\i. \\fn là 2.4a (applyFontNow).
 * \\b/\\i KHÔNG có số → return false, không toggle (chốt 03sep26 bản 2).
 *
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {{css: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} context
 * @returns {boolean} true = đã xử lí; false = không thuộc nhóm tween.
 */
function applyLayoutStatic(tag, context) {
	if (tag.startsWith('\\fscy')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) context.scaleY = v;
		return true;
	}
	if (tag.startsWith('\\fscx')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) context.scaleX = v;
		return true;
	}
	if (tag.startsWith('\\fsc')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) {
			context.scaleX = v;
			context.scaleY = v;
		}
		return true;
	}
	if (tag.startsWith('\\fsp')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) context.css['letter-spacing'] = `${v}px`;
		return true;
	}
	if (tag.startsWith('\\fs')) {
		const v = Number.parseFloat(tag.slice(3));
		if (!Number.isNaN(v)) context.css['font-size'] = `${v}px`;
		return true;
	}
	if (/^\\b-?\d+(?:\.\d+)?$/.test(tag)) {
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.css['font-weight'] = on ? '700' : '400';
		return true;
	}
	if (/^\\i-?\d+(?:\.\d+)?$/.test(tag)) {
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.css['font-style'] = on ? 'italic' : 'normal';
		return true;
	}
	return false;
}
/** [arena.ai] 2.4a — \\fn last-wins vào css (apply-now, không tween). */
function applyFontNow(tag, context) {
	if (!tag.startsWith('\\fn')) return false;
	let name = tag.slice(3).trim();
	if (name === '') name = context.styleRef?.fontName ?? '';
	if (name !== '') context.css['font-family'] = `"${name}", sans-serif`;
	return true;
}
/** [arena.ai] Gộp scaleX/scaleY thành chuỗi 'transform' CSS-cooked. */
function finalizeTransform(css, scaleX, scaleY) {
	const parts = [];
	if (scaleX !== undefined && scaleX !== 100) parts.push(`scaleX(${scaleX / 100})`);
	if (scaleY !== undefined && scaleY !== 100) parts.push(`scaleY(${scaleY / 100})`);
	if (parts.length) css['transform'] = parts.join(' ');
}
/**
 * Tách \\t(...) → { t1, t2, easing, modsText } hoặc null nếu tag không hợp lệ.
 * parseTransformTag / 2.4a inner dùng chung để không parse ngoặc hai lần khác nhau.
 */
function splitTransformParts(tag) {
	const m = /^\\t(?:\((.*)\))?$/.exec(tag);
	if (!m) return null;
	const inner = m[1] ?? '';
	const firstSlash = inner.indexOf('\\');
	const argSection = firstSlash === -1 ? inner : inner.slice(0, firstSlash);
	const modsText = firstSlash === -1 ? '' : inner.slice(firstSlash);
	const nums = [];
	for (const tok of argSection.split(',')) {
		const t = tok.trim();
		if (t === '') continue;
		if (isNumericToken(t)) nums.push(Number(t));
		else break;
	}
	let t1 = 0;
	let t2 = null;
	let easing = 1;
	if (nums.length === 1) {
		easing = nums[0];
	} else if (nums.length === 2) {
		t1 = nums[0];
		t2 = nums[1];
	} else if (nums.length >= 3) {
		t1 = nums[0];
		t2 = nums[1];
		easing = nums[2];
	}
	return { t1, t2, easing, modsText };
}
/** Tag trong \\t không vào anim.t.target: first-win line-level, clip, hoặc 2.4a apply-now. */
function skipTransformTarget(sub) {
	if (/^\\(pos|move|org)(?:$|[\\(])/.test(sub)) return true;
	if (/^\\an\d/.test(sub) || sub === '\\an') return true;
	if (/^\\(iclip|clip)/.test(sub)) return true;
	if (sub.startsWith('\\fn')) return true;
	if (sub.startsWith('\\r')) return true;
	if (/^\\q/.test(sub)) return true;
	if (KARAOKE_RE.test(sub)) return true;
	return false;
}
/** [arena.ai] 2.4b — Parse 1 tag \\t(...) thành { t1, t2, easing, target }. Không side-effect karaoke/fn/r/q. */
function parseTransformTag(tag, styleRef) {
	const parts = splitTransformParts(tag);
	if (!parts) return null;
	const context = { css: {}, scaleX: undefined, scaleY: undefined, styleRef };
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		if (skipTransformTarget(sub)) continue;
		applyLayoutStatic(sub, context);
	}
	finalizeTransform(context.css, context.scaleX, context.scaleY);
	if (Object.keys(context.css).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context.css };
}

/**
 * 2.4a apply-now trên 1 tag đơn (ngoài \\t hoặc inner \\t, cùng path).
 * \\fn/\\r/\\q last-wins trong item; \\k* cộng dồn karaokeRun trên CẢ DÒNG.
 * \\kt không match KARAOKE_RE → bỏ.
 * @returns {boolean} true nếu đã tiêu thụ tag apply-now.
 */
function applyNow(tag, acc) {
	const km = KARAOKE_RE.exec(tag);
	if (km) {
		const duration = Number(km[2]) * 10;
		acc.data.k = { type: km[1], startTime: acc.karaokeRunMs, duration };
		acc.karaokeRunMs += duration;
		return true;
	}
	if (tag.startsWith('\\r')) {
		const styleName = tag.slice(2);
		acc.data.baseStyleName = styleName !== '' ? styleName : (acc.styleRef?.name ?? FALLBACK_STYLE_NAME);
		return true;
	}
	if (/^\\q/.test(tag)) {
		const v = Number.parseInt(tag.slice(2), 10);
		if (!Number.isNaN(v)) acc.data.q = v;
		return true;
	}
	if (applyFontNow(tag, acc.context)) return true;
	return false;
}

/** [arena.ai] Nhóm 2.4 — Layout Local: 2.4a apply-now (k/fn/r/q) theo thứ tự tag, gặp \\t thì
 * apply-now inner TRƯỚC rồi 2.4b parseTransformTag.
 *
 * delta.data.k = { type, startTime, duration } (ms, ×10 từ cs). Không anim.k.
 * \\k trong cùng item: cộng dồn; payload k = syl cuối.
 */
export function classifyLayoutLocal(base, styleRef) {
	if (!Array.isArray(base)) return base;
	let karaokeRunMs = 0;
	for (const item of base) {
		const tags = item.tags;
		if (!Array.isArray(tags) || tags.length === 0) continue;
		const css = {};
		const data = {};
		const animT = [];
		const context = { css, scaleX: undefined, scaleY: undefined, styleRef };
		const acc = { data, context, styleRef, karaokeRunMs };
		for (const tag of tags) {
			if (tag.startsWith('\\t')) {
				const parts = splitTransformParts(tag);
				if (parts) {
					for (const sub of splitOverrideTagsTransform(parts.modsText)) {
						applyNow(sub, acc);
					}
				}
				const entry = parseTransformTag(tag, styleRef);
				if (entry) animT.push(entry);
				continue;
			}
			if (applyNow(tag, acc)) continue;
			if (tag === '\\h' || tag === '\\N' || tag === '\\n') {
				data.marker = tag;
				continue;
			}
			applyLayoutStatic(tag, context);
		}
		karaokeRunMs = acc.karaokeRunMs;
		finalizeTransform(css, context.scaleX, context.scaleY);
		if (Object.keys(css).length > 0 || Object.keys(data).length > 0) {
			const delta = {};
			if (Object.keys(css).length > 0) delta.text = css;
			if (Object.keys(data).length > 0) delta.data = data;
			item.delta = delta;
		}
		if (animT.length > 0) {
			item.anim = { t: animT };
		}
	}
	return base;
}

/** [arena.ai] Nhóm 2.3 — Decoration Local Tags. SESSION SAU. */
export function classifyDecoration(base, styleRef) {
	return base;
}

/** [arena.ai] Nhóm 2.2 — Collision. Bản này CHỈ signal \\t. */
export function classifyCollision(base, styleRef) {
	let hasTransform = false;
	if (Array.isArray(base)) {
		for (const item of base) {
			if (!Array.isArray(item.tags)) continue;
			for (const tag of item.tags) {
				if (tag.startsWith('\\t')) { hasTransform = true; break; }
			}
			if (hasTransform) break;
		}
	}
	return { t: hasTransform };
}

/** [arena.ai] Nhóm 2.1 — Clip. STUB. */
export function classifyClip(base, styleRef) {
	return { rawList: [], effectiveType: null, effectiveRaw: null };
}

/** [arena.ai] Classify — 2.4 → 2.3 → 2.2 → 2.1. */
export function classify(entry, styleRef) {
	const base = Array.isArray(entry?.base) ? entry.base : [];
	classifyLayoutLocal(base, styleRef);
	classifyDecoration(base, styleRef);
	const collision = classifyCollision(base, styleRef);
	const clip = classifyClip(base, styleRef);
	return { base, collision, clip };
}
