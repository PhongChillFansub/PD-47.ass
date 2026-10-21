// Tests for tagProcess.js's public classify(base, styleRef) API.
// classify mutates the supplied base items by attaching delta/anim metadata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '../background/parser.js';
import { classify } from '../background/tagProcess.js';

const mkBase = (...pairs) => pairs.map(([tags, text]) => ({ tags, text }));
const DEFAULT_STYLE_REF = Object.freeze({
	name: 'Default', fontName: 'Arial', fontSize: 20, alignment: 2,
});

const MINI_ASS = [
	'[Script Info]',
	'ScriptType: v4.00+',
	'WrapStyle: 0',
	'PlayResX: 640',
	'PlayResY: 480',
	'LayoutResX: 640',
	'LayoutResY: 480',
	'ScaledBorderAndShadow: yes',
	'',
	'[V4+ Styles]',
	'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
	'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
	'',
	'[Events]',
	'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
	'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Xin {\\fs30}chào{\\N}các bạn',
].join('\n');

test('classify accepts the base array directly and preserves item tags/text', () => {
	const base = mkBase([['\\fs30', '\\fsp2', '\\fnVerdana', '\\b1', '\\i1'], 'chữ']);
	const entry = classify(base, DEFAULT_STYLE_REF);

	assert.strictEqual(entry.base, base);
	assert.deepEqual(entry.base, [{
		tags: ['\\fs30', '\\fsp2', '\\fnVerdana', '\\b1', '\\i1'],
		text: 'chữ',
		delta: {
			text: {
				'font-size': '30px',
				'letter-spacing': '2px',
				'font-family': '"Verdana", sans-serif',
				'font-weight': '700',
				'font-style': 'italic',
			},
		},
	}]);
});

test('classify does not emit the legacy direct transform for static scale tags', () => {
	const entry = classify(mkBase([['\\fscx150', '\\fscy80'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base, [{ tags: ['\\fscx150', '\\fscy80'], text: 'x' }]);
	assert.deepEqual(entry.collision, { t: false });
});

test('classify applies reset and wrap tags as text-level deltas', () => {
	const entry = classify(mkBase(
		[['\\r', '\\q1', '\\q2'], 'a'],
		[['\\rAlt', '\\fs20'], 'b'],
	), DEFAULT_STYLE_REF);

	assert.deepEqual(entry.base[0].delta, {
		text: { '--base-style-name': 'Default', '--wrap-style': 2 },
	});
	assert.deepEqual(entry.base[1].delta, {
		text: { '--base-style-name': 'Alt', 'font-size': '20px' },
	});
});

test('classify ignores incomplete local formatting tags', () => {
	const entry = classify(mkBase([['\\b', '\\i', '\\u'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base, [{ tags: ['\\b', '\\i', '\\u'], text: 'x' }]);
});

test('classify records explicit hard-space and line-break markers as data', () => {
	const entry = classify(mkBase([[], 'a'], [['\\N'], ''], [['\\h'], ''], [[], 'b']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: [], text: 'a' });
	assert.deepEqual(entry.base[1], { tags: ['\\N'], text: '', delta: { data: { marker: '\\N' } } });
	assert.deepEqual(entry.base[2], { tags: ['\\h'], text: '', delta: { data: { marker: '\\h' } } });
	assert.deepEqual(entry.base[3], { tags: [], text: 'b' });
});

test('classify records a usable transform animation and signals collision work', () => {
	const entry = classify(mkBase([['\\t(0,500,\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [
		{ t1: 0, t2: 500, easing: 1, target: { 'font-size': '30px' } },
	]);
	assert.deepEqual(entry.collision, { t: true });
});

test('classify parses alternate transform timing forms', () => {
	const accel = classify(mkBase([['\\t(2,\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(accel.base[0].anim, [
		{ t1: 0, t2: null, easing: 2, target: { 'font-size': '30px' } },
	]);

	const wholeLine = classify(mkBase([['\\t(\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(wholeLine.base[0].anim, [
		{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } },
	]);
});

test('a transform containing only unsupported scale data has no animation target but still signals \\t', () => {
	const entry = classify(mkBase([['\\t(0,1000,0.5,\\fscx120\\fscy90)'], 'x']), DEFAULT_STYLE_REF);
	assert.equal(entry.base[0].anim, undefined);
	assert.deepEqual(entry.collision, { t: true });
});

test('layout-global tags in a transform do not become animation targets', () => {
	const entry = classify(mkBase([['\\t(\\pos(10,20)\\an5\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [
		{ t1: 0, t2: null, easing: 1, target: { 'font-size': '30px' } },
	]);
});

test('clip data is currently a stable empty stub and unrelated tags are retained', () => {
	const entry = classify(mkBase([['\\clip(0,0,100,100)', '\\fs30'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { text: { 'font-size': '30px' } });
	assert.deepEqual(entry.base[0].tags, ['\\clip(0,0,100,100)', '\\fs30']);
	assert.deepEqual(entry.clip, { rawList: [], effectiveType: null, effectiveRaw: null });
});

test('classify preserves its input for an empty or non-array base', () => {
	assert.deepEqual(classify([], DEFAULT_STYLE_REF), {
		base: [], collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null },
	});
	assert.deepEqual(classify({}, DEFAULT_STYLE_REF), {
		base: {}, collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null },
	});
});

test('tagProcess exports only classify', async () => {
	const mod = await import('../background/tagProcess.js');
	assert.deepEqual(Object.keys(mod).sort(), ['classify']);
});

test('parser supplies classifier input as a base array and retains line result shape', () => {
	const parsed = parser(false, MINI_ASS);
	assert.deepEqual(Object.keys(parsed.lineCss[0]).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(parsed.lineCss[0].base[1], {
		tags: ['\\fs30'], text: 'chào', delta: { text: { 'font-size': '30px' } },
	});
	assert.deepEqual(parsed.lineCss[0].base[2], {
		tags: ['\\N'], text: '', delta: { data: { marker: '\\N' } },
	});
});

test('classify cooks color and karaoke decoration metadata using the style color channels', () => {
	const entry = classify(mkBase([['\\c&HFF&', '\\k20'], 'x']), {
		...DEFAULT_STYLE_REF,
		primaryColour: 'rgba(255, 255, 255, 1.00)',
		secondaryColour: 'rgba(255, 0, 0, 1.00)',
		outlineColour: 'rgba(0, 0, 0, 1.00)',
		backColour: 'rgba(0, 0, 0, 1.00)',
	});
	assert.deepEqual(entry.base[0].delta, {
		text: {
			color: 'rgba(255, 0, 0, 1.00)',
			'--primary-color': 'rgba(255, 0, 0, 1.00)',
		},
		data: { k: { type: 'k', durationMs: 200, startMs: 0 } },
	});
});
