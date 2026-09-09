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

// import * as utils from './utils.js';
/** Regex nhận diện tag karaoke: \\k / \\kf / \\ko + duration (số, centisecond trong file).
 * KHÔNG match \\kt và \K. Nhóm 1 = type, nhóm 2 = duration raw (cs). */
const KARAOKE_RE = /^\\(k[fo]?)(\d+(?:\.\d+)?)/;
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
/** [Manual edit] Hàm áp dụng tag nhóm 2.4.1 (Có thể transform trong tag \t; cục bộ; có thể làm ảnh hưởng layout):
 * 
 * \fsc[x/y] (*:\fsc chỉ có trong VSFilterMod), \fsp, \fs.
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} context 
 * Object ghi dữ liệu tạm thời. Chỉ khi có thay đổi thì mới ghi từ context sang lineCss[i].delta
 * @returns {boolean} true = đã xử lí; false = không thuộc nhóm này.
 */
function applyLayoutLocalTransformable(tag, context) {
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
		if (!Number.isNaN(v)) context.textCss['letter-spacing'] = `${v}px`;
		return true;
	}
	if (tag.startsWith('\\fs')) {
		const v = Number.parseFloat(tag.slice(3));
		if (!Number.isNaN(v)) context.textCss['font-size'] = `${v}px`;
		return true;
	}
	return false;
}
/** [Manual edit] Hàm áp dụng tag nhóm 2.4.2 (Ko thể transform trong tag \t; cục bộ; có thể làm ảnh hưởng layout):
 * 
 * \- (inline-fx), \b, \i, \fn, \r, \q
 * 
 * comment: \k[f/o] đưa sang 2.3. Không xử lí \kt, \K.
 * 
 * Chú ý: những tag này vẫn xử lí như bình thường KỂ CẢ khi nằm trong \t(...).
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} context 
 * Object ghi dữ liệu tạm thời. Chỉ khi có thay đổi thì mới ghi từ context sang lineCss[i].delta
 * @returns {boolean} true = đã xử lí; false = không thuộc nhóm này.
 */
function applyLayoutLocalNonTransformable(tag, context) {
	if (/^\\-/.test(tag)) {
		// Xử lý tag inline-fx: lưu dữ liệu text của inline-fx
		const inlineFx = tag.slice(2).trim();
		if (inlineFx !== '') context.textCss['--inline-fx'] = inlineFx;
		return true;
	}
	if (/^\\b-?\d+(?:\.\d+)?$/.test(tag)) {
		// Xử lý tag bold: lưu dữ liệu text của bold và cập nhật font-weight
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.textCss['font-weight'] = on ? '700' : '400';
		return true;
	}
	if (/^\\i-?\d+(?:\.\d+)?$/.test(tag)) {
		// Xử lý tag italic: lưu dữ liệu text của italic và cập nhật font-style
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.textCss['font-style'] = on ? 'italic' : 'normal';
		return true;
	}
	if (tag.startsWith('\\fn')) {
		// Xử lý tag font name: lưu dữ liệu text của font name và cập nhật font-family
		let name = tag.slice(3).trim();
		if (name === '') name = context.styleRef?.fontName ?? '';
		if (name !== '') context.textCss['font-family'] = `"${name}", sans-serif`;
		return true;
	}
	if (tag.startsWith('\\r')) {
		// Xử lý tag reset style: lưu dữ liệu text của reset style và cập nhật style name
		const styleName = tag.slice(2);
		const baseStyleName = styleName !== '' ? styleName : (context.styleRef?.name ?? FALLBACK_STYLE_NAME);
		context.textCss['--base-style-name'] = baseStyleName;
		return true;
	}
	if (/^\\q\d+$/.test(tag)) {
		/// Xử lý tag wrap style: lưu dữ liệu text của wrap style và cập nhật --wrap-style
		const v = Number.parseInt(tag.slice(2), 10);
		if (!Number.isNaN(v)) context.textCss['--wrap-style'] = v;
		return true;
	}
	// if (KARAOKE_RE.test(tag)) {
	// 	// Xử lý tag karaoke: lưu dữ liệu text của karaoke và cập nhật --karaoke
	// 	const km = KARAOKE_RE.exec(tag);
	// 	if (km) {
	// 		const endTime = context.data.k?.endTime ?? 0;
	// 		// Chú ý: đây là endTime cũ, ko phải endTime của item hiện tại. Nếu item hiện tại có nhiều tag \k* thì cộng dồn duration.
	// 		const duration = Number(km[2]) * 10;
	// 		context.data.k = { type: km[1], duration, endTime: endTime + duration };
	// 	}
	// 	return true;
	// }
	return false;
}
/** [arena.ai] Tách \\t(...) → { t1, t2, easing, modsText } hoặc null nếu tag không hợp lệ.
 * 
 * Chỉ lấy các tag thành modsText.
 * @param {string} tag Tag raw, bắt đầu bằng '\\t'.
 * @returns {{t1: number, t2: (number|null), easing: number, modsText: string}|null}
 *  - t1: ms, tương đối đầu dòng (Aegisub: \\t dùng ms).
 *  - t2: ms, tương đối đầu dòng (Aegisub: \\t dùng ms). 
 * null khi file không ghi t2 (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
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
/** [arena.ai] Gộp scaleX/scaleY thành chuỗi 'transform' dạng CSS để tối ưu riêng. */
function finalizeSmartScale(textCss, scaleX, scaleY) {
	const parts = [];
	if (scaleX !== undefined) parts.push(`scaleX(${scaleX / 100})`);
	if (scaleY !== undefined) parts.push(`scaleY(${scaleY / 100})`);
	if (parts.length) textCss['transform'] = parts.join(' ');
}
/** [Manual edit] Hàm áp dụng các tag trong tag \t. (2.4.1, 2.3) 
 * @param {string} tag Tag raw, bắt đầu bằng '\\t'.
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {{t1: number, t2: (number|null), easing: number, target: Object}|null}
 *  - t1: ms, tương đối đầu dòng (Aegisub: \\t dùng ms).
 *  - t2: ms, tương đối đầu dòng (Aegisub: \\t dùng ms). 
 * null khi file không ghi t2 (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
*/
function parseTransformTag(tag, styleRef) {
	const parts = splitTransformParts(tag);
	if (!parts) return null;
	/** Lưu dữ liệu tạm thời khi apply các tag trong \t. Chỉ khi có thay đổi thì mới ghi từ context sang lineCss[i].delta
	 * @type {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}}
	 */
	const context = { textCss: {}, scaleX: undefined, scaleY: undefined, styleRef };
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		// Chỉ các hàm áp dụng tag có thể transform của các nhóm, thì mới đặt ở đây.
		applyLayoutLocalTransformable(sub, context); // 2.4.1
	}
	finalizeSmartScale(context.textCss, context.scaleX, context.scaleY);
	if (Object.keys(context.textCss).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context.textCss };
}
/** [Manual edit] Hàm xử lí các tag nhóm 2.4 - Layout Local.
 * chú ý: \k[f/o] đưa sang 2.3.
 * @param {Array<{tags: string[], text: string}>} base Mảng base item (đầu ra của processLineText).
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {Array<{tags: string[], text: string, delta?: Object, anim?: Object}>} base đã classify.
 */
function classifyLayoutLocal(base, styleRef) {
	if (!Array.isArray(base)) return base;
	for (const item of base) {
		// item là segments của line, mỗi item = { tags: string[], text: string } (đầu ra của processLineText).
		// trong item có thể có delta (container, text, data) và anim (\t).
		const tags = item.tags;
		// Tự động bỏ qua nếu line ko có tag nào (tránh tạo delta rỗng).
		if (!Array.isArray(tags) || tags.length === 0) continue;
		const textCss = {}; // Phần ghi vào item.delta.text.
		const data = {}; // Phần ghi vào item.delta.data.
		const animT = []; // Phần ghi vào item.anim.
		const context = { textCss, scaleX: undefined, scaleY: undefined, styleRef };
		for (const tag of tags) {
			if (tag.startsWith('\\t')) {
				const entry = parseTransformTag(tag, styleRef);
				if (entry) animT.push(entry);
				continue;
			}
			// Nếu là tag \t.
			if (tag === '\\h' || tag === '\\N' || tag === '\\n') {
				data.marker = tag;
				continue;
			}
			// Nếu là tag marker \h, \N, \n.
			applyLayoutLocalTransformable(tag, context); // 2.4.1
			applyLayoutLocalNonTransformable(tag, context); // 2.4.2
		}
		finalizeSmartScale(context.textCss, context.scaleX, context.scaleY);
		if (Object.keys(context.textCss).length > 0 || Object.keys(data).length > 0) {
			const delta = {}; // Phần ghi vào item.delta.
			if (Object.keys(context.textCss).length > 0) delta.text = context.textCss;
			if (Object.keys(data).length > 0) delta.data = data;
			item.delta = delta;
		}
		if (animT.length > 0) item.anim = animT;
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
