// v0.1.0 11nov26
// alpha mode
// Classify — biến base (đầu ra của processLineText, từng mục { tags, text }) thành lineCss[i] ĐẦY ĐỦ
// { base, collision, clip }.
import * as utils from './utils.js';
/** [Manual edit] Một số lưu ý liên quan đến parser-tagProcess 
 * - Chỉ import từ utils, ko import từ parser. (chỉ parser có import tagProcess)
 * - Chỉ export hàm classify.
 * - tag, text trong base giữ nguyên sau xử lí trong tagProcess
 * - \t theo hướng metadata, ko xử lí tạo snapshot
 * - \fsc*100 trả về xóa scale trong transform (theo utils.scaleAngleToCss)
 * - Các tag cùng được xử lí trong 1 hàm utils -> chỉ chạy 1 lần hàm đó, 
 *   ko chạy nhiều lần các hàm utils trong 1 vòng lặp tag.
 * - Các tag ko hỗ trợ:
 * \a (dùng \an),
 * \xbord, \ybord, (giới hạn của CSS, ko dùng svg)
 * \be (giới hạn của CSS, ko dùng svg)
 * \q (khóa \q2)
 * \fe (khóa charset UTF-8)
 * 
 */
/** [Manual edit] Phân loại tag trong tagProcess (mới)
 * Chú ý: do khóa \q2 nên layout local (2.4 cũ) giờ tương đương decoration (2.3 cũ) 
 * => phân loại lại
 * 1. Segment-level Transformable (2.4.1 cũ + 2.3.1 cũ)
 * 2. Segment-level Non-transformable (2.4.2 cũ + 2.3.2 cũ)
 * 3. Line-level Collision (2.2 cũ)
 * 4. Line-level Clip (2.1 cũ)
 */
/** [Manual edit] Phân loại tag trong tagProcess (cũ) 
 * 2.4. Layout Local/Segment-level
 * 	2.4.1. Transformable (vd: \fs, \fsc*, ...)
 * 	2.4.2. Non-transformable (vd: \fn, \r, ...)
 * 2.3. Decoration Local 
 * 	2.3.1. Transformable (vd: \*c, \*a, \bord, \shad, \fa*, \fr*, ...)
 * 	2.3.2. Non-transformable (\s, \u, \k*, ...)
 * 2.2. Line-level: Collision (\an -> \pos, \move (lấy đầu) -> \org)
 * 2.1. Line-level: \[i]clip
 */
/** [Manual edit] Định nghĩa/chú thích cấu trúc baseRaw 
 * (đầu ra hàm processLineText/đầu vào "base" của classify)
 * @typedef {object} parsedDataFormat.baseRaw
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * Tags này giữ nguyên để kiểm tra/debug sau này.
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} trở thành {} cho hiển thị,
 * cái này để renderer làm sau).
 */
/** [Manual edit] Định nghĩa/chú thích cấu trúc lineCss[i]
 * @typedef {object} parsedDataFormat.lineCss đầu ra của classify
 * @property {Array<parsedDataFormat.baseItem>} base bê nguyên { tags, text } từ đầu vào baseRaw;
 * chỉ thêm { delta?, anim? } khi có tag ghi đè thay đổi nội dung. 
 * @property {parsedDataFormat.lineSubCss} lineSub Ghi các dữ liệu của lineSub. (sẽ ghi clip vào đây).
 * @property {parsedDataFormat.segmentSubCss} segmentSub Ghi các dữ liệu của segmentSub. (chỉ để renderer đọc).
 * @property {Array<parsedDataFormat.clipItem>} clip Dữ liệu của tag clip (xử lí xong sẽ đưa vào lineSub).
 */
/** [Manual edit] Định nghĩa/chú thích baseItem trong lineCss[i].base = Array baseItem 
 * @typedef {object} parsedDataFormat.baseItem Đơn vị trong Array base: 1 cụm tag + 1 đoạn text.
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, 
 * raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} — renderer làm sau).
 * (classify KHÔNG xóa tags khi xử lí, renderer/debug vẫn đọc lại được.)
 * @property {parsedDataFormat.tagOverrideControls} [delta] thuộc tính CSS mới do tag ghi đè.
 * @property {parsedDataFormat.baseItemAnim} [anim] thuộc tính CSS cho animation.
 */
/** [Manual edit] Định nghĩa/chú thích baseItem.anim 
 * @typedef {object} parsedDataFormat.baseItemAnim
 * @property {(number|null)} t1 Thời điểm bắt đầu, ms tính từ đầu dòng (Aegisub dùng ms).
 * @property {(number|null)} t2 Thời điểm kết thúc, ms tính từ đầu dòng;
 * @property {(number|null)} easing Số accel thô 
 * (default 1 = linear; >1 nhanh dần, <1 chậm dần).
 * @property {parsedDataFormat.tagOverrideControls} target
 * (các tag khác xử lí trước khi đưa vào)
 */
/** [Manual edit] Định nghĩa/chú thích lineSubCss trong lineCss[i] 
 * @typedef {typeof utils.globalCss & ReturnType<typeof utils.alignmentToCss>} parsedDataFormat.lineSubCss
 * Ghép thuộc tính từ utils.globalCss và utils.alignmentToCss
 * 
 * Đo bằng cqw/cqh để giảm khối lượng tính.
 */
/** [Manual edit] Định nghĩa/chú thích parsedDataFormat.tagOverrideControls 
 * Là danh sách các biến CSS trong segmentSubCss và lineSubCss mà tagProcess có thể ghi đè.
 * @typedef {object} parsedDataFormat.tagOverrideControls
 * @property {number} [left] \pos, \move điều khiển vị trí (ghi trực tiếp, đv cqw)
 * @property {number} [top] \pos, \move điều khiển vị trí (ghi trực tiếp, đv cqh)
 * @property {number} [--align-x] \an ghi đè (gọi utils.resolveAlignment)
 * @property {number} [--align-y] \an ghi đè (gọi utils.resolveAlignment)
 * @property {number} --origin-delta-x renderer tính origin của từng segment
 * @property {number} --origin-delta-y renderer tính origin của từng segment
 * (\org chỉ ghi origin của line, renderer phải tính delta origin của từng segment, 
 * từ origin của line này và left/top; và ko sửa vào --origin)
 * @property {string} [--style-name] \r điều khiển style
 * @property {string} [--font-name] \fn điều khiển fontName
 * @property {number} [--font-size] \fs điều khiển fontSize
 * @property {number} [--color1] \1c, \1a điều khiển primaryColour
 * @property {number} [--color2] \2c, \2a điều khiển secondaryColour
 * @property {number} [--color3] \3c, \3a điều khiển outlineColour (gọi utils.outlineStyleToCss)
 * @property {number} [--color4] \4c, \4a điều khiển backColour (gọi utils.outlineStyleToCss, utils.shadBlurToCss)
 * @property {number} [--bold] \b điều khiển bold (chạy 'font-weight': utils.boldToWeight(style.bold),)
 * @property {number} [--italic] \i điều khiển italic (chạy 'font-style': style.italic ? 'italic' : 'normal')
 * @property {boolean} [--underline] \u điều khiển underline (gọi utils.decorationToCss)
 * @property {boolean} [--strikeout] \s điều khiển strikeOut (gọi utils.decorationToCss)
 * @property {number} [--spacing] \fsp điều khiển letter-spacing
 * @property {number} [--outline] \bord điều khiển độ dày viền (gọi utils.outlineWidthToCss)
 * @property {number} [--shadow-x] \shad điều khiển shadow-x (gọi utils.shadBlurToCss)
 * @property {number} [--shadow-y] \shad điều khiển shadow-y (gọi utils.shadBlurToCss)
 * @property {number} [--blur] \blur điều khiển blur (gọi utils.shadBlurToCss)
 * @property {number} [--inline-fx] \- điều khiển inline-fx
 * @property {number} [--scale-x] \fscx điều khiển scaleX (gọi utils.scaleAngleToCss)
 * @property {number} [--scale-y] \fscy điều khiển scaleY (gọi utils.scaleAngleToCss)
 * @property {number} [--angle-x] \frx điều khiển angleX (gọi utils.scaleAngleToCss)
 * @property {number} [--angle-y] \fry điều khiển angleY (gọi utils.scaleAngleToCss)
 * @property {number} [--angle-z] \frz điều khiển angleZ (gọi utils.scaleAngleToCss)
 * @property {number} [--skew-x] \fax điều khiển skewX (gọi utils.scaleAngleToCss)
 * @property {number} [--skew-y] \fay điều khiển skewY (gọi utils.scaleAngleToCss)
 */
/** Regex nhận diện tag karaoke: \k / \kf / \ko + duration (số, centisecond trong file).
 * KHÔNG match \K (không xử lí) và \kt (wontfix v1+). Nhóm 1 = type, nhóm 2 = duration raw (cs).
 */
const KARAOKE_RE = /^\\(k[fo]?)(\d+(?:\.\d+)?)/;
/** Regex số thuần (cho phần tham số đứng trước trong \t: t1/t2/accel) */
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

/** [Manual edit] Áp chỉ tag Segment-level Transformable vào delta hoặc target của \t
 * @param {string} tag Tag raw đơn, bắt đầu bằng '\\'.
 * @param {parsedDataFormat.tagOverrideControls} context delta hoặc target của \t
 * @returns {boolean} `true` khi tag thuộc nhóm này, kể cả lúc giá trị raw lỗi.
 */
function applySegmentLevelTransformable(tag, context) {
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

	const state = context.decoration;
	let m = /^\\([1-4])c&(.*)$/.exec(tag);
	if (!m && tag.startsWith('\\c&')) m = [tag, '1', tag.slice(3)];
	if (m) {
		const color = utils.parseAegisubHex(m[2]);
		if (color) state.colors[Number(m[1])] = color;
		return true;
	}
	if (tag.startsWith('\\blur')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) state.blur = v;
		return true;
	}
	if (tag.startsWith('\\fax')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) state.skew.x = v;
		return true;
	}
	if (tag.startsWith('\\fay')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) state.skew.y = v;
		return true;
	}
	const frM = /^\\fr([xyz])/.exec(tag);
	if (frM || tag.startsWith('\\fr')) {
		const axis = frM ? frM[1] : 'z';
		const v = Number.parseFloat(tag.slice(frM ? 4 : 3));
		if (!Number.isNaN(v)) state.angle[axis] = v;
		return true;
	}
	if (tag.startsWith('\\bord')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) state.bord.w = v;
		return true;
	}
	if (tag.startsWith('\\shad')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) state.shad.d = v;
		return true;
	}
	if (tag.startsWith('\\xshad')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) state.shad.x = v;
		return true;
	}
	if (tag.startsWith('\\yshad')) {
		const v = Number.parseFloat(tag.slice(6));
		if (!Number.isNaN(v)) state.shad.y = v;
		return true;
	}
	if (tag.startsWith('\\alpha&')) {
		const byte = utils.hexToAlpha(tag.slice(7));
		if (byte !== null) state.alpha.all = (255 - byte) / 255;
		return true;
	}
	m = /^\\([1-4])a&(.*)$/.exec(tag);
	if (m) {
		const byte = utils.hexToAlpha(m[2]);
		if (byte !== null) state.alpha[Number(m[1])] = (255 - byte) / 255;
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
 * @param {parsedDataFormat.tagOverrideControls} context
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
/** [arena.ai] Parse một \t(...) thành metadata nội suy cho Segment-level Transformable tags.
 * @param {string} tag Tag raw, bắt đầu bằng '\t' (vd "\t(0,500,\fs30)").
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @param {Object} nonTransformableContext
 * State của static segment: non-transformable tag trong \t hiện vẫn apply-now vào đây.
 * @returns {{t1: number, t2: (number|null), easing: number, target: Object}|null}
 *  - null khi tag không phải \t hợp lệ, hoặc scope không tạo target transformable nào.
 *  - t1: ms, tương đối đầu dòng (Aegisub: \t dùng ms).
 *  - t2: ms, tương đối đầu dòng; null khi file không ghi t2 (transform chạy tới HẾT dòng —
 *    renderer lấy duration dòng từ events để resolve).
 */
function parseTransformTag(tag, styleRef, nonTransformableContext) {
	const parts = splitTransformParts(tag);
	if (!parts) return null;
	/** Lưu dữ liệu tạm thời khi apply các tag trong \t. Chỉ khi có thay đổi thì mới ghi từ context sang lineCss[i].delta
	 * @type {parsedDataFormat.tagOverrideControls}
	 */
	const context = {
		textCss: {},
		scaleX: undefined,
		scaleY: undefined,
		decoration: newDecorationState(),
		styleRef,
	};
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		applySegmentLevelTransformable(sub, context);
		applyLayoutLocalNonTransformable(sub, nonTransformableContext); // apply-now cho nhóm non-transformable
		applySegmentLevelNonTransformableDecoration(sub, nonTransformableContext.decoration);
	}
	// Cook phần decoration của TOÀN BỘ scope \t đúng một lần.
	// Container target vẫn chưa tween được, nên cố ý bỏ output container ở đây.
	emitDecoration(context.decoration, styleRef, context.textCss, {});
	// finalizeSmartScale(context.textCss, context.scaleX, context.scaleY);
	if (Object.keys(context.textCss).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context.textCss };
}
/** Định nghĩa/chú thích object mục base sau khi tách
 * @typedef {object} parsedDataFormat.baseItem Đơn vị nhỏ nhất trong base: 1 cụm tag + 1 đoạn text.
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} — renderer làm tầng cuối).
 *   (classify KHÔNG xóa tags khi tiêu thụ: nhóm sau 2.3/2.2/2.1 + renderer/debug đọc lại được.)
 * @property {parsedDataFormat.baseItemDelta} [delta] classify (tagProcess.js) sinh: mức text
 *   (layout tĩnh \fs\fsc\fsp + \fn\b\i + \r → '--base-style-name', \q → '--wrap-style') /
 *   data (marker \h\N\n; karaoke CHƯA — về 2.3, tags giữ raw). text không tag thì KHÔNG có delta/anim.
 * @property {parsedDataFormat.baseItemAnim} [anim] classify sinh metadata nội suy \t:
 *   MẢNG trực tiếp, mỗi \t → { t1, t2, easing, target } (không bọc { t: [...] }). Karaoke không anim.k.
 */
/** mới: Định nghĩa/chú thích baseItem trong lineCss[i].base = Array<baseItem> 
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
/** Định nghĩa/chú thích delta theo mức node của mục base
 * ĐỊNH HƯỚNG cho classify (bước 4-7): parser xử lí đến base thì mỗi mục base mang
 * delta tách theo 3 mức giống styleParsedToCss (container / text / data).
 * Renderer chuyển mục base thành node container-text TÙY MỨC ĐỘ DELTA:
 * - delta có container → phải sinh CẶP node container+text MỚI (delta chạm vỏ dòng).
 * - delta chỉ có text  → chỉ sinh node text bên trong container hiện có (đổi ruột chữ).
 * - delta chỉ có data  → không sinh node, chỉ là số liệu cho đo chữ / collision.
 * @typedef {object} parsedDataFormat.baseItemDelta
 * @property {Object} [container] Tag chạm vỏ dòng (vd \bord/\4c khi borderStyle==3, \clip) → renderer tách container mới.
 * @property {Object} [text] Tag đổi ruột chữ (\fs, \c, \b, \fr...) → renderer chỉ thêm node text.
 * @property {Object} [data] Chỉ số liệu đo/collision (không có CSS tương ứng) → không sinh node.
 */
/** Field màu của styleRef theo kênh ASS (1=primary, 2=secondary, 3=outline, 4=back). */
const STYLE_COLOR_FIELD = Object.freeze({ 1: 'primaryColour', 2: 'secondaryColour', 3: 'outlineColour', 4: 'backColour' });
/** [arena.ai] Chuyển đổi hệ số skew ASS (\\fax/\\fay: x' = x + f·y) → góc deg cho CSS skewX/Y: θ = atan(f). */
function skewFactorToDeg(f) { return Number((Math.atan(f) * 180 / Math.PI).toFixed(4)); }


// to-do: sửa lại hàm classifyLayoutLocal này -> classifyBase (chạy for item + for tag cho cả 4 phần 2.x trong này)
/** [Manual edit] Hàm thực hiện vòng lặp for..do quét các tag.
 * @param {Array<{tags: string[], text: string}>} base Mảng base item (đầu ra của processLineText).
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {Array<{tags: string[], text: string, delta?: parsedDataFormat.baseItemDelta, anim?: parsedDataFormat.baseItemAnim}>} base đã classify.
 */
function classifyBase(base, styleRef) {
	if (!Array.isArray(base)) return base;
	for (const item of base) {
		// item là mục base của line, mỗi item = { tags: string[], text: string } (đầu ra của processLineText).
		// trong item có thể có delta (container, text, data) và anim (\t).
		const tags = item.tags;
		// Tự động bỏ qua nếu line ko có tag nào (tránh tạo delta rỗng).
		if (!Array.isArray(tags) || tags.length === 0) continue;
		// Khởi tạo context cục bộ cho item trong base.
		const tempAnim = []; // Phần ghi vào item.anim dự kiến.


		const data = {}; // Phần ghi vào item.delta.data.
		const context = {
			textCss: {},
			scaleX: undefined,
			scaleY: undefined,
			decoration: newDecorationState(),
			styleRef,
		};
		const containerCss = {};

		for (const tag of tags) {
			if (tag.startsWith('\\t')) {
				const entry = parseTransformTag(tag, styleRef, context);
				if (entry) tempAnim.push(entry);
				continue;
			}
			if (tag === '\\h' || tag === '\\N' || tag === '\\n') {
				data.marker = tag;
				continue;
			}
			applySegmentLevelTransformable(tag, context);
			applyLayoutLocalNonTransformable(tag, context);
		}
		// Cook toàn bộ Segment-level Transformable state đúng một lần cho static item.
		emitDecoration(context.decoration, styleRef, context.textCss, containerCss);
		if (Object.keys(context.textCss).length > 0 || Object.keys(containerCss).length > 0 || Object.keys(data).length > 0) {
			const delta = {}; // Phần ghi vào item.delta.
			if (Object.keys(context.textCss).length > 0) delta.text = context.textCss;
			if (Object.keys(containerCss).length > 0) delta.container = containerCss;
			if (Object.keys(data).length > 0) delta.data = data;
			item.delta = delta;
		}

		if (tempAnim.length > 0) item.anim = tempAnim;
	}
	return base;
}



// to-do: sửa đoạn này






/** [arena.ai] Trạng thái decoration tạm của 1 item — caller tạo MỚI mỗi item (last-wins = ghi đè field). */
function newDecorationState() {
	return {
		colors: { 1: null, 2: null, 3: null, 4: null },
		alpha: { all: null, 1: null, 2: null, 3: null, 4: null },
		underline: null,
		strikeOut: null,
		bord: { w: null, x: null, y: null },
		shad: { d: null, x: null, y: null },
		blur: null,
		angle: { x: null, y: null, z: null },
		skew: { x: null, y: null },
	};
}
/** [arena.ai] Áp các Segment-level Non-transformable decoration tags.
 * `\u` và `\s` không trở thành target của `\t`; karaoke được giữ ở
 * classifyDecoration vì cần karaoke clock xuyên cả dòng.
 * @param {string} tag Tag raw đơn, bắt đầu bằng '\\'.
 * @param {ReturnType<typeof newDecorationState>} state State decoration tạm của item.
 * @returns {boolean} `true` khi tag thuộc nhóm này.
 */
function applySegmentLevelNonTransformableDecoration(tag, state) {
	let m = /^\\u(-?\d+(?:\.\d+)?)$/.exec(tag);
	if (m) {
		state.underline = Number.parseFloat(m[1]) !== 0 ? 'underline' : ' ';
		return true;
	}
	m = /^\\s(-?\d+(?:\.\d+)?)$/.exec(tag);
	if (m) {
		state.strikeOut = Number.parseFloat(m[1]) !== 0 ? 'line-through' : ' ';
		return true;
	}
	return false;
}
/** [arena.ai] Nấu trạng thái decoration `st` của item → textCss/containerCss (CSS-cooked,
 * khóa khớp styleCss.text của styleParsedToCss để renderer Object.assign).
 * Alpha hiệu dụng mỗi kênh: byte alpha của tag màu > \\Na > \\alpha > alpha màu style. */
function emitDecoration(state, styleRef, textCss, containerCss) {
	const isBox = styleRef?.borderStyle === 3;
	if (state.underline !== null) textCss['--underline'] = state.underline;
	if (state.strikeOut !== null) textCss['--strike-out'] = state.strikeOut;
	const styleCols = {};
	for (const n of [1, 2, 3, 4]) styleCols[n] = utils.parseCssRgba(styleRef?.[STYLE_COLOR_FIELD[n]]);
	for (const n of [1, 2, 3, 4]) {
		const tagC = state.colors[n];
		const trackedA = state.alpha[n] ?? state.alpha.all ?? null;
		if (tagC === null && trackedA === null) continue; // kênh không bị đụng
		const baseC = styleCols[n];
		const rgb = tagC ?? (baseC ? { r: baseC.r, g: baseC.g, b: baseC.b } : null);
		if (rgb === null) continue; // tag chỉ alpha mà style thiếu màu → bỏ qua kênh này
		const a = (tagC && tagC.a !== null) ? tagC.a : (trackedA ?? baseC?.a ?? 1);
		const css = utils.hexToRgba({ r: rgb.r, g: rgb.g, b: rgb.b, a });
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
	if (state.bord.w !== null || state.bord.x !== null || state.bord.y !== null) {
		const styleBord = Number(styleRef?.outline) || 0;
		const ex = Math.max(0, state.bord.x ?? state.bord.w ?? styleBord);
		const ey = Math.max(0, state.bord.y ?? state.bord.w ?? styleBord);
		const eff = Math.max(ex, ey);
		if (isBox) containerCss['padding'] = `${eff}px`; // borderStyle 3: \bord là padding của box
		else textCss['-webkit-text-stroke-width'] = `${eff * 2}px`; // ×2 — ADR 0007 (stroke vẽ cân giữa)
		textCss['--outline-width'] = `${eff}px`;
	}
	// \\be/\\blur → CSS filter (xấp xỉ theo ADR 0004); 0 = tắt.
	if (state.blur !== null) textCss['filter'] = state.blur > 0 ? `blur(${state.blur}px)` : 'none';
	// \\fr*/\\fa* → CSS variables RAW deg — renderer gộp với scale/style transform (chốt 03sep26: gộp là việc renderer).
	for (const axis of ['x', 'y', 'z']) {
		if (state.angle[axis] !== null) textCss[`--angle-${axis}`] = `${state.angle[axis]}deg`;
	}
	if (state.skew.x !== null) textCss['--skew-x'] = `${skewFactorToDeg(state.skew.x)}deg`;
	if (state.skew.y !== null) textCss['--skew-y'] = `${skewFactorToDeg(state.skew.y)}deg`;
	// \\shad* — offset x/y CHÍNH XÁC (text-shadow nhận offset thật); màu = --back-color hiệu dụng.
	if (state.shad.d !== null || state.shad.x !== null || state.shad.y !== null) {
		const styleShad = Number(styleRef?.shadow) || 0;
		const ex = state.shad.x ?? state.shad.d ?? styleShad;
		const ey = state.shad.y ?? state.shad.d ?? styleShad;
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
/** [arena.ai] Phần còn lại của Segment-level Non-transformable:
 * \\u, \\s và karaoke \\k/\\kf/\\ko. Các Segment-level Transformable tag đã được
 * classifyBase xử lí và cook trước đó.
 * @param {Array<{tags: string[], text: string}>} base Mảng base item (đầu ra của processLineText).
 * @param {Object} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {Array<{tags: string[], text: string, delta?: Object, anim?: Array<Object>}>} base đã classify.
 */
function classifyDecoration(base, styleRef) {
	if (!Array.isArray(base)) return base;
	/** Nhịp karaoke cộng dồn mức DÒNG (cs×10 = ms): \k* của item sau nối tiếp item trước. */
	let karaokeRunMs = 0;
	for (const item of base) {
		const tags = item.tags;
		if (!Array.isArray(tags) || tags.length === 0) continue;



		const state = newDecorationState();
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
			if (applySegmentLevelNonTransformableDecoration(tag, state)) consumed = true;
		}
		if (!consumed) continue;
		const textCss = {};
		const containerCss = {};
		emitDecoration(state, styleRef, textCss, containerCss);
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

/** [arena.ai] Classify — Segment-level Transformable → Segment-level Non-transformable
 * → Line-level Collision → Line-level Clip.
 * @param {Array<parsedDataFormat.baseRaw>} base Mảng base ban đầu (đầu ra của processLineText).
 * @param {parsedDataFormat.style} styleRef Style dòng (styleRef) do parser() truyền vào qua classify().
 * @returns {{base: Array<{tags: string[], text: string, delta?: Object, anim?: Array<Object>}>, collision: {t: boolean}, clip: {rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}}}
 */
export function classify(base, styleRef) {
	base = classifyBase(base, styleRef);
	base = classifyDecoration(base, styleRef);
	const collision = classifyCollision(base, styleRef);
	const clip = classifyClip(base, styleRef);
	return { base, collision, clip };
}
// Cấu trúc mới: loại bỏ hàm này, và viết 1 hàm mới (có thể sau 2.1) để gộp style thành CSS-cooked.
// /** [arena.ai] Gộp scaleX/scaleY thành chuỗi 'transform' dạng CSS để tối ưu riêng.
//  * KHÔNG lọc identity 100: scaleX(1)/scaleY(1) vẫn emit (chốt 09sep26 — renderer áp trực tiếp,
//  * không tốn logic lọc ở parser). */
// function finalizeSmartScale(textCss, scaleX, scaleY) {
// 	const parts = [];
// 	if (scaleX !== undefined) parts.push(`scaleX(${scaleX / 100})`);
// 	if (scaleY !== undefined) parts.push(`scaleY(${scaleY / 100})`);
// 	if (parts.length) textCss['transform'] = parts.join(' ');
// }