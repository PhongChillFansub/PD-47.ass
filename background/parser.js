/** v0.1.0 02sep26
 * alpha mode
 * Chức năng: xử lí kế tiếp, giai đoạn từ có file sub thô (rawText) đến cấu trúc JS (parsedData) và CSS (globalCss, styleCss, lineCss).
*/
/** Mẫu text của các line [Events] trong file sub
 * [Events]
 * Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
 * Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0000,0000,0000,,
 * (Chỉnh sửa để dễ đọc hơn):
 * Format:      Layer,  Start,      End,        Style,    Name,   MarginL,  MarginR,  MarginV,  Effect, Text
 * Dialogue:    0,      0:00:00.00, 0:00:05.00, Default,      ,   0000,     0000,     0000,          ,
 * định dạng:	index,  h:mm:ss.cs, h:mm:ss.cs, string,   string, px,       px,       px,       string  string
 * !: Margin có thể là 0000 (undefined chuyển thành) hoặc 0 (defined). Xử lí cả 2 như giá trị 0
 * !: Name trong Aegisub chính là line.actor. Nếu trong line.actor có dấu "," thì sẽ bị lưu thành ";".
 * utils: cung cấp logger(message, type = 'info', ...extra); dùng log/warn bên dưới.
 */
import * as utils from './utils.js';
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
 * @property {Array} lineCss mỗi phần tử { base } cùng chỉ số với events — base là danh sách mục base tag-text
 *   (02sep26: đổi tên segments → base; classify bước 4-7 sẽ ghi trực tiếp vào base + thêm collision, clip)
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
/** Chuyển chuỗi màu Aegisub sang định dạng rgba() dùng cho CSS.
 * Hỗ trợ cả định dạng style màu &HAABBGGRR và inline màu &HBBGGRR&.
 *
 * @param {string} ascStr Chuỗi màu đầu vào từ file ASS.
 * @returns {string} Giá trị màu theo dạng rgba(r, g, b, a).
 */
function convertAegisubColorToCss(ascStr) {
  let hex = ascStr.replace(/&H|&/g, ''); // Loại bỏ ký tự định dạng &H và & của string màu (định dạng mới AABBGGRR/BBGGRR)
  if (!hex) return 'rgba(0,0,0,0)'; // Nếu string màu trống (&H&), coi như màu đen
  hex = hex.padStart(8, '0'); // Chuyển về chuẩn AABBGGRR
  // Trong định dạng màu Aegisub: Alpha theo cơ chế tính ngược (00: Opaque, FF: Transparent)
  // Còn lại đều là tính xuôi. Và tất cả đều là hệ 16
  const a = ((255 - parseInt(hex.substring(0, 2), 16)) / 255).toFixed(2);
  const b = parseInt(hex.substring(2, 4), 16);
  const g = parseInt(hex.substring(4, 6), 16);
  const r = parseInt(hex.substring(6, 8), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
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
 *   segments → base; classify bước 4-7 sau này ghi trực tiếp vào base + thêm collision, clip).
 */
function tagProcess(doStripTags, text) {
	const tokens = tokenizeLineText(text ?? '');
	if (!doStripTags) return { base: segmentsFromTokens(tokens) }; // falsy → xử lí tất cả
	// truthy → strip: nối text token + marker nguyên văn, bỏ mọi tag token.
	let stripped = '';
	for (const tok of tokens) {
		if (isStandaloneToken(tok)) { stripped += tok.slice(1, -1); continue; } // {\N} → '\N' nguyên văn
		if (tok.startsWith('{') && tok.endsWith('}')) continue; // tag token → xóa
		stripped += tok; // text token (kể cả '{' không đóng, \{ \})
	}
	return { base: stripped === '' ? [] : [{ tags: [], text: stripped }] };
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
/** Hàm đọc text của file Aegisub.
 * @param {boolean} doStripTags Chế độ xử lí tag cho tagProcess() (chốt 02sep26, bản 2 — boolean):
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
                        styleValue = convertAegisubColorToCss(styleValue);
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
				// base (mục base tag-text) của dòng ghi vào lineCss (cùng chỉ số với events), KHÔNG thay đổi orgline
				parsedData.lineCss.push(tagProcess(doStripTags, orgline.text))
    		}
		}
	}
	parsedData.globalCss = globalCssFromInfo(parsedData.info);
	utils.log(`${parserLogPrefix} Đã xử lí xong.`, parsedData);	
	return parsedData;
}

/** [arena.ai] Cache globalCss theo WrapStyle (chỉ 0..3 → tối đa 4 entry).
 * CHỈ dùng nội bộ styleParsedToCss để spread vào container (frozen → an toàn chia sẻ);
 * parsedData.globalCss vẫn lấy object MỚI từ globalCssFromInfo (pure) để renderer tự do dùng.
 * @type {Map<number, Object>} */
const GLOBAL_CSS_CACHE = new Map();
/** [arena.ai 02sep26] Lấy globalCss từ cache theo WrapStyle (tạo + freeze nếu chưa có). */
function cachedGlobalCss(info) {
	const wrapStyle = Number(info?.WrapStyle ?? 0);
	let cached = GLOBAL_CSS_CACHE.get(wrapStyle);
	if (!cached) {
		cached = Object.freeze(globalCssFromInfo(info));
		GLOBAL_CSS_CACHE.set(wrapStyle, cached);
	}
	return cached;
}
/** [arena.ai] Chuyển đổi style đã chuẩn hóa thành object CSS.
 * 29aug26 — bước 3: phân tích kĩ container / text / data
 * 31aug26 — Chú ý 2 pipeline: container chứa sẵn globalCss (chuẩn); delta theo mức node
 *           {container, text, data} cho classify (bước 4-7) — xem typedef
 *           parsedDataFormat.baseItemDelta bên dưới segmentsFromTokens.
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
 * data (bổ sung — renderer tính toán):
 *   - 02sep26 (tối ưu): data = { ...style } (spread toàn bộ field style gốc — field mới tự theo,
 *     không liệt kê tay 20+ field) + các field suy ra TỪ STYLE: isBox, hAlign, transformOrigin,
 *     styleIndex (02sep26 — chỉ số trong parsedData.styles, chuyển từ lineCss vào đây).
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
export function styleParsedToCss (style, info = {}, styleIndex = -1) {
	const alignment = style.alignment;
	// hAlign: 1,4,7 → left; 2,5,8 → center; 3,6,9 → right
	const hAlign = alignment % 3 === 1 ? 'left' : alignment % 3 === 2 ? 'center' : 'right';
	// transform-origin theo anchor \an (để \fr quay quanh đúng điểm neo) — map hoisted (02sep26)
	const transformOrigin = TRANSFORM_ORIGIN_MAP[alignment] || '50% 50%';

	const isBox = style.borderStyle === 3;

	// 31aug26 (Chú ý 2 pipeline): globalCss làm chuẩn → nhúng thẳng vào container.
	// 02sep26 (tối ưu): lấy từ GLOBAL_CSS_CACHE theo WrapStyle thay vì tính lại mỗi style.
	const globalCss = cachedGlobalCss(info);

	// container: định vị, không chứa font
	// 31aug26 (Chú ý 2 pipeline): nhúng THẲNG bộ globalCss (chuẩn) vào container —
	// white-space/word-break/overflow-wrap/text-wrap/max-width theo WrapStyle đã chuẩn hóa.
	const container = {
		'display': 'inline-block',
		'position': 'absolute', // renderer sẽ set left/top/right/bottom theo an + margin + pos/move
		'text-align': hAlign,
		'line-height': `${style.fontSize}px`,
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
	const data = {
		...style,
		isBox,
		hAlign,
		transformOrigin,
		styleIndex,
	};

	return { container, text, data };
}
/** [arena.ai] Tag có chứa tag karaoke (\k, \K, \kf, \ko) không? */
export function hasKaraokeTag(tag) {
	return /\\[kK](?:[fo])?/.test(tag);
}
/** [arena.ai] Token là marker đứng riêng {\h} / {\N} / {\n} (renderer quyết định ngữ nghĩa) không? */
export function isStandaloneToken(tok) {
	return tok === '{\\h}' || tok === '{\\N}' || tok === '{\\n}';
}
/** [arena.ai] Tokenize + làm sạch nội dung dòng (tiền xử lí tag override).
 *
 * Mục tiêu: biến line.text thô (một chuỗi đan xen text thường và tag {...}) thành một mảng
 * token ĐÃ LÀM SẠCH — để bước sau (segmentsFromTokens) chỉ việc ghép tag + text thành base
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
 *     liền nhau (}{) — TRỪ khi tag sau chứa karaoke (\k/\K/\kf/\ko) và TRỪ marker {\h}/{\N}/{\n}.
 *   - \{ \} giữ nguyên văn, unescape ở tầng cuối (renderer).
 */
export function tokenizeLineText(text) {
	const result = [];
	const regex = /\\\{|\\\}|\{|\}|\\h|\\n|\\N/g;
	let endIndex = 0;
	let tagStartIndex = -1;
	let match;

	/**
	 * Đẩy 1 token vào result, áp quy tắc làm sạch / hợp nhất RIÊNG cho tag.
	 *
	 * Các nhánh (kiểm tra theo thứ tự):
	 * 1. tok rỗng ('') → bỏ qua.
	 * 2. Không phải tag (không vừa bắt đầu '{' vừa kết thúc '}') → đẩy NGUYÊN text token.
	 * 3. Là tag nhưng không có '\' ở vị trí >= 1 (VD {abc} — tag comment thuần) → bỏ qua.
	 * 4. Là tag có '\' → strip hết phần trước '\' ĐẦU TIÊN (bỏ '{' và phần comment dẫn đầu),
	 *    rồi bọc lại trong { } thành cleaned (VD {abc\b1} → {\b1}).
	 * 5. cleaned là marker đứng riêng {\h}/{\N}/{\n} → đẩy NGAY, không bao giờ merge.
	 * 6. Ngược lại, nếu token trước trong result cũng là tag (không phải marker, không có
	 *    karaoke) → HỢP NHẤT 2 tag: bỏ '}' của token trước và '{' của cleaned, ghép thành 1 tag
	 *    liền (VD {\b1} + {\i1} → {\b1\i1}). Chỉ KHÔNG hợp nhất khi cleaned chứa tag karaoke
	 *    (\k/\K/\kf/\ko) — karaoke phải đứng riêng để đo thời lượng từng syl.
	 * 7. Còn lại → đẩy cleaned như 1 tag mới.
	 *
	 * Lưu ý: chỉ TAG mới được sửa/merge; TEXT luôn đẩy nguyên (như nhánh 2).
	 *
	 * @param {string} tok Chuỗi con cắt từ text: có thể là text thường hoặc 1 tag {...}.
	 * @returns {void}
	 */
	const pushToken = (tok) => {
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
		if (prev !== undefined && prev.startsWith('{') && prev.endsWith('}')
			&& !isStandaloneToken(prev) && !hasKaraokeTag(cleaned)) {
			result[result.length - 1] = prev.slice(0, -1) + cleaned.slice(1);
		} else {
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

// ==========================================================================
// ==== TÁCH TAG TRONG TOKEN → MỤC BASE (bước ngay sau tokenizeLineText) ====
// ==========================================================================
// Thứ tự xử lí: tokenizeLineText (token + clean) → segmentsFromTokens (tách các tag đơn
// trong tag token, ghép với text token kế tiếp thành 1 mục base).
// Phân loại/phân cấp tag (nhóm 2.4 → 2.3 → 2.2 → 2.1) là bước SAU, chưa viết ở bản này.
//
// BASE MODEL (theo pipeline): mỗi tag token kết hợp với text token tạo thành 1 mục base:
//   base item = { tags: [...các tag đơn tách từ (các) tag token, raw nguyên văn], text: '...' }
// - Nhiều tag token đứng LIỀN TIẾP (vd {\b1}{\k25} — tokenizer giữ riêng tag chứa karaoke)
//   → gộp chung vào tags của 1 mục base.
// - Text token đứng TRƯỚC mọi tag token → mục base { tags: [], text }.
// - Marker {\h}/{\N}/{\n} → flush NGAY thành mục base RIÊNG tại đúng vị trí
//   { tags: [marker], text: '' }; tag đang pending vẫn chờ text kế tiếp (marker không ăn mất pending).
// - Tag token THƯỜNG đứng CUỐI dòng (không còn text theo sau) → BỎ (không tạo mục base);
//   marker đứng cuối dòng thì VẪN GIỮ (đã flush thành mục base riêng từ lúc gặp).

/** Định nghĩa/chú thích object mục base sau khi tách
 * @typedef {object} parsedDataFormat.baseItem Đơn vị nhỏ nhất trong base: 1 cụm tag + 1 đoạn text.
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} — renderer làm tầng cuối).
 */
/** Định nghĩa/chú thích delta theo mức node của mục base (31aug26 — Chú ý 2 pipeline).
 * ĐỊNH HƯỚNG cho classify (bước 4-7): parser xử lí đến base thì mỗi mục base mang
 * delta tách theo 3 mức giống styleParsedToCss (container / text / data).
 * Renderer chuyển mục base thành node container-text TÙY MỨC ĐỘ DELTA:
 * - delta có container → phải sinh CẶP node container+text MỚI (delta chạm vỏ dòng).
 * - delta chỉ có text  → chỉ sinh node text bên trong container hiện có (đổi ruột chữ).
 * - delta chỉ có data  → không sinh node, chỉ là số liệu cho đo chữ / collision / karaoke.
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
export function splitOverrideTags(content) {
	const tags = [];
	let depth = 0;
	let start = -1; // vị trí '\' mở đầu tag đang dở (ngoài ngoặc)
	for (let i = 0; i < content.length; i++) {
		const ch = content[i];
		if (ch === '(') { depth++; }
		else if (ch === ')') { if (depth > 0) depth--; }
		else if (ch === '\\' && depth === 0) {
			if (start !== -1) tags.push(content.slice(start, i));
			start = i;
		}
	}
	if (start !== -1) tags.push(content.slice(start));
	return tags;
}

/** [arena.ai] Đổi tokens (đầu ra của tokenizeLineText) thành danh sách base.
 * @param {Array<string>} tokens Tokens từ tokenizeLineText (text không bao ngoặc / tag có bao ngoặc {}).
 * @returns {Array<parsedDataFormat.baseItem>} Danh sách mục base theo thứ tự trong dòng.
 */
export function segmentsFromTokens(tokens) {
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
