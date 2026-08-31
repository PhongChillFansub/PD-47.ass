// Tests cho parser.js: tokenizeLineText + segmentsFromTokens + parser().
// Chữ ký (chốt 31aug26): parser(tagProcessLevel = 0, rawText) → test gọi parser(0, rawText).
// Chạy: npm test (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser, tokenizeLineText, segmentsFromTokens } from '../background/parser.js';

// ======================================================================
// tokenizeLineText
// ======================================================================

test('tokenize: gộp 2 tag liền nhau, bỏ tag comment thuần', () => {
	assert.deepEqual(tokenizeLineText('{\\b1}{\\i1}x{chỉ comment}y'), ['{\\b1\\i1}', 'xy']);
});

test('tokenize: \\N/\\h đứng ngoài tag → wrap thành marker đứng riêng', () => {
	assert.deepEqual(tokenizeLineText('lorem\\Nipsum\\hx'), ['lorem', '{\\N}', 'ipsum', '{\\h}', 'x']);
});

test('tokenize: \\{ \\} giữ nguyên văn trong text (unescape ở renderer)', () => {
	assert.deepEqual(tokenizeLineText('\\{gin\\}'), ['\\{gin\\}']);
});

test('tokenize: tag sau chứa karaoke thì KHÔNG được gộp vào tag trước', () => {
	assert.deepEqual(tokenizeLineText('{\\b1}{\\k25}na'), ['{\\b1}', '{\\k25}', 'na']);
});

test('tokenize: { không đóng → giữ nguyên văn như text', () => {
	assert.deepEqual(tokenizeLineText('abc{def'), ['abc{def']);
});

// ======================================================================
// segmentsFromTokens (tách tag trong token → segment)
// Thứ tự: tokenizeLineText xong → mới tách tag trong token → ghép text token thành segment
// ======================================================================

test('segments: text thuần không có tag → 1 segment { tags: [], text }', () => {
	assert.deepEqual(segmentsFromTokens(tokenizeLineText('xin chào')), [{ tags: [], text: 'xin chào' }]);
});

test('segments: 1 tag token + text token = 1 segment, tag tách thành các tag đơn', () => {
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('{\\bord2\\t(\\fs30)\\c&HFF&}x')),
		[{ tags: ['\\bord2', '\\t(\\fs30)', '\\c&HFF&'], text: 'x' }] // \t(...) không bị tách oan
	);
});

test('segments: text trước mọi tag → segment { tags: [] }; mỗi tag token mở segment mới', () => {
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('abc{\\b1}de{\\i}f')),
		[
			{ tags: [], text: 'abc' },
			{ tags: ['\\b1'], text: 'de' },
			{ tags: ['\\i'], text: 'f' },
		]
	);
});

test('segments: nhiều tag token liền nhau (karaoke) → gộp chung tags của 1 segment', () => {
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('{\\b1}{\\k25}na')),
		[{ tags: ['\\b1', '\\k25'], text: 'na' }]
	);
});

test('segments: marker {\\N} → segment RIÊNG tại đúng vị trí, không ăn mất tag pending', () => {
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('a{\\N}b')),
		[
			{ tags: [], text: 'a' },
			{ tags: ['\\N'], text: '' },
			{ tags: [], text: 'b' },
		]
	);
	// \N đứng trước 1 tag thay vì text: marker flush riêng, \i1 vẫn chờ text kế tiếp
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('a{\\N}{\\i1}b')),
		[
			{ tags: [], text: 'a' },
			{ tags: ['\\N'], text: '' },
			{ tags: ['\\i1'], text: 'b' },
		]
	);
});

test('segments: marker đứng CUỐI dòng vẫn giữ (đã flush thành segment riêng)', () => {
	assert.deepEqual(
		segmentsFromTokens(tokenizeLineText('text{\\N}')),
		[
			{ tags: [], text: 'text' },
			{ tags: ['\\N'], text: '' },
		]
	);
});

test('segments: tag token cuối dòng không có text theo sau → BỎ (không tạo segment)', () => {
	assert.deepEqual(segmentsFromTokens(tokenizeLineText('text{\\i}')), [{ tags: [], text: 'text' }]);
});

test('segments: tokens rỗng → mảng rỗng; input không phải array → mảng rỗng', () => {
	assert.deepEqual(segmentsFromTokens(tokenizeLineText('')), []);
	assert.deepEqual(segmentsFromTokens([]), []);
	assert.deepEqual(segmentsFromTokens(null), []);
});

// ======================================================================
// parser() — parse thô không đổi, không gắn gì thêm vào orgline
// ======================================================================

const MINI_ASS = [
	'[Script Info]',
	'Title: Test parser',
	'ScriptType: v4.00+',
	'WrapStyle: 0',
	'PlayResX: 640',
	'PlayResY: 480',
	'ScaledBorderAndShadow: yes',
	'',
	'[V4+ Styles]',
	'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
	'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
	'',
	'[Events]',
	'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
	'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(320,240)\\an5}Xin {\\c&HFF&}chào{\\N}các bạn',
].join('\n');

test('parser: named export, parse info/styles/events như cũ', () => {
	assert.equal(typeof parser, 'function');
	const parsed = parser(0, MINI_ASS);
	assert.equal(parsed.info.Title, 'Test parser');
	assert.equal(parsed.info.PlayResX, 640);
	assert.equal(parsed.info.WrapStyle, 0);
	assert.equal(parsed.info.ScaledBorderAndShadow, true);
	assert.equal(parsed.styles.length, 1);
	assert.equal(parsed.styles[0].fontName, 'Arial');
	assert.equal(parsed.events.length, 1);
	// 27aug26: convertTimeStringToMs trả ms (nhân 1000) — khớp tên hàm, dùng cho CSS timing.
	assert.equal(parsed.events[0].startTime, 1000); // '0:00:01.00'
	assert.equal(parsed.events[0].endTime, 2000);   // '0:00:02.00'
});

test('parser: KHÔNG gắn segments/classify vào orgline (tách tag là bước rời, gọi khi cần)', () => {
	const parsed = parser(0, MINI_ASS);
	const line = parsed.events[0];
	assert.equal(line.text, '{\\pos(320,240)\\an5}Xin {\\c&HFF&}chào{\\N}các bạn');
	assert.equal(line.runs, undefined);
	assert.equal(line.collision, undefined);
	assert.equal(line.clip, undefined);
	assert.equal(line.segments, undefined);
	// text token hóa + tách tag ngay tại chỗ khi cần (thứ tự: token → tách tag → phân loại)
	assert.deepEqual(segmentsFromTokens(tokenizeLineText(line.text)).length, 4);
});

test('parser: segments ghi vào lineCss (cùng chỉ số với events), KHÔNG đụng orgline', () => {
	const parsed = parser(0, MINI_ASS);
	assert.equal(parsed.lineCss.length, 1); // 1 Dialogue → 1 entry lineCss
	assert.deepEqual(
		parsed.lineCss[0].segments,
		[
			{ tags: ['\\pos(320,240)', '\\an5'], text: 'Xin ' },
			{ tags: ['\\c&HFF&'], text: 'chào' },
			{ tags: ['\\N'], text: '' }, // marker → segment riêng
			{ tags: [], text: 'các bạn' },
		]
	);
	// orgline giữ nguyên, không có dấu vết segments
	const line = parsed.events[0];
	assert.equal(line.segments, undefined);
	assert.equal(line.runs, undefined);
});

test('parser: Dialogue ngắt dòng (continuation) → events và lineCss vẫn cùng chỉ số', () => {
	const ass = MINI_ASS + '\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\b1}bị ngắt\n{\\i}tiếp nối';
	const parsed = parser(0, ass);
	assert.equal(parsed.events.length, 2);
	assert.equal(parsed.lineCss.length, 2); // pop/push đúng → không lệch chỉ số
	assert.equal(parsed.events[1].text, '{\\b1}bị ngắt\n{\\i}tiếp nối');
	assert.equal(parsed.lineCss[1].segments.length, 2);
	assert.deepEqual(parsed.lineCss[1].segments[0].tags, ['\\b1']);
	assert.deepEqual(parsed.lineCss[1].segments[1].tags, ['\\i']);
});

test('parser: thời gian ms chính xác tuyệt đối (toán nguyên, không lỗi float)', () => {
	// 0:00:02.01 là giá trị từng bị float lỗi với cách reduce*1000 (2009.9999999999998)
	const ass = MINI_ASS.replace('Dialogue: 0,0:00:01.00,0:00:02.00', 'Dialogue: 0,0:00:02.01,1:02:03.21');
	const parsed = parser(0, ass);
	assert.equal(parsed.events[0].startTime, 2010);
	assert.equal(parsed.events[0].endTime, 3723210); // 1h2m3.21s
});

test('parser: thời gian — các ca biên (định dạng ngắn, thập phân, rác)', () => {
	const cases = [
		['0:00:02.01', 2010],      // mốc từng dính lỗi float
		['1:02:03.21', 3723210],   // đủ h:mm:ss.cs
		['02:03.21', 123210],      // thiếu giờ → cấp số tính TỪ PHẢI (phút, không phải giờ)
		['0:00:01.2', 1200],       // cs thiếu chữ số → ngữ nghĩa thập phân ('1.2' giây)
		['1:02:03.', 3723000],     // cs trống
		['rác', 0], ['', 0],       // rác → 0
	];
	for (const [t, want] of cases) {
		const ass = MINI_ASS.replace('Dialogue: 0,0:00:01.00,0:00:02.00', 'Dialogue: 0,' + t + ',' + t);
		const parsed = parser(0, ass);
		assert.equal(parsed.events[0].startTime, want, 'startTime sai với đầu vào: ' + JSON.stringify(t));
	}
});

test('parser: pop/merge continuation đúng — đứt 3 lần vẫn gộp 1 event, events/lineCss cùng chỉ số', () => {
	const ass = MINI_ASS
		+ '\nDialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,{\\b1}Đứt lần 1\nlần 2\nlần 3'
		+ '\nDialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Dòng kế';
	const parsed = parser(0, ass);
	// 3 Dialogue vật lý (đứt 3 dòng) → 3 events / 3 lineCss, KHÔNG trùng bản dở
	assert.equal(parsed.events.length, 3);
	assert.equal(parsed.lineCss.length, 3);
	assert.equal(parsed.events[1].text, '{\\b1}Đứt lần 1\nlần 2\nlần 3'); // gộp từ chuỗi gốc
	assert.equal(parsed.events[1].startTime, 3000);
	assert.deepEqual(parsed.lineCss[1].segments, [{ tags: ['\\b1'], text: 'Đứt lần 1\nlần 2\nlần 3' }]);
	assert.deepEqual(parsed.lineCss[2].segments, [{ tags: [], text: 'Dòng kế' }]); // dòng sau không bị dính
});

// ======================================================================
// 31aug26 — Chú ý 1 (pipeline): info chuẩn hóa NGAY trong loop, không re-map sau file
// ======================================================================

test('Chú ý 1: file thiếu info key → seed mặc định, styleCss.push vẫn đúng ngay trong loop', () => {
	// Bỏ hẳn PlayResX/PlayResY/ScaledBorderAndShadow khỏi [Script Info]
	const ass = MINI_ASS
		.replace('PlayResX: 640\n', '')
		.replace('PlayResY: 480\n', '')
		.replace('ScaledBorderAndShadow: yes\n', '');
	const parsed = parser(0, ass);
	assert.equal(parsed.info.PlayResX, 640);
	assert.equal(parsed.info.PlayResY, 480);
	assert.equal(parsed.info.ScaledBorderAndShadow, false);
	// styleCss được push ngay trong loop nhưng data đã đúng (không nhờ re-map cuối file)
	assert.equal(parsed.styleCss.length, 1);
	assert.equal(parsed.styleCss[0].data.playResX, 640);
	assert.equal(parsed.styleCss[0].data.playResY, 480);
	assert.equal(parsed.styleCss[0].data.scaledBorderAndShadow, false);
});

test('Chú ý 1: giá trị rác/ngoài phạm vi bị chuẩn hóa NGAY KHI LƯU vào info', () => {
	const ass = MINI_ASS
		.replace('WrapStyle: 0', 'WrapStyle: 9')          // ngoài 0..3 → clamp 3
		.replace('PlayResX: 640', 'PlayResX: 12')         // dưới min → 640
		.replace('ScaledBorderAndShadow: yes', 'ScaledBorderAndShadow: no');
	const parsed = parser(0, ass);
	assert.equal(parsed.info.WrapStyle, 3);
	assert.equal(parsed.info.PlayResX, 640);
	assert.equal(parsed.info.ScaledBorderAndShadow, false);
	// styleCss dùng đúng info đã chuẩn hóa tại thời điểm push
	assert.equal(parsed.styleCss[0].data.playResX, 640);
	assert.equal(parsed.globalCss['white-space'], 'pre-wrap'); // WrapStyle 3 ≠ 2
});

// ======================================================================
// 31aug26 — Chú ý 2 (pipeline): globalCss làm chuẩn, nhúng sẵn vào container styleCss
// ======================================================================

test('Chú ý 2: parsedData.globalCss giữ làm CHUẨN + container styleCss nhúng đủ globalCss', () => {
	const parsed = parser(0, MINI_ASS); // WrapStyle 0
	// bản chuẩn (renderer tham chiếu cho lớp gốc)
	assert.equal(parsed.globalCss['white-space'], 'pre-wrap');
	assert.equal(parsed.globalCss['word-break'], 'keep-all');
	assert.equal(parsed.globalCss['overflow-wrap'], 'break-word');
	assert.equal(parsed.globalCss['text-wrap'], 'pretty');
	assert.equal(parsed.globalCss['max-width'], '100%');
	// container của style đã chứa sẵn → renderer áp 1 chỗ, không merge riêng
	const container = parsed.styleCss[0].container;
	assert.equal(container['white-space'], 'pre-wrap');
	assert.equal(container['word-break'], 'keep-all');
	assert.equal(container['overflow-wrap'], 'break-word');
	assert.equal(container['text-wrap'], 'pretty');
	assert.equal(container['max-width'], '100%');
	// các props định vị riêng của container vẫn giữ nguyên
	assert.equal(container['display'], 'inline-block');
	assert.equal(container['position'], 'absolute');
	assert.equal(container['text-align'], 'center'); // an=2
});

test('Chú ý 2: WrapStyle đổi → globalCss và container đổi theo cùng lúc', () => {
	const cases = [
		[1, 'pre-wrap', 'wrap'],    // end-of-line word wrapping
		[2, 'pre', 'pretty'],       // no word wrapping → giữ trắng nguyên văn
		[3, 'pre-wrap', 'balance'], // smart wrapping, bottom line wider
	];
	for (const [wrapStyle, whiteSpace, textWrap] of cases) {
		const parsed = parser(0, MINI_ASS.replace('WrapStyle: 0', `WrapStyle: ${wrapStyle}`));
		assert.equal(parsed.info.WrapStyle, wrapStyle);
		assert.equal(parsed.globalCss['white-space'], whiteSpace);
		assert.equal(parsed.globalCss['text-wrap'], textWrap);
		assert.equal(parsed.styleCss[0].container['white-space'], whiteSpace);
		assert.equal(parsed.styleCss[0].container['text-wrap'], textWrap);
	}
});

test('Chú ý 2: ScaledBorderAndShadow=yes lan đúng từ info (chuẩn hóa trong loop) sang data styleCss', () => {
	const parsed = parser(0, MINI_ASS); // file ghi "yes"
	assert.equal(parsed.info.ScaledBorderAndShadow, true);
	assert.equal(parsed.styleCss[0].data.scaledBorderAndShadow, true);
	assert.equal(parsed.styleCss[0].data.playResX, 640);
	assert.equal(parsed.styleCss[0].data.playResY, 480);
});
