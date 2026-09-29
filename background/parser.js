// v0.1.0 29sep26
// beta mode (đã viết xong, sửa lỗi khi chạy)
// Chức năng: xử lí kế tiếp, giai đoạn từ có file sub thô (rawText) đến cấu trúc JS (parsedData) và CSS trung gian (globalCss, styleCss, lineCss).
import * as utils from './utils.js';
import { classify } from './tagProcess.js'; // 03sep26: classify biến base → lineCss[i] đầy đủ { base, collision, clip }; 09sep26: tagProcess CHỈ export classify
/** Định nghĩa/chú thích object FALLBACK_DEFAULT_STYLE (parsedDataFormat.style) 
 * @typedef {object} parsedDataFormat.style Kiểu style nguyên bản 
 * 
 * (có thể sẽ thêm các biến khác như CSSResize?)
 * @property {string} name Tên style (style.name, line.styleref.name, syl.style.name)
 * @property {string} fontName Tên font (\fn)
 * @property {number} fontSize Font size (\fs, px, với PlayRes 640x480)
 * @property {string} primaryColour Màu 1, main (\1c)
 * @property {string} secondaryColour Màu 2, pre-kara (\2c)
 * @property {string} outlineColour Màu 3, outline (\3c)
 * @property {string} backColour Màu 4, shadow (\4c)
 * @property {boolean} bold In đậm (\b, boolean)
 * @property {boolean} italic In nghiêng (\i, boolean)
 * @property {boolean} underline Gạch dưới (\u, boolean)
 * @property {boolean} strikeOut Gạch ngang (\s, boolean)
 * @property {number} scaleX ScaleX (\fscx, %)
 * @property {number} scaleY ScaleY (\fscy, %)
 * @property {number} spacing Khoảng cách ký tự (\fsp, px)
 * @property {number} angle Góc xoay (\fr hoặc \frz, degree)
 * @property {number} borderStyle Kiểu border (1: viền thường, 3: box)
 * @property {number} outline Độ dày viền (\bord, px. Có \xbord và \ybord)
 * @property {number} shadow Độ đổ bóng (\shad, px. Có \xshad và \yshad)
 * @property {number} alignment Căn lề (\an, 1-9 kiểu numpad)
 * @property {number} marginL Lề trái (px)
 * @property {number} marginR Lề phải (px)
 * @property {number} marginV Lề dọc (px)
 * @property {number} encoding Encoding (\fe, nên bị bỏ qua)
 */
/** Định nghĩa/chú thích object parsedData, sau xử lí 
 * @typedef {object} parsedDataFormat.global Tương ứng với các phần [Script Info], [V4+ Styles], [Events]. Bỏ qua phần [Aegisub Project Garbage].
 * @property {parsedDataFormat.info} info lưu dưới dạng obj do file sub có cấu trúc key: value
 * @property {Array<parsedDataFormat.style>} styles lưu các style của file sub (nếu style không được chuẩn thì fallback cả style về FALLBACK_DEFAULT_STYLE resize)
 * @property {Array<parsedDataFormat.event>} events lưu các events (dialogue) của file sub
 * @property {object} globalCss định dạng các thuộc tính info (có thể chuyển) thành CSS
 * @property {Array} styleCss định dạng các style thành CSS ({container, text, data} — data chứa cả styleIndex, 02sep26)
 * @property {Array} lineCss mỗi phần tử { base, collision, clip } cùng chỉ số với events.
 *   (02sep26: đổi tên segments → base; classify ghi trực tiếp vào base + thêm collision, clip.
 *   03sep26: lineCss[i] = classify(processLineText(...)) — { base, collision, clip }; 2.4 layout +
 *   \t metadata làm thật; 09sep26: karaoke KHÔNG ở 2.4 (về 2.3), 2.3/2.2/2.1 để session sau
 *   — xem background/tagProcess.js)
 */
/** Định nghĩa/chú thích object parsedData.info sau xử lí 
 * @typedef {object} parsedDataFormat.info
 * @property {string} Title Phần text để hiển thị trong tab Thông tin chung
 * @property {string} ScriptType chỉ hỗ trợ "v4.00+", nếu ko thì xử lí file sub sẽ không đảm bảo
 * @property {number} WrapStyle (0..3)
 * 
 * 0: Smart wrapping, top line is wider
 * 
 * 1: End-of-line word wrapping, only \N breaks
 * 
 * 2: No word wrapping, both \n and \N break
 * 
 * 3: Smart wrapping, bottom line is wider
 * @property {boolean} ScaledBorderAndShadow yes -> true, no -> false. Nếu true/yes thì outline/shadow sẽ scale theo PlayRes
 * @property {number} PlayResX Kích thước video chuẩn mà sub dựa vào. Mọi thông số font, pos đều phụ thuộc vào nó
 * @property {number} PlayResY Kích thước video chuẩn mà sub dựa vào. Mọi thông số font, pos đều phụ thuộc vào nó
 */
/** Mẫu style sau chuẩn hóa, với PlayRes 640x480
 * @readonly Chỉ đọc để so chuẩn với các style trong parsedData
 * @type {parsedDataFormat.style} */
const FALLBACK_DEFAULT_STYLE = {
	name: "Default",
	fontName: "Arial",
	fontSize: 20,
	primaryColour: "rgba(255,255,255,1.0)",
	secondaryColour: "rgba(255,0,0,1.0)",
	outlineColour: "rgba(0,0,0,1.0)",
	backColour: "rgba(0,0,0,1.0)",
	bold: false,   
	italic: false, 
	underline: false,
	strikeOut: false,
	scaleX: 100,
	scaleY: 100,
	spacing: 0,  
	angle: 0,    
	borderStyle: 1,
	outline: 2,  
	shadow: 2,   
	alignment: 2,
	marginL: 20,
	marginR: 20, 
	marginV: 20, 
	encoding: 1,
};
Object.freeze(FALLBACK_DEFAULT_STYLE); // Khóa chỉ đọc
/** Danh sách các key chuẩn của style để so sánh */
const REQUIRED_STYLE_KEYS = Object.keys(FALLBACK_DEFAULT_STYLE);
/** LogPrefix của parser (utils.logger đã tự thêm "[PD-47.ass] " nên chỉ cần "parser:"). */
const parserLogPrefix = "parser:";
/** [arena.ai] Map \an (1-9) → transform-origin, hoisted ra module scope
 * (tối ưu: không tạo lại object mỗi lần gọi styleParsedToCss). */
const TRANSFORM_ORIGIN_MAP = Object.freeze({
	1: '0% 100%', 2: '50% 100%', 3: '100% 100%',
	4: '0% 50%',  5: '50% 50%',  6: '100% 50%',
	7: '0% 0%',   8: '50% 0%',   9: '100% 0%',
});
/** Chuyển tên trường từ định dạng ASS sang camelCase để sử dụng làm key JavaScript.
 * Ví dụ: "Fontname" -> "fontName", "PrimaryColour" -> "primaryColour".
 *
 * @param {string} str Chuỗi cần chuyển đổi.
 * @param {number[]} [indices=[0]] Các vị trí ký tự cần đổi hoa/thường ngược lại.
 * @returns {string} Chuỗi đã chuyển đổi sang dạng camelCase hoặc chuỗi rỗng nếu đầu vào rỗng.
 */
const toCamelCase = (str, indices = [0]) => {
    if (!str) return ''; // Vào trống thì ra trống.
    return Array.from(str, (char, index) => indices.includes(index) ? (char === char.toUpperCase() ? char.toLowerCase() : char.toUpperCase()) : char).join('');    
};
/** Chuyển thời gian ASS (h:mm:ss.cs) sang mili giây (ms — đơn vị dùng cho CSS timing).
 * 
 * Tính toán theo số nguyên thay vì số thực để tránh lỗi làm tròn.
 * 
 * '.' được thay thành ':' để split 1 lần; pad TRÁI lên đủ 4 phần tử trước khi destructure.
 * 
 * Cấp số tính TỪ PHẢI SANG (cs, giây, phút, giờ), có thể sai nếu đầu vào ko chuẩn. (vd: t = 120, coi như 120ms)
 * @param {string} t Chuỗi thời gian đầu vào. VD chuẩn: "0:00:05.00". Chú ý: nếu cs = "13a" (130+a ms) thì coi như 130ms (slice(0,2) → 13 → 130ms)
 * @returns {number} Thời gian (ms), hoặc 0 nếu chuỗi không hợp lệ (rác → NaN → || 0; không thể throw).
 */
const convertTimeStringToMs = t => {
    const p = String(t).replace('.', ':').split(':').slice(-4);
    const [h = 0, m = 0, s = 0, cs = 0] = Array(4 - p.length).fill(0).concat(p);
    return h * 36e5 + m * 6e4 + s * 1e3 + String(cs).padEnd(2, '0').slice(0, 2) * 10 || 0;
};
/** Parse và clamp một giá trị số từ file ASS về phạm vi hợp lệ.
 * @param {boolean} isInteger true nếu cần parse kiểu integer, false nếu cần parse kiểu float.
 * @param {string|number} v Giá trị đầu vào.
 * @param {number} def Giá trị mặc định khi parse thất bại.
 * @param {number} [min] Giá trị tối thiểu cho phép.
 * @param {number} [max] Giá trị tối đa cho phép.
 * @returns {number} Giá trị sau khi parse và clamp về phạm vi hợp lệ.
 */
function parseClampedNum (isInteger, v, def, min, max) {
	const raw = isInteger ? Number.parseInt(v, 10) : Number.parseFloat(v); 
	return Number.isNaN(raw) ? def : Math.min(Math.max(raw, (min ?? -Infinity)), (max ?? Infinity));
}
/** Kiểm tra và chuẩn hóa một style từ ASS trước khi dùng trong renderer.
 * Nếu style thiếu thông tin bắt buộc hoặc giá trị không hợp lệ, hàm sẽ trả về false để loại bỏ style đó.
 * - Cho phép style.name rỗng (Aegisub vẫn coi là hợp lệ #a1).
 * @param {parsedDataFormat.style} style Style cần kiểm tra và chuẩn hóa.
 * @returns {boolean} true nếu style hợp lệ, false nếu style bị bỏ qua.
 */
function validateAndNormalizeStyle(style) {
	// name được phép rỗng, các key khác không được null/undefined/''/toàn space
	if (REQUIRED_STYLE_KEYS.some(key => {
		if (key === 'name') return style[key] == null; // chỉ loại khi null/undefined, cho phép ''
		return style[key] == null || (typeof style[key] === 'string' && style[key].trim() === '');
	})) return false;
	for (const key of REQUIRED_STYLE_KEYS) {
		// Dòng dưới này có vẻ thừa? để lại. sau này có thể dùng giải pháp thế defaultValue thay vì xóa toàn style
		const defaultValue = FALLBACK_DEFAULT_STYLE[key]; 
		const defaultType = typeof defaultValue;
		switch (defaultType) {
			case 'boolean':
				style[key] = style[key] !== '0'; // '0' → false, còn lại true
				break;
			case 'number': {
				const value = Number.parseFloat(style[key]);
				if (Number.isNaN(value)) return false; // số không parse được → loại style
				style[key] = value;
				break;
			}
			default:
				// string đã hợp lệ (trừ name có thể rỗng), giữ nguyên
				break;
		}
	}
	return true;
}
/** [arena.ai] Xử lí text của 1 dòng Dialogue theo doStripTags → entry cho lineCss[i]
 * 
 * - Chú ý: Strip (truthy — như Aegisub strip tags): đi qua CHUNG tokenizeLineText (không regex raw)
 *   để edge case đồng nhất 2 chế độ:
 *   + tag {...} bị xóa hết (kể cả tag comment thuần {abc} — tokenizer đã bỏ);
 *   + marker \h/\N/\n đứng NGOÀI tag GIỮ NGUYÊN VĂN trong text (Aegisub strip chỉ xóa {...});
 *   + '{' không đóng giữ nguyên văn như text; \{ \} giữ nguyên văn (renderer unescape tầng cuối);
 *   + kết quả gộp thành 1 mục base duy nhất { tags: [], text }; text rỗng/toàn tag → base = [].
 *
 * @param {boolean} doStripTags truthy = như Aegisub strip tags, falsy = ko strip, xử lí tất cả.
 * @param {string} text line.text dạng raw.
 * @returns {{base: Array<parsedDataFormat.baseItem>}} Entry lineCss: { base } (02sep26 — đổi tên
 *   segments → base; classify 03sep26 ghi trực tiếp vào base + thêm collision, clip).
 */
function processLineText(doStripTags, text) {
	const tokens = tokenizeLineText(text ?? '');
	if (!doStripTags) return baseFromTokens(tokens); // falsy → xử lí tất cả
	// truthy → strip: nối text token + marker nguyên văn, bỏ mọi tag token.
	let stripped = '';
	for (const tok of tokens) {
		if (isStandaloneToken(tok)) { stripped += tok.slice(1, -1); continue; } // {\N} → '\N' nguyên văn
		if (tok.startsWith('{') && tok.endsWith('}')) continue; // tag token → xóa
		stripped += tok; // text token (kể cả '{' không đóng, \{ \})
	}
	return [{ tags: [], text: stripped }];
}
/** [arena.ai] globalCss làm CHUẨN, suy từ info (đã chuẩn hóa).
 * Bộ props dùng chung cho MỌI dòng của file sub. Parser nhúng thẳng bộ này vào container
 * của từng styleCss (styleParsedToCss) → renderer áp container 1 chỗ là đủ, không cần
 * merge globalCss riêng theo từng style. parsedData.globalCss vẫn giữ làm bản chuẩn
 * để renderer tham chiếu cho lớp gốc (root layer) của phụ đề.
 *
 * Phân mức: toàn bộ props hiện tại đều thuộc mức CONTAINER (wrap/khung dòng).
 * Nếu sau này có prop mức text thì nhúng vào phần text của styleParsedToCss tương ứng.
 *
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — chỉ đọc WrapStyle.
 * @returns {Object} Bộ props CSS chuẩn: white-space/word-break/overflow-wrap/text-wrap/max-width.
 */
function globalCssFromInfo(info = {}) {
	const wrapStyle = Number(info.WrapStyle ?? 0); // chống string khi info chưa chuẩn hóa
	return {
		'white-space': (wrapStyle === 2 ? 'pre' : 'pre-wrap'), // WrapStyle 2: không word wrap
		'word-break': 'keep-all',
		'overflow-wrap': 'break-word',
		'text-wrap': (wrapStyle === 3 ? 'balance' : wrapStyle === 1 ? 'wrap' : 'pretty'),
		'max-width': '100%',
	};
}
/** [arena.ai] Cache globalCss theo WrapStyle (chỉ 0..3 → tối đa 4 entry).
 * CHỈ dùng nội bộ styleParsedToCss để spread vào container (frozen → an toàn chia sẻ);
 * parsedData.globalCss vẫn lấy object MỚI từ globalCssFromInfo (pure) để renderer tự do dùng.
 * @type {Map<number, Object>} */
const GLOBAL_CSS_CACHE = new Map();
/** [arena.ai] Lấy globalCss từ cache theo WrapStyle (tạo + freeze nếu chưa có). 
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — chỉ đọc WrapStyle.
 * @returns {{Object<'white-space': string, 'word-break': string, 'overflow-wrap': string, 'text-wrap': string, 'max-width': string>}} Bộ props CSS chuẩn: white-space/word-break/overflow-wrap/text-wrap/max-width.
*/
function cachedGlobalCss(info) {
	const wrapStyle = Number(info?.WrapStyle ?? 0);
	let cached = GLOBAL_CSS_CACHE.get(wrapStyle);
	if (!cached) {
		cached = Object.freeze(globalCssFromInfo(info));
		GLOBAL_CSS_CACHE.set(wrapStyle, cached);
	}
	return cached;
}
/** Định nghĩa/chú thích lineSubCss
 * @typedef {object} parsedDataFormat.lineSubCss các thuộc tính CSS cho toàn line (tương đương tag 2.2, 2.1)
 *
 * VỎ NGOÀI của một dòng sub, parent của các segmentSub. Chỉ chứa prop mà TOÀN LINE chịu ảnh hưởng:
 * - tag mức dòng: 2.2 (\an, \pos, \move, \org) và 2.1 (\clip, \iclip);
 * - dữ liệu KHÔNG phải tag ở mức dòng: alignment + marginL/R/V của style, WrapStyle của info (globalCss).
 * KHÔNG chứa typography (font / màu chữ / viền chữ / border box) — những thứ đó thuộc segmentSubCss.
 *
 * Mọi px giữ theo PlayRes; renderer mới scale (videoSize / PlayRes) và xử lí collision.
 * styleParsedToCss chỉ dựng phần suy TỪ STYLE + INFO; các key do tag sinh ra (đánh dấu [tùy chọn])
 * do tagProcess/classify ghi đè lên cùng bộ key này, renderer Object.assign là ra kết quả cuối.
 *
 * @property {string} display 'inline-block' — khung dòng ôm sát chữ, không chiếm cả hàng ngang.
 * @property {string} position 'absolute' — chỗ dựa để renderer set left/top/right/bottom theo
 *   alignment + marginL/R/V, ghi đè bởi \an / \pos / \move (2.2). Parser KHÔNG ghi sẵn tọa độ
 *   (tọa độ là việc của renderer: cần videoSize thật + collision).
 * @property {string} text-align 'left' | 'center' | 'right' — suy từ alignment (hAlign); \an (2.2) ghi đè.
 * @property {string} white-space 'pre' (WrapStyle 2) | 'pre-wrap' — globalCss, theo info.WrapStyle.
 * @property {string} word-break 'keep-all' — globalCss (hằng, không tag nào đụng).
 * @property {string} overflow-wrap 'break-word' — globalCss (hằng, không tag nào đụng).
 * @property {string} text-wrap 'balance' (WrapStyle 3) | 'wrap' (1) | 'pretty' (0, 2) — globalCss theo
 *   info.WrapStyle. Lưu ý: \q là tag 2.4.2 (mức segment) nên KHÔNG ghi đè key này; nó đi qua
 *   '--wrap-style' của segmentSub, renderer tự quy đổi.
 * @property {string} max-width '100%' — globalCss, chặn dòng tràn ra ngoài khung video.
 * @property {string} transform-origin gốc quay/neo của dòng — LUÔN emit. Mặc định suy từ \an của style
 *   (map TRANSFORM_ORIGIN_MAP), ghi đè bởi \org (2.2 — nên key này thuộc mức DÒNG, không phải segment).
 *   \fr* (2.3) ở mức segment quay quanh chính gốc này.
 * @property {string} [clip-path] [tùy chọn] chỉ có khi dòng bị \clip / \iclip (2.1); \iclip là phần bù
 *   (dựng bằng fill-rule evenodd hoặc path bao ngoài — chốt khi làm 2.1, ticket #16).
 */

/** Định nghĩa/chú thích segmentSubCss
 * @typedef {object} parsedDataFormat.segmentSubCss các thuộc tính CSS cho segment (tương đương tag 2.4, 2.3)
 *
 * RUỘT CHỮ của một segment — một khúc chữ bên trong lineSub, là đơn vị nhỏ nhất mà tag CỤC BỘ
 * tác động: 2.4 (layout cục bộ: \fs, \fsp, \fsc*, \b, \i, \fn, \r, \q, \-) và 2.3 (trang trí:
 * màu/alpha, \bord, \shad, \be, \blur, \fa*, \fr*, karaoke).
 * (Từ "segment" ở đây là đơn vị CSS của renderer, KHÔNG liên quan tới tên cũ "segment → base"
 * của tokenizer — hai khái niệm khác nhau, đừng gộp.)
 *
 * styleParsedToCss dựng bộ GỐC của style; mỗi tag cục bộ chỉ tạo một segment mới ghi đè vài key.
 * Kèm bộ CSS variables giữ SỐ LIỆU THÔ để tag override và renderer đọc lại mà không phải parse ngược CSS.
 *
 * Key DUY NHẤT trông như chuyện của chữ nhưng KHÔNG nằm ở đây: transform-origin → lineSubCss
 * (gốc quay đến từ \org, tag 2.2 mức dòng).
 *
 * BORDER BOX (borderStyle 3) nằm Ở ĐÂY, không phải ở lineSub — vì libass dựng box bằng cách thay
 * outline của TỪNG GLYPH bằng hộp bao rồi hợp lại, nên box thừa hưởng màu/độ dày/cỡ chữ của khúc
 * chữ tại chỗ đó: \3c, \bord, \fs giữa dòng đều đổi box từ chỗ đó trở đi (một box phẳng mức dòng
 * sẽ sai cả 3 ca). Box "một khối cho cả event" là BorderStyle=4 — extension riêng của libass,
 * VSFilter render thành BorderStyle=1, KHÔNG phải thứ đang làm ở đây.
 *
 * @property {string} font-family '"<fontName>", sans-serif' — từ style.fontName; \fn (2.4.2) ghi đè
 *   (\fn rỗng = về font của styleRef).
 * @property {string} font-size px theo PlayRes — style.fontSize; \fs (2.4.1, nội suy được trong \t).
 * @property {string} line-height px — style.fontSize (19sep26: chuyển XUỐNG mức segment, trước ở container;
 *   đổi theo \fs cùng lúc với font-size).
 * @property {string} color màu chữ chính — style.primaryColour; \1c/\c (2.3), alpha từ \1a/\alpha (2.3).
 * @property {string} font-weight '700' | '400' — style.bold; \b (2.4.2).
 * @property {string} font-style 'italic' | 'normal' — style.italic; \i (2.4.2).
 * @property {string} text-decoration 'underline' | 'line-through' | cả hai | 'none' — style.underline/strikeOut;
 *   \u, \s (2.3).
 * @property {string} letter-spacing px — style.spacing; \fsp (2.4.1, nội suy được).
 * @property {string} [transform] CHỈ emit khi khác identity (R3): chuỗi rotate(-angle) ĐỨNG TRƯỚC
 *   scaleX/scaleY (R1 — CSS áp phải→trái, khớp VSFilter; \frz dương của ASS quay ngược chiều kim
 *   đồng hồ nên phải đổi dấu). Nguồn: style.angle/scaleX/scaleY; \frx/\fry/\frz + \fax/\fay (2.3)
 *   và \fscx/\fscy/\fsc (2.4.1). Gộp chuỗi transform cuối cùng là việc của RENDERER (chốt 03sep26),
 *   tag chỉ đẩy số liệu qua --angle-x/y/z và --skew-x/y.
 * @property {string} paint-order 'stroke fill markers' (borderStyle 1) | 'normal' (borderStyle 3) —
 *   để stroke không che fill khi dùng -webkit-text-stroke (Chromium 123+ mới áp cho HTML text).
 * @property {string} -webkit-text-stroke-width px — borderStyle 1: style.outline × 2 (ADR 0007 — stroke
 *   vẽ cân giữa đường bao glyph, nhân đôi + paint-order để phần ngoài đúng \bord px như Aegisub);
 *   borderStyle 3: '0px'. Tag: \bord (2.3); \xbord/\ybord → XẤP XỈ 2×max(x,y) (CSS không tách chiều).
 * @property {string} -webkit-text-stroke-color màu viền — style.outlineColour; \3c/\3a (2.3);
 *   'transparent' khi borderStyle 3.
 * @property {string} text-shadow '<x>px <y>px <backColour>' | 'none' — style.shadow + style.backColour;
 *   \shad (2.3, x = y), \xshad/\yshad (2.3, tách chiều CHÍNH XÁC), màu theo \4c/\4a. 'none' khi borderStyle 3.
 * @property {string} [filter] [tùy chọn] 'blur(Npx)' — chỉ khi có \be / \blur (2.3, cùng họ, last-wins chéo);
 *   style gốc không sinh key này.
 * @property {string} [background-color] [tùy chọn] chỉ khi borderStyle 3 (opaque box): style.outlineColour
 *   là MÀU NỀN của box (không phải màu viền chữ); \3c/\3a (2.3) ghi đè. borderStyle 1 → không emit.
 * @property {string} [padding] [tùy chọn] chỉ khi borderStyle 3: độ nở của box = \bord (style.outline),
 *   KHÔNG phải margin (margin là định vị dòng, thuộc lineSub); \bord (2.3) ghi đè.
 *   NGUYÊN LÍ BÙ MARGIN ÂM (chốt 26sep26) — libass nở hộp bao của từng glyph thêm \bord rồi HỢP
 *   (union) các hộp: box to ra nhưng VỊ TRÍ CHỮ KHÔNG ĐỔI. CSS thì ngược: padding của một inline box
 *   CHIẾM CHỖ trong luồng, nên mỗi mối nối giữa 2 segment chữ sẽ bị nới thêm 2×\bord. Cách bù:
 *     padding: <bord>px; margin-left: -<bord>px; margin-right: -<bord>px;
 *   → luồng chữ trở lại đúng advance width gốc (padding cộng vào, margin âm trừ đi), trong khi nền
 *   vẫn được VẼ đủ phần nở ra; vùng nở của 2 segment kề nhau đè lên nhau đúng bằng \bord nên dải box
 *   liền mạch, không hở khe — đúng hiệu ứng union của libass.
 *   Chiều DỌC không cần bù: padding dọc của inline box không làm cao line box (chiều cao dòng do
 *   line-height quyết định), nền vẫn tràn ra ngoài — chỉ cần lineSub đừng cắt (overflow visible).
 *   VÙNG CHỒNG: nếu màu box trong suốt một phần (alpha < 1) thì dải chồng rộng \bord ở mỗi mối nối
 *   ĐẬM GẤP ĐÔI. KHÔNG phải bug, KHÔNG cần chữa (chủ repo chốt 26sep26): đó đúng là hành vi của
 *   VSFilter — box vẽ theo từng khúc rồi đè lên nhau, chỗ giao đậm hơn (libass hợp hình rồi mới tô
 *   nên mới không bị). Renderer cứ để chồng tự nhiên; KHÔNG gộp node nền, KHÔNG bù alpha.
 * @property {string} [margin-left] [tùy chọn] chỉ khi borderStyle 3: '-<bord>px' — phần bù cho padding
 *   (xem NGUYÊN LÍ BÙ MARGIN ÂM ở trên). KHÔNG liên quan marginL/R/V của style (cái đó là định vị dòng).
 * @property {string} [margin-right] [tùy chọn] chỉ khi borderStyle 3: '-<bord>px' — phần bù cho padding.
 * @property {string} [box-shadow] [tùy chọn] chỉ khi borderStyle 3: style.shadow + style.backColour
 *   ('<x>px <y>px <backColour>'); \shad/\xshad/\yshad + \4c/\4a (2.3) ghi đè.
 *   borderStyle 1 dùng text-shadow (bóng bám chữ), KHÔNG dùng key này.
 * @property {string} --primary-color số liệu thô màu chính (\1c/\c, và màu chữ CHƯA hát của karaoke).
 * @property {string} --secondary-color số liệu thô màu phụ (\2c) — màu chữ ĐÃ hát của karaoke.
 * @property {string} --outline-color số liệu thô màu viền (\3c).
 * @property {string} --back-color số liệu thô màu bóng/nền box (\4c).
 * @property {string} --outline-width px GỐC của \bord (CHƯA ×2 — số thô cho renderer/tag override).
 * @property {string} --shadow-depth px độ sâu bóng = max(|x|, |y|) của \shad / \xshad / \yshad.
 * @property {string} --font-size px GỐC của \fs (số thô để đo chữ / quy đổi tương đối).
 * @property {string} [--angle-x] [tùy chọn] deg RAW của \frx (2.3) — renderer đổi dấu khi gộp transform.
 * @property {string} [--angle-y] [tùy chọn] deg RAW của \fry (2.3).
 * @property {string} [--angle-z] [tùy chọn] deg RAW của \frz / \fr (2.3).
 * @property {string} [--skew-x] [tùy chọn] deg đã NẤU SẴN = atan(f) của \fax (2.3).
 * @property {string} [--skew-y] [tùy chọn] deg đã NẤU SẴN = atan(f) của \fay (2.3).
 * @property {string} [--inline-fx] [tùy chọn] tên hiệu ứng inline của \- (2.4.2) — parser không diễn giải.
 * @property {string} [--base-style-name] [tùy chọn] tên style để reset của \r (2.4.2); rỗng = style của dòng.
 * @property {number} [--wrap-style] [tùy chọn] số WrapStyle override của \q (2.4.2) — renderer tự quy đổi
 *   sang white-space/text-wrap của lineSub.
 */
/** Định nghĩa/chú thích dataCss
 * @typedef {object} parsedDataFormat.dataCss các biến dữ liệu chung
 *
 * CHƯA CHỐT (19sep26) — cố ý để trống. Đây là chỗ chứa SỐ LIỆU (không sinh node, không phải CSS)
 * cho renderer dùng: dữ liệu mức LINE lẫn mức SEGMENT đều nằm chung ở đây.
 * Chốt tới đâu thì bổ sung @property tới đó; đừng suy diễn từ `data` của hàm styleParsedToCss cũ
 * ({ ...style, isBox, hAlign, transformOrigin, styleIndex }) — bộ đó thuộc cấu trúc cũ container/text/data.
 */
/** [Manual edit] Hàm chuyển đỏi style đã chuẩn hóa thành object CSS (lineSub, segmentSub, data)
 * Cấu trúc: lineSub là parent cho các segmentSub; data lưu dữ liệu (cả line và segment để renderer xử lí)
 * - Ghi chú: parser chỉ dựa trên PlayRes, renderer chỉ xử lí scale và collision,
 * tất cả dữ liệu khác phải xử lí trước trong parser/tagProcess.
 *
 * Bản viết lại của styleParsedToCss theo 3 typedef mới (29sep26): trả về
 * { lineSub, segmentSub, data } — shape mới, KHÁC {container, text, data} của hàm cũ.
 * Hai khác biệt kiến trúc so với hàm cũ (đều đã ghi trong typedef):
 *   1. transform-origin CHUYỂN LÊN lineSub (gốc quay đến từ \org — tag 2.2 mức DÒNG),
 *      không còn nằm ở ruột chữ.
 *   2. line-height CHUYỂN XUỐNG segmentSub (19sep26 — đổi cùng \fs), không còn ở vỏ dòng.
 *   3. borderStyle 3 (opaque box): background/padding/box-shadow CHUYỂN XUỐNG segmentSub
 *      (box thừa hưởng màu/độ dày/cỡ chữ của TỪNG khúc chữ), kèm bù margin âm để advance
 *      width chữ không đổi — xem NGUYÊN LÍ BÙ MARGIN ÂM trong typedef segmentSubCss.
 *
 * lineSub (vỏ ngoài — định vị dòng, tag 2.2/2.1):
 *   - display/position/text-align (từ \an) + bộ globalCss chuẩn (white-space/word-break/
 *     overflow-wrap/text-wrap/max-width, nhúng sẵn không merge ở renderer) + transform-origin.
 *   - KHÔNG chứa font/color/box — những thứ đó thuộc segmentSub.
 *   - clip-path chỉ sinh khi có \clip/\iclip (2.1) → không emit từ style.
 *
 * segmentSub (ruột chữ — typography + trang trí, tag 2.4/2.3):
 *   - font/color/weight/style/decoration/letter-spacing + line-height, transform (R1+R3),
 *     outline/shadow (borderStyle 1) hoặc box (borderStyle 3), kèm CSS variables số liệu thô.
 *   - transform: CHỈ emit khi khác identity (R3); rotate(-angle) đứng TRƯỚC scaleX/scaleY (R1 —
 *     CSS áp phải→trái khớp VSFilter, và \frz dương của ASS quay ngược chiều nên đổi dấu).
 *   - borderStyle 1: -webkit-text-stroke-width = outline × 2 (ADR 0007) + paint-order 'stroke fill
 *     markers'; --outline-width vẫn giữ giá trị GỐC (số thô cho tag override/renderer).
 *   - borderStyle 3: không stroke (reset về 0/transparent + paint-order normal + text-shadow none);
 *     background-color = outlineColour, padding = \bord, margin-left/right = -\bord (bù), box-shadow.
 *
 * data (số liệu cho renderer): CHƯA CHỐT (19sep26) → cố ý để TRỐNG {}. Bổ sung @property vào
 * typedef dataCss tới đâu thì điền tới đó; KHÔNG bê nguyên data cũ ({...style, isBox, hAlign,
 * transformOrigin, styleIndex}) của styleParsedToCss vào (chủ repo chốt 29sep26).
 *
 * @param {parsedDataFormat.style} style Style đã chuẩn hóa.
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — chỉ đọc WrapStyle cho globalCss.
 * @returns {{lineSub: Object, segmentSub: Object, data: Object}} lineSub (vỏ dòng), segmentSub (ruột chữ), data (trống, chờ chốt).
 */
function styleToCss (style, info = {}) {
	const alignment = style.alignment;
	// hAlign: 1,4,7 → left; 2,5,8 → center; 3,6,9 → right
	const hAlign = alignment % 3 === 1 ? 'left' : alignment % 3 === 2 ? 'center' : 'right';
	// transform-origin theo anchor \an (để \fr* quay quanh đúng điểm neo) — map hoisted; \org (2.2) ghi đè.
	const transformOrigin = TRANSFORM_ORIGIN_MAP[alignment] || '50% 50%';
	// borderStyle 3: opaque box; 1: viền thường (stroke + shadow bám chữ).
	const isBox = style.borderStyle === 3;
	// globalCss chuẩn (frozen, cache theo WrapStyle) — spread vào lineSub, không merge ở renderer.
	const globalCss = cachedGlobalCss(info);

	// lineSub: định vị + wrap + gốc quay. KHÔNG chứa font/color/box.
	const lineSub = {
		'display': 'inline-block',
		'position': 'absolute', // renderer set left/top/right/bottom theo \an + margin + \pos/\move
		'text-align': hAlign,   // \an (2.2) ghi đè
		...globalCss,           // white-space/word-break/overflow-wrap/text-wrap/max-width
		'transform-origin': transformOrigin, // LUÔN emit; \org (2.2) ghi đè. clip-path chỉ có khi \clip/\iclip (2.1).
	};

	// text-decoration gốc từ style.underline/strikeOut; \u,\s (2.3) ghi đè.
	const decoration = [style.underline ? 'underline' : '', style.strikeOut ? 'line-through' : '']
		.filter(Boolean).join(' ') || 'none';

	// transform (R1+R3): CHỈ emit khi KHÁC identity; rotate(-angle) TRƯỚC scaleX/scaleY.
	const transformParts = [];
	if (style.angle !== 0) transformParts.push(`rotate(${-style.angle}deg)`);
	if (style.scaleX !== 100) transformParts.push(`scaleX(${style.scaleX / 100})`);
	if (style.scaleY !== 100) transformParts.push(`scaleY(${style.scaleY / 100})`);

	// segmentSub: typography + line-height (19sep26 xuống đây) + transform + outline/shadow hoặc box.
	const segmentSub = {
		'font-family': `"${style.fontName}", sans-serif`,
		'font-size': `${style.fontSize}px`,   // PlayRes px; \fs (2.4.1) ghi đè, renderer scale sau
		'line-height': `${style.fontSize}px`, // 19sep26: mức segment, đổi cùng \fs
		'color': style.primaryColour,
		'font-weight': style.bold ? '700' : '400',
		'font-style': style.italic ? 'italic' : 'normal',
		'text-decoration': decoration,
		'letter-spacing': `${style.spacing}px`,
		// R3: key transform chỉ xuất hiện khi thật sự cần (tránh compositing thừa).
		...(transformParts.length ? { 'transform': transformParts.join(' ') } : {}),
		'paint-order': isBox ? 'normal' : 'stroke fill markers',
		...(isBox ? {
			// borderStyle 3: KHÔNG stroke chữ (reset đủ bộ để renderer reuse node không dính cache),
			// outlineColour là MÀU NỀN box, \bord là padding, kèm bù margin âm giữ advance width.
			'-webkit-text-stroke-width': '0px',
			'-webkit-text-stroke-color': 'transparent',
			'text-shadow': 'none',
			'background-color': style.outlineColour,
			'padding': `${style.outline}px`,
			'margin-left': `-${style.outline}px`,
			'margin-right': `-${style.outline}px`,
			'box-shadow': style.shadow ? `${style.shadow}px ${style.shadow}px ${style.backColour}` : 'none',
		} : {
			// borderStyle 1: stroke ×2 (ADR 0007) — vẽ cân giữa đường bao glyph, paint-order 'stroke fill'
			// để fill che nửa trong → nửa ngoài đúng \bord px như Aegisub; shadow bám chữ (text-shadow).
			'-webkit-text-stroke-width': style.outline ? `${style.outline * 2}px` : '0px',
			'-webkit-text-stroke-color': style.outlineColour,
			'text-shadow': style.shadow ? `${style.shadow}px ${style.shadow}px ${style.backColour}` : 'none',
		}),
		// CSS variables giữ SỐ LIỆU THÔ cho tag override (2.3) + renderer đọc lại (không parse ngược CSS).
		'--primary-color': style.primaryColour,
		'--secondary-color': style.secondaryColour,
		'--outline-color': style.outlineColour,
		'--back-color': style.backColour,
		'--outline-width': `${style.outline}px`, // GỐC (CHƯA ×2)
		'--shadow-depth': `${style.shadow}px`,   // max(|x|,|y|); style gốc x=y=shadow
		'--font-size': `${style.fontSize}px`,    // GỐC của \fs
	};

	// data: CHƯA CHỐT (19sep26) — để trống, bổ sung khi typedef dataCss được điền @property.
	const data = {};

	return { lineSub, segmentSub, data };
}


/** [arena.ai] to-do: sửa hàm này. Chuyển đổi style đã chuẩn hóa thành object CSS.
 * 31aug26 — Chú ý 2 pipeline: container chứa sẵn globalCss (chuẩn); delta theo mức node
 *           {container, text, data} cho classify (bước 4-7) — xem typedef
 *           parsedDataFormat.baseItemDelta bên dưới baseFromTokens.
 *
 * Triết lý:
 * - Parser KHÔNG đo chữ thật, KHÔNG scale sang video thật. Mọi px giữ theo PlayRes.
 * - Renderer mới scale (videoSize / PlayRes) và đo chữ thật (pretext).
 *
 * container (vỏ ngoài — định vị dòng):
 *   - Nhiệm vụ: đặt khung dòng trong video theo \an + marginL/R/V (+ \pos/\move sau này).
 *   - Chứa: display, position, text-align (từ \an), line-height,
 *           bộ globalCss chuẩn (white-space/word-break/overflow-wrap/text-wrap/max-width,
 *           31aug26 Chú ý 2: nhúng sẵn, không phải merge ở renderer),
 *           background/box-shadow khi borderStyle==3 (opaque box).
 *   - KHÔNG chứa font/color/transform — những thứ đó thuộc text.
 *   - alignment → hAlign (left/center/right) để set text-align, và transformOrigin cho \fr.
 *
 * text (ruột — chữ):
 *   - Nhiệm vụ: typography gốc của dòng, làm base cho delta tag \b,\i,\fn,\fs,\fsc,\fsp,\fr,\c...
 *   - Chứa: font-family, font-size (PlayRes px), color (primaryColour),
 *           font-weight/style, text-decoration (u/s), letter-spacing (fsp),
 *           transform (02sep26 — review từ hàm cũ styleObjToCss): CHỈ emit khi khác identity
 *             (R3 — scaleX/Y=100 và angle=0 thì KHÔNG có key transform, tránh compositing thừa);
 *             thứ tự chuỗi: rotate TRƯỚC scale (R1 — CSS áp phải→trái: scale trước, xoay sau,
 *             khớp VSFilter scale glyph rồi mới xoay) và rotate(-angle) (R1 — \frz dương của ASS
 *             quay NGƯỢC chiều kim đồng hồ, CSS rotate dương quay THUẬN → phải đổi dấu).
 *             transform-origin từ \an LUÔN emit (vô hại, sẵn cho tag \fr override sau).
 *           outline/shadow: nếu borderStyle==1 dùng -webkit-text-stroke + text-shadow,
 *             (02sep26 — chốt Chromium 131+): stroke-width = outline * 2 vì -webkit-text-stroke
 *             vẽ viền CÂN GIỮA đường bao glyph (nửa trong nửa ngoài) còn \bord của Aegisub vẽ
 *             HOÀN TOÀN ra ngoài; nhân đôi + paint-order stroke fill (Chromium 123+ mới áp dụng
 *             cho HTML text) → nửa trong bị fill che, nửa ngoài đúng outline px như Aegisub.
 *             --outline-width vẫn giữ giá trị GỐC outline (số liệu thô cho tag override/renderer).
 *           nếu borderStyle==3 thì không stroke (box lo chứa background).
 *   - Kèm CSS variables --primary/--secondary/--outline/--back để tag \1c..\4c override nhanh.
 *
 *  * data (bổ sung — renderer tính toán):
 *   - 02sep26 (tối ưu): data = { ...style } (spread toàn bộ field style gốc — field mới tự theo,
 *     không liệt kê tay 20+ field) + các field suy ra TỪ STYLE: isBox, hAlign, transformOrigin,
 *     styleIndex (02sep26 — chỉ số trong parsedData.styles, chuyển từ lineCss vào đây).
 *   - 02sep26 (chốt vai trò từng thuộc tính — tránh đổi nhầm):
 *     + marginL/R/V → DÙNG CHO ĐỊNH VỊ dòng (safe margin): renderer set left/top/right/bottom
 *       theo \an + margin + \pos/\move, rồi scale về videoSize/PlayRes. KHÔNG phải padding box.
 *     + Khi borderStyle==3 (opaque box), PADDING của box chính là OUTLINE (\bord) — cụ thể
 *       'padding': outline px, 'background-color': outlineColour, 'box-shadow': shadow+backColour.
 *       Margin KHÔNG tham gia padding box (đó là vị trí, không phải độ đệm quanh chữ).
 *     + hAlign (left/center/right) → text-align / transform-origin; nằm trong data cho renderer.
 *   - 02sep26 bản 3: KHÔNG lưu playResX/playResY/scaledBorderAndShadow vào data nữa —
 *     chúng là hằng số TOÀN FILE, đã có trong parsedData.info (renderer nhận cả parsedData);
 *     duplicate vào từng style vừa thừa vừa rủi ro stale (file dị dạng đặt [V4+ Styles]
 *     trước [Script Info] → data chụp fallback, info sau đó mới có giá trị thật).
 *
 * @param {parsedDataFormat.style} style Style đã chuẩn hóa.
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — chỉ dùng lấy globalCss (WrapStyle) nhúng vào container (02sep26 bản 3).
 * @param {number} [styleIndex=-1] Chỉ số của style trong parsedData.styles (02sep26 — lưu vào data.styleIndex; -1 nếu gọi rời không biết chỉ số).
 * @returns {{container: Object, text: Object, data: Object}}
 */
function styleParsedToCss (style, info = {}, styleIndex = -1) {
	const alignment = style.alignment;
	// hAlign: 1,4,7 → left; 2,5,8 → center; 3,6,9 → right
	const hAlign = alignment % 3 === 1 ? 'left' : alignment % 3 === 2 ? 'center' : 'right';
	// transform-origin theo anchor \an (để \fr quay quanh đúng điểm neo) — map hoisted
	const transformOrigin = TRANSFORM_ORIGIN_MAP[alignment] || '50% 50%';
	// 3: box, 1: thường
	const isBox = style.borderStyle === 3;
	/** cache để tối ưu */
	const globalCss = cachedGlobalCss(info);
	// container: định vị, không chứa font
	// nhúng globalCss vào container: white-space/word-break/overflow-wrap/text-wrap/max-width
	const container = {
		'display': 'inline-block',
		'position': 'absolute', // renderer sẽ set left/top/right/bottom theo an + margin + pos/move
		'text-align': hAlign,
		'line-height': `${style.fontSize}px`, // to-do: line-height theo text/segment, ko phải container/line
		...globalCss, // globalCssFromInfo(info): chuẩn wrap/khung dòng, renderer không cần merge riêng
		...(isBox ? {
			// borderStyle 3: opaque box — theo spec Aegisub, outlineColour là màu nền box,
			// outline là padding của box, shadow là box-shadow (hoặc vẫn là text-shadow? tạm dùng box-shadow)
			'background-color': style.outlineColour,
			'padding': `${style.outline}px`,
			'box-shadow': style.shadow ? `${style.shadow}px ${style.shadow}px ${style.backColour}` : 'none',
		} : {
			'background-color': 'transparent',
		}),
	};

	const decoration = [style.underline ? 'underline' : '', style.strikeOut ? 'line-through' : ''].filter(Boolean).join(' ') || 'none';

	// transform (02sep26 — R1+R3, review từ hàm cũ styleObjToCss):
	// R3: chỉ emit key transform khi KHÁC identity (đa số style thường sẽ không có key này).
	// R1: rotate đứng TRƯỚC trong chuỗi (CSS áp phải→trái = scale trước, xoay sau — khớp VSFilter)
	//     và rotate(-angle) vì \frz dương của ASS quay ngược chiều kim đồng hồ, CSS thì thuận.
	const transformParts = [];
	if (style.angle !== 0) transformParts.push(`rotate(${-style.angle}deg)`);
	if (style.scaleX !== 100) transformParts.push(`scaleX(${style.scaleX / 100})`);
	if (style.scaleY !== 100) transformParts.push(`scaleY(${style.scaleY / 100})`);

	// text: typography + base transform + outline/shadow
	const text = {
		'font-family': `"${style.fontName}", sans-serif`,
		'font-size': `${style.fontSize}px`, // PlayRes px, renderer scale và CSSResize sau: videoHeight/PlayResY
		'color': style.primaryColour,
		'font-weight': style.bold ? '700' : '400',
		'font-style': style.italic ? 'italic' : 'normal',
		'text-decoration': decoration,
		'letter-spacing': `${style.spacing}px`,
		// R3 (02sep26): không có transform identity — key chỉ xuất hiện khi thật sự cần
		...(transformParts.length ? { 'transform': transformParts.join(' ') } : {}),
		'transform-origin': transformOrigin,
		'paint-order': 'stroke fill markers', // để stroke không che fill khi dùng -webkit-text-stroke
		// CSS variables cho tag override nhanh (\c, \2c, \3c, \4c, \bord, \shad)
		'--primary-color': style.primaryColour,
		'--secondary-color': style.secondaryColour,
		'--outline-color': style.outlineColour,
		'--back-color': style.backColour,
		'--outline-width': `${style.outline}px`,
		'--shadow-depth': `${style.shadow}px`,
		'--font-size': `${style.fontSize}px`,
		...(isBox ? {
			// R2 (02sep26 — adopt từ hàm cũ styleObjToCss): reset ĐỦ BỘ khi box —
			// thêm stroke-color transparent + paint-order normal (đè 'stroke fill markers' phía trên)
			// để renderer reuse node không dính cache style của nhánh outline.
			'-webkit-text-stroke-width': '0px',
			'-webkit-text-stroke-color': 'transparent',
			'paint-order': 'normal',
			'text-shadow': 'none',
		} : {
			// 02sep26 (chốt Chromium 131+): outline * 2 — stroke vẽ cân giữa, fill che nửa trong
			// (paint-order stroke fill, HTML text cần Chromium 123+) → viền ngoài đúng outline px như \bord.
			'-webkit-text-stroke-width': style.outline ? `${style.outline * 2}px` : '0px',
			'-webkit-text-stroke-color': style.outlineColour,
			'text-shadow': style.shadow ? `${style.shadow}px ${style.shadow}px ${style.backColour}` : 'none',
		}),
	};

	// data (02sep26 — tối ưu): spread toàn bộ style gốc + field suy ra TỪ STYLE. Field style mới
	// tự theo, không cần liệt kê tay. styleIndex chuyển từ lineCss vào đây (chốt 02sep26).
	// 02sep26 bản 3: BỎ playResX/playResY/scaledBorderAndShadow — renderer đọc từ parsedData.info
	// (hằng số toàn file, 1 nguồn sự thật, tránh stale khi section đặt sai thứ tự).
	// 02sep26 (chốt): marginL/R/V là ĐỊNH VỊ dòng (renderer set left/top/right/bottom theo
	// \an + margin + \pos/\move). KHÔNG dùng làm padding box — padding box khi borderStyle==3
	// là OUTLINE (\bord), như ở container phía trên. Tránh đổi margin thành padding.
	const data = {
		...style,
		isBox,
		hAlign,
		transformOrigin,
		styleIndex,
	};

	return { container, text, data };
}
/** [arena.ai] Token là marker đứng riêng {\h} / {\N} / {\n} (renderer quyết định ngữ nghĩa) không? */
function isStandaloneToken(tok) {
	return tok === '{\\h}' || tok === '{\\N}' || tok === '{\\n}';
}
/** [arena.ai] Lấy style ĐÃ CHUẨN HÓA của 1 dòng Dialogue (lookup theo orgline.style — tên style)
 * trong parsedData.styles. Dùng làm styleRef cho classify() (base style cho \r / \fn rỗng...).
 * Không tìm thấy (thiếu style, name rỗng lạ, style lỗi bị loại khi push) → fallback
 * FALLBACK_DEFAULT_STYLE (const frozen — chỉ đọc, an toàn chia sẻ). @type {function}
 * @param {Object} orgline Dòng Dialogue đã parse (có trường style = tên style).
 * @param {parsedDataFormat.global} parsedData parsedData đang xây (styles đã push từ [V4+ Styles]).
 * @returns {parsedDataFormat.style} Style chuẩn của dòng (hoặc fallback).
 */
function styleForLine(orgline, parsedData) {
	const found = parsedData.styles.find(style => style.name === orgline.style);
	return found ?? FALLBACK_DEFAULT_STYLE;
}
/** [arena.ai] Tokenize + làm sạch nội dung dòng (tiền xử lí tag override).
 *
 * Mục tiêu: biến line.text thô (một chuỗi đan xen text thường và tag {...}) thành một mảng
 * token ĐÃ LÀM SẠCH — để bước sau (baseFromTokens) chỉ việc ghép tag + text thành base
 * mà không cần bận tâm các "lỗi đánh máy" hay gặp: tag rỗng, tag comment thuần, 2 tag liền
 * nhau, tag bắt đầu bằng comment lẫn '\', \{ \}, '{' không đóng, '}' thừa...
 *
 * CÁCH HOẠT ĐỘNG (phần lõi là 1 vòng quét regex + 2 biến trạng thái):
 * - Quét text bằng 1 regex duy nhất chia thành các nhánh:
 *     /\\\{|\\\}|\{|\}|\\h|\\n|\\N/g
 * - Giữ 2 biến trạng thái trong lúc quét:
 *     + endIndex: vị trí BẮT ĐẦU của đoạn text chưa xử lí (phần text thường chưa đẩy).
 *     + tagStartIndex: vị trí '{' của tag đang mở; -1 khi KHÔNG nằm trong tag nào.
 * - Với mỗi match, hành vi rẽ nhánh theo ký tự khớp được:
 *
 *   1) \{  hoặc  \}   (dấu ngoặc được escape):
 *        Bỏ qua (continue) — nó nằm lại trong phần text thường, KHÔNG tạo token riêng.
 *        Renderer sẽ unescape \{ \} ở tầng cuối (khi không còn cần phân biệt text/tag).
 *
 *   2) \h / \N / \n   (marker đứng riêng, ngoài tag):
 *        Nếu ĐANG NGOÀI tag (tagStartIndex === -1): đẩy đoạn text trước nó, rồi đẩy marker
 *        được BỌC thành {\h} / {\N} / {\n} như 1 token riêng (để renderer quyết định ngữ nghĩa
 *        dấu cách / xuống dòng theo WrapStyle / \q), cuối cùng cập nhật endIndex vượt qua nó.
 *        Nếu ĐANG TRONG tag: bỏ qua (marker nằm nguyên trong tag token, không bọc riêng).
 *
 *   3) {   (mở tag):
 *        Nếu ĐANG NGOÀI tag: đẩy đoạn text trước nó, đặt tagStartIndex = match.index,
 *        endIndex = match.index (giữ nguyên '{' — nếu tag không đóng thì '{' thành text,
 *        tránh nhân đôi). Nếu ĐANG TRONG tag: bỏ qua ('{' lồng nhau chỉ là text của tag).
 *
 *   4) }   (đóng tag):
 *        Nếu ĐANG TRONG tag (tagStartIndex > -1): đẩy token là đoạn
 *        text.slice(tagStartIndex, regex.lastIndex) (từ '{' đến VỊ TRÍ SAU '}'), cập nhật
 *        endIndex, reset tagStartIndex = -1 (hết tag). '}' THỪA (không có '{' trước): bỏ qua.
 *
 * - SAU KHI quét hết, nếu còn text sót lại (endIndex < text.length):
 *     + Nếu token cuối của result KHÔNG kết thúc bằng '}' (tức là text thường / còn '{' không
 *       đóng) → NỐI đoạn còn lại vào token đó (gộp text liền mạch — xử lí ca '{' không đóng).
 *     + Ngược lại (token cuối là 1 tag/marker đóng bằng '}') → đẩy đoạn còn lại thành token mới.
 *
 * - TOKEN ĐẦU RA có 2 loại, phân biệt bằng việc có bao ngoặc {} hay không:
 *     + TEXT token: không có ngoặc — text thường (kể cả '{' không đóng, \{ \}).
 *     + TAG token: có ngoặc {...}, chứa 1+ tag đơn bắt đầu bằng '\' (đã strip phần trước '\' đầu).
 *
 * @param {string} text line.text dạng raw (chưa stringify).
 * @returns {Array<string>} tokens: text (không bao ngoặc) và tag (có bao ngoặc {}).
 *   - \h / \N / \n đứng NGOÀI tag → wrap thành {\h} / {\N} / {\n} riêng biệt, GIỮ NGUYÊN để
 *     renderer quyết định ngữ nghĩa (dấu cách / xuống dòng, theo WrapStyle / \q).
 *   - Tag {..}: bỏ tag rỗng/comment (không có '\'), strip phần trước '\' đầu tiên, hợp nhất 2 tag
 *     liền nhau (}{) — TRỪ marker {\h}/{\N}/{\n}.
 * 	 - Nếu 1 trong 2, hoặc cả 2 tag chứa karaoke (\k/\K/\kf/\ko) thì vẫn hợp nhất bình thường.
 *   - \{ \} giữ nguyên văn, unescape ở tầng cuối (renderer).
 */
function tokenizeLineText(text) {
	const result = [];
	const regex = /\\\{|\\\}|\{|\}|\\h|\\n|\\N/g;
	let endIndex = 0;
	let tagStartIndex = -1;
	let match;

	/** Đẩy 1 token vào result, áp quy tắc làm sạch / hợp nhất RIÊNG cho tag.
	 *
	 * Các nhánh (kiểm tra theo thứ tự):
	 * 1. tok rỗng ('') → bỏ qua.
	 * 2. Không phải tag (không vừa bắt đầu '{' vừa kết thúc '}') → đẩy NGUYÊN text token.
	 * 3. Là tag nhưng không có '\' ở vị trí >= 1 (VD {abc} — tag comment thuần) → bỏ qua.
	 * 4. Là tag có '\' → strip hết phần trước '\' ĐẦU TIÊN (bỏ '{' và phần comment dẫn đầu),
	 *    rồi bọc lại trong { } thành cleaned (VD {abc\b1} → {\b1}).
	 * 5. cleaned là marker đứng riêng {\h}/{\N}/{\n} → đẩy NGAY, không bao giờ merge.
	 * 6. Ngược lại, nếu token trước trong result cũng là tag (không phải marker) → HỢP NHẤT
	 *    2 tag: bỏ '}' của token trước và '{' của cleaned, ghép thành 1 tag liền
	 *    (VD {\b1} + {\i1} → {\b1\i1}). Quy tắc này vẫn áp dụng khi một hoặc cả hai tag
	 *    chứa karaoke (\k/\K/\kf/\ko).
	 * 7. Còn lại → đẩy cleaned như 1 tag mới.
	 *
	 * Lưu ý: chỉ TAG mới được sửa/merge; TEXT luôn đẩy nguyên (như nhánh 2).
	 *
	 * @param {string} tok Chuỗi con cắt từ text: có thể là text thường hoặc 1 tag {...}.
	 * @returns {void}
	 */
	const pushToken = (tok) => {
		// tok text trống thì bỏ qua
		if (tok === '') return;
		// Text → đẩy nguyên (merge chỉ áp cho tag).
		if (!(tok.startsWith('{') && tok.endsWith('}'))) {
			result.push(tok);
			return;
		}
		// Tag: bỏ comment thuần + strip phần trước dấu '\' đầu tiên.
		const firstSlash = tok.indexOf('\\', 1);
		if (firstSlash === -1) return; // không có '\' → comment thuần, bỏ
		const cleaned = '{' + tok.slice(firstSlash);
		// Marker {\h}/{\N}/{\n} luôn đứng riêng, không merge.
		if (isStandaloneToken(cleaned)) {
			result.push(cleaned);
			return;
		}
		const prev = result[result.length - 1];
		// Nếu token trước là tag (không phải marker) → merge 2 tag liền nhau
		if (prev !== undefined && prev.startsWith('{') && prev.endsWith('}')
			&& !isStandaloneToken(prev)) {
			result[result.length - 1] = prev.slice(0, -1) + cleaned.slice(1);
		} else { // Nếu ko thì push cleaned như 1 tag mới
			result.push(cleaned);
		}
	};

	while ((match = regex.exec(text)) !== null) {
		const char = match[0];
		if (char === '\\{' || char === '\\}') continue; // literal brace, unescape sau
		if (char === '\\h' || char === '\\N' || char === '\\n') {
			if (tagStartIndex === -1) { // chỉ wrap khi đứng ngoài tag
				pushToken(text.slice(endIndex, match.index));
				pushToken(`{${char}}`);
				endIndex = regex.lastIndex;
			}
			continue;
		}
		if (char === '{') {
			if (tagStartIndex === -1) {
				pushToken(text.slice(endIndex, match.index));
				tagStartIndex = match.index;
				endIndex = match.index; // { không đóng → giữ nguyên văn, không nhân đôi
			}
			continue;
		}
		if (char === '}') {
			if (tagStartIndex > -1) {
				pushToken(text.slice(tagStartIndex, regex.lastIndex));
				endIndex = regex.lastIndex;
				tagStartIndex = -1;
			}
			// } thừa (không có { trước) → bỏ qua
		}
	}
	if (endIndex < text.length) {
		const lastText = text.slice(endIndex);
		const last = result[result.length - 1];
		if (last !== undefined && !last.endsWith('}')) {
			result[result.length - 1] = last + lastText;
		} else {
			pushToken(lastText);
		}
	}
	return result;
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
/** [arena.ai] Tách nội dung 1 tag token (không bao ngoặc) thành các tag đơn theo '\' ở mức ngoặc ngoài cùng.
 * Theo dõi độ sâu ngoặc '()' nên tag trong \t(...)/\clip(...) không bị tách oan.
 * @param {string} content Nội dung trong {...} (vd: "\\bord2\\t(\\fs30)\\c&HFF&").
 * @returns {Array<string>} Các tag đơn, mỗi phần tử bắt đầu bằng '\', raw nguyên văn; content không chứa '\' → [].
 */
function splitOverrideTags(content) {
	const tags = [];
	/**
	 * Đẩy 1 tag đã cắt vào tags. BỎ tag rác: tag chỉ có mỗi '\' (length 1 — không có ký tự lệnh
	 * theo sau). Xảy ra khi content chứa 2 dấu '\' LIỀN NHAU kiểu "\b1\\i1" (file lỗi / double-escape):
	 * '\' thứ 2 tự nó thành 1 tag "rỗng" → bỏ, không cho lọt vào tags.
	 * Tag '\' + ký tự bất kỳ (\b, \1c, \fs30, \bord2...) đều là tag thật → KHÔNG lọc thêm.
	 * @param {string} tagChunk Đoạn tag từ '\' mở đầu (tối thiểu là '\').
	 * @returns {void}
	 */
	function pushTag(tagChunk) {
		if (tagChunk.length > 1) tags.push(tagChunk);
	}
	let depth = 0;
	let start = -1; // vị trí '\' mở đầu tag đang dở (ngoài ngoặc)
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		if (ch === '(') { depth++; }
		else if (ch === ')') { if (depth > 0) depth--; }
		else if (ch === '\\' && depth === 0) {
			if (start !== -1) pushTag(content.slice(start, i));
			start = i;
		}
	}
	if (start !== -1) pushTag(content.slice(start));
	return tags;
}
/** [arena.ai] Đổi tokens (đầu ra của tokenizeLineText) thành danh sách base.
 * @param {Array<string>} tokens Tokens từ tokenizeLineText (text không bao ngoặc / tag có bao ngoặc {}).
 * @returns {Array<parsedDataFormat.baseItem>} Danh sách mục base theo thứ tự trong dòng.
 */
function baseFromTokens(tokens) {
	const base = [];
	if (!Array.isArray(tokens)) return base;
	/** Các tag đơn đang chờ text token kế tiếp. @type {string[]} */
	let pendingTags = [];
	for (const tok of tokens) {
		if (tok.startsWith('{') && tok.endsWith('}')) {
			// Marker {\h}/{\N}/{\n} → mục base RIÊNG tại đúng vị trí (text rỗng); pending giữ nguyên.
			if (isStandaloneToken(tok)) {
				base.push({ tags: [tok.slice(1, -1)], text: '' });
				continue;
			}
			// Tag token thường → tách thành các tag đơn, gộp vào pending (các tag token liền nhau chung 1 mục base).
			pendingTags.push(...splitOverrideTags(tok.slice(1, -1)));
			continue;
		}
		// Text token → đóng 1 mục base với mọi tag đang chờ.
		base.push({ tags: pendingTags, text: tok });
		pendingTags = [];
	}
	// Tag token THƯỜNG cuối dòng không có text theo sau → BỎ (không tạo mục base — chốt 27aug26).
	// Marker không rơi vào đây vì đã flush thành mục base riêng ngay khi gặp.
	return base;
}
// Mẫu text của các line [Events] trong file sub
// [Events]
// Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
// Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0000,0000,0000,,
// (Chỉnh sửa để dễ đọc hơn):
// Format:      Layer,  Start,      End,        Style,    Name,   MarginL,  MarginR,  MarginV,  Effect, Text
// Dialogue:    0,      0:00:00.00, 0:00:05.00, Default,      ,   0000,     0000,     0000,          ,
// định dạng:	index,  h:mm:ss.cs, h:mm:ss.cs, string,   string, px,       px,       px,       string  string
// !: Margin có thể là 0000 (undefined chuyển thành) hoặc 0 (defined). Xử lí cả 2 như giá trị 0
// !: Name trong Aegisub chính là line.actor. Nếu trong line.actor có dấu "," thì sẽ bị lưu thành ";".
// utils: cung cấp logger(message, type = 'info', ...extra); dùng log/warn bên dưới.
/** Hàm đọc text của file Aegisub.
 * @param {boolean} doStripTags Chế độ xử lí tag cho processLineText() (chốt 02sep26, bản 2 — boolean):
 *   truthy (true, 1, 'x'...) → STRIP: xóa hết tag trong text (như Aegisub strip tags, marker \N/\h/\n giữ nguyên văn);
 *   falsy (false, 0, undefined, null, NaN, ''...) → xử lí tất cả tag như bình thường (mặc định an toàn).
 * @param {string} rawText Nội dung file ASS đầu vào dưới dạng text.
 * @returns {parsedDataFormat.global} Object chứa dữ liệu parser đã chuẩn hóa và CSS tương ứng.
 */
export function parser(doStripTags = false, rawText) {
	/** Dữ liệu tệp phụ đề.
	 * 
	 * Info lưu dưới dạng obj do file sub có cấu trúc key: value
	 * 
	 * Styles và Events lưu dưới dạng array do có cấu trúc khác so với Info, và trong Lua Automation của Aegisub cũng xử lí tương tự.
	 * @type {parsedDataFormat.global} */
	const parsedData = { info: {}, styles: [], events: [], globalCss: {}, styleCss: [], lineCss: [] };
	if (!rawText) {
		utils.warn(`${parserLogPrefix} Đã có ai làm gì đâu? Đã làm gì đâu? (cố tình nạp rawText trống?)`);
		return parsedData; // Nếu ko có rawText, trả về Data trống và gửi log lỗi text trống.
	}; // Chú ý: parser ko biết trước việc text có các phần chia section hay ko. Sẽ gặp lỗi nếu ko có chia section.
	/** Mảng các dòng text của file ASS sau khi tách theo dòng mới.
	 * 
	 * Đặt tên là subtitles để tương ứng với array subtitles trong Lua Automation của Aegisub.
	 * @type {string[]}
	 */
	const subtitles = rawText.split(/\r?\n/);
	// fallback nếu file sub ko có info
	parsedData.info.WrapStyle = 0;                 // mặc định: smart wrapping, top line is wider
	parsedData.info.PlayResX = 640;                // fallback PlayResX
	parsedData.info.PlayResY = 480;                // fallback PlayResY
	parsedData.info.ScaledBorderAndShadow = false; // mặc định: outline/shadow không scale theo video
	/** Phần hiện tại đang được xử lý trong file ASS, ví dụ [Script Info], [V4+ Styles] hoặc [Events].
	 * @type {string}
	 */
	let currentSection = '';
	/** Danh sách tên trường của section styles theo đúng thứ tự trong dòng Format.
	 * @type {string[]}
	 */
	let styleFormat = [];
	/** Danh sách tên trường của section events theo đúng thứ tự trong dòng Format.
	 * @type {string[]}
	 */
	let eventFormat = [];
	// Array vì các key và value theo trật tự trong mỗi dòng, và dòng Format (của cả 2 phần) có trật tự cố định
	/** Dòng text sau khi tách ban đầu, đầu vào xử lí thô.
	 * @type {string}
	 */
	let line;
	for (line of subtitles) { // Xét các dòng dữ liệu trong file. line = subtitles[i] (hoặc subs[i]. Subscribe?)
		line = line.trimStart(); // Xóa khoảng trắng ở đầu dòng dữ liệu (ko cần thiết?)
		if (!line || line.startsWith(';')) { continue }; 
		// Nếu line trống (""), hoặc bắt đầu bằng ";" thì bỏ qua. ";" là phần credit của app (trong phần Script Info).
		if (line.startsWith('[') && line.endsWith(']')) { currentSection = line.trim(); continue; } // Lưu phân đoạn
		/** Cho biết dòng hiện tại là phần nối tiếp của dialogue bị ngắt dòng hay ko (chỉ hỗ trợ phần Event. #a2).
		 * @type {boolean}
		 */
		let isContinuation = currentSection === '[Events]' && 
		                     !line.startsWith('Dialogue:') && 
		                     !line.startsWith('Comment:') && 
		                     !line.startsWith('Format:');
		if (isContinuation) {
			if (parsedData._lastRawDialogue) {
				parsedData.events.pop(); // Loại bỏ dòng Dialogue bị lỗi, thiếu trường trước đó
				parsedData.lineCss.pop(); // lineCss cùng chỉ số với events → pop theo (1 entry / 1 Dialogue)
				line = parsedData._lastRawDialogue.raw + '\n' + line; // Ghép dòng lỗi đó với dòng hiện tại
				isContinuation = false; // Đánh dấu đã khôi phục xong để tiếp tục parse phía dưới
			} else continue; 
			// Bỏ qua line trong subtitles này, nếu là dòng rác hoặc dòng comment bị lỗi xuống dòng 
			// (ko có _lastRawDialogue mà lại có isContinuation)
		}
		if (!isContinuation) parsedData._lastRawDialogue = null; // Reset trạng thái nếu đây là dòng chuẩn mới
		if (currentSection === '[Script Info]') {
			// Trong đoạn Script Info, lưu các thông số:
			// 		Title: để hiển thị.
			// 		ScriptType: để soát chuẩn
			// 		WrapStyle: để xử lí phụ đề.
			// 		PlayResX: để xử lí phụ đề.
			// 		PlayResY: để xử lí phụ đề.
			// 		ScaledBorderAndShadow: để xử lí phụ đề.
			// Tuy nhiên, ở đây lưu tất cả dữ liệu.
			const [, key, value] = line.match(/^([^:]+):(.*)$/) || []; 
			// gán bằng Regex: tách thành phần trước và sau dấu ":" thứ nhất
			if (key) {
				const k = key.trim(), v = value.trim();
				// chuẩn hóa NGAY KHI LƯU 4 key quan trọng (thay vì để sau loop)
				// để styleCss.push ở phần [V4+ Styles] chạy đúng ngay từ đầu, không cần re-map cuối file.
				parsedData.info[k] =
					k === 'WrapStyle' ? parseClampedNum(true, v, 0, 0, 3) :
					k === 'PlayResX' ? parseClampedNum(true, v, 640, 640) :
					k === 'PlayResY' ? parseClampedNum(true, v, 480, 480) :
					k === 'ScaledBorderAndShadow' ? v === 'yes' :
					v; // key khác: giữ nguyên bản như cũ
				if (k === 'ScriptType' && v !== 'v4.00+') { // Ko đảm bảo nếu ScriptType trong file ko phải v4.00+
					utils.warn(`${parserLogPrefix} Tin... File chuẩn chưa em? (Extension ko hỗ trợ tốt với ScriptType=${v})`);
				}
			}
		} else if (currentSection === '[V4+ Styles]') {
			// Trong đoạn V4+ Styles, dòng format lưu các key, dòng Style lưu value
			if (line.startsWith('Format:')) {
				// Dòng format, ngăn cách tên các key (ở đây coi là value của array) bởi dấu ","
				styleFormat = line.replace('Format:', '').split(',').map(s => s.trim());
				// Lấy text dòng này, xóa "Format:", tách thành 1 array các value ngăn bởi ",", đổi các value thành value.trim().
				// dòng Format có dạng:
				// Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ...
				// Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ...
				// Alignment, MarginL, MarginR, MarginV, Encoding
				// Chú ý: Name của Style đã được Aegisub can thiệp, sẽ ko có dấu "," trong Name. Fontname ko bao giờ có ","
			} else if (line.startsWith('Style:')) {
				// Dòng style lưu các dữ liệu
				/** Tương tự dòng Format, ở đây (dòng các styles) lưu thành mảng các giá trị. */
				const styleValues = line.replace('Style: ', '').split(',').map(s => s.trim());
				// Thực tế thì Aegisub lưu liền nhau chứ ko có dấu cách sau phẩy như Format.
				// Nên là dùng map(s => s.trim()) không cần thiết (lắm?).
                const style = {};
				// Mỗi 1 style trong array styles là 1 obj. (dặt tên để tương đồng với style trong Lua Automation của Aegisub) 
                styleFormat.forEach((styleField, styleIndex) => {
					// Xét với mỗi index (styleIndex)- value (styleField) trong array styleFormat
                    let styleValue = styleValues[styleIndex] || '';
					// Đặt biến tạm thời styleValue lấy bằng styleValues[styleIndex] (hoặc trống nếu i vượt quá. Có thể vượt quá à?) 
                    if (styleField.toLowerCase().includes('colour')) {
						// Nhận diện các styleValue có định dạng màu (tìm theo styleField tương ứng của nó.)
                        styleValue = utils.hexToRgba(styleValue);
						// Đổi định dạng màu.
                    }
                    style[toCamelCase(styleField,styleField.includes("Font") ? [0, 4] : [0])] = styleValue;
					// Lưu dữ liệu vào style[toLowerCaseFirst(styleField)]. Ở đây key (styleField) được xử lí (theo camelCase)
					// Căn bản là đổi kí tự đầu (trong Format, nó luôn là upper) thành lower/upper
					// Riêng Fontname và Fontsize (chứa "Font") thì đổi kí tự đầu ("F") và thứ 4 ("n", "s")
					// VD: Ở đây gọi style.primaryColour thì ở Aegisub là style.color1 (trong môi trường line là line.styleref.color1)
                });
				// Chú ý: Name của Style có thể bỏ trống ('') và vẫn hợp lệ
				// chuẩn hóa + tạo styleCss ngay khi push (đối xứng với events/lineCss)
				// - validateAndNormalizeStyle: fix bug forEach, cho phép name rỗng
				// - trùng tên: last wins (Aegisub ghi đè) → thay thế entry cũ để styles[i] ↔ styleCss[i] luôn đồng bộ
				if (!validateAndNormalizeStyle(style)) {
					// style không hợp lệ → bỏ qua, không push
					utils.log(`${parserLogPrefix} Phát hiện style lỗi, bỏ qua.`,style);
					continue;
				}
				// last-wins cho mọi style, kể cả name=""
				const existingIdx = parsedData.styles.findIndex(s => s.name === style.name);
				if (existingIdx !== -1) {
				parsedData.styles[existingIdx] = style;
				// 02sep26: last-wins giữ NGUYÊN chỉ số cũ → styleIndex = existingIdx
				parsedData.styleCss[existingIdx] = styleParsedToCss(style, parsedData.info, existingIdx);
				continue;
				}
				parsedData.styles.push(style);
				// 02sep26: style vừa push nằm cuối → styleIndex = length - 1 (lưu vào data.styleIndex)
				parsedData.styleCss.push(styleParsedToCss(style, parsedData.info, parsedData.styles.length - 1));
			}
		} else if (currentSection === '[Events]') {
			// Trong đoạn Events, cấu trúc cũng tương tự đoạn Styles.
			if (line.startsWith('Format:')) { // Dòng format.
				eventFormat = line.replace('Format:', '').split(',').map(s => s.trim());
				// Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
				// Chú ý: Name = Actor (trong giao diện Aegisub), Name đã đc Aegisub can thiệp, cấm dấu ","
				// Tuy nhiên, Text sẽ có dấu "," tự do.
      		} else if (line.startsWith('Dialogue:')) { // Dòng Dialogue. (Sẽ không xét các dòng Comment)
				/** Chuỗi nội dung của dialogue sau khi bỏ qua tiền tố "Dialogue: ".
				 * @type {string}
				 */
				const lineData = line.substring('Dialogue: '.length);
				// Bỏ qua chỗ 'Dialogue: ' đầu line.
				/** Array lưu các giá trị của line (tương tự styleValues ở phần Values). 
				 * 
				 * Nhưng thay vì chạy thẳng .split().map() như styleValues, eventValues tách "từ từ" để giữ nguyên phần Text.
				 * @type {string[]}
				 */
				const eventValues = [];
				/** Lưu vị trí dấu phẩy liền trước để bỏ qua nó */
				let lastCommaPos = 0;
				// i < .length -1, hay chạy từ 0 đến .len -2, tức là chạy tất cả format của Events trừ Text.
				for (let i = 0; i < eventFormat.length - 1; i++) {
					/** Lưu vị trí dấu phẩy mới nhất để tách lấy dữ liệu */
					const latestCommaPos = lineData.indexOf(',', lastCommaPos);
					// Nếu ko có dấu phẩy nào nữa thì thoát (do thiếu dấu phẩy? Ko do Aegisub đã chuẩn hóa)
					if (latestCommaPos === -1) break;
					eventValues.push(lineData.substring(lastCommaPos,latestCommaPos).trim());
					// Thực tế thì Aegisub lưu liền nhau chứ ko có dấu cách sau phẩy như Format.
					// Nên là dùng .trim() không cần thiết (lắm?).
					lastCommaPos = latestCommaPos + 1;
				}
				eventValues.push(lineData.substring(lastCommaPos)); // Phần text.
				/** Object chứa dữ liệu dialogue hiện tại sau khi chuyển đổi key.
				 * 
				 * Đặt tên để tương đồng với orgline của Lua Automation trong Aegisub.
				 * @type {Object<string, string|number|boolean>}
				 */
				const orgline = {};
				eventFormat.forEach((eventField, eventIndex) => {
					// Tương tự phần styles, xét với mỗi index (eventIndex) - value (eventField) trong array eventFormat
					/** Đặt biến tạm thời styleValue lấy bằng styleValues[eventIndex] (hoặc trống nếu eventIndex vượt quá. Có thể vượt quá à?) */
					let eventValue = eventValues[eventIndex] || '';
					if (eventField === 'Start' || eventField === 'End') {
						// Nếu là thời gian (định dạng h:mm:ss.cs thì convert)
						orgline[eventField.toLowerCase() + 'Time'] = convertTimeStringToMs(eventValue)
						// Và lưu dưới dạng orgline.startTime/endTime (ở Aegisub là orgline.start_time)
					}
					orgline[toCamelCase(eventField)] = eventValue;
				});
				orgline.raw = line; // Lưu lại chuỗi gốc đề phòng dòng tiếp theo bị ngắt
				parsedData._lastRawDialogue = orgline; // Lưu tham chiếu dòng dialogue mới nhất
				parsedData.events.push(orgline);
				// base (mục base tag-text) của dòng ghi vào lineCss (cùng chỉ số với events), KHÔNG thay đổi orgline.
				// qua classify() → lineCss[i] = { base, collision, clip } — cần styleRef của dòng
				// (style đã chuẩn hóa, lookup theo orgline.style) để \r biết reset về style nào.
				parsedData.lineCss.push(
					classify(processLineText(doStripTags, orgline.text), styleForLine(orgline, parsedData))
				)
    		}
		}
	}
	parsedData.globalCss = globalCssFromInfo(parsedData.info);
	utils.log(`${parserLogPrefix} Đã xử lí xong.`, parsedData);	
	return parsedData;
}