// Tests cho tagProcess.js — classify() 09sep26 (bản sau khi BỎ apply-now).
// 2.4: 2.4.1/2.4.2 TĨNH (delta.text / delta.data.marker) + \t → anim (MẢNG trực tiếp);
// karaoke \k* KHÔNG xử lí ở 2.4 (về 2.3); 2.3 no-op; 2.2 signal \t; 2.1 stub.
// File CHỈ export classify (mọi hàm nhóm private).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '../background/parser.js';
import { classify } from '../background/tagProcess.js';

const mkBase = (...pairs) => pairs.map(([tags, text]) => ({ tags, text }));

const DEFAULT_STYLE_REF = { name: 'Default', fontName: 'Arial', fontSize: 20, alignment: 2 };

const MINI_ASS = [
	'[Script Info]',
	'Title: Test tagProcess',
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

test('classify 2.4: \\fs \\fsc \\fsp \\fn \\b \\i → delta.text CSS-cooked, tags GIỮ NGUYÊN', () => {
	const entry = classify({ base: mkBase([['\\fs30', '\\fsc150', '\\fsp2', '\\fnVerdana', '\\b1', '\\i1'], 'chữ']) }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 1);
	const item = entry.base[0];
	assert.equal(item.text, 'chữ');
	assert.deepEqual(item.tags, ['\\fs30', '\\fsc150', '\\fsp2', '\\fnVerdana', '\\b1', '\\i1']);
	assert.deepEqual(item.delta, {
		text: {
			'font-size': '30px',
			'transform': 'scaleX(1.5) scaleY(1.5)',
			'letter-spacing': '2px',
			'font-family': '"Verdana", sans-serif',
			'font-weight': '700',
			'font-style': 'italic',
		},
	});
	assert.equal(item.anim, undefined);
});

test('classify 2.4: \\b/\\i/\\u KHÔNG có số đằng sau → coi như KHÔNG có tag', () => {
	const entry = classify({ base: mkBase([['\\b'], 'x'], [['\\i'], 'y'], [['\\u'], 'z']) }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 3);
	assert.deepEqual(entry.base[0], { tags: ['\\b'], text: 'x' });
	assert.deepEqual(entry.base[1], { tags: ['\\i'], text: 'y' });
	assert.deepEqual(entry.base[2], { tags: ['\\u'], text: 'z' });
});

test('classify 2.4: \\b0 \\i0 → tắt; \\fscx100 identity VẪN emit transform scaleX(1)', () => {
	const entry = classify({ base: mkBase([['\\b0', '\\i0', '\\fscx100'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, {
		text: { 'font-weight': '400', 'font-style': 'normal', transform: 'scaleX(1)' },
	});
});

test('classify 2.4: chỉ 1 trục scale → transform chỉ có scaleX hoặc scaleY', () => {
	const entry = classify({ base: mkBase([['\\fscy80'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { transform: 'scaleY(0.8)' });
});

test('classify 2.4: nhiều tag scale trong CÙNG mục — tag SAU thắng', () => {
	const entry = classify({ base: mkBase([['\\fscx150', '\\fscy90', '\\fscx200'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { transform: 'scaleX(2) scaleY(0.9)' });
});

test('classify 2.4: \\r rỗng → --base-style-name = style DÒNG; \\rAlt → tên', () => {
	const toDefault = classify({ base: mkBase([['\\r'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(toDefault.base[0].delta, { text: { '--base-style-name': 'Default' } });
	const toAlt = classify({ base: mkBase([['\\rAltStyle'], 'x']) }, { name: 'Default', fontName: 'Arial' });
	assert.deepEqual(toAlt.base[0].delta, { text: { '--base-style-name': 'AltStyle' } });
});

test('classify 2.4: \\r + \\fs cùng mục → delta.text gộp --base-style-name + font-size', () => {
	const entry = classify({ base: mkBase([['\\rAlt', '\\fs20'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, {
		text: { '--base-style-name': 'Alt', 'font-size': '20px' },
	});
});

test('classify 2.4: marker \\N/\\h → delta.data { marker }', () => {
	const entry = classify({ base: mkBase([[], 'a'], [['\\N'], ''], [[], 'b']) }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 3);
	assert.deepEqual(entry.base[0], { tags: [], text: 'a' });
	assert.deepEqual(entry.base[1], { tags: ['\\N'], text: '', delta: { data: { marker: '\\N' } } });
	assert.deepEqual(entry.base[2], { tags: [], text: 'b' });
	const entryH = classify({ base: mkBase([[], 'a'], [['\\h'], ''], [[], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entryH.base[1].delta, { data: { marker: '\\h' } });
});

test('classify 2.4b: \\t(t1,t2,mods) → anim MẢNG + collision.t = true', () => {
	const entry = classify({ base: mkBase([['\\t(0,500,\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: 500, easing: 1, target: { 'font-size': '30px' } }]);
	assert.equal(entry.collision.t, true);
});

test('classify 2.4b: \\t(accel,mods) 1 số → easing = accel, t2 = null', () => {
	const entry = classify({ base: mkBase([['\\t(2,\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: null, easing: 2, target: { 'font-size': '30px' } }]);
});

test('classify 2.4b: \\t(mods) không số → toàn dòng', () => {
	const entry = classify({ base: mkBase([['\\t(\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } }]);
});

test('classify 2.4b: \\t(t1,t2,accel,mods) + scale target', () => {
	const entry = classify({ base: mkBase([['\\t(0,1000,0.5,\\fscx120\\fscy90)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: 1000, easing: 0.5, target: { transform: 'scaleX(1.2) scaleY(0.9)' } }]);
});

test('classify 2.4b: \\t chứa \\pos/\\move/\\org → BỎ QUA khỏi target', () => {
	const entry = classify({ base: mkBase([['\\t(\\pos(10,20)\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } }]);
	const entryMove = classify({ base: mkBase([['\\t(\\move(1,2,3,4))'], 'x']) }, DEFAULT_STYLE_REF);
	assert.equal(entryMove.base[0].anim, undefined);
	assert.equal(entryMove.collision.t, true);
});

test('classify 2.4b: không \\t → collision.t = false', () => {
	const entry = classify({ base: mkBase([[], 'Xin chào']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.collision, { t: false });
});

test('classify 2.3: \\k tạo data.k; \\K KHÔNG xử lí (không delta, không đẩy nhịp)', () => {
	const entry = classify({ base: mkBase([['\\k25'], 'a'], [['\\K50'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: ['\\k25'], text: 'a', delta: { data: { k: { type: 'k', durationMs: 250, startMs: 0 } } } });
	assert.deepEqual(entry.base[1], { tags: ['\\K50'], text: 'b' });
	assert.equal(entry.base[0].anim, undefined);
});

test('classify 2.3: \\kf/\\ko giữa các mục → data.k cộng dồn mức dòng', () => {
	const entry = classify({ base: mkBase([[], 'x'], [['\\kf25'], 'a'], [['\\ko30'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: [], text: 'x' });
	assert.deepEqual(entry.base[1], { tags: ['\\kf25'], text: 'a', delta: { data: { k: { type: 'kf', durationMs: 250, startMs: 0 } } } });
	assert.deepEqual(entry.base[2], { tags: ['\\ko30'], text: 'b', delta: { data: { k: { type: 'ko', durationMs: 300, startMs: 250 } } } });
});

test('classify 2.3: cùng mục \\fs30 + \\k25 → delta.text (2.4) + data.k (2.3) merge, KHÔNG anim', () => {
	const item = classify({ base: mkBase([['\\fs30', '\\k25'], 'na']) }, DEFAULT_STYLE_REF).base[0];
	assert.deepEqual(item.delta, { text: { 'font-size': '30px' }, data: { k: { type: 'k', durationMs: 250, startMs: 0 } } });
	assert.equal(item.anim, undefined);
});

test('classify 2.3: nhiều \\k cùng mục → tag CUỐI thắng (syllable hiển thị), nhịp vẫn cộng dồn đủ', () => {
	const entry = classify({ base: mkBase([['\\k25', '\\k30'], 'na'], [['\\k50'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: ['\\k25', '\\k30'], text: 'na', delta: { data: { k: { type: 'k', durationMs: 300, startMs: 250 } } } });
	// \\k25 (syllable rỗng) vẫn đẩy nhịp → \\k50 của item sau bắt đầu ở 550.
	assert.deepEqual(entry.base[1], { tags: ['\\k50'], text: 'x', delta: { data: { k: { type: 'k', durationMs: 500, startMs: 550 } } } });
});

test('classify 2.4: \\q last-wins → --wrap-style; \\kt KHÔNG xử lí (wontfix) nhưng \\k cùng mục vẫn ra data.k', () => {
	const entry = classify({ base: mkBase([['\\q1', '\\q2'], 'a'], [['\\kt50', '\\k10'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { text: { '--wrap-style': 2 } });
	assert.deepEqual(entry.base[1], { tags: ['\\kt50', '\\k10'], text: 'b', delta: { data: { k: { type: 'k', durationMs: 100, startMs: 0 } } } });
});

test('classify 2.4: \\t nội suy tag 2.4.1 — tag 2.4.2 TRONG \\t áp apply-now (11sep26); \\k* KHÔNG áp ở 2.4 (về 2.3)', () => {
	const entry = classify({
		base: mkBase([['\\k20', '\\t(0,500,\\k99\\fnVerdana\\fs40)', '\\k30'], 'A'], [['\\k40'], 'B']),
	}, DEFAULT_STYLE_REF);
	// Karaoke: \\k99 TRONG \\t bỏ im lặng (SAI SỐ chấp nhận — #17); \\k20 rồi \\k30 → item A nhận tag cuối.
	assert.deepEqual(entry.base[0], {
		tags: ['\\k20', '\\t(0,500,\\k99\\fnVerdana\\fs40)', '\\k30'],
		text: 'A',
		delta: { text: { 'font-family': '"Verdana", sans-serif' }, data: { k: { type: 'k', durationMs: 300, startMs: 200 } } },
		anim: [{ t1: 0, t2: 500, easing: 1, target: { 'font-size': '40px' } }],
	});
	assert.deepEqual(entry.base[1], { tags: ['\\k40'], text: 'B', delta: { data: { k: { type: 'k', durationMs: 400, startMs: 500 } } } });
});

test('classify 2.4b: \\an trong \\t không vào target', () => {
	const entry = classify({ base: mkBase([['\\t(\\an5\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } }]);
});

// ==== Nhóm 2.3 — Decoration Local Tags (11sep26) ====
// Style đầy đủ field decoration (màu/bord/shadow) cho các test 2.3.
const DECOR_STYLE_REF = {
	name: 'Decor', fontName: 'Arial', fontSize: 20, alignment: 2,
	primaryColour: 'rgba(255, 255, 255, 1.00)',
	secondaryColour: 'rgba(255, 0, 0, 1.00)',
	outlineColour: 'rgba(0, 0, 0, 1.00)',
	backColour: 'rgba(0, 0, 0, 0.50)',
	borderStyle: 1, outline: 2, shadow: 2, angle: 0, scaleX: 100, scaleY: 100,
};

test('classify 2.3: \\1c/\\c → delta.text color + --primary-color (rgba nấu từ &HBBGGRR&)', () => {
	const entry = classify({
		base: mkBase([['\\1c&H00FF00&'], 'A'], [['\\c&HFF&'], 'B']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, {
		text: { 'color': 'rgba(0, 255, 0, 1.00)', '--primary-color': 'rgba(0, 255, 0, 1.00)' },
	});
	// \\c chỉ đổi RGB — alpha kế thừa primaryColour của style (1.00).
	assert.deepEqual(entry.base[1].delta, {
		text: { 'color': 'rgba(255, 0, 0, 1.00)', '--primary-color': 'rgba(255, 0, 0, 1.00)' },
	});
	assert.deepEqual(entry.base[0].tags, ['\\1c&H00FF00&']); // tags GIỮ NGUYÊN
});

test('classify 2.3: \\2c \\3c \\4c → --secondary-color / stroke-color + --outline-color / --back-color (+text-shadow khi style có shadow)', () => {
	const entry = classify({
		base: mkBase([['\\2c&H0000FF&'], 'A'], [['\\3c&H00FF00&'], 'B'], [['\\4c&HFF0000&'], 'C']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { '--secondary-color': 'rgba(255, 0, 0, 1.00)' });
	assert.deepEqual(entry.base[1].delta.text, {
		'-webkit-text-stroke-color': 'rgba(0, 255, 0, 1.00)',
		'--outline-color': 'rgba(0, 255, 0, 1.00)',
	});
	// \\4c chỉ đổi RGB — alpha kế thừa backColour của style (0.50), đúng ngữ nghĩa Aegisub.
	assert.deepEqual(entry.base[2].delta.text, {
		'--back-color': 'rgba(0, 0, 255, 0.50)',
		'text-shadow': '2px 2px rgba(0, 0, 255, 0.50)',
	});
});

test('classify 2.3: \\alpha (mọi kênh) + \\1a..\\4a — rgb lấy từ style khi tag chỉ có alpha', () => {
	const entry = classify({
		base: mkBase([['\\alpha&H40&'], 'A'], [['\\1a&HFF&', '\\3c&H00FF00&'], 'B']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, {
		'color': 'rgba(255, 255, 255, 0.75)',
		'--primary-color': 'rgba(255, 255, 255, 0.75)',
		'--secondary-color': 'rgba(255, 0, 0, 0.75)',
		'-webkit-text-stroke-color': 'rgba(0, 0, 0, 0.75)',
		'--outline-color': 'rgba(0, 0, 0, 0.75)',
		'--back-color': 'rgba(0, 0, 0, 0.75)',
		'text-shadow': '2px 2px rgba(0, 0, 0, 0.75)',
	});
	assert.deepEqual(entry.base[1].delta.text, {
		'color': 'rgba(255, 255, 255, 0.00)',
		'--primary-color': 'rgba(255, 255, 255, 0.00)',
		'-webkit-text-stroke-color': 'rgba(0, 255, 0, 1.00)',
		'--outline-color': 'rgba(0, 255, 0, 1.00)',
	});
});

test('classify 2.3: \\be/\\blur → filter blur; giá trị 0 → none; last-wins giữa \\be và \\blur', () => {
	const entry = classify({
		base: mkBase([['\\blur3'], 'A'], [['\\be2'], 'B'], [['\\blur0'], 'C'], [['\\be5', '\\blur1'], 'D']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { 'filter': 'blur(3px)' });
	assert.deepEqual(entry.base[1].delta.text, { 'filter': 'blur(2px)' });
	assert.deepEqual(entry.base[2].delta.text, { 'filter': 'none' });
	assert.deepEqual(entry.base[3].delta.text, { 'filter': 'blur(1px)' });
});

test('classify 2.3: \\fr/\\frx/\\fry/\\frz → --angle-* (deg raw); \\fax/\\fay → --skew-* (deg nấu từ atan)', () => {
	const entry = classify({
		base: mkBase([['\\fr45'], 'A'], [['\\frx10', '\\fry-20', '\\frz30'], 'B'], [['\\fax1'], 'C']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { '--angle-z': '45deg' });
	assert.deepEqual(entry.base[1].delta.text, { '--angle-x': '10deg', '--angle-y': '-20deg', '--angle-z': '30deg' });
	// atan(1) = 45 độ — skew nấu sẵn deg để renderer chỉ việc ráp transform.
	assert.deepEqual(entry.base[2].delta.text, { '--skew-x': '45deg' });
});

test('classify 2.3: \\bord → stroke ×2 + --outline-width; \\xbord/\\ybord → xấp xỉ max(x,y); \\bord0 hợp lệ', () => {
	const entry = classify({
		base: mkBase([['\\bord4'], 'A'], [['\\xbord1', '\\ybord5'], 'B'], [['\\bord0'], 'C']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { '-webkit-text-stroke-width': '8px', '--outline-width': '4px' });
	assert.deepEqual(entry.base[1].delta.text, { '-webkit-text-stroke-width': '10px', '--outline-width': '5px' });
	assert.deepEqual(entry.base[2].delta.text, { '-webkit-text-stroke-width': '0px', '--outline-width': '0px' });
});

test('classify 2.3: \\shad → text-shadow + --shadow-depth; \\shad0 → none; \\xshad/\\yshad offset chính xác; màu từ \\4c cùng item', () => {
	const entry = classify({
		base: mkBase([['\\shad3'], 'A'], [['\\shad0'], 'B'], [['\\xshad4', '\\yshad1'], 'C'], [['\\4c&HFF&', '\\shad2'], 'D']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { 'text-shadow': '3px 3px rgba(0, 0, 0, 0.50)', '--shadow-depth': '3px' });
	assert.deepEqual(entry.base[1].delta.text, { 'text-shadow': 'none', '--shadow-depth': '0px' });
	assert.deepEqual(entry.base[2].delta.text, { 'text-shadow': '4px 1px rgba(0, 0, 0, 0.50)', '--shadow-depth': '4px' });
	// \\4c&HFF& kế thừa alpha backColour style (0.50) — text-shadow dùng màu back hiệu dụng.
	assert.deepEqual(entry.base[3].delta.text, {
		'--back-color': 'rgba(255, 0, 0, 0.50)',
		'text-shadow': '2px 2px rgba(255, 0, 0, 0.50)',
		'--shadow-depth': '2px',
	});
});

test('classify 2.3: \\fs (2.4) + \\1c (2.3) cùng item → merge vào CÙNG delta.text, không ghi đè', () => {
	const item = classify({ base: mkBase([['\\fs30', '\\1c&H00FF00&'], 'x']) }, DECOR_STYLE_REF).base[0];
	assert.deepEqual(item.delta.text, {
		'font-size': '30px',
		'color': 'rgba(0, 255, 0, 1.00)',
		'--primary-color': 'rgba(0, 255, 0, 1.00)',
	});
});

const BOX_STYLE_REF = Object.freeze({ ...DECOR_STYLE_REF, borderStyle: 3 });

test('classify 2.3 box (borderStyle 3): \\3c → container background-color; \\bord → container padding; \\shad → container box-shadow', () => {
	const entry = classify({
		base: mkBase([['\\3c&H00FF00&'], 'A'], [['\\bord5'], 'B'], [['\\shad3'], 'C'], [['\\shad0'], 'D']),
	}, BOX_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { container: { 'background-color': 'rgba(0, 255, 0, 1.00)' } });
	assert.deepEqual(entry.base[1].delta, { container: { padding: '5px' }, text: { '--outline-width': '5px' } });
	assert.deepEqual(entry.base[2].delta, { container: { 'box-shadow': '3px 3px rgba(0, 0, 0, 0.50)' }, text: { '--shadow-depth': '3px' } });
	assert.deepEqual(entry.base[3].delta, { container: { 'box-shadow': 'none' }, text: { '--shadow-depth': '0px' } });
});

test('classify 2.3: tag 2.3 TRONG \\t → anim.t[].target; \\k* trong \\t bỏ im lặng (SAI SỐ #17); item không delta ngoài', () => {
	const entry = classify({
		base: mkBase([['\\t(0,500,\\1c&H0000FF&\\bord4\\fr30\\k10)'], 'x']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{
		t1: 0, t2: 500, easing: 1,
		target: {
			'color': 'rgba(255, 0, 0, 1.00)',
			'--primary-color': 'rgba(255, 0, 0, 1.00)',
			'-webkit-text-stroke-width': '8px',
			'--outline-width': '4px',
			'--angle-z': '30deg',
		},
	}]);
	assert.equal(entry.base[0].delta, undefined);
});

test('classify 2.3: \\clip KHÔNG bị 2.3 tiêu thụ (việc của 2.1); tag 2.2/2.4 đi qua không tạo delta thừa', () => {
	const entry = classify({
		base: mkBase([['\\clip(0,0,100,100)', '\\fs30'], 'x'], [['\\an5'], 'y']),
	}, DECOR_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { text: { 'font-size': '30px' } });
	assert.deepEqual(entry.base[0].tags, ['\\clip(0,0,100,100)', '\\fs30']); // tags GIỮ NGUYÊN cho 2.1
	assert.equal(entry.base[1].delta, undefined);
});

test('classify: lineCss[i] đủ { base, collision, clip }', () => {
	const entry = classify({ base: mkBase([['\\fs30'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(Object.keys(entry).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(entry.clip, { rawList: [], effectiveType: null, effectiveRaw: null });
	assert.equal(entry.base[0].text, 'x');
});

test('classify: base rỗng / không phải array → không lỗi', () => {
	assert.deepEqual(classify({ base: [] }, DEFAULT_STYLE_REF), { base: [], collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null } });
	assert.deepEqual(classify({}, DEFAULT_STYLE_REF), { base: [], collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null } });
});

test('tagProcess: CHỈ export classify (mọi hàm nhóm private)', async () => {
	const mod = await import('../background/tagProcess.js');
	assert.deepEqual(Object.keys(mod).sort(), ['classify']);
});

test('classify qua parser(): marker \\N có delta.data', () => {
	const parsed = parser(false, MINI_ASS);
	assert.equal(parsed.lineCss.length, 1);
	assert.deepEqual(Object.keys(parsed.lineCss[0]).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(parsed.lineCss[0].collision, { t: false });
	assert.deepEqual(parsed.lineCss[0].clip, { rawList: [], effectiveType: null, effectiveRaw: null });
	assert.deepEqual(parsed.lineCss[0].base[2].delta.data, { marker: '\\N' });
	assert.equal(parsed.events[0].delta, undefined);
});
