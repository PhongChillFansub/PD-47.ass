// Tests for parser.js through its public parser(doStripTags, rawText) export.
// Tokenization helpers remain private and are exercised through lineCss[].base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser } from '../background/parser.js';
import {
	decorationToCss,
	outlineStyleToCss,
	outlineWidthToCss,
	parseCssRgba,
	scaleAngleToCss,
	shadBlurToCss,
} from '../background/utils.js';

const STYLE_LINE = 'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1';
const MINI_ASS = [
	'[Script Info]',
	'Title: Test parser',
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
	STYLE_LINE,
	'',
	'[Events]',
	'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
	'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(320,240)\\an5}Xin {\\fs30}chào{\\N}các bạn',
].join('\n');

const DLG_TEXT = '{\\pos(320,240)\\an5}Xin {\\fs30}chào{\\N}các bạn';
const assWithText = text => MINI_ASS.replace(DLG_TEXT, () => text);
const baseOfLine = text => parser(false, assWithText(text)).lineCss[0].base
	.map(({ tags, text: itemText }) => ({ tags, text: itemText }));

// Tokenization and base-item construction

test('tokenize merges adjacent override blocks and drops comment-only blocks', () => {
	assert.deepEqual(baseOfLine('{\\b1}{\\i1}x{comment only}y'), [
		{ tags: ['\\b1', '\\i1'], text: 'xy' },
	]);
});

test('tokenize turns outside N and hard-space markers into standalone items', () => {
	assert.deepEqual(baseOfLine('lorem\\Nipsum\\hx'), [
		{ tags: [], text: 'lorem' },
		{ tags: ['\\N'], text: '' },
		{ tags: [], text: 'ipsum' },
		{ tags: ['\\h'], text: '' },
		{ tags: [], text: 'x' },
	]);
});

test('tokenize leaves escaped braces and an unclosed opening brace as literal text', () => {
	assert.deepEqual(baseOfLine('\\{gin\\}'), [{ tags: [], text: '\\{gin\\}' }]);
	assert.deepEqual(baseOfLine('abc{def'), [{ tags: [], text: 'abc{def' }]);
});

test('tokenize discards empty backslash chunks while splitting tags', () => {
	assert.deepEqual(baseOfLine('{\\b1\\\\i1}x'), [{ tags: ['\\b1', '\\i1'], text: 'x' }]);
	assert.deepEqual(baseOfLine('{\\\\b1\\i1}x'), [{ tags: ['\\b1', '\\i1'], text: 'x' }]);
});

test('base items associate pending tags with the following text and drop trailing tag-only blocks', () => {
	assert.deepEqual(baseOfLine('abc{\\b1}de{\\i1}f'), [
		{ tags: [], text: 'abc' },
		{ tags: ['\\b1'], text: 'de' },
		{ tags: ['\\i1'], text: 'f' },
	]);
	assert.deepEqual(baseOfLine('text{\\i1}'), [{ tags: [], text: 'text' }]);
	assert.deepEqual(baseOfLine(''), []);
});

test('base splitting keeps parenthesized transform content intact', () => {
	assert.deepEqual(baseOfLine('{\\q2\\t(\\fs30)\\i1}x'), [
		{ tags: ['\\q2', '\\t(\\fs30)', '\\i1'], text: 'x' },
	]);
});

test('marker items retain pending tag boundaries and survive at the end of a line', () => {
	assert.deepEqual(baseOfLine('a{\\N}{\\i1}b{\\h}'), [
		{ tags: [], text: 'a' },
		{ tags: ['\\N'], text: '' },
		{ tags: ['\\i1'], text: 'b' },
		{ tags: ['\\h'], text: '' },
	]);
});

// Parsed raw data and classifier integration

test('parser is the public entry point and normalizes info, styles, and event time values', () => {
	assert.equal(typeof parser, 'function');
	const parsed = parser(false, MINI_ASS);
	assert.equal(parsed.info.Title, 'Test parser');
	assert.equal(parsed.info.PlayResX, 640);
	assert.equal(parsed.info.LayoutResY, 480);
	assert.equal(parsed.info.ScaledBorderAndShadow, true);
	assert.equal(parsed.styles.length, 1);
	assert.equal(parsed.styles[0].fontName, 'Arial');
	assert.equal(parsed.styles[0].primaryColour, 'rgba(255, 255, 255, 1.00)');
	assert.equal(parsed.events[0].startTime, 1000);
	assert.equal(parsed.events[0].endTime, 2000);
});

test('parser keeps raw dialogue data separate from classified lineCss', () => {
	const parsed = parser(false, MINI_ASS);
	assert.equal(parsed.events[0].text, DLG_TEXT);
	assert.equal(parsed.events[0].delta, undefined);
	assert.deepEqual(Object.keys(parsed.lineCss[0]).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(parsed.lineCss[0].base, [
		{ tags: ['\\pos(320,240)', '\\an5'], text: 'Xin ' },
		{ tags: ['\\fs30'], text: 'chào', delta: { text: { 'font-size': '30px' } } },
		{ tags: ['\\N'], text: '', delta: { data: { marker: '\\N' } } },
		{ tags: [], text: 'các bạn' },
	]);
	assert.deepEqual(parsed.lineCss[0].collision, { t: false });
	assert.deepEqual(parsed.lineCss[0].clip, { rawList: [], effectiveType: null, effectiveRaw: null });
});

test('parser uses last-wins style replacement while retaining the original style-array index', () => {
	const ass = MINI_ASS.replace(STYLE_LINE, [
		STYLE_LINE,
		'Style: Alt,Tahoma,30,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,8,10,10,10,1',
		'Style: Default,Verdana,25,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1',
	].join('\n'));
	const parsed = parser(false, ass);
	assert.equal(parsed.styles.length, 2);
	assert.equal(parsed.styles[0].fontName, 'Verdana');
	assert.equal(parsed.styles[0].bold, true);
	assert.equal(parsed.styles[1].fontName, 'Tahoma');
	assert.equal(parsed.styleCss[0].segmentSub['--font-name'], 'Verdana');
	assert.equal(parsed.styleCss[1].segmentSub['--font-name'], 'Tahoma');
});

test('parser joins a continued Dialogue into one event and one lineCss entry', () => {
	const ass = MINI_ASS.replace(
		'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(320,240)\\an5}Xin {\\fs30}chào{\\N}các bạn',
		'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,first\nsecond',
	);
	const parsed = parser(false, ass);
	assert.equal(parsed.events.length, 1);
	assert.equal(parsed.lineCss.length, 1);
	assert.equal(parsed.events[0].text, 'first\nsecond');
});

test('parser uses current defaults for missing or invalid Script Info values', () => {
	const sparse = MINI_ASS
		.replace('WrapStyle: 0\n', 'WrapStyle: 99\n')
		.replace('PlayResX: 640\n', 'PlayResX: 20\n')
		.replace('PlayResY: 480\n', 'PlayResY: bad\n');
	const info = parser(false, sparse).info;
	assert.equal(info.WrapStyle, 0);
	assert.equal(info.PlayResX, 640);
	assert.equal(info.PlayResY, 480);
});

// doStripTags is a public parser mode.

test('doStripTags truthy removes override blocks while retaining text markers verbatim', () => {
	const parsed = parser(true, assWithText('lorem\\Nipsum\\hdolor\\nsit{\\fs30}amet'));
	assert.deepEqual(parsed.lineCss[0].base, [
		{ tags: [], text: 'lorem\\Nipsum\\hdolor\\nsitamet' },
	]);
});

test('doStripTags false keeps override blocks for classification', () => {
	const parsed = parser(false, assWithText('{\\fs30}amet'));
	assert.deepEqual(parsed.lineCss[0].base, [
		{ tags: ['\\fs30'], text: 'amet', delta: { text: { 'font-size': '30px' } } },
	]);
});

test('doStripTags treats all truthy values as strip mode and falsy values as normal mode', () => {
	for (const value of [true, 1, 'x', {}]) {
		assert.deepEqual(parser(value, assWithText('{\\fs30}x')).lineCss[0].base, [{ tags: [], text: 'x' }]);
	}
	for (const value of [false, 0, '', null, undefined, NaN]) {
		assert.deepEqual(parser(value, assWithText('{\\fs30}x')).lineCss[0].base, [
			{ tags: ['\\fs30'], text: 'x', delta: { text: { 'font-size': '30px' } } },
		]);
	}
});

// Current styleCss result shape

test('styleCss contains lineSub and segmentSub, not the removed container/text/data shape', () => {
	const parsed = parser(false, MINI_ASS);
	const styleCss = parsed.styleCss[0];
	assert.deepEqual(Object.keys(styleCss).sort(), ['lineSub', 'segmentSub']);
	assert.equal(styleCss.data, undefined);
	assert.equal(styleCss.container, undefined);
	assert.equal(styleCss.text, undefined);

	const { lineSub, segmentSub } = styleCss;
	assert.equal(lineSub.position, 'absolute');
	assert.equal(lineSub.width, 'fit-content');
	assert.equal(lineSub['white-space'], 'pre');
	assert.equal(lineSub['paint-order'], 'stroke fill markers');
	assert.equal(lineSub.left, '50cqw');
	assert.equal(lineSub['max-width'], 'calc(100cqw - 1.5625cqw - 1.5625cqw)');

	assert.equal(segmentSub.display, 'inline-block');
	assert.equal(segmentSub['--base-style-name'], 'Default');
	assert.equal(segmentSub['--font-name'], 'Arial');
	assert.equal(segmentSub['font-family'], 'var(--font-name), sans-serif');
	assert.equal(segmentSub['font-size'], 'calc(var(--font-size) / 480 * 100cqh * var(--css-resize))');
	assert.equal(segmentSub['--color1'], 'rgba(255, 255, 255, 1.00)');
	assert.equal(segmentSub.color, 'var(--color1)');
	assert.equal(segmentSub.filter, 'drop-shadow(2px 2px rgba(0, 0, 0, 1.00))');
});

test('styleCss routes BorderStyle 1 and 3 paint colors through segmentSub', () => {
	const stylesOnly = MINI_ASS.slice(0, MINI_ASS.indexOf('[Events]'));
	const normal = parser(false, stylesOnly).styleCss[0].segmentSub;
	assert.equal(normal['--border-style'], 1);
	assert.equal(normal['background-color'], 'transparent');
	assert.equal(normal['-webkit-text-stroke-color'], 'rgba(0, 0, 0, 1.00)');

	const boxAss = stylesOnly.replace(',1,2,2,2,10,10,10,1', ',3,2,2,2,10,10,10,1');
	const box = parser(false, boxAss).styleCss[0].segmentSub;
	assert.equal(box['--border-style'], 3);
	assert.equal(box['background-color'], 'rgba(0, 0, 0, 1.00)');
	assert.equal(box['-webkit-text-stroke-color'], 'transparent');
});

test('styleCss uses scaleAngleToCss output directly on segmentSub', () => {
	const ass = MINI_ASS.replace(STYLE_LINE,
		'Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,120,80,0,15,1,2,2,2,10,10,10,1');
	const segmentSub = parser(false, ass).styleCss[0].segmentSub;
	assert.equal(segmentSub.transform, 'rotateZ(-15deg) scaleX(1.2) scaleY(0.8)');
	assert.equal(segmentSub['--scale-x'], 120);
	assert.equal(segmentSub['--scale-y'], 80);
	assert.equal(segmentSub['--angle-z'], 15);
});

// Public CSS helpers used by parser.

test('decorationToCss uses the supplied truthiness and produces standard decoration tokens', () => {
	assert.equal(decorationToCss(false, false), 'none');
	assert.equal(decorationToCss(true, false), 'underline');
	assert.equal(decorationToCss(false, true), 'line-through');
	assert.equal(decorationToCss(true, true), 'underline line-through');
	assert.equal(decorationToCss('var(--underline)', 'var(--strike-out)'), 'underline line-through');
});

test('shadBlurToCss currently accepts numeric positive shadow/blur components', () => {
	assert.equal(shadBlurToCss(2, -1, 3, 'black'), 'drop-shadow(2px -1px black) blur(3px)');
	assert.equal(shadBlurToCss(0, 0, 0, 'black'), 'none');
	assert.equal(shadBlurToCss('var(--shadow-x)', 'var(--shadow-y)', 'var(--blur)', 'black'), 'none');
});

test('outline helpers preserve common stroke geometry and BorderStyle paint routing', () => {
	assert.deepEqual(outlineStyleToCss(1, 'red', 'blue'), {
		'--color3': 'red', '--border-style': 1, 'background-color': 'transparent', '-webkit-text-stroke-color': 'red',
	});
	assert.deepEqual(outlineStyleToCss(3, 'red', 'blue'), {
		'--color3': 'red', '--border-style': 3, 'background-color': 'red', '-webkit-text-stroke-color': 'transparent',
	});
	assert.deepEqual(outlineWidthToCss(2, 480, 480, true), {
		'--outline': 2,
		'-webkit-text-stroke-width': 'calc(0.004166666666666667 * 2 * 100cqh)',
		padding: 'calc(0.004166666666666667 * 100cqh)',
		margin: 'calc(0.004166666666666667 * 100cqh)',
	});
});

test('scaleAngleToCss emits perspective and the current rotate/scale order', () => {
	assert.deepEqual(scaleAngleToCss(100, 100, 0, 0, 0, 480), {});
	assert.deepEqual(scaleAngleToCss(120, 80, 15, -30, 45, 480), {
		transform: 'perspective(0.6510416666666666cqh) rotateY(30deg) rotateX(-15deg) rotateZ(-45deg) scaleX(1.2) scaleY(0.8)',
	});
});

test('parseCssRgba reads the parser-produced CSS color shape and rejects unsupported CSS colors', () => {
	assert.deepEqual(parseCssRgba('rgba(255, 0, 128, 0.50)'), { r: 255, g: 0, b: 128, a: 0.5 });
	assert.deepEqual(parseCssRgba({ r: 1, g: 2, b: 3 }), { r: 1, g: 2, b: 3, a: 1 });
	assert.equal(parseCssRgba('rgb(255, 0, 0)'), null);
	assert.equal(parseCssRgba('var(--color1)'), null);
	assert.equal(parseCssRgba(null), null);
});

test('parser classifies color and karaoke decoration tags with parsed style colors', () => {
	const parsed = parser(false, assWithText('{\\c&HFF&\\k20}x'));
	assert.deepEqual(parsed.lineCss[0].base, [{
		tags: ['\\c&HFF&', '\\k20'],
		text: 'x',
		delta: {
			text: {
				color: 'rgba(255, 0, 0, 1.00)',
				'--primary-color': 'rgba(255, 0, 0, 1.00)',
			},
			data: { k: { type: 'k', durationMs: 200, startMs: 0 } },
		},
	}]);
});
