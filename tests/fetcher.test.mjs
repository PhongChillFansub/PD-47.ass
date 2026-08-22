// Tests for the source-list orchestration in fetchSubtitleFileList().
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchSubtitleFileList } from '../background/fetcher.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const githubItem = (name, sha) => ({
  type: 'file',
  name,
  sha,
  download_url: `https://raw.githubusercontent.com/${sha}/${name}`
});

const okJsonResponse = value => ({
  ok: true,
  async text() { return JSON.stringify(value); }
});

test('fetchSubtitleFileList quét song song, giữ thứ tự và bỏ source trùng', async () => {
  const pending = [];
  globalThis.fetch = (url) => new Promise(resolve => {
    pending.push({ url, resolve });
  });

  const first = 'https://github.com/owner/first/tree/main/subs';
  const second = 'https://github.com/owner/second/tree/main/subs';
  const resultPromise = fetchSubtitleFileList([first, second, `${first}/`]);

  // Nhường một microtask để tất cả scan được khởi chạy. Nếu hàm quét tuần tự,
  // tại đây mới chỉ có request đầu tiên.
  await Promise.resolve();
  assert.equal(pending.length, 2);

  pending[1].resolve(okJsonResponse([githubItem('second.ass', 'sha-second')]));
  pending[0].resolve(okJsonResponse([githubItem('first.ass', 'sha-first')]));

  const result = await resultPromise;
  assert.deepEqual(result.map(source => source.name), [
    'first/subs',
    'second/subs'
  ]);
});

test('fetchSubtitleFileList loại mọi bản lặp của source quét lỗi', async () => {
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const url = 'https://github.com/owner/missing/tree/main/subs';
  const result = await fetchSubtitleFileList([url, `${url}/`, { url }]);

  assert.equal(requestCount, 1);
  assert.deepEqual(result, []);
});
