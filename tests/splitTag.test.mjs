import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTag } from '../background/tagProcess.js';

test('splitTag: tag số, value là phần còn lại nguyên văn', () => {
	assert.deepEqual(splitTag('\\fs30'), { key: 'fs', value: '30' });
	assert.deepEqual(splitTag('\\fs+5'), { key: 'fs', value: '+5' });
	assert.deepEqual(splitTag('\\fs-5'), { key: 'fs', value: '-5' });
	assert.deepEqual(splitTag('\\fs'), { key: 'fs', value: '' });
	assert.deepEqual(splitTag('\\fsp2'), { key: 'fsp', value: '2' });
	assert.deepEqual(splitTag('\\bord3'), { key: 'bord', value: '3' });
});

test('splitTag: tiền tố dài thắng tiền tố ngắn', () => {
	// Không cần lookahead: alternation khớp trái sang phải theo thứ tự khai báo.
	assert.equal(splitTag('\\fscx120').key, 'fscx');
	assert.equal(splitTag('\\fscy80').key, 'fscy');
	assert.equal(splitTag('\\fsc150').key, 'fsc');
	assert.equal(splitTag('\\fsp-1.5').key, 'fsp');
	assert.equal(splitTag('\\frx45').key, 'frx');
	assert.equal(splitTag('\\frz45').key, 'frz');
	assert.equal(splitTag('\\fr45').key, 'fr');
	assert.equal(splitTag('\\xshad-3').key, 'xshad');
	assert.equal(splitTag('\\yshad-3').key, 'yshad');
	assert.equal(splitTag('\\shad3').key, 'shad');
});

test('splitTag: value không nhất thiết là số', () => {
	assert.deepEqual(splitTag('\\fnArial Black'), { key: 'fn', value: 'Arial Black' });
	assert.deepEqual(splitTag('\\rAlt Style'), { key: 'r', value: 'Alt Style' });
	assert.deepEqual(splitTag('\\1c&HFF0000&'), { key: '1c', value: '&HFF0000&' });
	assert.deepEqual(splitTag('\\alpha&H80&'), { key: 'alpha', value: '&H80&' });
	assert.deepEqual(splitTag('\\b1'), { key: 'b', value: '1' });
	assert.deepEqual(splitTag('\\p0'), { key: 'p', value: '0' });
});

test('splitTag: tag được tách nhưng thuộc nhóm khác vẫn ra đúng key', () => {
	// \pos / \pbo / \p là 3 key khác nhau; \pos và \pbo phải thắng \p.
	assert.equal(splitTag('\\pos(10,20)').key, 'pos');
	assert.equal(splitTag('\\pbo2').key, 'pbo');
	assert.deepEqual(splitTag('\\p0'), { key: 'p', value: '0' });
	// \be (bị khóa) phải thắng \b, để không bị hiểu thành \b + "e1".
	assert.equal(splitTag('\\be1').key, 'be');
	assert.equal(splitTag('\\b1').key, 'b');
});

test('splitTag: tag ngoài mọi nhóm trả key rỗng', () => {
	for (const tag of ['\\an5', '\\clip(0,0,100,100)', '\\k20', '\\t(0,500,\\fs30)',
		'\\move(1,2,3,4)', '\\fad(100,100)', '\\h', '\\N', '\\q2', '\\xbord3', '\\ybord3',
		'\\fe0', '\\c&HFF&', '\\a4']) {
		assert.equal(splitTag(tag).key, '', tag);
	}
	assert.equal(splitTag('\\t1c&HFF&').key, ''); // \t + \1c: chưa tách, key rỗng
});
