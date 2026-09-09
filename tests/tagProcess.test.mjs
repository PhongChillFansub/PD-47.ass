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

test('classify 2.4: \\k/\\K KHÔNG tạo delta (về 2.3 — tags giữ raw)', () => {
	const entry = classify({ base: mkBase([['\\k25'], 'a'], [['\\K50'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: ['\\k25'], text: 'a' });
	assert.deepEqual(entry.base[1], { tags: ['\\K50'], text: 'b' });
	assert.equal(entry.base[0].delta, undefined);
	assert.equal(entry.base[0].anim, undefined);
});

test('classify 2.4: \\kf/\\ko giữa các mục → không delta, không cộng dồn', () => {
	const entry = classify({ base: mkBase([[], 'x'], [['\\kf25'], 'a'], [['\\ko30'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: [], text: 'x' });
	assert.deepEqual(entry.base[1], { tags: ['\\kf25'], text: 'a' });
	assert.deepEqual(entry.base[2], { tags: ['\\ko30'], text: 'b' });
});

test('classify 2.4: cùng mục \\fs30 + \\k25 → chỉ delta.text, KHÔNG data.k', () => {
	const item = classify({ base: mkBase([['\\fs30', '\\k25'], 'na']) }, DEFAULT_STYLE_REF).base[0];
	assert.deepEqual(item.delta, { text: { 'font-size': '30px' } });
	assert.equal(item.anim, undefined);
});

test('classify 2.4: nhiều \\k cùng mục → không delta (không cộng dồn startTime)', () => {
	const entry = classify({ base: mkBase([['\\k25', '\\k30'], 'na'], [['\\k50'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: ['\\k25', '\\k30'], text: 'na' });
	assert.deepEqual(entry.base[1], { tags: ['\\k50'], text: 'x' });
});

test('classify 2.4: \\q last-wins → --wrap-style; \\kt + \\k → không delta', () => {
	const entry = classify({ base: mkBase([['\\q1', '\\q2'], 'a'], [['\\kt50', '\\k10'], 'b']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { text: { '--wrap-style': 2 } });
	assert.deepEqual(entry.base[1], { tags: ['\\kt50', '\\k10'], text: 'b' });
});

test('classify 2.4b: \\t chỉ nội suy tag 2.4.1 — \\k*/\\fn TRONG \\t không áp (apply-now đã BỎ)', () => {
	const entry = classify({
		base: mkBase([['\\k20', '\\t(0,500,\\k99\\fnVerdana\\fs40)', '\\k30'], 'A'], [['\\k40'], 'B']),
	}, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], {
		tags: ['\\k20', '\\t(0,500,\\k99\\fnVerdana\\fs40)', '\\k30'],
		text: 'A',
		anim: [{ t1: 0, t2: 500, easing: 1, target: { 'font-size': '40px' } }],
	});
	assert.equal(entry.base[0].delta, undefined);
	assert.deepEqual(entry.base[1], { tags: ['\\k40'], text: 'B' });
});

test('classify 2.4b: \\an trong \\t không vào target', () => {
	const entry = classify({ base: mkBase([['\\t(\\an5\\fs30)'], 'x']) }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } }]);
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
