/** v0.1.0 03sep26
 * Classify — biến base (đầu ra của processLineText, từng mục { tags, text }) thành lineCss[i] ĐẦY ĐỦ
 * { base, collision, clip } theo struct đích (mục 3 prompt 03sep26).
 *
 * Thứ tự nhóm KHÔNG ĐƯỢC đổi (đã chốt):
 *   2.4 Layout Local (TĨNH + động \t/\k — bản này) → 2.3 Decoration (session sau) →
 *   2.2 Collision (bản này chỉ signal t) → 2.1 Clip (bản này stub default).
 *
 * QUY ƯỚC CHUNG (KHÔNG bao giờ đổi):
 * - Parser giữ nguyên PlayRes px, KHÔNG đo chữ/scale/collision — việc đó của renderer.
 * - Parser KHÔNG bake snapshot: nhóm động (\t, \k...) chỉ lưu metadata nội suy (Cách 1);
 *   renderer resolve theo metadata.mediaTime mỗi tick rVFC.
 * - Tag chạm VỎ dòng → delta.container; đổi RUỘT chữ → delta.text; số liệu thuần → delta.data.
 * - delta.text dùng KEY CSS + value CSS-cooked (khớp styleCss.text của styleParsedToCss) để renderer
 *   áp bằng Object.assign; \fscx/fscy ghi 'transform' chứa scale của CHÍNH item/entry đó
 *   (gộp transform với style gốc/rotate là việc renderer — đã hỏi/chốt 03sep26).
 * - Mỗi base item GIỮ NGUYÊN mảng tags raw (đã hỏi/chốt 03sep26): nhóm sau (2.3/2.2/2.1) và
 *   renderer/debug đọc lại được tag gốc — vì vậy các hàm nhóm KHÔNG xóa tag khi tiêu thụ.
 *
 * KHÔNG import gì từ './parser.js' (parser.js import classify từ file này → tránh vòng tròn).
 * Dữ liệu cần của style dòng (styleRef) do parser() truyền vào qua classify().
 */
/** Định nghĩa/chú thích anim của 1 mục base (nhóm ĐỘNG — metadata nội suy, renderer resolve)
 * @typedef {object} parsedDataFormat.baseItemAnim
 * @property {Array<{t1: number, t2: (number|null), easing: number, to: Object}>} [t] Danh sách
 *   mỗi \t(...) trong item theo thứ tự: { t1, t2, easing, to }.
 *   - t1/t2: ms, tương đối đầu dòng (Aegisub: \t dùng ms). t2 = null khi file không ghi t2
 *     (transform chạy tới HẾT dòng — renderer lấy duration dòng từ events để resolve).
 *   - easing: số accel THÔ (default 1 = linear; >1 nhanh dần, <1 chậm dần) — renderer tự map
 *     sang hàm easing (linear/parabola/cubic...); giữ số thô để không mất độ chính xác.
 *   - to: tag target ĐÃ map CSS-cooked (giống delta.text). CHỈ chứa tag map được; \pos/\move/\org
 *     trong \t bị BỎ QUA (chốt 03sep26), tag nhóm 2.3 (\c, \bord, \fr...) map khi viết 2.3.
 * @property {{type: ('kf'|'K'|'k'|'ko'), durationMs: number, startMs: number}} [k] Karaoke syl:
 *   durationMs = file (centisecond) × 10 → ms (chốt 03sep26); startMs = parser CỘNG DỒN các syl
 *   trước trong cùng dòng.
 */
/** Định nghĩa/chú thích lineCss[i] sau classify (struct đích — mục 3 prompt 03sep26)
 * @typedef {object} parsedDataFormat.lineCssEntry
 * @property {Array<parsedDataFormat.baseItem>} base Mục base đã classify: mỗi mục giữ nguyên
 *   { tags, text } + thêm { delta?, anim? } (delta/anim chỉ xuất hiện khi có nội dung).
 * @property {{t: boolean}} collision Nhóm 2.2 — mức DÒNG (bản này CHỈ signal \t, chốt 03sep26:
 *   an/pos/move/org để session 2.2 làm đầy). collision.t = true khi dòng có \t → renderer tự
 *   disable collision (KHÔNG lưu payload \t ở đây — payload chỉ ở base[i].anim.t).
 * @property {{rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}} clip
 *   Nhóm 2.1 — mức DÒNG, last-wins (bản này STUB default — session 2.1 làm đầy).
 */

/** Regex nhận diện tag karaoke: \k / \K / \kf / \ko + duration (số, centisecond trong file).
 * Nhóm 1 = type ('k'|'K'|'kf'|'ko'), nhóm 2 = duration raw (cs). */
const KARAOKE_RE = /^\\(k[fo]?|K)(\d+(?:\.\d+)?)/;
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
 * @param {string} text Chuỗi chứa tag, vd "\\fs30\\t(\\clip(0,0,1,1))\\c&HFF&".
 * @returns {string[]} Các tag đơn, mỗi phần tử bắt đầu bằng '\'.
 */
function splitStyleModifiers(text) {
	const tags = [];
	let depth = 0;
	let start = -1; // vị trí '\' mở đầu tag đang dở (ngoài ngoặc)
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === '(') { depth++; }
		else if (ch === ')') { if (depth > 0) depth--; }
		else if (ch === '\\' && depth === 0) {
			if (start !== -1) tags.push(text.slice(start, i));
			start = i;
		}
	}
	if (start !== -1) tags.push(text.slice(start));
	return tags;
}

/** [arena.ai] Map 1 tag LAYOUT TĨNH (2.4) thành CSS-cooked, ghi vào ctx.
 * Chỉ xử lí: \fs \fscx \fscy \fsc (alias fscx) \fsp \fn \b \i.
 * \b/\i (và \u/\s khi 2.3 làm) KHÔNG có số đằng sau → coi như KHÔNG có tag: return false, không toggle
 * (parser không giữ state dòng — chốt 03sep26 bản 2).
 * \r và marker \h/\N/\n KHÔNG qua hàm này (classifyLayoutLocal xử lí riêng — cần data + styleRef).
 * \t/\k là nhóm ĐỘNG → xử lí riêng, không qua hàm này.
 *
 * @param {string} tag Tag đơn raw, bắt đầu bằng '\' (vd "\\fs30", "\\fscx150").
 * @param {{css: Object, scaleX: (number|undefined), scaleY: (number|undefined), styleRef: (Object|null|undefined)}} ctx
 *   Context dùng CHUNG cho cả item/entry (scaleX/scaleY phải tích lũy qua nhiều tag scale).
 *   - css: nơi ghi key CSS-cooked (font-size/letter-spacing/font-weight/font-style/font-family...).
 *   - scaleX/scaleY: số % gốc của tag scale — KHÔNG ghi css.transform tại đây, caller gộp 1 lần cuối
 *     bằng finalizeTransform (nhiều tag scale trong cùng mục không đè nhau; tag sau thắng).
 *   - styleRef: style chuẩn của dòng — dùng cho \fn rỗng (reset font về style dòng).
 * @returns {boolean} true = tag thuộc layout tĩnh (đã xử lí — dù có sinh CSS hay không);
 *   false = tag KHÔNG thuộc nhóm này (vd \c, \bord, \an, \pos...) → để lại cho nhóm sau.
 */
function applyLayoutStatic(tag, ctx) {
	const { css } = ctx;
	// \fscy: scale Y (%).
	if (tag.startsWith('\\fscy')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) ctx.scaleY = v;
		return true;
	}
	// \fscx: scale X (%).
	if (tag.startsWith('\\fscx')) {
		const v = Number.parseFloat(tag.slice(5));
		if (!Number.isNaN(v)) ctx.scaleX = v;
		return true;
	}
	// \fsc = alias của \fscx (SSA cũ).
	if (tag.startsWith('\\fsc')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) ctx.scaleX = v;
		return true;
	}
	// \fsp: letter-spacing (px, PlayRes) — phải đứng trước \fs (prefix trùng '\fs').
	if (tag.startsWith('\\fsp')) {
		const v = Number.parseFloat(tag.slice(4));
		if (!Number.isNaN(v)) css['letter-spacing'] = `${v}px`;
		return true;
	}
	// \fn: font-family (reset về font style dòng nếu \fn rỗng).
	if (tag.startsWith('\\fn')) {
		let name = tag.slice(3).trim();
		if (name === '') name = ctx.styleRef?.fontName ?? '';
		if (name !== '') css['font-family'] = `"${name}", sans-serif`;
		return true;
	}
	// \fs: font-size (px, PlayRes) — để SAU \fscx/fscy/fsc/fsp vì prefix '\fs' trùng.
	if (tag.startsWith('\\fs')) {
		const v = Number.parseFloat(tag.slice(3));
		if (!Number.isNaN(v)) css['font-size'] = `${v}px`;
		return true;
	}
	// \b: font-weight 700/400 — YÊU CẦU SỐ đằng sau (\b1/\b0; \b-1 cũng là số → parse ≠ 0 → 700).
	// \b KHÔNG số → return false: coi như KHÔNG có tag (chốt 03sep26 bản 2 — KHÔNG toggle vì parser
	// không giữ state dòng; tag để nguyên trong item.tags, nhóm sau cũng không áp khi thiếu số).
	// \bord/\bbox... KHÔNG lọt (regex khóa đuôi chữ số).
	if (/^\\b-?\d+(?:\.\d+)?$/.test(tag)) {
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		css['font-weight'] = on ? '700' : '400';
		return true;
	}
	// \i: font-style italic/normal — cùng quy tắc \b: YÊU CẦU SỐ; \i KHÔNG số → return false.
	// (\iclip... không lọt — regex khóa đuôi chữ số.)
	if (/^\\i-?\d+(?:\.\d+)?$/.test(tag)) {
		const on = Number.parseFloat(tag.slice(2)) !== 0;
		css['font-style'] = on ? 'italic' : 'normal';
		return true;
	}
	return false;
}

/** [arena.ai] Gộp scaleX/scaleY (số % đã gom từ nhiều tag scale trong CÙNG mục) thành chuỗi
 * 'transform' CSS-cooked. Chỉ emit key khi có ít nhất 1 scale ≠ 100 (identity không cần — giống R3).
 * Thứ tự chuỗi scaleX trước scaleY cho khớp styleParsedToCss (phần scale luôn đứng sau rotate).
 * @param {Object} css Object CSS đang xây (thêm key 'transform' khi cần).
 * @param {number|undefined} scaleX Giá trị % của \fscx (100 = identity).
 * @param {number|undefined} scaleY Giá trị % của \fscy (100 = identity).
 * @returns {void}
 */
function finalizeTransform(css, scaleX, scaleY) {
	const parts = [];
	if (scaleX !== undefined && scaleX !== 100) parts.push(`scaleX(${scaleX / 100})`);
	if (scaleY !== undefined && scaleY !== 100) parts.push(`scaleY(${scaleY / 100})`);
	if (parts.length) css['transform'] = parts.join(' ');
}

/** [arena.ai] Parse 1 tag \t(...) thành entry anim { t1, t2, easing, to } (metadata — Cách 1,
 * KHÔNG bake snapshot; renderer resolve theo mediaTime).
 *
 * Cú pháp (Aegisub / ASSv5 wiki): \t([t1],[t2],[accel],mods) | \t([t1],[t2],mods) |
 * \t([accel],mods) | \t(mods). t1/t2 tính bằng ms, tương đối đầu dòng.
 * Gán theo SỐ token số đứng đầu (trước '\' đầu tiên):
 *   - 0 số  → t1 = 0, t2 = null (tới hết dòng), easing = 1 (linear).
 *   - 1 số  → số đó là ACCEL (form \t(accel, mods)) → t1 = 0, t2 = null.
 *   - 2 số  → t1, t2 (easing mặc định 1).
 *   - 3 số+ → t1, t2, accel.
 *
 * ⚠️ ĐIỂM ĐẶC BIỆT (chốt 03sep26): \t KHÔNG animate \pos/\move/\org — nếu bên trong \t(...) có
 * 3 tag này thì TỰ ĐỘNG BỎ QUA (không parse vào to). \t chỉ animate style (vd \fs, \c, \fsc, \fr,
 * \bord, \shad, \frz...). \pos/\move/\org là line-level (collision), không thể nằm trong \t.
 * \clip/\iclip trong \t cũng bỏ qua ở đây (ít gặp; nhóm 2.1 sau này đọc lại từ tags raw — tags
 * được GIỮ nên không mất dữ liệu).
 *
 * @param {string} tag Tag \t raw (vd "\\t(0,500,0.5,\\fs30\\fscx150)").
 * @param {Object|null|undefined} styleRef Style chuẩn của dòng (cho \fn rỗng bên trong \t).
 * @returns {{t1: number, t2: (number|null), easing: number, to: Object}|null} Entry anim;
 *   null khi \t không hợp lệ (thiếu ngoặc) hoặc KHÔNG có tag target nào map được (to rỗng).
 */
function parseTTransformTag(tag, styleRef) {
	const m = /^\\t(?:\((.*)\))?$/.exec(tag);
	if (!m) return null; // \t không có (...): không hợp lệ → bỏ qua
	const inner = m[1] ?? '';
	// Tách phần tham số số (trước '\' đầu tiên) và phần style modifiers (từ '\' đầu tiên trở đi).
	const firstSlash = inner.indexOf('\\');
	const argSection = firstSlash === -1 ? inner : inner.slice(0, firstSlash);
	const modsText = firstSlash === -1 ? '' : inner.slice(firstSlash);
	// Gom các token số dẫn đầu (bỏ token rỗng — file có thể ghi kiểu \t(,500,...)).
	const nums = [];
	for (const tok of argSection.split(',')) {
		const t = tok.trim();
		if (t === '') continue;
		if (isNumericToken(t)) nums.push(Number(t));
		else break; // token không phải số → hết phần tham số
	}
	let t1 = 0;
	let t2 = null;
	let easing = 1;
	if (nums.length === 1) {
		easing = nums[0]; // form \t(accel, mods)
	} else if (nums.length === 2) {
		t1 = nums[0];
		t2 = nums[1];
	} else if (nums.length >= 3) {
		t1 = nums[0];
		t2 = nums[1];
		easing = nums[2];
	}
	// Map style modifiers → to (chỉ map được tag layout tĩnh; tag 2.3 bổ sung khi viết 2.3).
	const ctx = { css: {}, scaleX: undefined, scaleY: undefined, styleRef };
	for (const sub of splitStyleModifiers(modsText)) {
		if (/^\\(pos|move|org)/.test(sub)) continue; // BỎ QUA \pos/\move/\org trong \t (điểm đặc biệt)
		if (/^\\(iclip|clip)/.test(sub)) continue;   // \clip/\iclip trong \t → 2.1 đọc lại từ tags raw
		applyLayoutStatic(sub, ctx);
	}
	finalizeTransform(ctx.css, ctx.scaleX, ctx.scaleY);
	if (Object.keys(ctx.css).length === 0) return null; // không có target map được → không tạo entry
	return { t1, t2, easing, to: ctx.css };
}

/** [arena.ai] Nhóm 2.4 — Layout Local (LÀM NGAY, bản 03sep26). NHÓM TĨNH (+ động \t/\k metadata).
 *
 * Với MỖI mục base, đọc tags (raw) theo THỨ TỰ trong mục và sinh:
 *   - delta.text — \fs \fscx \fscy \fsc \fsp \fn \b \i → CSS-cooked (khớp styleCss.text).
 *   - delta.data — \r (baseStyleName: reset về style dòng khi \r rỗng, hoặc style tên trong \r);
 *                  marker \h/\N/\n (renderer quyết ngữ nghĩa xuống dòng/space theo WrapStyle/\q).
 *   - anim.t     — \t(...) → metadata nội suy (không bake); \pos/\move/\org trong \t bị BỎ QUA.
 *   - anim.k     — \k/\K/\kf/\ko → { type, durationMs, startMs }; startMs CỘNG DỒN theo thứ tự
 *                  base trong CÙNG dòng (parser tính; ×10 vì file ghi centisecond — chốt 03sep26).
 *
 * Tag KHÔNG thuộc 2.4 (\c, \bord, \an, \pos...) để NGUYÊN trong item.tags — tags luôn được giữ
 * (chốt 03sep26) cho 2.3/2.2/2.1 chạy sau trong classify(). Hàm này là nhóm CHẠY ĐẦU nên gán
 * thẳng item.delta/item.anim; nhóm 2.3 sau này phải MERGE (không gán đè) khi viết vào item.delta.
 *
 * @param {Array<parsedDataFormat.baseItem>} base Mảng mục base của dòng (mutate tại chỗ).
 * @param {Object|null|undefined} [styleRef] Style đã chuẩn hóa của dòng (lookup theo orgline.style
 *   trong parsedData.styles; \r rỗng / \fn rỗng cần tên + fontName). Thiếu → fallback mặc định.
 * @returns {Array<parsedDataFormat.baseItem>} base đã classify (ghi trực tiếp vào từng mục).
 */
export function classifyLayoutLocal(base, styleRef) {
	if (!Array.isArray(base)) return base;
	/** startMs cộng dồn cho karaoke — 1 biến xuyên suốt base (cùng dòng) @type {number} */
	let karaokeRunMs = 0;
	for (const item of base) {
		const tags = item.tags;
		if (!Array.isArray(tags) || tags.length === 0) continue;
		/** @type {Object<string, string>} CSS-cooked mức text của item (key CSS) */
		const css = {};
		/** @type {Object} dữ liệu thuần mức data của item (\r → baseStyleName; marker \h/\N/\n) */
		const data = {};
		/** @type {Array<{t1,t2,easing,to}>} danh sách \t của item (theo thứ tự xuất hiện) */
		const animT = [];
		/** @type {{type,durationMs,startMs}|undefined} karaoke của item (syl cuối thắng nếu nhiều \k cạnh nhau) */
		let animK;
		/** Context DÙNG CHUNG cả item — scaleX/scaleY tích lũy qua nhiều tag scale trong cùng mục */
		const ctx = { css, scaleX: undefined, scaleY: undefined, styleRef };
		for (const tag of tags) {
			// Nhóm ĐỘNG 1 — \t(...): metadata nội suy (Cách 1), renderer resolve theo mediaTime.
			if (tag.startsWith('\\t')) {
				const entry = parseTTransformTag(tag, styleRef);
				if (entry) animT.push(entry);
				continue;
			}
			// Nhóm ĐỘNG 2 — karaoke \k/\K/\kf/\ko: duration file centisecond × 10 = ms; startMs cộng dồn.
			const km = KARAOKE_RE.exec(tag);
			if (km) {
				const durationMs = Number(km[2]) * 10;
				animK = { type: km[1], durationMs, startMs: karaokeRunMs };
				karaokeRunMs += durationMs; // syl SAU trong dòng lấy mốc mới
				continue;
			}
			// \r: reset style → delta.data.baseStyleName (nguồn baseStyleName của run).
			// Rỗng → về style DÒNG (styleRef.name); có tên → về style tên đó (renderer lookup trong styles).
			if (tag.startsWith('\\r')) {
				const styleName = tag.slice(2);
				data.baseStyleName = styleName !== '' ? styleName : (styleRef?.name ?? FALLBACK_STYLE_NAME);
				continue;
			}
			// Marker \h/\N/\n: delta.data (marker) — không CSS, không sinh node; renderer quyết ngữ nghĩa
			// (xuống dòng / dấu cách theo WrapStyle / \q). Text của mục marker để '' như cũ.
			if (tag === '\\h' || tag === '\\N' || tag === '\\n') {
				data.marker = tag;
				continue;
			}
			// Layout tĩnh còn lại (fs/fscx/fscy/fsc/fsp/fn/b/i). false = tag nhóm khác → để nguyên cho 2.3/2.2/2.1.
			applyLayoutStatic(tag, ctx);
		}
		// Gộp transform (scale) của item — chỉ khi có scale khác identity.
		finalizeTransform(css, ctx.scaleX, ctx.scaleY);
		// Ghi delta (mức text/data) + anim (t/k) vào item — CHỈ khi có nội dung (giữ item tối giản).
		if (Object.keys(css).length > 0 || Object.keys(data).length > 0) {
			const delta = {};
			if (Object.keys(css).length > 0) delta.text = css;
			if (Object.keys(data).length > 0) delta.data = data;
			item.delta = delta;
		}
		if (animT.length > 0 || animK) {
			const anim = {};
			if (animT.length > 0) anim.t = animT;
			if (animK) anim.k = animK;
			item.anim = anim;
		}
	}
	return base;
}

/** [arena.ai] Nhóm 2.3 — Decoration Local Tags (màu, bord/shad, \fa, \fr...). SESSION SAU.
 * Để shape classify() chạy đúng thứ tự 2.4 → 2.3 → 2.2 → 2.1, hàm này được classify() gọi ở vị trí 2.
 * Khi implement: đọc tags còn nguyên trên từng mục base, MERGE delta vào item.delta ĐÃ CÓ từ 2.4
 * (không gán đè), và bổ sung tag target nhóm 2.3 vào anim.t[i].to của \t (tags raw vẫn còn để đối chiếu).
 * QUY TẮC CHUNG (chốt 03sep26 bản 2): tag dạng bật/tắt kiểu \u/\s (và \b/\i nếu 2.3 đụng tới)
 * KHÔNG có số đằng sau → coi như KHÔNG có tag (bỏ qua, không toggle — parser không giữ state dòng).
 * @param {Array<parsedDataFormat.baseItem>} base Mảng mục base của dòng.
 * @param {Object|null|undefined} [styleRef] Style chuẩn của dòng.
 * @returns {Array<parsedDataFormat.baseItem>} base (bản này chưa đổi gì).
 */
export function classifyDecoration(base, styleRef) {
	// TODO 03sep26: implement khi tới session 2.3 — giữ stub (no-op) để test chảy.
	return base;
}

/** [arena.ai] Nhóm 2.2 — Collision (mức DÒNG). Bản 03sep26: CHỈ signal \t (đã hỏi/chốt).
 * Shape đích (session 2.2 làm đầy): { an?, pos?, move?, org?, t }.
 * - an (1-9): đổi GỐC NEO — VẪN tính collision.
 * - pos/move/org: renderer gặp là TỰ disable collision (không cần signal riêng).
 * - t: boolean — có \t trong dòng → renderer tự disable collision. KHÔNG lưu payload \t ở đây
 *   (payload chỉ ở base[i].anim.t) → đúng mục 5.1: không lặp \t.
 * @param {Array<parsedDataFormat.baseItem>} base Mảng mục base của dòng (đã qua 2.4; tags còn nguyên).
 * @param {Object|null|undefined} [styleRef] Style chuẩn của dòng.
 * @returns {{t: boolean}} Signal collision của dòng.
 */
export function classifyCollision(base, styleRef) {
	// \t nằm trong item.tags dạng tag đơn (splitOverrideTags đã giữ nguyên \t(...) cả cụm).
	// Quét mọi mục: chỉ cần 1 tag bắt đầu bằng '\t' → collision.t = true.
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

/** [arena.ai] Nhóm 2.1 — Clip (mức DÒNG, last-wins). Bản 03sep26: STUB trả shape default.
 * Shape đích (session 2.1 làm đầy): { rawList, effectiveType, effectiveRaw }.
 * - rawList: tất cả \clip/\iclip raw theo thứ tự (KHÔNG có \t).
 * - effectiveType/effectiveRaw: cái CUỐI CÙNG quyết định.
 * - Chú ý: \clip/\iclip nằm TRONG \t → mới append thêm vào SAU clip.rawList (ít gặp) — khi đó phải
 *   đọc lại tags raw trên item (tags được giữ) và parse cả nội dung \t(...).
 * @param {Array<parsedDataFormat.baseItem>} base Mảng mục base của dòng (đã qua 2.4; tags còn nguyên).
 * @param {Object|null|undefined} [styleRef] Style chuẩn của dòng.
 * @returns {{rawList: string[], effectiveType: ('clip'|'iclip'|null), effectiveRaw: (string|null)}}
 *   Object clip mức dòng.
 */
export function classifyClip(base, styleRef) {
	// TODO 03sep26: implement khi tới session 2.1 — giữ stub (shape default) để test chảy.
	return { rawList: [], effectiveType: null, effectiveRaw: null };
}

/** [arena.ai] Classify — biến base đầu ra của processLineText thành lineCss[i] ĐẦY ĐỦ.
 * Gọi các nhóm theo ĐÚNG THỨ TỰ 2.4 → 2.3 → 2.2 → 2.1 (thứ tự nhóm là ràng buộc thiết kế).
 * Bản 03sep26: 2.4 (layout + động \t/\k) LÀM THẬT; 2.3 no-op; 2.2 signal \t; 2.1 shape default.
 *
 * @param {{base: Array<parsedDataFormat.baseItem>}} entry Đầu ra của processLineText: { base }.
 *   base được MUTATE tại chỗ (mỗi mục thêm delta/anim khi có nội dung; tags giữ nguyên).
 * @param {Object|null|undefined} [styleRef] Style ĐÃ CHUẨN HÓA của dòng — lookup theo orgline.style
 *   trong parsedData.styles (để \r biết reset về style nào); không tìm thấy → fallback
 *   FALLBACK_DEFAULT_STYLE (parser() truyền styleForLine()).
 * @returns {parsedDataFormat.lineCssEntry} lineCss[i] = { base, collision, clip }.
 */
export function classify(entry, styleRef) {
	const base = Array.isArray(entry?.base) ? entry.base : [];
	classifyLayoutLocal(base, styleRef);   // 2.4 — Layout Local (tĩnh + \t/\k metadata)
	classifyDecoration(base, styleRef);    // 2.3 — Decoration (session sau)
	const collision = classifyCollision(base, styleRef); // 2.2 — bản này: signal \t
	const clip = classifyClip(base, styleRef);           // 2.1 — bản này: shape default
	return { base, collision, clip };
}
