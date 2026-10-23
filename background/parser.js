// v0.1.0 22oct26
// alpha mode
// Chức năng: xử lí kế tiếp, giai đoạn từ có file sub thô (rawText) đến cấu trúc JS (parsedData) và CSS trung gian (globalCss, styleCss, lineCss).
import * as utils from './utils.js';
import { classify } from './tagProcess.js';
/** [Manual edit] Định nghĩa/chú thích object FALLBACK_DEFAULT_STYLE (parsedDataFormat.style) 
 * @typedef {object} parsedDataFormat.style Kiểu style nguyên bản 
 * @property {string} name Tên style (style.name, line.styleref.name, syl.style.name)
 * @property {string} fontName Tên font (\fn)
 * @property {number} fontSize Font size (\fs, px, với PlayRes 640x480)
 * @property {string} primaryColour Màu 1, main (\1c), đã qua utils.hexToRgba, alpha = 1.0 nếu không có \1a
 * @property {string} secondaryColour Màu 2, pre-kara (\2c), đã qua utils.hexToRgba, alpha = 1.0 nếu không có \2a
 * @property {string} outlineColour Màu 3, outline (\3c), đã qua utils.hexToRgba, alpha = 1.0 nếu không có \3a
 * @property {string} backColour Màu 4, shadow (\4c), đã qua utils.hexToRgba, alpha = 1.0 nếu không có \4a
 * @property {boolean} bold In đậm (\b, boolean)
 * @property {boolean} italic In nghiêng (\i, boolean)
 * @property {boolean} underline Gạch dưới (\u, boolean)
 * @property {boolean} strikeOut Gạch ngang (\s, boolean)
 * @property {number} scaleX ScaleX (\fscx, %)
 * @property {number} scaleY ScaleY (\fscy, %)
 * @property {number} spacing Khoảng cách ký tự (\fsp, px)
 * @property {number} angle Góc xoay (\frz, degree)
 * @property {number} borderStyle Kiểu border (1: viền thường, 3: box)
 * @property {number} outline Độ dày viền (\bord, px. Có \xbord và \ybord)
 * @property {number} shadow Độ đổ bóng (\shad, px. Có \xshad và \yshad)
 * @property {number} alignment Căn lề (\an, 1-9 kiểu numpad)
 * @property {number} marginL Lề trái (px)
 * @property {number} marginR Lề phải (px)
 * @property {number} marginV Lề dọc (px)
 * @property {number} encoding Encoding (\fe, nên bị bỏ qua)
 */
/** [Manual edit] Định nghĩa/chú thích object parsedData, sau xử lí 
 * @typedef {object} parsedDataFormat.global Tương ứng với các phần [Script Info], [V4+ Styles], [Events]. Bỏ qua phần [Aegisub Project Garbage].
 * @property {parsedDataFormat.info} info lưu dưới dạng obj do file sub có cấu trúc key: value
 * @property {Array<parsedDataFormat.style>} styles lưu các style của file sub (nếu style không chuẩn thì fallback cả style về FALLBACK_DEFAULT_STYLE)
 * @property {Array<parsedDataFormat.event>} events lưu các events (dialogue) của file sub
 * @property {object} globalCss định dạng các thuộc tính info (có thể chuyển) thành CSS
 * @property {Array<{
 * 	lineSub: parsedDataFormat.lineSubCss, 
 * 	segmentSub: parsedDataFormat.segmentSubCss
 * }>} styleCss định dạng các style thành CSS
 * @property {parsedDataFormat.lineCss} lineCss mỗi phần tử { base, collision, clip } cùng chỉ số với events.
 *   (02sep26: đổi tên segments → base; classify ghi trực tiếp vào base + thêm collision, clip.
 *   03sep26: lineCss[i] = classify(processLineText(...)) — { base, collision, clip }; 2.4 layout +
 *   \t metadata làm thật; 09sep26: karaoke KHÔNG ở 2.4 (về 2.3), 2.3/2.2/2.1 để session sau
 *   — xem background/tagProcess.js)
 */
/** [Manual edit] Định nghĩa/chú thích object parsedData.info sau xử lí 
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
 * @property {number} PlayResX Kích thước video cho xử lí vị trí phụ đề.
 * @property {number} PlayResY Kích thước video cho xử lí vị trí phụ đề.
 * @property {number} LayoutResX Kích thước video cho xử lí hiệu ứng liên quan đến scaleRes.
 * @property {number} LayoutResY Kích thước video cho xử lí hiệu ứng liên quan đến scaleRes.
 */
/** [Manual edit] Định nghĩa/chú thích lineSubCss 
 * @typedef {typeof utils.globalCss & ReturnType<typeof utils.alignmentToCss>} parsedDataFormat.lineSubCss
 * Ghép thuộc tính từ utils.globalCss và utils.alignmentToCss (2.2). to-do: clip (2.1)?
 * 
 * Đo bằng cqw/cqh để giảm khối lượng tính.
 */
/** [Manual edit] Định nghĩa/chú thích các thuộc tính trực tiếp trong segmentSubCss 
 * @typedef {object} parsedDataFormat.segmentSubCssIndependentProperties
 * (Từ "segment" ở đây là đơn vị CSS của renderer, KHÔNG liên quan tới tên cũ "segment → base"
 * 
 * của tokenizer — hai khái niệm khác nhau, không nhầm lẫn, không gộp.)
 * 
 * RUỘT CHỮ của một segment = một đoạn chữ bên trong lineSub, là đơn vị nhỏ nhất mà tag CỤC BỘ
 * 
 * tác động: 2.4 (layout cục bộ: \fs, \fsp, \fsc*, \b, \i, \fn, \r, \q, \-) và 2.3 (trang trí:
 * 
 * màu/alpha, \bord, \shad, \be, \blur, \fa*, \fr*, karaoke).
 *
 * styleParsedToCss dựng bộ GỐC của style; mỗi tag cục bộ chỉ tạo một segment mới ghi đè vài key
 * 
 * (bằng delta, xem lineCss[line index in sub file].base[index segment in line].delta).
 * 
 * Kèm bộ CSS variables giữ SỐ LIỆU THÔ để tag override và renderer đọc lại mà không phải parse ngược CSS.
 *
 * @property {string} display 'inline-block' — segment là transformable box và không auto-wrap.
 * @property {string} --base-style-name tên style gốc để \r rỗng reset.
 * @property {string} --style-name tên style hiệu dụng, để \r<name> đổi style.
 * @property {string} --font-name tên font thô từ style.fontName / \fn.
 * @property {string} font-family 'var(--font-name), sans-serif'.
 * @property {number} --font-size cỡ chữ thô theo PlayRes từ style.fontSize / \fs.
 * @property {number} --css-resize hệ số renderer quy đổi font VSFilter → CSS, ban đầu là 1.
 * @property {string} font-size cỡ chữ CSS theo cqh.
 * @property {string} line-height chiều cao dòng CSS theo cqh.
 * @property {string} --color1 màu chính thô từ style.primaryColour / \1c / \c.
 * @property {string} color 'var(--color1)'.
 * @property {string} --color2 màu phụ thô từ style.secondaryColour / \2c.
 * @property {string} --color3 màu outline thô từ style.outlineColour / \3c.
 * @property {number} --border-style BorderStyle hiệu dụng.
 * @property {string} --color4 màu shadow / box thô từ style.backColour / \4c.
 * @property {string} background-color do outlineStyleToCss() route paint theo BorderStyle.
 * @property {string} -webkit-text-stroke-color do outlineStyleToCss() route paint theo BorderStyle.
 * @property {string} font-weight '400' | '700' | '<weight>' từ style.bold / \b.
 * @property {string} font-style 'italic' | 'normal' từ style.italic / \i.
 * @property {boolean} --underline trạng thái thô của \u.
 * @property {boolean} --strike-out trạng thái thô của \s.
 * @property {string} text-decoration 'underline' | 'line-through' | cả hai | 'none'.
 * @property {number} --spacing khoảng cách chữ thô theo PlayRes từ style.spacing / \fsp.
 * @property {string} letter-spacing khoảng cách chữ CSS theo cqw.
 * @property {number} --outline độ dày \bord thô.
 * @property {string} -webkit-text-stroke-width độ dày stroke CSS do outlineWidthToCss() tạo.
 * @property {string} padding độ nở box / geometry CSS do outlineWidthToCss() tạo.
 * @property {string} margin bù geometry CSS do outlineWidthToCss() tạo.
 * @property {number} --shadow-x offset shadow X thô.
 * @property {number} --shadow-y offset shadow Y thô.
 * @property {string} --blur blur CSS, style gốc là '0px'.
 * @property {string} filter drop-shadow(...) và/hoặc blur(...).
 * @property {string} --inline-fx tên hiệu ứng inline của \-; parser không diễn giải.
 * @property {number} --scale-x scale X thô (%) từ style.scaleX / \fscx.
 * @property {number} --scale-y scale Y thô (%) từ style.scaleY / \fscy.
 * @property {number} --angle-x góc X thô (deg) từ \frx.
 * @property {number} --angle-y góc Y thô (deg) từ \fry.
 * @property {number} --angle-z góc Z thô (deg) từ style.angle / \frz / \fr.
 * @property {string} [transform] chuỗi perspective → fry → frx → frz → scale do scaleAngleToCss() tạo;
 *   chỉ có khi khác identity. transform-origin được renderer tính sau layout cho từng segment.
 */
/** [Copilot] Định nghĩa/chú thích segmentSubCss 
 * @typedef {{ [K in keyof parsedDataFormat.segmentSubCssIndependentProperties]:
 *   parsedDataFormat.segmentSubCssIndependentProperties[K] }
 *   & ReturnType<typeof utils.outlineStyleToCss>
 *   & ReturnType<typeof utils.outlineWidthToCss>
 *   & ReturnType<typeof utils.scaleAngleToCss>
 *   & {
 *     'font-weight': ReturnType<typeof utils.boldToWeight>,
 *     'text-decoration': ReturnType<typeof utils.decorationToCss>,
 *     filter: ReturnType<typeof utils.shadBlurToCss>
 *   }
 * } parsedDataFormat.segmentSubCss
 * Gồm các thuộc tính độc lập và cụm thuộc tính (do các hàm utils xử lí) cho segment 
 * 
 * (tương đương tag 2.4, 2.3)
 */
/** [Manual edit] Định nghĩa/chú thích dataCss 
 * @typedef {object} parsedDataFormat.dataCss các biến dữ liệu chung
 * Ko có gì.
 */
/** [Manual edit] Mẫu style sau chuẩn hóa, với PlayRes 640x480
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
/** [arena.ai] Chuyển tên trường từ định dạng ASS sang camelCase để sử dụng làm key JavaScript.
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
/** [arena.ai] Chuyển thời gian ASS (h:mm:ss.cs) sang mili giây (ms — đơn vị dùng cho CSS timing).
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
/** [Copilot] Parse một giá trị số từ file ASS và trả về mặc định nếu ngoài phạm vi hợp lệ.
 * @param {boolean} isInteger true nếu cần parse kiểu integer, false nếu cần parse kiểu float.
 * @param {string|number} v Giá trị đầu vào.
 * @param {number} def Giá trị mặc định khi parse thất bại.
 * @param {number} [min] Giá trị tối thiểu cho phép.
 * @param {number} [max] Giá trị tối đa cho phép.
 * @returns {number} Giá trị đã parse, hoặc def nếu không hợp lệ/ngoài phạm vi.
 */
function parseClampedNum (isInteger, v, def, min, max) {
	const raw = isInteger ? Number.parseInt(v, 10) : Number.parseFloat(v); 
	return Number.isNaN(raw) || (min != null && raw < min) || (max != null && raw > max) ? def : raw;
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
	return stripped === '' ? [] : [{ tags: [], text: stripped }];
}
/** [Manual edit] Hàm chuyển đổi style đã chuẩn hóa thành object CSS (lineSub, segmentSub, data)
 * 
 * Cấu trúc: node lineSub là parent cho các node segmentSub.
 * 
 * Khung hiển thị: parser chỉ dựa trên PlayRes-LayoutRes. Renderer chỉ xử lí scale và collision,
 * 
 * tất cả dữ liệu khác phải xử lí trước trong tagProcess/parser.
 * @param {parsedDataFormat.style} style Style đã chuẩn hóa.
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — chỉ đọc WrapStyle cho globalCss.
 * @returns {{
 * 	lineSub: parsedDataFormat.lineSubCss, 
 * 	segmentSub: parsedDataFormat.segmentSubCss
 * }} lineSub (vỏ dòng), segmentSub (ruột chữ)
 */
function styleToCss (style, info = {}) {
	// Chú ý vấn đề trùng tên với biến dùng trong page.
	/** @type {parsedDataFormat.lineSubCss} */
	const lineSub = {
		...utils.globalCss,
		...utils.alignmentToCss(style, info.PlayResX, info.PlayResY),
	}
	// const data = {
	// };
	// renderer đặt scale bằng CSS.registerProperty({ name: '--play-res-scale', syntax: '<number>', initialValue: '1', inherits: true });
// to-do: scale gì cơ?
	/** @type {parsedDataFormat.segmentSubCss} */
	const segmentSub = {
		/** Chủ đích không xây dựng tính năng tự động xuống dòng bằng thuộc tính "display: inline" */
		'display': 'inline-block',
		/** Lưu style mặc định để \r rỗng đưa --style-name về. */
		'--base-style-name': style.name, 
		/** Lưu style hiện tại để \r không rỗng ghi dữ liệu vào. */
		'--style-name': style.name, 
		/** Biến ghi tên font (\fn) */
		'--font-name': style.fontName,
		'font-family': `var(--font-name), sans-serif`,
		/** Biến ghi cỡ font (\fs) */
		'--font-size': style.fontSize,
		/** Biến cho renderer ghi hệ số thu phóng chuyển đổi font VSFilter -> CSS. */
		'--css-resize': 1,
		'font-size': `calc(var(--font-size) / ${info.PlayResY} * 100cqh * var(--css-resize))`,
		'line-height': `calc(var(--font-size) / ${info.PlayResY} * 100cqh)`,
		/** Biến ghi màu chính (\1c) */
		'--color1': style.primaryColour,
		'color': `var(--color1)`,
		/** Biến ghi màu thứ cấp (\2c) */
		'--color2': style.secondaryColour,
		/** Biến ghi màu viền (\3c) */
		'--color3': style.outlineColour,
		'--border-style': style.borderStyle,
		/** Biến ghi màu bóng (\4c) */
		'--color4': style.backColour,
		// Ở lần đầu, các hàm utils ở đây lấy dữ liệu từ style. 
		// Khi override, lấy dữ liệu từ các biến tên kiểu CSS (vd ở đây: --border-style, --color3, --color4) thay cho các biến của style.
		// Hàm ghi màu viền (\3c), khi override tag (\3c,\3a thì gọi hàm này.)
		...utils.outlineStyleToCss(style.borderStyle, style.outlineColour, style.backColour),
		/** Hàm ghi độ dày chữ (\b) */
		'font-weight': utils.boldToWeight(style.bold),
		/** Biến ghi độ nghiêng chữ (\i) */
		'font-style': style.italic ? 'italic' : 'normal',
		/** Biến ghi gạch chân (phải giữ boolean) */
		'--underline': style.underline,
		/** Biến ghi gạch ngang (phải giữ boolean) */
		'--strike-out': style.strikeOut,
		/** Hàm ghi gạch chân/gạch ngang (\u, \s) */
		'text-decoration': utils.decorationToCss(style.underline, style.strikeOut),
		/** Biến ghi giãn cách chữ (\fsp), phải nhận số thuần, ko có đơn vị */
		'--spacing': style.spacing,
		'letter-spacing': `calc(var(--spacing) / ${info.PlayResX} * 100cqw)`,
		/** Biến ghi độ dày viền (\bord. CSS ko hỗ trợ \xbord, \ybord), nhận số thuần, ko có đơn vị */
		...utils.outlineWidthToCss(style.outline, info.PlayResY, info.LayoutResY, info.ScaledBorderAndShadow),
		/** Biến ghi vị trí bóng */
		'--shadow-x': style.shadow,
		'--shadow-y': style.shadow,
		/** style ban đầu không có giá trị blur, chỉ có khi dùng \blur. */
		'--blur': '0px', 
		/** Khi override, gọi --shadow-x, --shadow-y, --blur, --color4.
		 * 
		 * Nếu transform thì đưa nguyên cụm var() vào string (chấp nhận loại bỏ khả năng filter: none)
		 */
		filter: utils.shadBlurToCss(style.shadow, style.shadow, 0, style.backColour),
		'--inline-fx': '',
		'--scale-x': style.scaleX,
		'--scale-y': style.scaleY,
		'--angle-x': 0,
		'--angle-y': 0,
		'--angle-z': style.angle,
		/**
		 * transform-origin KHÔNG thể chốt tại parser: nhiều segmentSub cùng line phải quay/scale
		 * quanh một pivot ASS chung, trong khi parser chưa biết offset layout thật của từng segment.
		 * Renderer phải append lineSub + segmentSub, đợi browser layout, rồi tính cho MỖI segment:
		 *   originPx = commonPivotInSubRootPx - untransformedSegmentTopLeftInSubRootPx;
		 *   originXCqw = originPx.x / subRoot.clientWidth * 100;
		 *   originYCqh = originPx.y / subRoot.clientHeight * 100;
		 * commonPivot là \org đã đổi PlayRes → subRoot px; nếu không có \org thì là alignment
		 * anchor của lineSub. Ghi kết quả: segment.style.transformOrigin = '<x>cqw <y>cqh'.
		 * Không dùng transform-origin: inherit / var(--origin): chúng không trừ offset từng segment.
		 * Tính lại sau resize/font load/split segment; \move + \org cần origin thay đổi theo line.
		 */
		/** Khi override, gọi -scale-x, -scale-y, '--angle-x', '--angle-y', '--angle-z' */
		...utils.scaleAngleToCss(style.scaleX,style.scaleY,0,0,style.angle,info.LayoutResY),
	};
	// wrap-style tắt.
	/** Quy định phân vùng dữ liệu cho lineSub, segmentSub, data. (style[*] -> lineSub?/segmentSub?/data?.[*])
	 * style.name -> data.name; (ghi tắt là .name -> data; do chỉ có từ object style nên ghi .name, và ko đổi tên nên chỉ ghi data mà ko ghi đủ data.name)
	//  * .fontName -> segmentSub[font-family] (fallback sans-serif)
	//  * // Chú ý: fontSize có liên quan tới line-height.
	//  * .fontSize -> segmentSub[font-size]; -> segmentSub[line-height];
	//  * // Chú ý: 4 màu lưu dưới dạng var trong segmentSub để renderer chạy lai CSS-native animation + can thiệp timeline bằng JS.
	//  * .primaryColour -> segmentSub[--color1]; -> segmentSub[color]
	//  * .secondaryColour -> segmentSub[--color2];
	//  * // giữ nguyên segmentSub[-webkit-text-stroke-color] bất kể có isBox hay ko. isBox chỉ cần sửa
	//  * .outlineColour -> segmentSub[--color3]; -> segmentSub[background-color]; -> segmentSub[-webkit-text-stroke-color];
	//  * .backColour -> segmentSub[--color4];
	//  * .bold -> segmentSub[font-weight] = utils.boldToWeight(style.bold);
	//  * // Chú ý: utils.boldToWeight trong tagProcess ko dùng để xử lí trực tiếp tag \b (do \b chỉ nhận khi có giá trị số.)
	//  * .italic -> segmentSub[font-style] = style.italic ? 'italic' : 'normal';
	//  * .underline, .strikeOut -> segmentSub[text-decoration] = decoration (ở trên);
	// .scaleX-Y, .angle -> segmentSub: ...utils.scaleAngleToCss(style.scaleX,style.scaleY,0,0,style.angle,info.PlayResY),
	// -> segmentSub[--scale-x/y], segmentSub[--angle-x/y/z];
	//  * .spacing -> segmentSub[letter-spacing]; -> segmentSub[--spacing];
	//  * .borderStyle -> segmentSub[--border-style] (thay thế isBox);
	//  * // Chú ý: paint-order luôn là 'stroke fill markers'. (đã ghi ở globalCss)
	//  * .outline -> segmentSub: ...utils.outlineToCss(style.outline, info.PlayResY);
	//  * .shadow -> segmentSub[--shadow-x/y]; (để đưa vào filter: drop-shadow().)
	//  * .marginL/R/V, .alignment -> lineSub: ...utils.alignmentToCss(style, info.PlayResX, info.PlayResY);
	 */
	return { lineSub, segmentSub };
	
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
/** [arena.ai] Định nghĩa/chú thích object mục base sau khi tách
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
/** [arena.ai] Định nghĩa/chú thích delta theo mức node của mục base
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
	const parsedData = { info: {}, styles: [], events: [], styleCss: [], lineCss: [] };
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
	parsedData.info.WrapStyle = 0;					// mặc định: smart wrapping, top line is wider
	parsedData.info.PlayResX = 640;					// fallback PlayResX
	parsedData.info.PlayResY = 480;					// fallback PlayResY
	parsedData.info.LayoutResX = 640;				// fallback LayoutResX (=PlayResX)
	parsedData.info.LayoutResY = 480;				// fallback LayoutResY (=PlayResY)
	parsedData.info.ScaledBorderAndShadow = false; // mặc định: outline/shadow không scale theo video
	/** Phần hiện tại đang được xử lý trong file ASS, ví dụ [Script Info], [V4+ Styles] hoặc [Events].
	 * @type {string}
	 */
	let currentSection = '';
	/** LayoutRes chỉ fallback sang PlayRes khi file không khai báo trục tương ứng. */
	let hasExplicitLayoutResX = false;
	let hasExplicitLayoutResY = false;
	/** Chốt LayoutRes sau khi đã đọc hết [Script Info], trước khi styleToCss() dùng nó. */
	const finalizeLayoutRes = () => {
		if (!hasExplicitLayoutResX) parsedData.info.LayoutResX = parsedData.info.PlayResX;
		if (!hasExplicitLayoutResY) parsedData.info.LayoutResY = parsedData.info.PlayResY;
	};
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
		if (line.startsWith('[') && line.endsWith(']')) {
			const nextSection = line.trim();
			// Style được biên dịch ngay trong loop, nên phải resolve fallback trước Style đầu tiên.
			if (nextSection === '[V4+ Styles]') finalizeLayoutRes();
			currentSection = nextSection;
			continue;
		} // Lưu phân đoạn
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
			// 		LayoutResX: để xử lí phụ đề. (v3.5.0+)
			// 		LayoutResY: để xử lí phụ đề. (v3.5.0+)
			//		*Chú thích: LayoutRes liên quan xử lí hiệu ứng liên quan đến scaleRes, 
			// 					PlayRes liên quan xử lí vị trí phụ đề.
			// 		ScaledBorderAndShadow: để xử lí phụ đề, liên quan đến LayoutRes và PlayRes.
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
					k === 'LayoutResX' ? parseClampedNum(true, v, parsedData.info.PlayResX, 1) :
					k === 'LayoutResY' ? parseClampedNum(true, v, parsedData.info.PlayResY, 1) :
					k === 'ScaledBorderAndShadow' ? v === 'yes' :
					v; // key khác: giữ nguyên bản như cũ
					if (k === 'LayoutResX' && Number.isFinite(parseClampedNum(true, v, NaN, 1))) hasExplicitLayoutResX = true;
					if (k === 'LayoutResY' && Number.isFinite(parseClampedNum(true, v, NaN, 1))) hasExplicitLayoutResY = true;
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
				const styleValues = line.replace('Style:', '').split(',').map(s => s.trim());
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
				parsedData.styleCss[existingIdx] = styleToCss(style, parsedData.info, existingIdx);
				continue;
				}
				parsedData.styles.push(style);
				// 02sep26: style vừa push nằm cuối → styleIndex = length - 1 (lưu vào data.styleIndex)
				parsedData.styleCss.push(styleToCss(style, parsedData.info, parsedData.styles.length - 1));
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
				const lineData = line.substring('Dialogue:'.length);
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
	// Giữ info nhất quán cả khi file không có [V4+ Styles].
	finalizeLayoutRes();
	utils.log(`${parserLogPrefix} Đã xử lí xong.`, parsedData);	
	return parsedData;
}