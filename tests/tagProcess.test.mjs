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
		delta: { '--font-size': 30, '--spacing': 2, '--font-name': 'Verdana', '--bold': 1, '--italic': 1 },
	}]);
});

test('classify emits raw scale variables for static scale tags', () => {
	const entry = classify(mkBase([['\\fscx150', '\\fscy80'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base, [{ tags: ['\\fscx150', '\\fscy80'], text: 'x', delta: { '--scale-x': 150, '--scale-y': 80 } }]);
	assert.deepEqual(entry.collision, { t: false });
});

test('classify applies reset and ignores unsupported wrap tags', () => {
	const entry = classify(mkBase(
		[['\\r', '\\q1', '\\q2'], 'a'],
		[['\\rAlt', '\\fs20'], 'b'],
	), DEFAULT_STYLE_REF);

	assert.deepEqual(entry.base[0].delta, {
		'--style-name': 'Default',
	});
	assert.deepEqual(entry.base[1].delta, {
		'--style-name': 'Alt', '--font-size': 20,
	});
});

test('classify ignores incomplete local formatting tags', () => {
	const entry = classify(mkBase([['\\b', '\\i', '\\u'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base, [{ tags: ['\\b', '\\i', '\\u'], text: 'x' }]);
});

test('classify records explicit hard-space and line-break markers as data', () => {
	const entry = classify(mkBase([[], 'a'], [['\\N'], ''], [['\\h'], ''], [[], 'b']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0], { tags: [], text: 'a' });
	assert.deepEqual(entry.base[1], { tags: ['\\N'], text: '', data: { marker: '\\N' } });
	assert.deepEqual(entry.base[2], { tags: ['\\h'], text: '', data: { marker: '\\h' } });
	assert.deepEqual(entry.base[3], { tags: [], text: 'b' });
});

test('classify records a usable transform animation and signals collision work', () => {
	const entry = classify(mkBase([['\\t(0,500,\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [
		{ t1: 0, t2: 500, easing: 1, target: { '--font-size': 30 } },
	]);
	assert.deepEqual(entry.collision, { t: true });
});

test('classify parses alternate transform timing forms', () => {
	const accel = classify(mkBase([['\\t(2,\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(accel.base[0].anim, [
		{ t1: 0, t2: null, easing: 2, target: { '--font-size': 30 } },
	]);

	const wholeLine = classify(mkBase([['\\t(\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(wholeLine.base[0].anim, [
		{ t1: 0, t2: null, easing: 1, target: { '--font-size': 30 } },
	]);
});

test('scale data in a transform becomes an animation target', () => {
	const entry = classify(mkBase([['\\t(0,1000,0.5,\\fscx120\\fscy90)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [{ t1: 0, t2: 1000, easing: 0.5, target: { '--scale-x': 120, '--scale-y': 90 } }]);
	assert.deepEqual(entry.collision, { t: true });
});

test('segment-level transformable tags produce the same overrides in static and \\t scopes', () => {
	const style = {
		...DEFAULT_STYLE_REF,
		primaryColour: 'rgba(255, 255, 255, 1.00)',
		secondaryColour: 'rgba(0, 0, 0, 1.00)',
		outlineColour: 'rgba(0, 0, 0, 1.00)',
		backColour: 'rgba(0, 0, 0, 1.00)',
		borderStyle: 1,
		outline: 2,
		shadow: 2,
	};
	const transformable = ['\\c&HFF&', '\\1a&H80&', '\\bord3', '\\xshad4', '\\yshad-2', '\\blur2', '\\frz45', '\\fax0.5'];
	const staticEntry = classify(mkBase([transformable, 'x']), style);
	const animEntry = classify(mkBase([[`\\t(0,100,${transformable.join('')})`], 'x']), style);

	assert.deepEqual(animEntry.base[0].anim, [{
		t1: 0,
		t2: 100,
		easing: 1,
		target: staticEntry.base[0].delta,
	}]);
});

test('segment-level transformable leaves the explicitly unsupported \\be and axis-border tags raw', () => {
	const entry = classify(mkBase([['\\be4', '\\xbord5', '\\ybord2'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base, [{ tags: ['\\be4', '\\xbord5', '\\ybord2'], text: 'x' }]);
});

test('non-transformable decoration and karaoke remain available after the transformable split', () => {
	const entry = classify(mkBase([['\\u1', '\\s1', '\\k20'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { '--underline': true, '--strike-out': true });
	assert.deepEqual(entry.base[0].data, { k: { type: 'k', durationMs: 200, startMs: 0 } });
});

test('non-transformable decoration inside \\t applies to the enclosing static segment', () => {
	const entry = classify(mkBase([['\\t(0,100,\\u1\\s1)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { '--underline': true, '--strike-out': true });
	assert.equal(entry.base[0].anim, undefined);
	assert.deepEqual(entry.collision, { t: true });
});

test('layout-global tags in a transform do not become animation targets', () => {
	const entry = classify(mkBase([['\\t(\\pos(10,20)\\an5\\fs30)'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, [
		{ t1: 0, t2: null, easing: 1, target: { '--font-size': 30 } },
	]);
});

test('clip data is currently a stable empty stub and unrelated tags are retained', () => {
	const entry = classify(mkBase([['\\clip(0,0,100,100)', '\\fs30'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { '--font-size': 30 });
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
		tags: ['\\fs30'], text: 'chào', delta: { '--font-size': 30 },
	});
	assert.deepEqual(parsed.lineCss[0].base[2], {
		tags: ['\\N'], text: '', data: { marker: '\\N' },
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
	assert.deepEqual(entry.base[0].delta, { '--color1': 'rgba(255, 0, 0, 1.00)' });
	assert.deepEqual(entry.base[0].data, { k: { type: 'k', durationMs: 200, startMs: 0 } });
});

test('all transformable numeric tags use raw override variables in static and transform scopes', () => {
	const tags = ['\\fs30', '\\fsp-1.5', '\\fsc120', '\\fscy80', '\\bord3',
		'\\shad2', '\\xshad-4', '\\yshad5', '\\blur1.5', '\\frx10',
		'\\fry20', '\\frz30', '\\fr40', '\\fax0.5', '\\fay-0.25'];
	const expected = {
		'--font-size': 30, '--spacing': -1.5, '--scale-x': 120, '--scale-y': 80,
		'--outline': 3, '--shadow-x': -4, '--shadow-y': 5, '--blur': 1.5,
		'--angle-x': 10, '--angle-y': 20, '--angle-z': 40, '--skew-x': 0.5, '--skew-y': -0.25,
	};
	const entry = classify(mkBase([tags, 'x'], [[`\\t(${tags.join('')})`], 'y']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, expected);
	assert.deepEqual(entry.base[1].anim[0].target, expected);
});

test('color and alpha overrides combine in tag order and use static color as transform fallback', () => {
	const style = { ...DEFAULT_STYLE_REF, primaryColour: 'rgba(1, 2, 3, 0.75)',
		secondaryColour: 'rgba(4, 5, 6, 1.00)', outlineColour: 'rgba(7, 8, 9, 1.00)',
		backColour: 'rgba(10, 11, 12, 1.00)' };
	const tags = ['\\alpha&H80&', '\\1c&HFF&', '\\2a&H00&', '\\3c&HFF0000&',
		'\\4c&H00FF00&', '\\t(\\1a&H00&)'];
	const entry = classify(mkBase([tags, 'x']), style);
	assert.deepEqual(entry.base[0].delta, {
		'--color1': 'rgba(255, 0, 0, 0.50)', '--color2': 'rgba(4, 5, 6, 1.00)',
		'--color3': 'rgba(0, 0, 255, 0.50)', '--color4': 'rgba(0, 255, 0, 0.50)',
	});
	assert.deepEqual(entry.base[0].anim[0].target, { '--color1': 'rgba(255, 0, 0, 1.00)' });
});

test('alpha before color is retained without style and invalid tags do not overwrite values', () => {
	const entry = classify(mkBase([['\\1a&H80&', '\\c&HFF&', '\\fs30', '\\fs2junk',
		'\\bord3', '\\bordbad', '\\c&HZZ&'], 'x']), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { '--color1': 'rgba(255, 0, 0, 0.50)', '--font-size': 30, '--outline': 3 });
});

test('karaoke clock spans items and non-transformable tags apply in source order', () => {
	const entry = classify(mkBase(
		[['\\k10', '\\kf20', '\\u1', '\\t(\\u0\\fs40)', '\\s1'], 'a'],
		[['\\ko5'], 'b'],
	), DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, { '--underline': false, '--strike-out': true });
	assert.deepEqual(entry.base[0].data.k, { type: 'kf', durationMs: 200, startMs: 100 });
	assert.deepEqual(entry.base[1].data.k, { type: 'ko', durationMs: 50, startMs: 300 });
	assert.deepEqual(entry.base[0].anim[0].target, { '--font-size': 40 });
});

test('numeric tag prefixes are distinguished and invalid values do not overwrite overrides', () => {
	const tags = ['\\fs20', '\\fsp3', '\\fsc120', '\\fscx150', '\\fscy80',
		'\\fr15', '\\frx30', '\\fry40', '\\frz45', '\\shad2', '\\xshad3', '\\yshad4',
		'\\fscxinvalid', '\\fspbad', '\\frxinvalid', '\\shadbad'];
	const expected = {
		'--font-size': 20, '--spacing': 3, '--scale-x': 150, '--scale-y': 80,
		'--angle-z': 45, '--angle-x': 30, '--angle-y': 40,
		'--shadow-x': 3, '--shadow-y': 4,
	};
	const result = classify(mkBase([tags, 'x'], [[`\\t(${tags.join('')})`], 'y']), DEFAULT_STYLE_REF);
	assert.deepEqual(result.base[0].delta, expected);
	assert.deepEqual(result.base[1].anim[0].target, expected);
});
