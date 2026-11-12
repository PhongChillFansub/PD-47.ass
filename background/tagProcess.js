// v0.1.0 12nov26
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
 * @typedef {{
 * left?: number, // \pos, \move điều khiển vị trí (đv cqw)
 * top?: number, // \pos, \move điều khiển vị trí (đv cqh)
 * '--align-x'?: number, // \an (utils.resolveAlignment)
 * '--align-y'?: number, // \an (utils.resolveAlignment)
 * '--origin-delta-x'?: number, // Renderer tính origin của từng segment từ origin line và left/top.
 * '--origin-delta-y'?: number, // Renderer không sửa --origin của line.
 * '--style-name'?: string, // \r điều khiển style
 * '--font-name'?: string, // \fn điều khiển fontName
 * '--font-size'?: number, // \fs điều khiển fontSize
 * '--color1'?: string, // \1c, \1a điều khiển primaryColour
 * '--color2'?: string, // \2c, \2a điều khiển secondaryColour
 * '--color3'?: string, // \3c, \3a điều khiển outlineColour (utils.outlineStyleToCss)
 * '--color4'?: string, // \4c, \4a điều khiển backColour (utils.outlineStyleToCss, utils.shadBlurToCss)
 * '--bold'?: number, // \b điều khiển bold (utils.boldToWeight)
 * '--italic'?: number, // \i điều khiển italic
 * '--underline'?: boolean, // \u điều khiển underline (utils.decorationToCss)
 * '--strike-out'?: boolean, // \s điều khiển strikeOut (utils.decorationToCss)
 * '--spacing'?: number, // \fsp điều khiển letter-spacing
 * '--outline'?: number, // \bord điều khiển độ dày viền (utils.outlineWidthToCss)
 * '--shadow-x'?: number, // \shad điều khiển shadow-x (utils.shadBlurToCss)
 * '--shadow-y'?: number, // \shad điều khiển shadow-y (utils.shadBlurToCss)
 * '--blur'?: number, // \blur điều khiển blur (utils.shadBlurToCss)
 * '--inline-fx'?: string, // \- điều khiển inline-fx
 * '--scale-x'?: number, // \fscx điều khiển scaleX (utils.scaleAngleToCss)
 * '--scale-y'?: number, // \fscy điều khiển scaleY (utils.scaleAngleToCss)
 * '--angle-x'?: number, // \frx điều khiển angleX (utils.scaleAngleToCss)
 * '--angle-y'?: number, // \fry điều khiển angleY (utils.scaleAngleToCss)
 * '--angle-z'?: number, // \frz điều khiển angleZ (utils.scaleAngleToCss)
 * '--skew-x'?: number, // \fax điều khiển skewX (utils.scaleAngleToCss)
 * '--skew-y'?: number // \fay điều khiển skewY (utils.scaleAngleToCss)
 * }} parsedDataFormat.tagOverrideControls
 */
/** Regex nhận diện tag karaoke: \k / \kf / \ko + duration (số, centisecond trong file).
 * KHÔNG match \K (không xử lí) và \kt (wontfix v1+). Nhóm 1 = type, nhóm 2 = duration raw (cs).
 */
const KARAOKE_RE = /^\\(k[fo]?)(\d+(?:\.\d+)?)/;
/** Regex số thuần (cho phần tham số đứng trước trong \t: t1/t2/accel) */
const NUMERIC_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)$/;
/** Tên style fallback khi styleRef thiếu (dùng cho \r rỗng) — khớp FALLBACK_DEFAULT_STYLE.name */
const FALLBACK_STYLE_NAME = 'Default';
/** [arena.ai] Field màu style theo kênh ASS. */
const STYLE_COLOR_FIELD = Object.freeze({ 1: 'primaryColour', 2: 'secondaryColour', 3: 'outlineColour', 4: 'backColour' });
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
/** [arena.ai] Tag số có tiền tố dài hơn phải đứng trước tag tiền tố ngắn hơn (fsc* / fsp trước fs, fr* trước fr). */
const TRANSFORMABLE_NUMERIC_TAGS = [
	['fscx', ['--scale-x']], ['fscy', ['--scale-y']],
	['fsc', ['--scale-x', '--scale-y']], ['fsp', ['--spacing']], ['fs', ['--font-size']],
	['blur', ['--blur']], ['fax', ['--skew-x']], ['fay', ['--skew-y']],
	['frx', ['--angle-x']], ['fry', ['--angle-y']], ['frz', ['--angle-z']], ['fr', ['--angle-z']],
	['bord', ['--outline']], ['xshad', ['--shadow-x']], ['yshad', ['--shadow-y']],
	['shad', ['--shadow-x', '--shadow-y']],
];
// to-do: sửa đoạn colorMatch, alphaMatch
/** [arena.ai] Áp một tag transformable vào các biến override thô.
 * @param {string} tag Tag raw đơn.
 * @param {parsedDataFormat.tagOverrideControls} context Delta hoặc target của \t.
 * @param {{
 * 	lineSub: parsedDataFormat.lineSubCss, 
 * 	segmentSub: parsedDataFormat.segmentSubCss
 * }} styleRef Style dòng, dùng để lấy giá trị fallback khi cần.
 * @returns {boolean} Tag thuộc nhóm này (kể cả khi giá trị không hợp lệ).
 */
function applySegmentLevelTransformableTags(tag, context, styleRef) {
	// Xét các array con [name, Array<key>] trong TRANSFORMABLE_NUMERIC_TAGS; theo thứ tự.
	for (const [name, keys] of TRANSFORMABLE_NUMERIC_TAGS) {
		// Nếu tag ko đúng name, bỏ qua;
		if (!tag.startsWith(`\\${name}`)) continue;
		// Tách name khỏi tag, lấy phần còn lại làm raw; nếu raw là số thuần, áp vào context.
		const raw = tag.slice(name.length + 1);
		// Check số của raw; nếu đúng, áp vào context.
		if (NUMERIC_TOKEN_RE.test(raw)) {
			// Nếu tag là \fsc, \shad hoặc tương tự thì áp vào nhiều key.
			for (const key of keys) context[key] = Number(raw);
		}
		return true;
	}
	// Đoạn áp dụng với các tag màu \1c, \2c, \3c, \4c và alpha \1a, \2a, \3a, \4a
	const colorMatch = /^\\([1-4]?)c&(.+)$/.exec(tag);
	// Check regex \*c (to-do: nhận cả số thay vì dạng &H*& của utils.parseAegisubHex).
	if (colorMatch) {
		const raw = colorMatch[2];
		if (!/^H[0-9a-f]{1,8}&?$/i.test(raw)) return true;
		const channel = Number(colorMatch[1] || 1);
		const key = `--color${channel}`;
		const color = utils.parseAegisubHexToObject(raw);
		const previous = utils.parseCssRgbaToObject(context[key] ?? colorState.fallback?.[key] ?? styleRef?.[STYLE_COLOR_FIELD[channel]]);
		// Màu 8 chữ số chứa alpha; màu ngắn hơn chỉ đổi RGB.
		if (raw.replace(/^H/i, '').replace(/&$/, '').length <= 6) color.a = colorState.alpha[channel] ?? previous?.a ?? 1;
		colorState.alpha[channel] = color.a;
		context[key] = utils.hexObjectToRgba(color);
		return true;
	}
	const alphaMatch = /^\\(alpha|[1-4]a)&(.*)$/.exec(tag);
	if (alphaMatch) {
		const raw = alphaMatch[2];
		if (!/^H[0-9a-f]{1,2}&?$/i.test(raw)) return true;
		const alpha = (255 - utils.hexObjectToAlpha(raw)) / 255;
		const channels = alphaMatch[1] === 'alpha' ? [1, 2, 3, 4] : [Number(alphaMatch[1][0])];
		for (const channel of channels) {
			const key = `--color${channel}`;
			colorState.alpha[channel] = alpha;
			const color = utils.parseCssRgbaToObject(context[key] ?? colorState.fallback?.[key] ?? styleRef?.[STYLE_COLOR_FIELD[channel]]);
			if (color) context[key] = utils.hexObjectToRgba({ ...color, a: alpha });
		}
		return true;
	}
	return false;
}

/** Áp các tag không nội suy vào delta của segment, kể cả khi nằm trong \t. */
function applyLayoutLocalNonTransformable(tag, context, styleRef) {
	if (tag.startsWith('\\-')) {
		const value = tag.slice(2).trim();
		if (value) context['--inline-fx'] = value;
		return true;
	}
	const m = /^\\([bius])(-?\d+(?:\.\d+)?)$/.exec(tag);
	if (m) {
		const value = Number(m[2]);
		const key = { b: '--bold', i: '--italic', u: '--underline', s: '--strike-out' }[m[1]];
		context[key] = m[1] === 'u' || m[1] === 's' ? value !== 0 : value;
		return true;
	}
	if (tag.startsWith('\\fn')) {
		const name = tag.slice(3).trim() || styleRef?.fontName;
		if (name) context['--font-name'] = name;
		return true;
	}
	if (tag.startsWith('\\r')) {
		context['--style-name'] = tag.slice(2) || styleRef?.name || FALLBACK_STYLE_NAME;
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
/** Parse \t thành metadata target; tag không transformable áp ngay vào delta ngoài. */
function parseTransformTag(tag, styleRef, nonTransformableContext) {
	const parts = splitTransformParts(tag);
	if (!parts) return null;
	/** @type {parsedDataFormat.tagOverrideControls} */
	const context = {};
	const colorState = { alpha: {}, fallback: nonTransformableContext };
	for (const sub of splitOverrideTagsTransform(parts.modsText)) {
		applySegmentLevelTransformableTags(sub, context, styleRef, colorState);
		applyLayoutLocalNonTransformable(sub, nonTransformableContext, styleRef);
	}
	if (Object.keys(context).length === 0) return null;
	return { t1: parts.t1, t2: parts.t2, easing: parts.easing, target: context };
}

/** Quét tag từng item; CSS override nằm trực tiếp trong delta, metadata trong data. */
function classifyBase(base, styleRef) {
	if (!Array.isArray(base)) return base;
	let karaokeRunMs = 0;
	for (const item of base) {
		if (!Array.isArray(item.tags) || item.tags.length === 0) continue;
		/** @type {parsedDataFormat.tagOverrideControls} */
		const context = {};
		const colorState = { alpha: {} };
		const data = {};
		const anim = [];
		for (const tag of item.tags) {
			if (tag.startsWith('\\t')) {
				const entry = parseTransformTag(tag, styleRef, context);
				if (entry) anim.push(entry);
				continue;
			}
			if (tag === '\\h' || tag === '\\N' || tag === '\\n') {
				data.marker = tag;
				continue;
			}
			const karaoke = KARAOKE_RE.exec(tag);
			if (karaoke) {
				const durationMs = Number.parseFloat(karaoke[2]) * 10;
				data.k = { type: karaoke[1], durationMs, startMs: karaokeRunMs };
				karaokeRunMs += durationMs;
				continue;
			}
			applySegmentLevelTransformableTags(tag, context, styleRef, colorState);
			applyLayoutLocalNonTransformable(tag, context, styleRef);
		}
		if (Object.keys(context).length) item.delta = context;
		if (Object.keys(data).length) item.data = data;
		if (anim.length) item.anim = anim;
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
 * @returns {{base: Array<parsedDataFormat.baseItem>, collision: {t: boolean}, clip: {rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}}}
 */
export function classify(base, styleRef) {
	base = classifyBase(base, styleRef);
	const collision = classifyCollision(base, styleRef);
	const clip = classifyClip(base, styleRef);
	return { base, collision, clip };
}
