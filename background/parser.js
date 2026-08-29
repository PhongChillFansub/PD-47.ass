/** v0.0.8 29aug26
 * alpha mode
 * parser.js
 * Chức năng: xử lí kế tiếp, giai đoạn từ giai đoạn có file sub thô (rawText) đến cấu trúc file sub JS (line.raw),
 * kèm tiền xử lí tag override: tokenizeLineText (token + clean) → segmentsFromTokens (tách tag trong token,
 * ghép text token thành segment). Phân loại/phân cấp tag (2.4 → 2.3 → 2.2 → 2.1) làm ở bước sau.
 * Mẫu text của các line [Events] trong file sub
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
 * @property {Array} styleCss định dạng các style thành CSS
 * @property {Array} lineCss danh sách các style cho node span của chữ và viền v.v.
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
/** LogPrefix của parser (utils.logger đã tự thêm "[<ts> PD-47.ass]" nên chỉ cần "parser:"). */
const parserLogPrefix = "parser:";
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
 * Toán thuần SỐ NGUYÊN (không qua float nên chính xác tuyệt đối, không cần Math.round —
 * cách reduce "giây.cs" *1000 từng bị 0:00:02.01 → 2009.9999999999998).
 * '.' được thay thành ':' để split 1 lần; pad TRÁI lên đủ 4 phần tử trước khi destructure
 * vì cấp số tính TỪ PHẢI (giây, phút, giờ) — mm:ss.cs vẫn đúng nếu thiếu phần giờ.
 * @param {string} t Chuỗi thời gian đầu vào.
 * @returns {number} Thời gian (ms), hoặc 0 nếu chuỗi không hợp lệ (rác → NaN → || 0; không thể throw).
 */
const convertTimeStringToMs = t => {
    const p = String(t).replace('.', ':').split(':').slice(-4);
    const [h = 0, m = 0, s = 0, cs = 0] = Array(4 - p.length).fill(0).concat(p); // pad trái, cấp số từ phải
    return h * 36e5 + m * 6e4 + s * 1e3 + String(cs).padEnd(2, '0').slice(0, 2) * 10 || 0; // '1.2' → 1200ms (ngữ nghĩa thập phân)
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
 * - Cho phép style.name rỗng (Aegisub vẫn coi là hợp lệ — comment cũ line 303).
 * - Fix bug cũ: return false trong forEach không thoát được hàm ngoài → dùng for...of.
 * @param {parsedDataFormat.style} style Style cần kiểm tra và chuẩn hóa.
 * @returns {boolean} true nếu style hợp lệ, false nếu style bị bỏ qua.
 */
export function validateAndNormalizeStyle(style) {
	// name được phép rỗng, các key khác không được null/undefined/''/toàn space
	if (REQUIRED_STYLE_KEYS.some(key => {
		if (key === 'name') return style[key] == null; // chỉ loại khi null/undefined, cho phép ''
		return style[key] == null || (typeof style[key] === 'string' && style[key].trim() === '');
	})) return false;
	for (const key of REQUIRED_STYLE_KEYS) {
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
/**
 * @typedef {string} line Dòng text sau khi tách ban đầu, đầu vào xử lí thô.
 */
/** Hàm đọc text của file Aegisub.
 * @param {string} rawText Nội dung file ASS đầu vào dưới dạng text.
 * @returns {parsedDataFormat.global} Object chứa dữ liệu parser đã chuẩn hóa và CSS tương ứng.
 */
export function parser(rawText) {
	/** Dữ liệu tệp phụ đề.
	 * 
	 * Info lưu dưới dạng obj do file sub có cấu trúc key: value
	 * 
	 * Styles và Events lưu dưới dạng array do file sub có cấu trúc khác, và trong Lua Automation của Aegisub cũng xử lí tương tự.
	 * @type {parsedDataFormat.global} */
	const parsedData = { info: {}, styles: [], events: [], globalCss: {}, styleCss: [], lineCss: [] };
	if (!rawText) {
		utils.warn(`${parserLogPrefix} Đã có ai làm gì đâu? Đã làm gì đâu? (rawText trống)`);
		return parsedData; // Nếu ko có rawText, trả về Data trống và gửi log lỗi text trống.
	};
	/** Mảng các dòng text của file ASS sau khi tách theo dòng mới.
	 * 
	 * Đặt tên là subtitles để tương ứng với array subtitles trong Lua Automation của Aegisub.
	 * @type {string[]}
	 */
	const subtitles = rawText.split(/\r?\n/);
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
	/** Dòng text hiện tại đang được phân tích từ file ASS.
	 * @type {string}
	 */
	let line;
	for (line of subtitles) { // Xét các dòng dữ liệu trong file. line = subtitles[i] (hoặc subs[i]. Subscribe?)
		line = line.trimStart(); // Xóa khoảng trắng ở đầu dòng dữ liệu (ko cần thiết?)
		if (!line || line.startsWith(';')) { continue }; 
		// Nếu line trống (""), hoặc bắt đầu bằng ";" thì bỏ qua. ";" là phần credit của app (trong phần Script Info).
		if (line.startsWith('[') && line.endsWith(']')) { currentSection = line.trim(); continue; } // Lưu phân đoạn
		/** Cho biết dòng hiện tại là phần nối tiếp của dialogue bị ngắt dòng.
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
			} else continue; // Bỏ qua nếu là dòng rác hoặc dòng comment bị lỗi xuống dòng
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
				parsedData.info[k] = v;
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
				// 29aug26: chuẩn hóa + tạo styleCss ngay khi push (đối xứng với events/lineCss)
				// - validateAndNormalizeStyle: fix bug forEach, cho phép name rỗng
				// - trùng tên: last wins (Aegisub ghi đè) → thay thế entry cũ để styles[i] ↔ styleCss[i] luôn đồng bộ
				if (!validateAndNormalizeStyle(style)) {
					// style không hợp lệ → bỏ qua, không push
					continue;
				}
				// Map name → index để xử lý trùng tên (trừ trường hợp name rỗng thì luôn push mới)
				if (style.name !== '') {
					const existingIdx = parsedData.styles.findIndex(s => s.name === style.name);
					if (existingIdx !== -1) {
						parsedData.styles[existingIdx] = style;
						parsedData.styleCss[existingIdx] = styleParsedToCss(style, parsedData.info);
						continue;
					}
				}
				parsedData.styles.push(style);
				parsedData.styleCss.push(styleParsedToCss(style, parsedData.info));
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
				// segments của dòng ghi vào lineCss (cùng chỉ số với events), KHÔNG thay đổi orgline
				parsedData.lineCss.push({ segments: segmentsFromTokens(tokenizeLineText(orgline.text ?? '')) });
    		}
		}
	}
	parsedData.info.WrapStyle = parseClampedNum(true, parsedData.info.WrapStyle, 0, 0, 3); // Chuẩn hóa .WrapStyle
	parsedData.info.PlayResX = parseClampedNum(true, parsedData.info.PlayResX, 640, 640); // Chuẩn hóa .PlayResX
	parsedData.info.PlayResY = parseClampedNum(true, parsedData.info.PlayResY, 480, 480); // Chuẩn hóa .PlayResY
	parsedData.info.ScaledBorderAndShadow = (parsedData.info.ScaledBorderAndShadow === "yes" ? true : false); // Chuẩn hóa .ScaledBorderAndShadow
	// 29aug26 bước 3: sau khi info đã chuẩn hóa, re-map styleCss để data.playResX/Y và scaled flag chính xác
	// (vẫn giữ logic push ngay khi parse để đồng bộ index, chỉ refresh CSS sau khi có info chuẩn)
	parsedData.styleCss = parsedData.styles.map(s => styleParsedToCss(s, parsedData.info));
	utils.log(`${parserLogPrefix} Đã xử lí thô.`, parsedData);
	// Phần xử lí chuyển đổi sang CSS. Sử dụng globalCss, styleCss và lineCss.
	// Phần globalCss (từ các giá trị trong info)
	parsedData.globalCss = {
        'white-space': (parsedData.info.WrapStyle === 2 ? 'pre' : 'pre-wrap'),
        'word-break' : 'keep-all',
        'overflow-wrap': 'break-word',
        'text-wrap': (parsedData.info.WrapStyle === 3 ? 'balance' : parsedData.info.WrapStyle === 1 ? 'wrap' : 'pretty'),
        'max-width': '100%',
		// Đơn giản là lấy WrapStyle
    };
	// Phần styleCss: 29aug26 bước 3
	// - Validation + dedup (last-wins) đã làm ngay khi push Style (line ~326), đối xứng events/lineCss.
	// - CSS generation: re-map sau khi info đã chuẩn hóa để data.playResX/Y và scaledBorderAndShadow chính xác.
	//   Vẫn giữ styles[i] ↔ styleCss[i] đồng bộ, không còn filter 2-pass cũ.

	return parsedData;
}
/** Chuyển đổi style đã chuẩn hóa thành object CSS.
 * 29aug26 — bước 3: phân tích kĩ container / text / data
 *
 * Triết lý:
 * - Parser KHÔNG đo chữ thật, KHÔNG scale sang video thật. Mọi px giữ theo PlayRes.
 * - Renderer mới scale (videoSize / PlayRes) và đo chữ thật (pretext).
 *
 * container (vỏ ngoài — định vị dòng):
 *   - Nhiệm vụ: đặt khung dòng trong video theo \an + marginL/R/V (+ \pos/\move sau này).
 *   - Chứa: display, position, max-width, text-align (từ \an), line-height,
 *           background/box-shadow khi borderStyle==3 (opaque box).
 *   - KHÔNG chứa font/color/transform — những thứ đó thuộc text.
 *   - alignment → hAlign (left/center/right) để set text-align, và transformOrigin cho \fr.
 *
 * text (ruột — chữ):
 *   - Nhiệm vụ: typography gốc của dòng, làm base cho delta tag \b,\i,\fn,\fs,\fsc,\fsp,\fr,\c...
 *   - Chứa: font-family, font-size (PlayRes px), color (primaryColour),
 *           font-weight/style, text-decoration (u/s), letter-spacing (fsp),
 *           transform: scaleX/Y + rotate (fscx/fscy/fr), transform-origin từ \an,
 *           outline/shadow: nếu borderStyle==1 dùng -webkit-text-stroke + text-shadow,
 *           nếu borderStyle==3 thì không stroke (box lo chứa background).
 *   - Kèm CSS variables --primary/--secondary/--outline/--back để tag \1c..\4c override nhanh.
 *
 * data (bổ sung — renderer tính toán):
 *   - Raw số: fontSize, scaleX/Y, spacing, angle, outline, shadow, margins, alignment,
 *   - Màu: secondary/outline/back (rgba), primary đã có trong text.color nhưng giữ lại để karaoke,
 *   - Cờ: isBox (borderStyle==3), borderStyle, encoding,
 *   - PlayResX/Y, scaledBorderAndShadow từ info để renderer quyết định outline/shadow có scale theo video không.
 *
 * @param {parsedDataFormat.style} style Style đã chuẩn hóa.
 * @param {parsedDataFormat.info} [info] Info đã (hoặc chưa) chuẩn hóa — dùng để lấy PlayRes/ScaledBorderAndShadow.
 * @returns {{container: Object, text: Object, data: Object}}
 */
export function styleParsedToCss (style, info = {}) {
	const playResX = info.PlayResX ?? 640;
	const playResY = info.PlayResY ?? 480;
	const scaled = info.ScaledBorderAndShadow ?? false;

	const alignment = style.alignment;
	// hAlign: 1,4,7 → left; 2,5,8 → center; 3,6,9 → right
	const hAlign = alignment % 3 === 1 ? 'left' : alignment % 3 === 2 ? 'center' : 'right';
	// transform-origin theo anchor \an (để \fr quay quanh đúng điểm neo)
	const transformOriginMap = {
		1: '0% 100%', 2: '50% 100%', 3: '100% 100%',
		4: '0% 50%',  5: '50% 50%',  6: '100% 50%',
		7: '0% 0%',   8: '50% 0%',   9: '100% 0%',
	};
	const transformOrigin = transformOriginMap[alignment] || '50% 50%';

	const isBox = style.borderStyle === 3;

	// container: định vị, không chứa font
	const container = {
		'display': 'inline-block',
		'position': 'absolute', // renderer sẽ set left/top/right/bottom theo an + margin + pos/move
		'max-width': '100%',
		'text-align': hAlign,
		'line-height': '1.15', // ASS không có line-height riêng, dùng 1.15 cho dễ đọc, renderer có thể override
		'white-space': 'pre-wrap', // fallback, globalCss sẽ override theo WrapStyle
		'word-break': 'keep-all',
		'overflow-wrap': 'break-word',
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

	// text: typography + base transform + outline/shadow
	const text = {
		'font-family': `"${style.fontName}", sans-serif`,
		'font-size': `${style.fontSize}px`, // PlayRes px, renderer scale sau: videoHeight/PlayResY
		'color': style.primaryColour,
		'font-weight': style.bold ? '700' : '400',
		'font-style': style.italic ? 'italic' : 'normal',
		'text-decoration': decoration,
		'letter-spacing': `${style.spacing}px`,
		'transform': `scaleX(${style.scaleX / 100}) scaleY(${style.scaleY / 100}) rotate(${style.angle}deg)`,
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
			'-webkit-text-stroke-width': '0px',
			'text-shadow': 'none',
		} : {
			'-webkit-text-stroke-width': style.outline ? `${style.outline}px` : '0px',
			'-webkit-text-stroke-color': style.outlineColour,
			'text-shadow': style.shadow ? `${style.shadow}px ${style.shadow}px ${style.backColour}` : 'none',
		}),
	};

	const data = {
		name: style.name,
		fontName: style.fontName,
		fontSize: style.fontSize,
		primaryColour: style.primaryColour,
		secondaryColour: style.secondaryColour,
		outlineColour: style.outlineColour,
		backColour: style.backColour,
		bold: style.bold,
		italic: style.italic,
		underline: style.underline,
		strikeOut: style.strikeOut,
		scaleX: style.scaleX,
		scaleY: style.scaleY,
		spacing: style.spacing,
		angle: style.angle,
		borderStyle: style.borderStyle,
		isBox,
		outline: style.outline,
		shadow: style.shadow,
		alignment,
		hAlign,
		transformOrigin,
		marginL: style.marginL,
		marginR: style.marginR,
		marginV: style.marginV,
		encoding: style.encoding,
		playResX,
		playResY,
		scaledBorderAndShadow: scaled,
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
// ==== TÁCH TAG TRONG TOKEN → SEGMENT (bước ngay sau tokenizeLineText) ====
// ==========================================================================
// Thứ tự xử lí: tokenizeLineText (token + clean) → segmentsFromTokens (tách các tag đơn
// trong tag token, ghép với text token kế tiếp thành segment).
// Phân loại/phân cấp tag (nhóm 2.4 → 2.3 → 2.2 → 2.1) là bước SAU, chưa viết ở bản này.
//
// Segment model (theo pipeline): mỗi tag token kết hợp với text token tạo thành 1 segment:
//   segment = { tags: [...các tag đơn tách từ (các) tag token, raw nguyên văn], text: '...' }
// - Nhiều tag token đứng LIỀN TIẾP (vd {\b1}{\k25} — tokenizer giữ riêng tag chứa karaoke)
//   → gộp chung vào tags của 1 segment.
// - Text token đứng TRƯỚC mọi tag token → segment { tags: [], text }.
// - Marker {\h}/{\N}/{\n} → flush NGAY thành segment RIÊNG tại đúng vị trí
//   { tags: [marker], text: '' }; tag đang pending vẫn chờ text kế tiếp (marker không ăn mất pending).
// - Tag token THƯỜNG đứng CUỐI dòng (không còn text theo sau) → BỎ (không tạo segment);
//   marker đứng cuối dòng thì VẪN GIỮ (đã flush thành segment riêng từ lúc gặp).

/** Định nghĩa/chú thích object segment sau khi tách 
 * @typedef {object} parsedDataFormat.segment Đơn vị nhỏ nhất: 1 cụm tag + 1 đoạn text.
 * @property {string[]} tags Các tag đơn tách từ (các) tag token liền trước text, raw nguyên văn (vd: "\\fs30", "\\c&HFF&").
 * @property {string} text Nội dung text đi kèm (nguyên văn, CHƯA unescape \{ \} — renderer làm tầng cuối).
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

/** [arena.ai] Đổi tokens (đầu ra của tokenizeLineText) thành danh sách segment.
 * @param {Array<string>} tokens Tokens từ tokenizeLineText (text không bao ngoặc / tag có bao ngoặc {}).
 * @returns {Array<parsedDataFormat.segment>} Danh sách segment theo thứ tự trong dòng.
 */
export function segmentsFromTokens(tokens) {
	const segments = [];
	if (!Array.isArray(tokens)) return segments;
	/** Các tag đơn đang chờ text token kế tiếp. @type {string[]} */
	let pendingTags = [];
	for (const tok of tokens) {
		if (tok.startsWith('{') && tok.endsWith('}')) {
			// Marker {\h}/{\N}/{\n} → segment RIÊNG tại đúng vị trí (text rỗng); pending giữ nguyên.
			if (isStandaloneToken(tok)) {
				segments.push({ tags: [tok.slice(1, -1)], text: '' });
				continue;
			}
			// Tag token thường → tách thành các tag đơn, gộp vào pending (các tag token liền nhau chung 1 segment).
			pendingTags.push(...splitOverrideTags(tok.slice(1, -1)));
			continue;
		}
		// Text token → đóng 1 segment với mọi tag đang chờ.
		segments.push({ tags: pendingTags, text: tok });
		pendingTags = [];
	}
	// Tag token THƯỜNG cuối dòng không có text theo sau → BỎ (không tạo segment — chốt 27aug26).
	// Marker không rơi vào đây vì đã flush thành segment riêng ngay khi gặp.
	return segments;
}
