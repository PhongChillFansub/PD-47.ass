// Tests cho tagProcess.js — classify() 03sep26 (nhóm 2.4 Layout Local + động \t/\k metadata).
// Bản này: 2.4 làm thật (delta.text/data + anim.t/k); 2.3 no-op; 2.2 signal \t; 2.1 shape default.
// Chạy: npm test (node --test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parser, tokenizeLineText, baseFromTokens } from '../background/parser.js';
import { classify, classifyLayoutLocal } from '../background/tagProcess.js';

// ======================================================================
// Helper + fixture
// ======================================================================

/** Build base (mảng mục base) thẳng từ text — giống processLineText khi KHÔNG strip. */
const baseOf = text => baseFromTokens(tokenizeLineText(text));

test('base: 2 dấu \\\\ liền nhau (double-escape) → bỏ tag rác "\\" đơn, không sinh tag lạ', () => {
	// content (giải mã): \b1\\i1 / \\b1\i1 / \b1\\
	assert.deepEqual(splitOverrideTags('\\b1\\\\i1'), ['\\b1', '\\i1']); // \\ giữa 2 tag
	assert.deepEqual(splitOverrideTags('\\\\b1\\i1'), ['\\b1', '\\i1']); // \\ dẫn đầu
	assert.deepEqual(splitOverrideTags('\\b1\\\\'), ['\\b1']);           // \\ cuối — không tạo '\' thừa
	assert.deepEqual(splitOverrideTags('\\\\'), []);                     // toàn \\ → rỗng
	// tag thật không bị ảnh hưởng
	assert.deepEqual(splitOverrideTags('\\b1\\i1\\b0'), ['\\b1', '\\i1', '\\b0']);
	assert.deepEqual(splitOverrideTags('\\t(\\fs30)\\c&HFF&'), ['\\t(\\fs30)', '\\c&HFF&']);
});

/** Style chuẩn tối thiểu của dòng (classify chỉ đọc name/fontName ở bản 2.4). */
const DEFAULT_STYLE_REF = { name: 'Default', fontName: 'Arial', fontSize: 20, alignment: 2 };

/** File .ass mini (giống parser.test.mjs) cho test tích hợp qua parser(). */
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

// ======================================================================
// 2.4 Layout Local — delta.text (layout tĩnh, CSS-cooked)
// ======================================================================

test('classify 2.4: \fs \fsc \fsp \fn \b \i → delta.text CSS-cooked, tags GIỮ NGUYÊN', () => {
	const entry = classify({ base: baseOf('{\\fs30\\fscx150\\fscy80\\fsp2\\fnVerdana\\b1\\i1}chữ') }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 1);
	const item = entry.base[0];
	assert.equal(item.text, 'chữ');
	// tags không bị xóa khi classify (chốt 03sep26)
	assert.deepEqual(item.tags, ['\\fs30', '\\fscx150', '\\fscy80', '\\fsp2', '\\fnVerdana', '\\b1', '\\i1']);
	assert.deepEqual(item.delta, {
		text: {
			'font-size': '30px',
			'transform': 'scaleX(1.5) scaleY(0.8)',
			'letter-spacing': '2px',
			'font-family': '"Verdana", sans-serif',
			'font-weight': '700',
			'font-style': 'italic',
		},
	});
	assert.equal(item.anim, undefined); // không có \t/\k → không có anim
});

test('classify 2.4: \\b/\\i/\\u KHÔNG có số đằng sau → coi như KHÔNG có tag (không sinh delta/anim)', () => {
	const entry = classify({ base: baseOf('{\\b}x{\\i}y{\\u}z') }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 3);
	// \b trần / \i trần: không toggle, không delta — để nguyên tags cho nhóm sau (nhóm sau cũng không áp khi thiếu số)
	assert.deepEqual(entry.base[0], { tags: ['\\b'], text: 'x' });
	assert.deepEqual(entry.base[1], { tags: ['\\i'], text: 'y' });
	// \u thuộc nhóm 2.3 (chưa implement) — 2.4 không đụng tới, không delta
	assert.deepEqual(entry.base[2], { tags: ['\\u'], text: 'z' });
});

test('classify 2.4: \b0 \i0 → tắt; \fscx100 (identity) → KHÔNG sinh transform', () => {
	const entry = classify({ base: baseOf('{\\b0\\i0\\fscx100}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, {
		text: { 'font-weight': '400', 'font-style': 'normal' },
	});
	// \fscx100 là identity → không có key transform (giống R3 styleParsedToCss)
	assert.equal(entry.base[0].delta.text.transform, undefined);
});

test('classify 2.4: chỉ 1 trục scale → transform chỉ có scaleX hoặc scaleY', () => {
	const entry = classify({ base: baseOf('{\\fscy80}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { transform: 'scaleY(0.8)' });
});

test('classify 2.4: nhiều tag scale trong CÙNG mục — tag SAU thắng, gộp 1 chuỗi transform', () => {
	const entry = classify({ base: baseOf('{\\fscx150\\fscy90\\fscx200}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta.text, { transform: 'scaleX(2) scaleY(0.9)' });
});

// ======================================================================
// 2.4 — \r (delta.data.baseStyleName) + marker \h/\N/\n (delta.data.marker)
// ======================================================================

test('classify 2.4: \r rỗng → baseStyleName = style DÒNG; \rAlt → baseStyleName = "Alt"', () => {
	const toDefault = classify({ base: baseOf('{\\r}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(toDefault.base[0].delta, { data: { baseStyleName: 'Default' } });
	const toAlt = classify({ base: baseOf('{\\rAltStyle}x') }, { name: 'Default', fontName: 'Arial' });
	assert.deepEqual(toAlt.base[0].delta, { data: { baseStyleName: 'AltStyle' } });
});

test('classify 2.4: \r + \fs cùng mục → delta.data (reset) + delta.text cùng lúc', () => {
	const entry = classify({ base: baseOf('{\\rAlt\\fs20}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].delta, {
		data: { baseStyleName: 'Alt' },
		text: { 'font-size': '20px' },
	});
});

test('classify 2.4: marker \N/\h → delta.data { marker }, text rỗng, KHÔNG delta.text', () => {
	const entry = classify({ base: baseOf('a{\\N}b') }, DEFAULT_STYLE_REF);
	assert.equal(entry.base.length, 3);
	assert.deepEqual(entry.base[0], { tags: [], text: 'a' }); // không tag → không delta/anim
	assert.deepEqual(entry.base[1], { tags: ['\\N'], text: '', delta: { data: { marker: '\\N' } } });
	assert.deepEqual(entry.base[2], { tags: [], text: 'b' });
	const entryH = classify({ base: baseOf('a{\\h}b') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entryH.base[1].delta, { data: { marker: '\\h' } });
});

// ======================================================================
// Nhóm ĐỘNG — \t (anim.t metadata, không bake; \pos/\move/\org trong \t bị BỎ QUA)
// ======================================================================

test('classify động: \t(t1,t2,mods) → anim.t { t1, t2, easing, to } + collision.t = true', () => {
	const entry = classify({ base: baseOf('{\\t(0,500,\\fs30)}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim, { t: [{ t1: 0, t2: 500, easing: 1, to: { 'font-size': '30px' } }] });
	assert.equal(entry.collision.t, true); // signal \t ở collision (KHÔNG lặp payload)
});

test('classify động: \t(accel,mods) 1 số → easing = accel, t2 = null (tới hết dòng)', () => {
	const entry = classify({ base: baseOf('{\\t(2,\\fs30)}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.t, [{ t1: 0, t2: null, easing: 2, to: { 'font-size': '30px' } }]);
});

test('classify động: \t(mods) không số → toàn dòng (t1 0, t2 null, easing 1)', () => {
	const entry = classify({ base: baseOf('{\\t(\\fs30)}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.t, [{ t1: 0, t2: null, easing: 1, to: { 'font-size': '30px' } }]);
});

test('classify động: \t(t1,t2,accel,mods) accel thập phân + scale target → to.transform', () => {
	const entry = classify({ base: baseOf('{\\t(0,1000,0.5,\\fscx120\\fscy90)}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.t, [{ t1: 0, t2: 1000, easing: 0.5, to: { transform: 'scaleX(1.2) scaleY(0.9)' } }]);
});

test('classify động: \t chứa \pos/\move/\org → BỎ QUA (không vào to; không còn target thì không tạo anim)', () => {
	// \pos nằm cạnh \fs30: chỉ \fs30 được animate
	const entry = classify({ base: baseOf('{\\t(\\pos(10,20)\\fs30)}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.t, [{ t1: 0, t2: null, easing: 1, to: { 'font-size': '30px' } }]);
	// \t chỉ chứa \move → bị loại hẳn (anim.t không tồn tại)
	const entryMove = classify({ base: baseOf('{\\t(\\move(1,2,3,4))}x') }, DEFAULT_STYLE_REF);
	assert.equal(entryMove.base[0].anim, undefined);
	// dù vậy \t vẫn là SIGNAL disable collision (prompt 03sep26: có \t trong dòng → t = true)
	assert.equal(entryMove.collision.t, true);
});

test('classify động: \t KHÔNG có trong dòng → collision.t = false', () => {
	const entry = classify({ base: baseOf('Xin chào') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.collision, { t: false });
});

// ======================================================================
// Nhóm ĐỘNG — karaoke \k/\K/\kf/\ko (anim.k: type, durationMs ×10, startMs cộng dồn)
// ======================================================================

test('classify động: \k → anim.k { type, durationMs (cs ×10), startMs cộng dồn theo syl }', () => {
	const entry = classify({ base: baseOf('{\\k25}a{\\K50}b') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.k, { type: 'k', durationMs: 250, startMs: 0 });
	assert.deepEqual(entry.base[1].anim.k, { type: 'K', durationMs: 500, startMs: 250 });
});

test('classify động: \kf/\ko + mục không karaoke ở giữa KHÔNG cắt mạch cộng dồn', () => {
	const entry = classify({ base: baseOf('x{\\kf25}a{\\ko30}b') }, DEFAULT_STYLE_REF);
	assert.equal(entry.base[0].anim, undefined);
	assert.deepEqual(entry.base[1].anim.k, { type: 'kf', durationMs: 250, startMs: 0 });
	assert.deepEqual(entry.base[2].anim.k, { type: 'ko', durationMs: 300, startMs: 250 });
});

test('classify động: cùng mục \fs30 + \k25 → delta.text (layout) + anim.k (karaoke)', () => {
	const item = classify({ base: baseOf('{\\fs30\\k25}na') }, DEFAULT_STYLE_REF).base[0];
	assert.deepEqual(item.delta, { text: { 'font-size': '30px' } });
	assert.deepEqual(item.anim, { k: { type: 'k', durationMs: 250, startMs: 0 } });
});

test('classify động: nhiều \k trong CÙNG mục → anim.k = syl cuối; startMs vẫn cộng dồn cho mục SAU', () => {
	const entry = classify({ base: baseOf('{\\k25}{\\k30}na{\\k50}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(entry.base[0].anim.k, { type: 'k', durationMs: 300, startMs: 250 });
	assert.deepEqual(entry.base[1].anim.k, { type: 'k', durationMs: 500, startMs: 550 });
});

// ======================================================================
// classify() — shape lineCss[i] = { base, collision, clip } + tích hợp qua parser()
// ======================================================================

test('classify: lineCss[i] đủ { base, collision, clip }; 2.1 clip = shape default (stub)', () => {
	const entry = classify({ base: baseOf('{\\fs30}x') }, DEFAULT_STYLE_REF);
	assert.deepEqual(Object.keys(entry).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(entry.clip, { rawList: [], effectiveType: null, effectiveRaw: null });
	assert.equal(entry.base[0].text, 'x');
});

test('classify: base rỗng / không phải array → không lỗi, collision/clip default', () => {
	assert.deepEqual(classify({ base: [] }, DEFAULT_STYLE_REF), { base: [], collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null } });
	assert.deepEqual(classify({}, DEFAULT_STYLE_REF), { base: [], collision: { t: false }, clip: { rawList: [], effectiveType: null, effectiveRaw: null } });
});

test('classifyLayoutLocal: hàm nhóm 2.4 export riêng — mutate base tại chỗ, giữ styleRef mặc định', () => {
	const base = baseOf('{\\fs30}x');
	const out = classifyLayoutLocal(base, DEFAULT_STYLE_REF);
	assert.equal(out, base); // mutate cùng mảng
	assert.deepEqual(base[0].delta.text, { 'font-size': '30px' });
});

test('classify qua parser(): lineCss[i] đã qua classify — marker \N có delta.data, collision/clip có sẵn', () => {
	const parsed = parser(false, MINI_ASS);
	assert.equal(parsed.lineCss.length, 1);
	assert.deepEqual(Object.keys(parsed.lineCss[0]).sort(), ['base', 'clip', 'collision']);
	assert.deepEqual(parsed.lineCss[0].collision, { t: false }); // MINI_ASS không có \t
	assert.deepEqual(parsed.lineCss[0].clip, { rawList: [], effectiveType: null, effectiveRaw: null });
	// 2.4 chạy trong parser: marker {\N} → delta.data.marker
	assert.deepEqual(parsed.lineCss[0].base[2].delta.data, { marker: '\\N' });
	// orgline không bị classify đụng tới (classify chỉ viết vào lineCss)
	assert.equal(parsed.events[0].delta, undefined);
});
