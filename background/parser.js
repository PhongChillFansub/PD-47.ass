// Code bằng tay
// v0.0.8 05aug26
// parser.js
// Chức năng: xử lí kế tiếp, giai đoạn từ giai đoạn có file sub thô (rawText) đến cấu trúc file sub JS (line.raw)
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
/** Định nghĩa/chú thích object FALLBACK_DEFAULT_STYLE (parsedDataFormat.style) */
/**
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
/** Định nghĩa/chú thích object parsedData, sau xử lí */
/** 
 * @typedef {object} parsedDataFormat.global Tương ứng với các phần [Script Info], [V4+ Styles], [Events]. Bỏ qua phần [Aegisub Project Garbage].
 * @property {parsedDataFormat.info} info lưu dưới dạng obj do file sub có cấu trúc key: value
 * @property {Array<parsedDataFormat.style>} styles lưu các style của file sub (nếu style không được chuẩn thì fallback cả style về FALLBACK_DEFAULT_STYLE resize)
 * @property {Array<parsedDataFormat.event>} events lưu các events (dialogue) của file sub
 * @property {object} globalCss định dạng các thuộc tính info (có thể chuyển) thành CSS
 * @property {Array} styleCss định dạng các style thành CSS
 * @property {Array} lineCss danh sách các style cho node span của chữ và viền v.v.
 */
/** Định nghĩa/chú thích object parsedData.info sau xử lí */
/**
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
/** Là logPrefix của parser, of course? */
const parserLogPrefix = "[PD-47.ass] parser:";
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
/** Chuyển thời gian theo định dạng ASS sang mili giây.
 * Hỗ trợ định dạng h:mm:ss.cs, ví dụ 0:00:01.23.
 *
 * @param {string} t Chuỗi thời gian đầu vào.
 * @returns {number} Thời gian tính bằng mili giây, hoặc 0 nếu chuỗi không hợp lệ.
 */
const convertTimeStringToMs = t => {
    try { return t.split(':').reduce((acc, v) => acc * 60 + +v, 0) || 0; } catch { return 0;}
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
 * @param {parsedDataFormat.style} style Style cần kiểm tra và chuẩn hóa.
 * @returns {boolean} true nếu style hợp lệ, false nếu style bị bỏ qua.
 */
function validateAndNormalizeStyle(style) {
	if (REQUIRED_STYLE_KEYS.some(key => style[key] == null || (typeof style[key] === "string" && style[key].trim() === ""))) return false;
	// Nếu bất kì key nào là null, undefined, hoặc string trống/toàn dấu cách thì trả về style false (bị loại bỏ).
	REQUIRED_STYLE_KEYS.forEach(key => {
		const defaultValue = FALLBACK_DEFAULT_STYLE[key];
		const defaultType = typeof defaultValue;
		switch (defaultType) {
			case "boolean":
				style[key] = style[key] !== "0"; // Nếu string ban đầu là 0 thì là false, còn lại là true
				break;
			case "number":
				const value = Number.parseFloat(style[key]);
				if (Number.isNaN(value)) return false; // Nếu ko chuyển được thành số thì trả về style false (bị loại)
				style[key] = value;
				break;
			default:
				// String ở đây đã luôn hợp lệ (khác string trống hoặc toàn dấu cách), giữ nguyên.
				break;
		}
	});
	return true;
}
/**
 * @typedef {string} line Dòng text sau khi tách ban đầu, đầu vào xử lí thô.
 */
/** Hàm đọc text của file Aegisub.
 * @param {string} rawText Nội dung file ASS đầu vào dưới dạng text.
 * @returns {parsedDataFormat.global} Object chứa dữ liệu parser đã chuẩn hóa và CSS tương ứng.
 */
export default function parser(rawText) {
	/** Dữ liệu tệp phụ đề.
	 * 
	 * Info lưu dưới dạng obj do file sub có cấu trúc key: value
	 * 
	 * Styles và Events lưu dưới dạng array do file sub có cấu trúc khác, và trong Lua Automation của Aegisub cũng xử lí tương tự.
	 * @type {parsedDataFormat.global} */
	const parsedData = { info: {}, styles: [], events: [], globalCss: {}, styleCss: [], lineCss: [] };
	if (!rawText) {
		console.warn("[PD-47.ass] parser: Đã có ai làm gì đâu? Đã làm gì đâu? (rawText trống)");
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
					console.warn(`${parserLogPrefix} Tin... File chuẩn chưa em? (Extension ko hỗ trợ tốt với ScriptType=${v})`);
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
				parsedData.styles.push(style);
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
    		}
		}
	}
	parsedData.info.WrapStyle = parseClampedNum(true, parsedData.info.WrapStyle, 0, 0, 3); // Chuẩn hóa .WrapStyle
	parsedData.info.PlayResX = parseClampedNum(true, parsedData.info.PlayResX, 640, 640); // Chuẩn hóa .PlayResX
	parsedData.info.PlayResY = parseClampedNum(true, parsedData.info.PlayResY, 480, 480); // Chuẩn hóa .PlayResY
	parsedData.info.ScaledBorderAndShadow = (parsedData.info.ScaledBorderAndShadow === "yes" ? true : false); // Chuẩn hóa .ScaledBorderAndShadow
	console.log(`${parserLogPrefix} Đã xử lí thô.`, parsedData);
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
	// Phần styleCss (các giá trị trong style)
	// Dựa trên giả định khung video là PlayRes(X-Y).
	parsedData.styles = parsedData.styles.filter(validateAndNormalizeStyle); // Lọc và chuẩn hóa dữ liệu style
	parsedData.styleCss = parsedData.styles.map(styleParsedToCss);


	return parsedData;
}
/** Chuyển đổi style đã chuẩn hóa thành object CSS.
 * Cơ chế: style là dữ liệu đầu tiên khi áp vào các line.
 * @param {parsedDataFormat.style} style Style đã chuẩn hóa.
 * @returns {Object<string, Object<string, string>>} 
 * obj chứa style obj CSS của container node (vỏ), text node (ruột chứa chữ) và dữ liệu bổ sung (cần xử lí sau khi có kích thước khung)
 */
function styleParsedToCss (style) {
	const container = { // Dữ liệu của container node

	};
	const text = { // Dữ liệu của text node

	};
	const data = { // Dữ liệu bổ sung

	};
	return { container, text, data };
}
