/** v0.1.0 23sep26
 * alpha mode
 * Cấu trúc: 
 * classify 
 * -> nhận dữ liệu baseItem
 * -> for item of base 
 * -> Tạo các slot ghi dữ liệu
 * -> for tag of tags 
 * -> Quét theo danh mục phân loại tag 
 * -> Ghi dữ liệu xử lí vào slot
 * -> Hậu kiểm dữ liệu
 * -> return baseItem
 */
import * as utils from './utils.js';
/** Định nghĩa/chú thích lineCss[i] đầu ra của classify 
 * @typedef {object} parsedDataFormat.lineCssEntry
 * @property {Array<parsedDataFormat.baseItem>} base mỗi mục giữ nguyên { tags, text } ban đầu;
 * thêm { delta?, anim? } khi có tag ghi đè thay đổi nội dung. 
 * @property {parsedDataFormat.containerLineData} container Ghi các dữ liệu của container.
 * @property {Array<parsedDataFormat.clipItem>} clip Dữ liệu của clip
 */
/** Định nghĩa/chú thích baseItem trong lineCss[i].base = Array<baseItem> 
 * @typedef {object} parsedDataFormat.baseItem Đơn vị trong Array base: 1 cụm tag + 1 đoạn text.
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, 
 * raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} — renderer làm sau).
 * (classify KHÔNG xóa tags khi xử lí, renderer/debug vẫn đọc lại được.)
 * @property {parsedDataFormat.baseItemDelta} [delta] các tag thay đổi nội dung (layout, decoration)
 * nếu ko có tag liên quan thì ko có delta/anim.
 * @property {parsedDataFormat.baseItemAnim} [anim] classify sinh metadata nội suy \t:
 *   MẢNG trực tiếp, mỗi \t → { t1, t2, easing, target } (không bọc { t: [...] }). Karaoke xử lí trong delta.data.
 */
/** Định nghĩa/chú thích baseItem.delta 
 * Chỉ chứa delta text và data. Các tag liên quan đến container sẽ chèn thẳng vào lineCss[i].container.
 * - delta.text → chỉ sinh node text bên trong container hiện có (đổi ruột chữ).
 * - delta.data → không sinh node, chỉ là số liệu cho đo chữ / collision.
 * @typedef {object} parsedDataFormat.baseItemDelta
 * @property {Object} styleRef 
 * @property {Object} [text] Tag đổi ruột chữ (\fs, \c, \b, \fr...) → renderer chỉ thêm node text.
 * @property {Object} [data] Chỉ số liệu đo/collision (không có CSS tương ứng) → không sinh node.
 */
/** Định nghĩa/chú thích baseItem.anim 
 * @typedef {Array<{t1: number, t2: (number|null), easing: number, target: parsedDataFormat.baseItemDelta}>} parsedDataFormat.baseItemAnim
 * Mỗi phần tử tương ứng 1 \t(...) trong item, theo thứ tự:
 * - t1/t2: ms, tương đối đầu dòng (Aegisub: \t dùng ms). t2 = null khi file không ghi t2
 *   (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
 * - easing: số accel THÔ (default 1 = linear; >1 nhanh dần, <1 chậm dần) — renderer tự map
 *   sang hàm easing (linear/parabola/cubic...); parser/tagProcess giữ số thô để không mất độ chính xác.
 * - target: tag 2.4.1 và 2.3, KHÔNG chứa tag 2.4.2, 2.2, 2.1. \k* nằm trong 2.4.2.
 */
/** Định nghĩa/chú thích lineCss[i].container (chưa viết)
 */
/** Định nghĩa/chú thích lineCss[i].clip (chưa viết)
 */
/** Regex nhận diện tag karaoke: \k / \kf / \ko + duration (số, centisecond trong file).
 * KHÔNG match \K (không xử lí) và \kt (wontfix v1+). Nhóm 1 = type, nhóm 2 = duration raw (cs).
 * Dùng trong classifyDecoration (2.3 — ĐÃ LÀM 11sep26); 2.4 KHÔNG đụng karaoke. */
const KARAOKE_RE = /^\\(k[fo]?)(\d+(?:\.\d+)?)/;
/** Regex số thuần (cho phần tham số đứng đầu của \t: t1/t2/accel) */
const NUMERIC_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
/** [arena.ai] Token có phải số thuần (dùng làm tham số t1/t2/accel của \t) không? */
function isNumericToken(token) { return NUMERIC_TOKEN_RE.test(token); }
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
/** [Manual edit] Hàm áp dụng tag nhóm 2.4.1 — TRANSFORMABLE: có thể mang dữ liệu trong tag \t;
 * cục bộ (mức mục base); có thể làm ảnh hưởng layout:
 *
 * \fsc[x/y] (*:\fsc chỉ có trong VSFilterMod), \fsp, \fs.
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\\'.
 * @param {parsedDataFormat.baseItemDelta} context Object ghi dữ liệu tạm thời 
 * @returns {boolean} true = tag đã xử lí ở hàm này; false = không thuộc nhóm này.
 */
function applyLayoutLocalTransformable(tag, context) {
	if (tag.startsWith('\\fscy')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) context.data.scaleY = v;
		return true;
	}
	if (tag.startsWith('\\fscx')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) context.data.scaleX = v;
		return true;
	}
	if (tag.startsWith('\\fsc')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) {
			context.data.scaleX = v;
			context.data.scaleY = v;
		}
		return true;
	}
	if (tag.startsWith('\\fsp')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) context.text['letter-spacing'] = `${v}px`;
		return true;
	}
	if (tag.startsWith('\\fs')) {
		const v = Number.parseFloat(tag.slice(3));
		if (!Number.isNaN(v)) context.text['font-size'] = `${v}px`;
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
 * @param {parsedDataFormat.baseItemDelta} context Object ghi dữ liệu tạm thời 
 * @returns {boolean} true = tag đã xử lí ở hàm này; false = không thuộc nhóm này.
 */
function applyLayoutLocalNonTransformable(tag, context) {
	if (/^\\-/.test(tag)) {
		// Xử lý tag inline-fx: lưu dữ liệu text của inline-fx
		const inlineFx = tag.slice(2).trim();
		if (inlineFx !== '') context.text['--inline-fx'] = inlineFx;
		return true;
	}
	if (/^\\b-?\d+(?:\.\d+)?$/.test(tag)) {
		// Xử lý tag bold: lưu dữ liệu text của bold và cập nhật font-weight
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.text['font-weight'] = on ? '700' : '400';
		return true;
	}
	if (/^\\i-?\d+(?:\.\d+)?$/.test(tag)) {
		// Xử lý tag italic: lưu dữ liệu text của italic và cập nhật font-style
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		context.text['font-style'] = on ? 'italic' : 'normal';
		return true;
	}
	if (tag.startsWith('\\fn')) {
		// Xử lý tag font name: lưu dữ liệu text của font name và cập nhật font-family
		let name = tag.slice(3).trim();
		if (name === '') name = context.styleRef?.fontName ?? '';
		if (name !== '') context.text['font-family'] = `"${name}", sans-serif`;
		return true;
	}
	if (tag.startsWith('\\r')) {
		// Xử lý tag reset style: lưu dữ liệu text của reset style và cập nhật style name
		const styleName = tag.slice(2);
		const baseStyleName = styleName !== '' ? styleName : (context.styleRef?.name ?? FALLBACK_STYLE_NAME);
		context.text['--base-style-name'] = baseStyleName;
		return true;
	}
	if (/^\\q\d+$/.test(tag)) {
		/// Xử lý tag wrap style: lưu dữ liệu text của wrap style và cập nhật --wrap-style
		const v = Number.parseInt(tag.slice(2), 10);
		if (!Number.isNaN(v)) context.text['--wrap-style'] = v;
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
/** Field màu của styleRef theo kênh ASS (1=primary, 2=secondary, 3=outline, 4=back). */
const STYLE_COLOR_FIELD = Object.freeze({ 1: 'primaryColour', 2: 'secondaryColour', 3: 'outlineColour', 4: 'backColour' });
/** [arena.ai] Chuyển đổi hệ số skew ASS (\\fax/\\fay: x' = x + f·y) → góc deg cho CSS skewX/Y: θ = atan(f). */
function skewFactorToDeg(f) { return Number((Math.atan(f) * 180 / Math.PI).toFixed(4)); }

// to-do: sửa đoạn này

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
	 * @type {parsedDataFormat.baseItemDelta}
	 */
	const context = { text: {}, data: {} };
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		// Chỉ các hàm áp dụng tag có thể transform của các nhóm, thì mới đặt ở đây.
		applyLayoutLocalTransformable(sub, context); // 2.4.1
		applyLayoutLocalNonTransformable(sub, nonTransformableContext); // 2.4.2 (apply-now 11sep26)
		applyDecorationToTarget(sub, context); // 2.3 → target (11sep26; karaoke bỏ im lặng — #17)
	}
	// finalizeSmartScale(context.textCss, context.scaleX, context.scaleY);
	if (Object.keys(context.textCss).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context.textCss };
}