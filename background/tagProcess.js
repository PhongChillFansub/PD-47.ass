/** v0.1.0 11sep26
 * alpha mode
 * Classify — biến base (đầu ra của processLineText, từng mục { tags, text }) thành lineCss[i] ĐẦY ĐỦ
 * { base, collision, clip } theo struct đích (mục 3 prompt 03sep26).
 *
 * Thứ tự nhóm KHÔNG ĐƯỢC đổi (đã chốt):
 *   2.4 Layout Local (2.4.1 transformable + 2.4.2 non-transformable TĨNH ngoài \t, rồi \t → metadata
 *   anim — bản này) → 2.3 Decoration (ĐÃ LÀM THẬT 11sep26: màu/alpha/bord/shad/be/blur/fa/fr
 *   + karaoke \k/\kf/\ko → delta.data.k) →
 *   2.2 Collision (bản này chỉ signal t) → 2.1 Clip (bản này stub default).
 *   KHÔNG có 2 pass 2.4a/2.4b — 11sep26 (chủ repo, commit 1ee633d): tag 2.4.2 nằm TRONG \t(...)
 *   được apply-now vào context của segment NGOÀI \t, coi như tag ngoài \t thông thường
 *   (09sep26 từng BỎ apply-now — hướng đó đã được thay thế bằng bản này).
 *
 * QUY ƯỚC CHUNG (KHÔNG bao giờ đổi):
 * - Parser giữ nguyên PlayRes px, KHÔNG đo chữ/scale/collision — việc đó của renderer.
 * - Parser KHÔNG bake snapshot: \t chỉ lưu metadata nội suy (Cách 1);
 *   renderer resolve theo metadata.mediaTime mỗi tick rVFC.
 * - Tag chạm VỎ dòng → delta.container; đổi RUỘT chữ → delta.text; số liệu thuần → delta.data.
 * - delta.text dùng KEY CSS + value CSS-cooked (khớp styleCss.text của styleParsedToCss) để renderer
 *   áp bằng Object.assign; \fscx/fscy ghi 'transform' chứa scale của CHÍNH item/entry đó
 *   (gộp transform với style gốc/rotate là việc renderer — đã hỏi/chốt 03sep26).
 *   KHÔNG lọc identity 100: \fscx100/\fscy100 vẫn emit scaleX(1)/scaleY(1) (chốt 09sep26).
 * - Mỗi base item GIỮ NGUYÊN mảng tags raw (đã hỏi/chốt 03sep26): nhóm sau (2.3/2.2/2.1) và
 *   renderer/debug đọc lại được tag gốc — vì vậy các hàm nhóm KHÔNG xóa tag khi tiêu thụ.
 *
 * KHÔNG import gì từ './parser.js' (parser.js import classify từ file này → tránh vòng tròn).
 * Dữ liệu cần của style dòng (styleRef) do parser() truyền vào qua classify().
 * File này CHỈ export classify — mọi hàm nhóm private (chốt 09sep26; tests đi qua classify).
 */
/** Định nghĩa/chú thích anim của 1 mục base: metadata nội suy \t, lưu MẢNG TRỰC TIẾP
 * (không bọc { t: [...] } — chốt 09sep26; renderer đọc item.anim[i].t1...).
 * Karaoke KHÔNG còn nằm ở đây — 2.4 không xử lí karaoke (về 2.3, xem typedef lineCssEntry).
 * @typedef {Array<{t1: number, t2: (number|null), easing: number, target: Object}>} parsedDataFormat.baseItemAnim
 * Mỗi phần tử tương ứng 1 \t(...) trong item, theo thứ tự:
 * - t1/t2: ms, tương đối đầu dòng (Aegisub: \t dùng ms). t2 = null khi file không ghi t2
 *   (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
 * - easing: số accel THÔ (default 1 = linear; >1 nhanh dần, <1 chậm dần) — renderer tự map
 *   sang hàm easing (linear/parabola/cubic...); giữ số thô để không mất độ chính xác.
 * - target: tag nội suy CSS-cooked — tag 2.4.1 (\fs/\fsp/\fsc[x/y]) + tag 2.3 (màu/bord/shad/
 *   be/blur/fa/fr — ĐÃ map 11sep26). KHÔNG chứa \pos/\move/\org/\an (first-win 2.2) và KHÔNG có
 *   tag 2.4.2 (\b/\i/\fn/\r/\q/\- — KHÔNG nội suy vào target; 11sep26: apply-now, áp ngay vào delta
 *   của segment ngoài \t như tag ngoài \t thông thường). KHÔNG \k* (bỏ im lặng — SAI SỐ #17), KHÔNG \kt.
 */
/** Định nghĩa/chú thích lineCss[i] sau classify (struct đích — mục 3 prompt 03sep26)
 * @typedef {object} parsedDataFormat.lineCssEntry
 * @property {Array<parsedDataFormat.baseItem>} base Mục base đã classify: mỗi mục giữ nguyên
 *   { tags, text } + thêm { delta?, anim? } (delta/anim chỉ xuất hiện khi có nội dung).
 *   delta.data chứa marker (\h/\N/\n) + karaoke k (2.3, 11sep26: { type, durationMs, startMs })
 *   — số liệu thuần. \r/\q KHÔNG vào data: ghi vào delta.text dưới dạng CSS var — '--base-style-name'
 *   (\r, rỗng = style dòng) / '--wrap-style' (\q, last-wins). Karaoke \k* do 2.3 xử lí.
 * @property {{t: boolean}} collision Nhóm 2.2 — mức DÒNG (bản này CHỈ signal \t, chốt 03sep26:
 *   an/pos/move/org để session 2.2 làm đầy). collision.t = true khi dòng có \t → renderer tự
 *   disable collision (KHÔNG lưu payload \t ở đây — payload chỉ ở base[i].anim).
 * @property {{rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}} clip
 *   Nhóm 2.1 — mức DÒNG, last-wins (bản này STUB default — session 2.1 làm đầy).
 */

// import * as utils from './utils.js';
/** Regex nhận diện tag karaoke: \k / \kf / \ko + duration (số, centisecond trong file).
 * KHÔNG match \K (không xử lí) và \kt (wontfix v1+). Nhóm 1 = type, nhóm 2 = duration raw (cs).
 * Dùng trong classifyDecoration (2.3 — ĐÃ LÀM 11sep26); 2.4 KHÔNG đụng karaoke. */
const KARAOKE_RE = /^\\(k[fo]?)(\d+(?:\.\d+)?)/;
/** Regex số thuần (cho phần tham số đứng đầu của \t: t1/t2/accel) */
const NUMERIC_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
/** Tên style fallback khi styleRef thiếu (dùng cho \r rỗng) — khớp FALLBACK_DEFAULT_STYLE.name */
const FALLBACK_STYLE_NAME = 'Default';
/** [arena.ai] Token có phải số thuần (dùng làm tham số t1/t2/accel của \t) không? */
function isNumericToken(token) {
	return NUMERIC_TOKEN_RE.test(token);
}
/** [arena.ai] Tách nội dung 1 chuỗi tag (không có ngoặc {}) thành các tag đơn theo '\' ở mức
 * ngoặc NGOÀI CÙNG — theo dõi depth '()' nên \clip(...)/\t(...) không bị tách oan.
 * Bản local (KHÔNG import splitOverrideTags từ parser.js để tránh vòng tròn import).
 *
 * note: hàm này giống hàm splitOverrideTags ở parser.js, nhưng nhân bản để dành cho tags trong \t.
 * @param {string} text Chuỗi chứa tag, vd "\fs30\t(\clip(0,0,1,1))\c&HFF&".
 * @returns {string[]} Các tag đơn, mỗi phần tử bắt đầu bằng '\'.
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
/** [Manual edit] Hàm áp dụng tag nhóm 2.4.1 — TRANSFORMABLE: được nội suy (tween) trong \t;
 * cục bộ (mức mục base); có thể làm ảnh hưởng layout:
 *
 * \fsc[x/y] (*:\fsc chỉ có trong VSFilterMod), \fsp, \fs.
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} context
 * Object ghi dữ liệu tạm thời (textCss / scaleX / scaleY). Caller (classifyLayoutLocal hoặc
 * parseTransformTag) mới ghi context sang item.delta khi có thay đổi.
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
/** [Manual edit] Hàm áp dụng tag nhóm 2.4.2 — NON-transformable: KHÔNG được nội suy (tween)
 * trong \t (chỉ tag 2.4.1 vào target của parseTransformTag); cục bộ; có thể làm ảnh hưởng layout:
 *
 * \- (inline-fx), \b, \i, \fn, \r, \q
 *
 * Karaoke: \k/\kf/\ko KHÔNG xử lí ở 2.4 — đưa sang 2.3 (session sau). Không xử lí \K, \kt.
 *
 * CHÚ Ý (11sep26): hàm này được gọi CHO CẢ tag TRONG \t(...) — parseTransformTag áp 2.4.2
 * apply-now vào context của segment ngoài \t (commit 1ee633d; hướng "BỎ apply-now" 09sep26 đã thay thế).
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} context
 * Object ghi dữ liệu tạm thời (textCss). Caller mới ghi context sang item.delta khi có thay đổi.
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
/** [arena.ai] Gộp scaleX/scaleY thành chuỗi 'transform' dạng CSS để tối ưu riêng.
 * KHÔNG lọc identity 100: scaleX(1)/scaleY(1) vẫn emit (chốt 09sep26 — renderer áp trực tiếp,
 * không tốn logic lọc ở parser). */
function finalizeSmartScale(textCss, scaleX, scaleY) {
	const parts = [];
	if (scaleX !== undefined) parts.push(`scaleX(${scaleX / 100})`);
	if (scaleY !== undefined) parts.push(`scaleY(${scaleY / 100})`);
	if (parts.length) textCss['transform'] = parts.join(' ');
}
/** [Manual edit] Hàm áp dụng các tag bên trong tag \t — metadata nội suy (CHỈ tag 2.4.1).
 * @param {string} tag Tag raw, bắt đầu bằng '\t' (vd "\t(0,500,\fs30)").
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @param {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} nonTransformableContext
 * Object ghi dữ liệu context của segment ngoài \t. (cho các tag 2.4.2, tag trong \t coi như tag ngoài \t thông thường)
 * @returns {{t1: number, t2: (number|null), easing: number, target: Object}|null}
 *  - null khi tag không phải \t hợp lệ, hoặc modsText không có tag 2.4.1 nào (không tạo entry anim).
 *  - t1: ms, tương đối đầu dòng (Aegisub: \t dùng ms).
 *  - t2: ms, tương đối đầu dòng; null khi file không ghi t2 (transform chạy tới HẾT dòng —
 *    renderer lấy duration dòng từ events để resolve).
 */
function parseTransformTag(tag, styleRef, nonTransformableContext) {
	const parts = splitTransformParts(tag);
	if (!parts) return null;
	/** Lưu dữ liệu tạm thời khi apply các tag trong \t. Chỉ khi có thay đổi thì mới ghi từ context sang lineCss[i].delta
	 * @type {{textCss: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}}
	 */
	const context = { textCss: {}, scaleX: undefined, scaleY: undefined, styleRef };
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		// Chỉ các hàm áp dụng tag có thể transform của các nhóm, thì mới đặt ở đây.
		applyLayoutLocalTransformable(sub, context); // 2.4.1
		applyLayoutLocalNonTransformable(sub, nonTransformableContext); // 2.4.2 (apply-now 11sep26)
		applyDecorationToTarget(sub, context); // 2.3 → target (11sep26; karaoke bỏ im lặng — #17)
	}
	finalizeSmartScale(context.textCss, context.scaleX, context.scaleY);
	if (Object.keys(context.textCss).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context.textCss };
}
/** [Manual edit] Hàm xử lí các tag nhóm 2.4 — Layout Local (2.4.1 + 2.4.2 tĩnh; \t → anim).
 * chú ý: karaoke \k/\kf/\ko KHÔNG xử lí ở 2.4 — thuộc 2.3 (classifyDecoration, đã làm 11sep26).
 * @param {Array<{tags: string[], text: string}>} base Mảng base item (đầu ra của processLineText).
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {Array<{tags: string[], text: string, delta?: Object, anim?: Array<Object>}>} base đã classify.
 */
function classifyLayoutLocal(base, styleRef) {
	if (!Array.isArray(base)) return base;
	for (const item of base) {
		// item là mục base của line, mỗi item = { tags: string[], text: string } (đầu ra của processLineText).
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
				const entry = parseTransformTag(tag, styleRef, context);
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











/** [arena.ai] Parse màu inline của tag 2.3 (&HBBGGRR& hoặc &HAABBGGRR&) → { r, g, b, alpha }
 * (alpha: 0..1 tính ngược Aegisub; NULL khi hex ≤ 6 chữ số = tag không kèm byte alpha → alpha
 * kế thừa trạng thái đang theo dõi / alpha của style lúc emit). Null khi không có hex.
 * Khớp convertAegisubColorToCss của parser.js về thứ tự byte AABBGGRR.
 * Nhân bản local vì tagProcess.js KHÔNG import parser.js (tránh vòng tròn — precedent splitOverrideTagsTransform). */
function parseTagColor(raw) {
	// Chỉ GIỮ ký tự hex — tag tới đây có thể còn dạng 'HBBGGRR&' (đã cắt '&'); lọc sạch là chắc ăn nhất.
	const hex0 = String(raw).replace(/[^0-9a-f]/gi, '');
	if (hex0 === '') return null;
	const hasAlphaByte = hex0.length > 6; // >6 chữ số = có byte AA (AABBGGRR)
	const hex = hex0.padStart(8, '0');
	const alpha = hasAlphaByte ? (255 - Number.parseInt(hex.slice(0, 2), 16)) / 255 : null;
	const b = Number.parseInt(hex.slice(2, 4), 16);
	const g = Number.parseInt(hex.slice(4, 6), 16);
	const r = Number.parseInt(hex.slice(6, 8), 16);
	if ([alpha, b, g, r].some(v => v !== null && Number.isNaN(v))) return null;
	return { r, g, b, alpha };
}
/** [arena.ai] Parse alpha của tag 2.3 (&HAA&) → 0..1 (Aegisub tính ngược), null khi vô giá trị. */
function parseTagAlpha(raw) {
	const hex = String(raw).replace(/[^0-9a-f]/gi, '');
	if (hex === '') return null;
	const aa = Number.parseInt(hex.padStart(2, '0').slice(0, 2), 16);
	if (Number.isNaN(aa)) return null;
	return (255 - aa) / 255;
}
/** [arena.ai] Nấu { r, g, b, a } → chuỗi rgba() đúng format convertAegisubColorToCss (space sau dấu phẩy, a 2 số lẻ). */
function cookRgba({ r, g, b, a }) {
	return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`;
}
/** [arena.ai] Parse ngược chuỗi rgba() đã nấu (màu style của styleRef) → { r, g, b, a }, null khi không khớp. */
function parseCssRgba(css) {
	const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(String(css ?? ''));
	if (!m) return null;
	return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] != null ? Number(m[4]) : 1 };
}
/** Field màu của styleRef theo kênh ASS (1=primary, 2=secondary, 3=outline, 4=back). */
const STYLE_COLOR_FIELD = Object.freeze({ 1: 'primaryColour', 2: 'secondaryColour', 3: 'outlineColour', 4: 'backColour' });
/** [arena.ai] Nấu hệ số skew ASS (\\fax/\\fay: x' = x + f·y) → góc deg cho CSS skewX/Y: θ = atan(f). */
function skewFactorToDeg(f) {
	return Number((Math.atan(f) * 180 / Math.PI).toFixed(4));
}
/** [arena.ai] Trạng thái decoration tạm của 1 item — caller tạo MỚI mỗi item (last-wins = ghi đè field). */
function newDecorationState() {
	return {
		colors: { 1: null, 2: null, 3: null, 4: null },
		alpha: { all: null, 1: null, 2: null, 3: null, 4: null },
		bord: { w: null, x: null, y: null },
		shad: { d: null, x: null, y: null },
		blur: null,
		angle: { x: null, y: null, z: null },
		skew: { x: null, y: null },
	};
}
/** [arena.ai] Áp MỘT tag nhóm 2.3 vào trạng thái tạm `st` của item (last-wins trong item).
 * Chỉ yêu cầu giá trị khi tag kèm '&' (để KHÔNG đụng \\clip — việc của 2.1).
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {Object} st Trạng thái decoration tạm của item (caller tạo mới mỗi item).
 * @returns {boolean} true = đã tiêu thụ tag; false = không thuộc nhóm 2.3.
 */
function applyDecorationTag(tag, st) {
	// \\1c..\\4c + alias \\c (= \\1c) — màu kênh 1..4 (Aegisub: last-wins mỗi kênh).
	let m = /^\\([1-4])c&(.*)$/.exec(tag);
	if (!m && tag.startsWith('\\c&')) m = [tag, '1', tag.slice(3)];
	if (m) {
		const c = parseTagColor(m[2]);
		if (c) st.colors[Number(m[1])] = c;
		return true;
	}
	// \\blur<r> / \\be<n> — CÙNG họ blur, last-wins CHÉO giữa hai tag (\\be coi như passes ≈ px, xấp xỉ ADR 0004).
	if (tag.startsWith('\\blur')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) st.blur = v;
		return true;
	}
	if (tag.startsWith('\\be')) {
		const v = Number.parseFloat(tag.slice(3));
		if (!Number.isNaN(v)) st.blur = v;
		return true;
	}
	// \\fax/\\fay — hệ số skew (\\faxy không tồn tại trong ASS).
	if (tag.startsWith('\\fax')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) st.skew.x = v;
		return true;
	}
	if (tag.startsWith('\\fay')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) st.skew.y = v;
		return true;
	}
	// \\frx/\\fry/\\frz + alias \\fr (= \\frz) — góc xoay, giữ RAW deg (renderer đổi dấu khi gộp).
	const frM = /^\\fr([xyz])/.exec(tag);
	if (frM || tag.startsWith('\\fr')) {
		const axis = frM ? frM[1] : 'z';
		const v = Number.parseFloat(tag.slice(frM ? 4 : 3));
		if (!Number.isNaN(v)) st.angle[axis] = v;
		return true;
	}
	// \\bord<w> cả hai chiều; \\xbord/\\ybord từng chiều (Aegisub: last-wins mỗi chiều).
	if (tag.startsWith('\\bord')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) st.bord.w = v;
		return true;
	}
	if (tag.startsWith('\\xbord')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) st.bord.x = v;
		return true;
	}
	if (tag.startsWith('\\ybord')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) st.bord.y = v;
		return true;
	}
	// \\shad<d> cả hai chiều; \\xshad/\\yshad từng chiều (nhận giá trị âm — bóng hất ngược).
	if (tag.startsWith('\\shad')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) st.shad.d = v;
		return true;
	}
	if (tag.startsWith('\\xshad')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) st.shad.x = v;
		return true;
	}
	if (tag.startsWith('\\yshad')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) st.shad.y = v;
		return true;
	}
	// \\alpha&HAA& — alpha MỌI kênh; \\1a..\\4a&HAA& — alpha từng kênh (last-wins theo thứ tự tag).
	if (tag.startsWith('\\alpha&')) {
		const a = parseTagAlpha(tag.slice(7));
		if (a !== null) st.alpha.all = a;
		return true;
	}
	m = /^\\([1-4])a&(.*)$/.exec(tag);
	if (m) {
		const a = parseTagAlpha(m[2]);
		if (a !== null) st.alpha[Number(m[1])] = a;
		return true;
	}
	return false;
}
/** [arena.ai] Nấu trạng thái decoration `st` của item → textCss/containerCss (CSS-cooked,
 * khóa khớp styleCss.text của styleParsedToCss để renderer Object.assign).
 * Alpha hiệu dụng mỗi kênh: byte alpha của tag màu > \\Na > \\alpha > alpha màu style. */
function emitDecoration(st, styleRef, textCss, containerCss) {
	const isBox = styleRef?.borderStyle === 3;
	const styleCols = {};
	for (const n of [1, 2, 3, 4]) styleCols[n] = parseCssRgba(styleRef?.[STYLE_COLOR_FIELD[n]]);
	for (const n of [1, 2, 3, 4]) {
		const tagC = st.colors[n];
		const trackedA = st.alpha[n] ?? st.alpha.all ?? null;
		if (tagC === null && trackedA === null) continue; // kênh không bị đụng
		const baseC = styleCols[n];
		const rgb = tagC ?? (baseC ? { r: baseC.r, g: baseC.g, b: baseC.b } : null);
		if (rgb === null) continue; // tag chỉ alpha mà style thiếu màu → bỏ qua kênh này
		const a = (tagC && tagC.alpha !== null) ? tagC.alpha : (trackedA ?? baseC?.a ?? 1);
		const css = cookRgba({ r: rgb.r, g: rgb.g, b: rgb.b, a });
		if (n === 1) { textCss['color'] = css; textCss['--primary-color'] = css; }
		if (n === 2) textCss['--secondary-color'] = css;
		if (n === 3) {
			if (isBox) containerCss['background-color'] = css; // borderStyle 3: outlineColour là màu nền box
			else { textCss['-webkit-text-stroke-color'] = css; textCss['--outline-color'] = css; }
		}
		if (n === 4) {
			textCss['--back-color'] = css;
			const shadow = Number(styleRef?.shadow) || 0;
			// shad block bên dưới sẽ GHI ĐÈ bằng offset hiệu dụng nếu item có tag \\shad*.
			if (shadow !== 0) textCss['text-shadow'] = `${shadow}px ${shadow}px ${css}`;
		}
	}
	// \\bord* — XẤP XỈ max(x,y) vì CSS stroke không tách được chiều (chốt 11sep26); ÂM → 0.
	if (st.bord.w !== null || st.bord.x !== null || st.bord.y !== null) {
		const styleBord = Number(styleRef?.outline) || 0;
		const ex = Math.max(0, st.bord.x ?? st.bord.w ?? styleBord);
		const ey = Math.max(0, st.bord.y ?? st.bord.w ?? styleBord);
		const eff = Math.max(ex, ey);
		if (isBox) containerCss['padding'] = `${eff}px`; // borderStyle 3: \bord là padding của box
		else textCss['-webkit-text-stroke-width'] = `${eff * 2}px`; // ×2 — ADR 0007 (stroke vẽ cân giữa)
		textCss['--outline-width'] = `${eff}px`;
	}
	// \\be/\\blur → CSS filter (xấp xỉ theo ADR 0004); 0 = tắt.
	if (st.blur !== null) textCss['filter'] = st.blur > 0 ? `blur(${st.blur}px)` : 'none';
	// \\fr*/\\fa* → CSS variables RAW deg — renderer gộp với scale/style transform (chốt 03sep26: gộp là việc renderer).
	for (const axis of ['x', 'y', 'z']) {
		if (st.angle[axis] !== null) textCss[`--angle-${axis}`] = `${st.angle[axis]}deg`;
	}
	if (st.skew.x !== null) textCss['--skew-x'] = `${skewFactorToDeg(st.skew.x)}deg`;
	if (st.skew.y !== null) textCss['--skew-y'] = `${skewFactorToDeg(st.skew.y)}deg`;
	// \\shad* — offset x/y CHÍNH XÁC (text-shadow nhận offset thật); màu = --back-color hiệu dụng.
	if (st.shad.d !== null || st.shad.x !== null || st.shad.y !== null) {
		const styleShad = Number(styleRef?.shadow) || 0;
		const ex = st.shad.x ?? st.shad.d ?? styleShad;
		const ey = st.shad.y ?? st.shad.d ?? styleShad;
		textCss['--shadow-depth'] = `${Math.max(Math.abs(ex), Math.abs(ey))}px`;
		if (ex === 0 && ey === 0) {
			if (isBox) containerCss['box-shadow'] = 'none';
			else textCss['text-shadow'] = 'none';
		} else {
			const backCss = textCss['--back-color'] ?? styleRef?.backColour ?? 'rgba(0, 0, 0, 1.00)';
			const val = `${ex}px ${ey}px ${backCss}`;
			if (isBox) containerCss['box-shadow'] = val;
			else textCss['text-shadow'] = val;
		}
	}
}
/** [arena.ai] Áp MỘT tag 2.3 đứng TRONG \t(...) → target của anim (nấu độc lập theo styleRef,
 * không cộng dồn trạng thái với tag khác trong cùng \t). Karaoke trả false (bỏ im lặng — SAI SỐ #17). */
function applyDecorationToTarget(tag, context) {
	const st = newDecorationState();
	if (!applyDecorationTag(tag, st)) return false;
	const textCss = {};
	const containerCss = {};
	emitDecoration(st, context.styleRef, textCss, containerCss);
	// target CHỈ nhận khóa mức text (container-level trong \t rất hiếm — v1 không tween).
	Object.assign(context.textCss, textCss);
	return true;
}
/** [arena.ai] Gộp kết quả decoration vào item.delta đã có từ 2.4 (KHÔNG ghi đè: merge từng mức).
 * @param {Object|null} dataKaraoke Karaoke của item { type, durationMs, startMs } — ghi vào delta.data.k. */
function mergeDecorationIntoItem(item, textCss, containerCss, dataKaraoke) {
	if (Object.keys(textCss).length === 0 && Object.keys(containerCss).length === 0 && !dataKaraoke) return;
	const delta = item.delta ?? {};
	if (Object.keys(textCss).length > 0) delta.text = Object.assign({}, delta.text, textCss);
	if (Object.keys(containerCss).length > 0) delta.container = Object.assign({}, delta.container, containerCss);
	if (dataKaraoke) delta.data = Object.assign({}, delta.data, { k: dataKaraoke });
	item.delta = delta;
}
/** [arena.ai] Nhóm 2.3 — Decoration Local Tags (màu/bord/shad/be/blur/fa/fr + karaoke \\k/\\kf/\\ko).
 * Cục bộ mức item, last-wins trong item, KHÔNG đổi kích thước khung chữ; merge vào delta 2.4.
 * @param {Array<{tags: string[], text: string}>} base Mảng base item (đầu ra của processLineText).
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {Array<{tags: string[], text: string, delta?: Object, anim?: Array<Object>}>} base đã classify 2.3.
 */
function classifyDecoration(base, styleRef) {
	if (!Array.isArray(base)) return base;
	/** Nhịp karaoke cộng dồn mức DÒNG (cs×10 = ms): \k* của item sau nối tiếp item trước. */
	let karaokeRunMs = 0;
	for (const item of base) {
		const tags = item.tags;
		if (!Array.isArray(tags) || tags.length === 0) continue;
		const st = newDecorationState();
		let consumed = false;
		/** Karaoke của item: tag \k* CUỐI trong item thắng (nhiều \k* liên tiếp không text xen giữa
		 * = các syllable rỗng đứng trước; syllable hiển thị là cái cuối). */
		let karaoke = null;
		for (const tag of tags) {
			const km = KARAOKE_RE.exec(tag);
			if (km) {
				const durationMs = Number.parseFloat(km[2]) * 10; // centisecond trong file × 10 = ms
				karaoke = { type: km[1], durationMs, startMs: karaokeRunMs };
				karaokeRunMs += durationMs;
				consumed = true;
				continue;
			}
			if (applyDecorationTag(tag, st)) consumed = true;
		}
		if (!consumed) continue;
		const textCss = {};
		const containerCss = {};
		emitDecoration(st, styleRef, textCss, containerCss);
		mergeDecorationIntoItem(item, textCss, containerCss, karaoke);
	}
	return base;
}

/** [arena.ai] Nhóm 2.2 — Collision. Bản này CHỈ signal \\t. */
function classifyCollision(base, styleRef) {
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
function classifyClip(base, styleRef) {
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
