# Code Review — branch `arena/01a06dcc-pd-47-ass` vs empty tree

> **Skill**: `/code-review` (xem `.agents/skills/code-review/SKILL.md`).
> **Fixed point**: empty tree (`$(git hash-object -t tree /dev/null)`), đo trên **baseline `ab3b264`** (trước khi session này thêm artifact) = **99 files, 8301 insertions, 0 deletions**. Tại thời điểm merge (PR #26 → `editor`, commit `99c5fc8`) cây là **111 files / 10104 insertions**; 12 file chênh lệch chính là artifact của session (spec 842 + TOC 272 + báo cáo này 227 + `CONTEXT.md` 154 + 7 ADR 49 + handoff 260 = 1804 dòng). Tức review này **không** bao gồm các artifact mới — chỉ review code.
> **Scope lọc** (bỏ `.agents/`, `docs/`, `popup-only-ui-theme/`, `skills-lock.json`): ~4400 dòng code, 16 file (6 source + 4 test + 1 HTML + 1 JS rỗng + 1 manifest + 1 package.json + 1 README + 1 AGENTS.md).
> **Spec source**: [`docs/specs/v1-pd47ass.md`](./v1-pd47ass.md).
> **Standards sources**:
> - `AGENTS.md` — quy ước làm việc của agent (Tiếng Việt là ngôn ngữ, dùng skill theo SKILL.md).
> - `pipeline.txt` — quyết định kiến trúc đã chốt (chuẩn cứ cho nhiều design choice).
> - Smell baseline (12 mùi Fowler từ skill) — paste từ `.agents/skills/code-review/SKILL.md` mục 3.
> - Coding convention suy ra từ code: JSDoc, hằng số `const ASSCEE_*`, function `export` rõ ràng, queue race-condition private, error policy `""`/string/`throw`.

---

## Standards

Repo này **không có** file `CODING_STANDARDS.md` / `CONTRIBUTING.md`. Coding convention phải suy ra từ code + `AGENTS.md` + `pipeline.txt`. Vì convention chưa explicit, **hầu hết findings dưới đây là judgement call (smell baseline), không phải hard violation** — ngoại lệ là những chỗ code tự mâu thuẫn với `pipeline.txt` (xem nhóm "hard").

### A. Hard violations (code mâu thuẫn với `pipeline.txt` — đã chốt trước đó)

1. **`background/background.js` rỗng** — chỉ 3 dòng (`// v0.1.0 20aug26` + `// alpha mode` + `"use strict"`; `wc -l` báo 2 vì thiếu newline cuối file). Spec §4.7 + `pipeline.txt` đã chốt BG phải có **message bus + lifecycle + cooldown wrapper**. Đây là thiếu sót lớn nhất, không phải smell — là **thiếu implementation theo spec đã chốt**.

2. **`popup.js` rỗng** (0 byte, ở **repo root** — không phải `popup/popup.js`; thư mục `popup/` chưa từng tồn tại). Spec §4.14 đã chốt popup phải đọc `ASSCEE_renderData` + gửi `renderer/reload` + mở options page. `popup.html` đã có sẵn 4 cột, đang chờ JS.

3. **Chưa có content script** (`content/overlay.js`, `content/renderer.js`, `content/adapters/*.js`). Spec §4.5 + §4.16 đã chốt cần `PlayerAdapter` interface + YouTube adapter. Toàn bộ thư mục `content/` chưa tồn tại.

4. **Chưa có options page** (`options.html`, `options.js` — **repo root**, theo `manifest.json`). Spec §4.15 đã liệt kê tính năng tối thiểu. Xem thêm mục 8 về hệ quả của việc file này chưa tồn tại.

5. **Stub `classifyDecoration` và `classifyClip` trong `tagProcess.js`** (line 340-342, 380-384) — đều có `// TODO 03sep26: implement khi tới session 2.3/2.1`. Spec §4.6 (mục #14 + #16) đã chốt phải implement 2.3 và 2.1. Đây là TODO thật, không phải comment thừa.

6. **`addSubData` (comment ở line 144, hàm ở line 152 — `storage.js`)** có comment `// to-do: sửa lại phần này sau khi viết xong parser.` — parser đã viết xong (toàn suite 91/91 pass tại 05sep26; `pipeline.txt` ghi 90 pass tại 03sep26), TODO vẫn còn. Nếu logic đã ổn (theo test pass) thì TODO nên xóa; nếu chưa ổn thì đã stale.

7. **`manifest.json` `optional_host_permissions` YouTube + Bilibili** — spec §4.10 (mục "chưa chốt") đã ghi "có thể chuyển sang host_permissions để chrome.scripting.executeScript dynamic work". Code hiện chưa quyết — chưa vi phạm, nhưng blocker cho §4.7.2.

8. **`manifest.json` khai `"options_page": "options.html"` nhưng file KHÔNG tồn tại** *(thêm 05sep26 khi verify lại)* — `find . -name "options*"` = 0 kết quả (không có ở root lẫn `background/`). Chrome validate path này lúc load unpacked → extension **không load được** cho tới khi tạo `options.html`. Chủ repo xác nhận 05sep26: file chưa viết (không phải path sai). Đây là blocker thật, mục 4 ở trên chỉ nói "thiếu tính năng" là chưa đủ nặng. Chưa test được trong sandbox (không có Chromium) — cần xác nhận lại trên máy thật.

### B. Judgement calls (smell baseline + convention suy ra từ code)

> Mỗi mục dưới đây là **judgement call** ("có thể là X smell"), không phải hard violation. Repo override: convention hiện tại (Tiếng Việt, JSDoc đầy đủ, queue private) được tôn trọng.

#### B.1 Mysterious Name

- **`SUBTITLE_DATA_KEY_BASE`** (`storage.js` line 26) — tên hơi dài, nhưng ý nghĩa rõ (base key cho sub data, nối thêm `_videoId`). OK.
- **`newData`** trong `setRendererStat` (line 343) — hơi generic, nhưng đi với JSDoc giải thích `fps, nps, dfps, subTitle`. OK.
- **`buildCacheEntry` / `readSubIndex`** — tên nói lên hành vi. OK.
- **Không có finding đáng kể** về Mysterious Name.

#### B.2 Duplicated Code

- **Validation pattern** lặp ở `storage.js`: `addSource` (URL), `addSubData` (videoId), `removeSubData` (videoId), `setConfig` (key+value), `setRendererStat` (newData) — đều có cùng shape: `if (typeof X !== "Y" || !X) return "storage: ... không hợp lệ";`. Có thể extract helper `validateInput(type, value, name)`, nhưng chưa tới mức phải refactor.
- **JSDoc opening** (3 dòng `/** ... */` đầu mỗi hàm) — lặp pattern. Không smell, là convention.

#### B.3 Feature Envy

- **`buildCacheEntry` (`storage.js` line 215-230)** — method `static` đọc nhiều field từ `value` (fileObj, videoId, cachedAt) để dựng entry mới. Tuy nhiên đây là **constructor/factory** cho cache entry, nên thuộc về cache module. OK.
- **Không có finding đáng kể** về Feature Envy.

#### B.4 Data Clumps

- **Source object** (`{url, folderId, sourceType, name, storageId, savedAt, fileList}`) — 7 field luôn đi cùng nhau. **Có thể** extract thành class/typedef `Source`. Nhưng code hiện dùng plain object + JSDoc, đủ cho MVP. → **Judgement call, không refactor** trừ khi spec yêu cầu.
- **FileEntry** (`{id, fileName, fetchUrl, folderUrl, sourceType, groupName}`) — 6 field. Tương tự Source.
- **Renderer stat** (`{fps, nps, dfps, subTitle}`) — 4 field, đi cùng. Có thể extract thành `RendererStat` type. Code hiện dùng spread. OK.

#### B.5 Primitive Obsession

- **`videoId: string`** xuất hiện ~15 lần trong `storage.js` + `fetcher.js` + `tagProcess.js`. Là chuỗi 11 ký tự YouTube. Có thể thành `VideoId` brand type. **Code hiện tại không validate format** — chỉ check truthy. → **Judgement call**: spec §4.16 đã nói "vd `/#([A-Za-z0-9_-]{11})/` cho YouTube ID 11 ký tự" — đây là regex, không phải type. Để primitive.
- **`sourceType: 'gdrive' | 'github'`** — string union. Có thể thành enum/const. Code hiện check qua regex (line 67-72). OK.

#### B.6 Repeated Switches

- **Không có switch/if-cascade** lặp trong code. Pattern recognition chủ yếu dùng regex + array.some/every. OK.

#### B.7 Shotgun Surgery

- **Thêm 1 storage key mới** → phải sửa `storage.js` (const key + export getter/setter) + `manifest.json` (không cần, manifest không liệt kê key) + spec (nếu có). Hiện tại 5 key, 11 export, đã stable.
- **Thêm 1 source type mới** (vd Bilibili) → sửa `fetcher.js` (scanBilibili + normalize) + `storage.js` (validateSourceUrl regex) + `adapters/` (MỚI) + `manifest.json` (host_permissions). **Tương đối rải**, nhưng đúng Spec §2.2 "BG giao tiếp với cả CS lẫn options page" — module map đã chốt, không phải smell.
- **Thêm 1 classify nhóm** (vd 2.5 nếu có) → sửa `tagProcess.js` 1 chỗ. OK.

#### B.8 Divergent Change

- **`storage.js`** đang chịu 3 trách nhiệm riêng biệt:
  1. Source list management (addSource/getSourceList/removeSource).
  2. Sub data cache (addSubData/getSubDataList/useSubData/removeSubData).
  3. Config + Renderer stat.
- 3 lý do khác nhau để sửa. **Có thể** tách thành 3 file: `storage-sources.js`, `storage-subdata.js`, `storage-config.js`, cùng dùng chung `enqueueWrite` private. → **Judgement call**, có thể refactor khi scale. Hiện 365 dòng, chưa tới ngưỡng phải tách.
- **`parser.js`** (898 dòng ✓) chịu nhiều trách nhiệm: tokenizer, validator, CSS generator, classify caller. Đã có `tagProcess.js` tách classify. OK.

#### B.9 Speculative Generality

- **`enqueueWrite`** (`storage.js` line 49) — wrapper cho race-condition. Hiện chỉ `storage.js` dùng, nhưng comment (line 41-46) giải thích "Module khác muốn ghi storage thì gọi qua các hàm export ở đây, không tự viết queue" → giữ private. OK, không speculative.
- **`crypto.randomUUID()`** (line 97) — chuẩn web, dùng cho `storageId`. Không phải abstraction thừa.
- **`FALLBACK_DEFAULT_STYLE`** trong `parser.js` (chưa đọc chi tiết, đã thấy ref ở `tagProcess.js` classify comment line 384) — fallback khi style không tìm thấy. Có ý nghĩa, không speculative.
- **Không có finding đáng kể** về Speculative Generality.

#### B.10 Message Chains

- **`utils.log` / `utils.warn` / `utils.error`** — `utils.log(\`storage: addSource(): Đã thêm nguồn: ${source.name}\`)` (line 102). Đây là 1 call chain `source.name` — không phải `a.b().c().d()`. OK.
- **`Object.entries(index)`** trong `getSubDataList` (line 191) — 1 lần destructure. OK.
- **Không có finding đáng kể** về Message Chains.

#### B.11 Middle Man

- **`logger` + 3 alias `log`/`warn`/`error`** (`utils.js` line 17-37) — `log` chỉ là wrapper `logger(message, 'log', ...extra)`. Có thể bỏ alias, dùng trực tiếp `utils.logger(msg, 'log', ...extra)`. → **Judgement call, không refactor** — alias giúp code đọc gọn (`utils.log(...)` vs `utils.logger(..., 'log', ...)`). Theo AGENTS.md "Tiếng Việt là ngôn ngữ làm việc" + convention hiện tại, giữ.
- **Không có finding đáng kể** khác về Middle Man.

#### B.12 Refused Bequest

- **Classify nhóm 2.2 (`classifyCollision`)** đã làm thật signal `\t` (line 360-375), trả `{t: boolean}`. Spec §4.6 yêu cầu `{t?, an?, org?, pos?, move?}` — hiện thiếu `an/org/pos/move`. **Không phải** refused bequest (đây là spec chưa implement, đã biết). OK.
- **Classify 2.3 + 2.1** còn stub trả base/object default. OK.

### C. Tiêu chuẩn cụ thể suy ra từ code (không có trong smell baseline)

- **Comment Tiếng Việt** (`storage.js` toàn bộ, `tagProcess.js` classify comments) — theo AGENTS.md. Được tôn trọng. OK.
- **JSDoc đầy đủ** cho mỗi export — được tôn trọng. OK.
- **`// v0.1.0 <date>` + `// alpha|beta mode`** header ở đầu mỗi file source — convention. OK.
- **`pipeline.txt` reference** trong JSDoc — convention để cross-link. OK.

### D. Tổng kết Standards

| Loại | Số lượng |
|---|---|
| Hard violations (mâu thuẫn với spec/pipeline.txt đã chốt) | **8** (mục A.1–A.8; A.8 thêm ngày 05sep26 khi verify lại) |
| Judgement calls (smell baseline) | ~9 item, rải trong 6/12 mùi (mục B.2, B.4, B.5, B.7, B.8, B.11); 6 mùi còn lại "không có finding đáng kể" |
| Worst issue (trong trục Standards) | **A.1 — `background.js` rỗng**: BG phải có message bus + lifecycle theo spec §4.7, đây là thiếu sót lớn nhất. |

---

## Spec

Spec source: [`docs/specs/v1-pd47ass.md`](./v1-pd47ass.md). Review code theo từng user story + implementation decision.

### A. Requirements từ spec — đã implement

| Spec mục | Code | Đánh giá |
|---|---|---|
| §3.1 Story 1-2: Add Drive/GitHub folder | `fetcher.js:805 fetchSubtitleFileList`, `storage.js:82 addSource` | ✅ Đủ |
| §3.1 Story 4 + §4.3.1: Auto-map `#<videoId>` trong tên file | **Không có ở đâu cả** — `grep videoId background/fetcher.js` = 0 kết quả; không có regex 11 ký tự nào; `pipeline.txt` không mô tả quy ước này. `fileName` chỉ dùng để chấm điểm search (`fetcher.js:407`), sort, log. `#` trong `parseSearchQuery` (dòng 94–118) là prefix case-sensitive cho **query viewer gõ tay**, không phải tag trong tên file | ❌ **Thiếu** *(đính chính 05sep26: bản đầu ghi "đã có regex theo pipeline / cần verify code" — sai, chưa hề verify)* |
| §3.1 Story 5: Fuzzy search (Levenshtein, fold, #, \|, ") | `fetcher.js:392 searchSubtitleFile` + `parseSearchQuery` (line 80+) | ✅ Đủ theo pipeline |
| §3.1 Story 6-8: Render + rVFC + skip-frame | **Chưa có** (content script chưa viết) | ❌ Thiếu |
| §3.1 Story 9: Re-fetch 3 lựa chọn + dialog 15s | **Chưa có** (options page chưa viết) | ❌ Thiếu |
| §3.1 Story 10: Popup 3 stat + Title + log + 2 nút | `popup.html` ✅, `popup.js` ❌ | Nửa |
| §3.1 Story 11: Auto-hide khi không có sub | **Chưa có** (content script) | ❌ Thiếu |
| §3.1 Story 12: Inject sibling div, không xung đột YouTube | **Chưa có** (content script) | ❌ Thiếu |
| §3.1 Story 13: Manual refresh + cooldown 60s | Cooldown `RENDERER_STAT_COOLDOWN_MS = 500` ở `storage.js`; **per-source cooldown 60s chưa có** | ❌ Thiếu |
| §3.1 Story 14: Storage.local + per-video auto-overwrite | `storage.js:152 addSubData` (ghi đè subKey) + `assembleIndex` | ✅ Đủ |
| §3.2 Story 15-17: Chuẩn bổ sung (file name + Script Info 8 keys) | Spec nói rõ → chưa implement vì content script chưa viết | N/A (chưa tới) |
| §3.3 Story 18-19: Maintainer chuẩn bổ sung + OOS reference | Spec đã có | ✅ (spec đã viết) |
| §4.6 2.3 classifyDecoration | `tagProcess.js:340` (stub) | ❌ TODO |
| §4.6 2.2 an/pos/move/org | `tagProcess.js:355` (chỉ signal `\t`) | ❌ Thiếu 4/5 |
| §4.6 2.1 classifyClip | `tagProcess.js:382` (stub) | ❌ TODO |
| §4.7 BG message bus | `background.js` rỗng | ❌ Thiếu |
| §4.7.2 dynamic inject qua `chrome.scripting.executeScript` | Chưa có | ❌ Thiếu |
| §4.9.3 Per-source cooldown 60s | Chưa có (chỉ có cooldown 500ms cho rendererStat) | ❌ Thiếu |
| §4.14 popup.js | `popup.js` rỗng | ❌ Thiếu |
| §4.15 options page | Chưa có | ❌ Thiếu |
| §4.16 PlayerAdapter | Chưa có | ❌ Thiếu |

### B. Behavior trong code ngoài spec (scope creep)

- **Không có finding** — code hiện tại (đến 03sep26) chỉ implement fetcher + parser + storage theo `pipeline.txt`, chưa có content script/popup/options, nên không có chỗ nào thêm tính năng ngoài spec.

### C. Requirements có vẻ implement nhưng implementation có vấn đề

- **`addSubData` validation** (`storage.js:152-160`):
  ```js
  if (!subtitleObj || typeof subtitleObj !== "object" || Array.isArray(subtitleObj) ||
      subtitleObj.parsedData === null || typeof subtitleObj.parsedData !== "object") { 
      return `storage: addSubData(): Dữ liệu file sub lưu cache không hợp lệ`; 
  }
  ```
  Check `parsedData` phải là object **non-null**, đúng. Nhưng spec §4.2.4 dự kiến `subtitleObj` có `videoId, fileName, rawText, parsedData, cachedAt, cachedId, source` — code hiện validate `parsedData` non-null mà **không validate các field khác**. → **OK với MVP** (fetcher gọi addSubData sau khi parse, các field khác đã đúng), nhưng spec chính thức sẽ cần shape chặt hơn.

- **`getConfig(key = null)` return type mismatch** (line 285-300): khi `key` truthy & là string → trả `string|number|boolean|null`; khi `key = null` → trả `Record<string, any>`. Caller phải check kiểu. Spec §4.2.2 message schema chỉ nói `config/get` trả về — chưa rõ type. → **Cần chốt type** ở spec khi viết options page.

- **`useSubData` không check kiểu** (line 232-238): trả `data[subKey] || null`. Nếu key tồn tại nhưng data bị corrupt (không phải object) → trả về corrupt data. So với `getSourceList` có check `Array.isArray`, `useSubData` thiếu check tương tự. → **Possible improvement**: add shape validation.

- **`fetcher.js` `fetchSubtitleFileList`** chưa đọc chi tiết trong review này (file 864 dòng), nhưng `pipeline.txt` đã chốt behavior. Không nằm trong scope review hiện tại.

### D. Tổng kết Spec

| Loại | Số lượng |
|---|---|
| Requirements đã implement đúng | 6/21 user stories (#1, #2, #5, #14, #18, #19) + 1 nửa (#10: `popup.html` có, `popup.js` rỗng) + 11 storage exports + parser |
| Requirements thiếu/một phần | 14 (toàn bộ content script + popup.js + options page + **auto-map `#<videoId>`** + 3 classify còn lại) |
| Scope creep | 0 |
| Implementation looks wrong | 2-3 (validation, type chưa chặt) |
| Worst issue (trong trục Spec) | **§4.7 BG message bus chưa có**: BG là xương sống của spec v1 (mọi giao tiếp CS↔Options đều qua BG). Không có BG = không thể chạy end-to-end. |

---

## Tổng kết 2 trục

| Trục | Findings | Worst issue |
|---|---|---|
| **Standards** | 8 hard + ~9 judgement | `background/background.js` rỗng — vi phạm spec §4.7 đã chốt |
| **Spec** | ~14/21 user stories thiếu, 0 scope creep, 2-3 chỗ cần chốt type | BG message bus thiếu — chặn toàn bộ end-to-end |

Cả 2 trục đều **fail**. Tuy nhiên 2 trục fail vì cùng 1 lý do: extension v0.1.0 chưa implement phần lớn spec v1 (renderer + BG + popup + options). Spec `v1-pd47ass` mô tả trạng thái đích, code mô tả trạng thái hiện tại. Đây không phải "code sai" mà là "code chưa đến spec".

Hành động đề xuất (theo thứ tự ưu tiên):
1. Implement `background/background.js` (message bus + lifecycle + per-source cooldown 60s).
2. Implement content script (`content/overlay.js` + `content/renderer.js` + `content/adapters/youtube.js`).
3. Implement `popup.js` (repo root — `popup.html:42` đã trỏ sẵn `<script src="popup.js">`).
4. Implement `options.html` + `options.js` (repo root — `manifest.json` đã trỏ sẵn `"options_page": "options.html"`; xem A.8: thiếu file này thì extension không load).
5. Hoàn thiện `classifyDecoration` (2.3) + `classifyCollision` (2.2 an/pos/move/org) + `classifyClip` (2.1) trong `tagProcess.js`.
5b. Implement auto-map `#<videoId>` từ tên file (Story #4 + spec §4.3.1) — hiện chưa có ở bất kỳ đâu; đồng thời chốt việc tách `videoId` chạy lúc scan folder hay lúc lookup (shape `FileEntry` ở spec §4.2.3 chưa có field `videoId`).
6. Chốt `manifest.json` host_permissions (YouTube sang `host_permissions`?).
7. Sau khi có 1 module mới, chạy lại `/code-review` với fixed point mới (commit mới nhất) để review diff incremental.

---

## Phụ lục: Phạm vi review

Đã đọc kĩ:
- `AGENTS.md`
- `background/storage.js` (365 dòng — đủ)
- `background/background.js` (3 dòng nội dung, `wc -l` = 2 vì thiếu newline cuối)
- `background/utils.js` (80 dòng — ref ở §B.11)
- `background/tagProcess.js` (stub section 340-395)
- `pipeline.txt` (mục storage.js + tagProcess.js)
- `package.json`
- `manifest.json` (chưa đọc chi tiết, ref qua spec)
- `popup.html` (43 dòng, đã đọc round grilling trước)
- `popup.js` (0 byte, repo root)

Chưa đọc chi tiết (lưu ý khi review lần sau):
- `background/fetcher.js` (863 dòng) — chỉ xem header + grep function list
- `background/parser.js` (898 dòng) — chỉ xem header + grep function list
- `background/tagProcess.js` phần còn lại (line 1-340, 395-405) — chỉ xem classify 2.4 signature
- 4 test files — **đã chạy thật 05sep26: 91/91 pass** (parser 39, storage 28, tagProcess 22, fetcher 2); `pipeline.txt` ghi "90 pass" tại 03sep26
