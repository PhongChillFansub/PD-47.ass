# TOC — Spec `v1-pd47ass` (Outline, CHƯA PHẢI SPEC HOÀN CHỈNH)

> File này là **outline** để chủ repo duyệt trước khi viết spec chính thức.
> Spec đầy đủ sẽ theo template của skill `/to-spec` (xem `.agents/skills/to-spec/SKILL.md`).
> Ngôn ngữ spec: **Tiếng Việt**, giữ nguyên thuật ngữ kĩ thuật tiếng Anh (parser, renderer, fetcher, lineCss, …) theo `pipeline.txt` và code.

---

## 0. Metadata
- **Tên**: v1-pd47ass
- **Mục tiêu**: Hoàn thiện content script renderer + các phần classify còn lại (2.3, 2.2 an/pos/move/org, 2.1) + popup.js + options page, để extension v0.1.0 chạy được end-to-end trên YouTube.
- **Phạm vi (scope)**: xem Out of Scope.
- **Nguồn kiến trúc**: `pipeline.txt` (primary source cho đến khi `CONTEXT.md` được tạo).
- **Nguồn spec hội thoại**: 16 round Q&A trong session `/grilling` arena/01a06dcc. Phụ lục cuối file truy vết được **63** câu (range `Q1–Q47` rồi `Q49–Q64` — **thiếu Q48**); transcript không persist nên không khôi phục được. Các chỗ khác ghi "64 câu" là theo số đếm lúc grilling.

---

## 1. Problem Statement

- Extension PD-47.ass (Chrome MV3, chromium 131+, tự host qua GitHub Releases) là bản viết lại gần như toàn bộ ASS-CEE cũ.
- Tính năng chính: cho phép **người xem phim/sub fansub trên YouTube** cài extension, add nguồn file `.ass` (Google Drive folder / GitHub folder / upload local), khi mở video YouTube có sub Aegisub thì extension tự render sub đè lên player, bám sát chuẩn Aegisub (V4+ Styles, libass-ish: text style, karaoke, \t, \move, vector…).
- Trạng thái hiện tại (03sep26): đã có `fetcher.js` (beta), `parser.js` (beta, đã xử lý 2.4 + động \t/\k), `storage.js` (alpha, đã có 11 export, **5 key**: `ASSCEE_sourceList`, `ASSCEE_subData_<videoId>`, `ASSCEE_subIndex`, `ASSCEE_config`, `ASSCEE_renderData`), `tagProcess.js` (classify 2.4 thật, 2.3/2.2-an-pos-move-org/2.1 còn stub), `background/background.js` (alpha, hầu như rỗng), `popup.html` (đã thiết kế xong 4 cột, `popup.js` rỗng), chưa có content script, chưa có options page, chưa có message bus BG ↔ CS, chưa có renderer.
- Viewer hiện chưa thể dùng extension vì thiếu renderer + content script + options page + popup.js. (Glossary `CONTEXT.md` chốt term `viewer`, tránh "end-user".)

---

## 2. Solution

Hoàn thiện extension v0.1.0 đạt **v1** theo nghĩa:
- Viewer cài extension, add 1+ nguồn (Drive folder / GitHub folder / upload file local), mở video YouTube có sub → sub Aegisub render đúng, hiệu ứng (style, karaoke, \t, \move) chạy mượt, hiệu năng best-effort có skip-frame thích nghi.
- Sub extension **inject 1 div sibling với parent div của YouTube player** (giống ASS-CEE cũ; có thể chuyển sang Shadow DOM ở session sau). Không xung đột kĩ thuật với sub YouTube mặc định; viewer tự ẩn sub bên nào thủ công (extension có nút ẩn sub extension trong popup).
- Toàn bộ xử lý nặng (fetch, parse, classify, search, scan folder) chạy ở background service worker. Content script **thuần renderer**: nhận `parsedData` từ BG 1 lần, dựng DOM, chạy animation loop theo `requestVideoFrameCallback`, dọn dẹp khi đổi video.
- Tách bạch rõ: BG giao tiếp với options page; options page ↔ CS thông qua BG; CS gọi BG qua message (parser, fetcher, storage đều ở BG).
- Chỉ target **YouTube** cho MVP. Bilibili / site khác để session sau, kiến trúc **platform adapter từ đầu** (interface `PlayerAdapter` chứa `getVideoId`, `injectSubtitleNode`, …; YouTube là adapter đầu tiên).
- Self-host qua GitHub Releases; định hướng publish Chrome Web Store + Firefox Add-ons khi đủ chín. Hiện tại chỉ Chromium 131+.

---

## 3. User Stories (sơ bộ, sẽ viết dài hơn ở spec chính thức)

1. As a viewer, I want to add a Google Drive folder containing `.ass` files, so that I can use it as a subtitle source.
2. As a viewer, I want to add a GitHub folder containing `.ass` files, so that I can use it as a subtitle source.
3. As a viewer, I want to upload a local `.ass` file, so that I can use it without hosting it anywhere.
4. As a viewer, I want sub files in a source folder to be **auto-mapped to videos** whose YouTube ID appears anywhere in the file name (as a `#<videoId>` tag, case-insensitive), so that I don't have to map manually.
5. As a viewer, I want a **fuzzy search** over all loaded sources (with OR groups `|`, exact-quote `"…"`, case-sensitive `#`, diacritic-insensitive tiếng Việt, Levenshtein ranking, phrase-run bonus), so that I can find the right sub when the file name doesn't contain the video ID.
6. As a viewer, I want sub to render in the YouTube player with full Aegisub fidelity (text style, border, shadow, box, alignment, margin, scale, rotate, karaoke `\k`/`\kf`/`\K`/`\ko`, animated `\t`, motion `\move`, clip, vector), so that fan-sub looks correct.
7. As a viewer, I want sub to animate at the video's presented frame rate via `requestVideoFrameCallback`, so that karaoke and \t look smooth and pause freezes them.
8. As a viewer, I want the renderer to **skip frames dynamically + auto-detect low-end** to keep playback smooth, so that weak machines still work.
9. As a viewer, I want to manually re-fetch a sub (per-video slot) from the options page; if the URL is dead, the extension must let me cancel (keep old), retry, or delete the cache.
10. As a viewer, I want the popup to show: 3 stats (FPS, NPS, DFPS), the sub's Script Info Title, the sub extension's log, and 2 buttons (reload renderer, open options page).
11. As a viewer, I want the renderer to **auto-hide** when the current YouTube video has no matching sub in any source, so that I'm not paying for a renderer that has nothing to do.
12. As a viewer, I want the renderer to NOT conflict technically with YouTube's built-in CC (it injects a separate DOM node), so that toggling either is independent.
13. As a sub provider, I want to keep the `.ass` file in **plain Aegisub V4+ format** (Aegisub v3.4.2 keys only in [Script Info]: Title, Original Script, Original Translation, Original Editing, Original Timing, Synch Point, Script Updated By, Update Details), so that the file opens in Aegisub without warnings; the extension reads those keys for display + future offset feature.
14. As a sub provider, I want to name files with `#<videoId>` tag anywhere in the name (case-insensitive) so the extension auto-maps; if no tag, the viewer's fuzzy search still finds them.
15. As a viewer, I want options page to manage all sources (add/remove/re-fetch), per-video sub cache, config keys.
16. As a viewer, I want source list fetch to be **manual** (only when I click "Refresh sources" in options page), with **60-second per-source cooldown** to avoid hammering Drive/GitHub.
17. As a viewer, I want the popup re-fetch (renderer state) to use `alert()` + log line, and the options-page re-fetch (storage state) to use a dialog with 15-second auto-cancel + customizable behavior.
18. As a viewer, I want sub data to live in `chrome.storage.local` (unlimitedStorage already declared), per-video slot auto-overwritten if a new sub for the same videoId is fetched.

(Story #13, #14 thể hiện **chuẩn bổ sung** của maintainer: chỉ file-name pattern + Script Info keys, không can thiệp events.)

---

## 4. Implementation Decisions (sẽ viết chi tiết ở spec chính thức, kèm file/module chịu trách nhiệm)

### 4.1 Module map (theo `pipeline.txt`, đã có sẵn trừ renderer)
- `background/fetcher.js` (beta) — không đổi scope; thêm `validateSourceUrl`/cooldown ở module này hoặc BG.
- `background/parser.js` (beta) — giữ; tiếp tục bước 5–7 của checklist 29aug26 (xem §4.6).
- `background/tagProcess.js` (partial) — viết tiếp `classifyDecoration` (2.3), `classifyCollision` (2.2 an/org/pos/move), `classifyClip` (2.1).
- `background/storage.js` (alpha) — ổn; thêm config keys khi cần (không liệt kê trong spec này).
- `background/background.js` (alpha) — viết message bus BG ↔ CS ↔ options page.
- `options.html` + `options.js` (**repo root**) — **MỚI**, viết mới. `manifest.json` đang khai `"options_page": "options.html"` (root).
- `content/overlay.js` (hoặc tên tương đương) — **MỚI**, content script renderer.
- `content/adapters/youtube.js` — **MỚI**, YouTube `PlayerAdapter`.
- `content/adapters/index.js` — registry; Bilibili stub cho tương lai.
- `popup.js` (**repo root**) — **MỚI**; đã có `popup.html` ở root (thiết kế cố định, dòng 42 có `<script src="popup.js">`; `manifest.json` khai `"default_popup": "popup.html"`).
- `popup-only-ui-theme/*` — giữ nguyên.
- Tests mới: `tests/tagProcess.test.mjs` (mở rộng 2.3/2.2/2.1), `tests/renderer.test.mjs` (mới — **mid-level**, deterministic, không cần browser; xem §5.1 — bản TOC này trước đó ghi nhầm "low-level").

### 4.2 Data contracts
- `parsedData` (đã chốt ở `parser.js`, typedef `parsedDataFormat`): `info, styles, events, globalCss, styleCss, lineCss[i]={base,collision,clip}`. BG gửi nguyên object này cho CS 1 lần, không gửi theo frame.
- `lineCss[i].base[j]` = `{ tags, text, delta?, anim? }`; `delta.text` CSS-cooked; `delta.data` số liệu thuần; `anim.t` mảng `{t1,t2,easing,target}`; `anim.k` `{type,durationMs,startMs}`.
- `collision` = `{t?, an?, org?, pos?, move?}` (an/org/pos/move session này); `clip` = `{rawList, effectiveType, effectiveRaw}` last-wins.
- Message BG ↔ CS (chưa chốt schema cụ thể, dự kiến):
  - CS → BG: `{type:'sub/request', videoId}`, `{type:'renderer/reload'}`.
  - BG → CS: `{type:'sub/parsed', payload: parsedData}`.
  - BG ↔ Options page: `{type:'source/list', …}`, `{type:'subdata/re-fetch', videoId}`, ….
  - (Sẽ tham chiếu file `background.js` cũ của ASS-CEE mà chủ repo sẽ gửi ở session sau để chốt schema.)

### 4.3 Chuẩn bổ sung cho sub provider (phần "maintainer chuẩn")
- **Tên file**: phải chứa `#<videoId>` ở bất kỳ vị trí nào, case-insensitive khi khớp. Không có tag → viewer dùng fuzzy search.
- **[Script Info] keys được phép edit trong Aegisub v3.4.2** (8 key, theo `docs/specs/v1-pd47ass`):
  1. Title
  2. Original Script
  3. Original Translation
  4. Original Editing
  5. Original Timing
  6. Synch Point
  7. Script Updated By
  8. Update Details
- Tool đọc các key này phục vụ:
  - **Hiện tại**: hiển thị `Title` trong popup (cột 3 của `popup.html`).
  - **Tương lai**: shift offset từ `Synch Point`, tìm sub kế tiếp từ `Original Script`/…
- Sub provider thêm key ngoài 8 key này → tool **không đọc** (trừ khi sửa tool, theo chuẩn Aegisub v3.4.2).
- Phần `[V4+ Styles]` và `[Events]` giữ nguyên chuẩn Aegisub/libass.

### 4.4 Search algorithm
- Giữ nguyên thuật toán đã implement ở `fetcher.js` (xem `pipeline.txt`):
  - `parseSearchQuery` (token + group + `#` + `|` + `"…"`).
  - `foldText` (tiếng Việt có dấu/không dấu).
  - `editDistanceSubstring` (Levenshtein).
  - `scoreSearchToken`, `scorePhraseRuns`, `scoreSearchGroup`, `matchSubtitle`.
  - `searchSubtitleFile`.
- Spec chính thức sẽ tóm tắt + link `pipeline.txt` + vài ví dụ user-facing.

### 4.5 Renderer architecture
- Content script (CS) là **pure renderer**: mount/unmount sub DOM, animation loop, dọn dẹp. Không fetch, không parse.
- Sub DOM = **div sibling với parent div của YouTube player** (giống ASS-CEE cũ; chuyển sang Shadow DOM ở session sau nếu cần).
- **Hybrid render**: text/style/basic animation dùng DOM + CSS (đã có `styleCss`); complex effect (vector drawing, motion phức tạp) dùng **canvas fallback**.
- **Animation loop**: `requestVideoFrameCallback`. Khi video pause → callback ngừng → sub tự đứng yên (đúng `pipeline.txt`).
- **Frame skip**: 2 cơ chế kết hợp
  1. **Skip dynamic** theo preset (BG cung cấp config, vd render 1 frame, skip 1 frame).
  2. **Auto-detect low-end**: đo dropped frames liên tục; nếu > ngưỡng → tự tăng skip ratio.
- **FPS thực tế**: best-effort, không cam kết con số. Renderer dùng `rVFC` nên tự khớp presented frame rate.
- **3 stat** hiển thị trong popup (đúng `popup.html`, không thêm):
  - **FPS**: dựa trên `rVFC` + giới hạn người dùng.
  - **NPS**: số node phải render trong giây.
  - **DFPS**: số frame extension chủ động bỏ qua trong giây (tổng cộng dồn).

### 4.6 Parser / classify — tiếp tục từ trạng thái 08sep26
- Còn lại của checklist 29aug26 (cập nhật 02sep26 + 03sep26 + 08sep26):
  - [ ] #14. 2.3 `classifyDecoration`: màu, bord, shad, `\fa`, `\fr`; merge delta vào `item.delta`; bổ sung target 2.3 vào `anim.t[].target`.
  - [ ] #15. 2.2 `classifyCollision` làm đầy `an`, `pos`, `move`, `org` (first-wins; `\an` vẫn tính collision; pos/move/org → renderer tự disable).
  - [ ] #16. 2.1 `classifyClip`: `rawList` + `effectiveType`/`effectiveRaw` last-wins (kể cả `\clip` trong `\t`).
- Phần 2.4 (đã làm) + động `\t`/`\k` (đã làm) + tagProcess strip mode (đã làm) → giữ nguyên. Bản 08sep26: `\fsc` scale cả X/Y và entry `anim.t` dùng field `target`.

### 4.7 Background ↔ Content Script ↔ Options page
- **CS chỉ làm renderer** (xem §4.5). CS **không bao giờ cần source data** (đúng Q54). *Đính chính 05sep26: phụ lục cuối file mô tả Q54 là "BG chỉ fetch on options page action"; mệnh đề này được chốt lại theo lý do **content-side vs background-side** — xem ADR 0001.*
- **BG giao tiếp** với cả CS lẫn options page.
- **Options ↔ CS** (nếu cần) **thông qua BG**, không trực tiếp.
- **CS gọi BG qua message** (parser, fetcher, storage đều ở BG).
- **CS injection**: dynamic qua `chrome.scripting.executeScript()` (cần nút reload renderer trong popup).
- **Host permissions**: thêm `https://www.youtube.com/*` (chuyển từ `optional_host_permissions` sang `host_permissions` để CS dynamic work) — **chưa chốt**, sẽ verify ở session sau.

### 4.8 Re-fetch policy
- **Renderer re-fetch** (CS khởi xướng qua BG): dùng `alert()` + dòng log trong popup (popup nhỏ không đủ dialog).
- **Storage re-fetch** (options page khởi xướng): dialog với 3 nút **Hủy (giữ file cũ) / Thử lại / Xóa cache**, auto-cancel 15s, viewer tùy chỉnh được (toast/timeout/hành vi sau khi chờ).
- **Slot trong cache = 1 videoId**. Nếu sub provider đẩy file mới cho cùng videoId → tự xóa cũ + ghi đè (đúng `addSubData` hiện tại: 1 videoId = 1 key `ASSCEE_subData_<videoId>`).
- **Cache không phụ thuộc folder sub provider**: nếu folder cập nhật mới mất file cũ → cache vẫn giữ.

### 4.9 Storage / source management
- `ASSCEE_sourceList`, `ASSCEE_subData_<videoId>`, `ASSCEE_subIndex`, `ASSCEE_config`, `ASSCEE_renderData` — giữ nguyên.
- **Versioning**: không có versioning từ đầu. Migration **on-demand** khi storage key/format thay đổi.
- **Per-source cooldown 60s** ở BG để tránh spam Drive/GitHub.
- **Source refresh**: chỉ khi viewer bấm "Refresh sources" trong options page (manual).
- **Fetch error policy**: storage trả `""` (thành công) / chuỗi lỗi (fail input/nghiệp vụ) / `throw` (lỗi lập trình) — giữ quy ước hiện tại.
- **Rate limiting**: cooldown per source 60s; retry với backoff khi fail (1s, 2s, 4s, 8s, max 3 lần) — **chưa chốt**, có thể không cần vì cooldown đã đủ. *ĐÃ CHỐT 05sep26: KHÔNG làm retry backoff — ADR 0003.*

### 4.10 Manifest / permissions
- Giữ nguyên: `storage, activeTab, scripting, unlimitedStorage` + `host_permissions` (Drive, GitHub raw, api.github.com) + `optional_host_permissions` (YouTube, Bilibili).
- Thêm permission sau này nếu cần (`declarativeNetRequest`, `alarms`, …) — không liệt kê trong spec này.
- `content_security_policy.extension_pages: script-src 'self'; object-src 'self'` — giữ.

### 4.11 Distribution
- Self-host qua GitHub Releases (file `.crx` hoặc zip load unpacked).
- Định hướng Chrome Web Store + Firefox Add-ons ở session sau (Firefox MV3 khác biệt nhẹ về namespace `chrome.*` vs `browser.*`, sidePanel, action vs browserAction).
- Hiện tại chỉ Chromium 131+.

### 4.12 Telemetry / privacy
- Không telemetry, không analytics. Viewer kiểm soát hoàn toàn.

### 4.13 i18n
- UI: **Tiếng Việt only** (đúng `AGENTS.md`).
- File sub: bất kỳ ngôn ngữ nào Aegisub hỗ trợ.
- Spec chính thức: Tiếng Việt, giữ thuật ngữ kĩ thuật tiếng Anh.

---

## 5. Testing Decisions

### 5.1 Seams (theo skill `/to-spec`, dùng seam cao nhất có thể)
- **Low level** (đã có): `tests/parser.test.mjs`, `tests/storage.test.mjs`, `tests/fetcher.test.mjs`, `tests/tagProcess.test.mjs`. Mở rộng tests cho 2.3/2.2/2.1 classify.
- **Mid level** (mới): `tests/renderer.test.mjs` — test deterministic, không cần browser, dùng stub `PlayerAdapter` + stub `document` (jsdom nếu cần) để test:
  - DOM mounting/unmounting theo videoId change.
  - Style application từ `styleCss`.
  - Frame skip logic (counter + threshold).
  - Stat calculation (FPS/NPS/DFPS) từ mock rVFC.
- **E2E** (chưa): sẽ làm ở session sau với Playwright/Puppeteer + load extension unpacked. Spec này **không** yêu cầu E2E.
- **Quy tắc test** (theo skill `/to-spec`): chỉ test external behavior, không test implementation details. Mỗi test phải có thể đọc được như user story.

### 5.2 Coverage mục tiêu
- Parser + classify: ≥ 90% statement (toàn suite `npm test` = **91/91 pass** tại 05sep26; `pipeline.txt` ghi 90 pass tại 03sep26).
- Storage: ≥ 90% branch (test race condition, cooldown, error).
- Fetcher: tăng coverage cho `searchSubtitleFile` (chỉ happy path ở hiện tại).
- Renderer: chưa chốt %; ưu tiên edge case (video pause, tab switch, race với reload).

### 5.3 Prior art
- `tests/parser.test.mjs` (đã có) — pattern: parse raw text → assert `parsedData` shape → so sánh từng field.
- `tests/storage.test.mjs` (đã có) — pattern: mock `chrome.storage.local` → test race condition với `Promise.all`.
- `tests/tagProcess.test.mjs` (đã có) — pattern: classify entry → assert `lineCss[i]` shape.

---

## 6. Out of Scope (cho spec này)

> Ghi chú: trong grilling, chủ repo ban đầu trả lời Q33 với ý nhắc riêng về `popup.js` (chưa viết, không phải design choice), không phải từ chối khái niệm OOS. Tôi tự suy ra các OOS dưới đây dựa trên toàn bộ Q&A; spec chính thức sẽ chốt lại ở session sau.

- Bilibili, Twitch, Vimeo, … (chỉ YouTube).
- Firefox Add-ons (chỉ Chromium 131+).
- A11y đầy đủ (chỉ có một số thẻ role/text cơ bản nếu render DOM; nếu canvas thì a11y = 0).
- Sub editor trong extension.
- Auto-translate, sub sync giữa nhiều người.
- Migration script cho data từ ASS-CEE cũ (chưa yêu cầu).
- Onboarding flow cho fresh install (chỉ empty state + hướng dẫn ở README; popup note sau).
- Telemetry/analytics.
- Storage schema versioning (chỉ migration on-demand khi cần).
- ETag / If-Modified-Since (chỉ manual re-fetch).
- Auto-refresh source list khi sub provider update folder (chỉ manual).
- Sub provider config keys cụ thể (chưa liệt kê, để session sau khi viết options page).
- AST/parser cho `[Aegisub Project Garbage]` section (giữ nguyên `pipeline.txt` đã nói "Bỏ qua phần [Aegisub Project Garbage]").

---

## 7. Further Notes

- **Open question cần chốt trước khi viết spec chính thức** (chưa hỏi trong grilling):
  1. Schema message BG ↔ CS ↔ Options cụ thể — sẽ dùng file `background.js` cũ của ASS-CEE mà chủ repo sẽ gửi.
  2. `host_permissions` cho YouTube: giữ `optional_host_permissions` hay chuyển sang `host_permissions`? (cần cho `chrome.scripting.executeScript` dynamic).
  3. Retry policy với backoff có cần không (cooldown 60s đã có thể đủ). *Đã chốt 05sep26: KHÔNG làm — ADR 0003; không còn là open question trong spec §7.1 (danh sách còn 6 mục).*
  4. Tên file content script (đề xuất `content/overlay.js`).
  5. Tên file `PlayerAdapter` interface (đề xuất `content/adapters/player-adapter.js`).

- **Phụ thuộc upstream** (theo `pipeline.txt` đã chốt, KHÔNG thay đổi trong spec này):
  - Algorithm pretext của chenglou (chỉ lấy core, không bundle).
  - YouTube IFrame Player API (cho rVFC + video metadata).
  - Aegisub v3.4.2 spec cho phần Script Info.

- **Rủi ro đã biết**:
  - Aegisub/libass khác nhau ở 1 số tag hiếm (vector drawing, complex `\t`) — canvas fallback sẽ giả lỏng, không bám 100%.
  - Firefox MV3 API khác biệt (`browser.*` namespace, sidePanel, action API) — sẽ làm riêng.
  - YouTube đổi DOM thường xuyên → `PlayerAdapter.getVideoId` phải có fallback (URL → ytInitialPlayerResponse).

---

## 8. Workflow tiếp theo

1. Chủ repo duyệt TOC này. Comment trực tiếp trong file hoặc trong chat.
2. Sau khi duyệt TOC, viết spec chính thức theo template `/to-spec` vào `docs/specs/v1-pd47ass.md` (bỏ `.toc`).
3. Publish spec: mở GitHub Issue với label `ready-for-agent`, body link file spec.
4. Sau khi publish, có thể chuyển sang `/code-review` (đã hỏi ở đầu session) nếu muốn review code hiện tại dựa trên spec này làm tiêu chuẩn.

---

## Phụ lục: Tổng hợp Q&A đã chốt (16 round — 63 câu truy vết được, thiếu Q48)

Xem các round trong session grilling arena/01a06dcc-pd-47-ass để tra cứu. Tóm tắt nhanh:
- R1 (Q1–Q4): primary actor = viewer; YouTube trước; Drive+GitHub+upload; to-spec + publish.
- R2 (Q5–Q7): full libass; local persistent; full v1.
- R3 (Q8–Q11): map theo video; folder + quy tắc tên + manual pick; chuẩn bổ sung ở filename + Script Info; render bằng inject DOM, không xung đột kĩ thuật.
- R4 (Q12–Q15): tên file linh hoạt `#<videoId>`; Script Info chỉ 8 key Aegisub; ẩn/hiện sub extension; platform adapter từ đầu.
- R5 (Q16–Q19): fuzzy + Levenshtein; giữ source structure hiện tại; hybrid URL+API; hiển thị info + mở rộng tương lai.
- R6 (Q20–Q23): cache không phụ thuộc folder; re-fetch 3 lựa chọn; chỉ YouTube injection; BG xử lý phần lớn, CS render.
- R7 (Q24–Q27): hybrid canvas+CSS; a11y để sau; chrome.storage.local; alert cho renderer, dialog cho options page.
- R8 (Q28–Q30): best-effort perf; popup giữ nguyên `popup.html` (3 stat, title, log); tự host, định hướng Chrome+Firefox.
- R9 (Q31–Q34): chỉ 3 stat; theo chuẩn Aegisub v3.4.2; không cần OOS; test low+mid level.
- R10 (Q35–Q38): chỉ Chromium 131+ MVP; sub overlap chuẩn Aegisub; UI VN; publish issue + label.
- R11 (Q39–Q43): grill tiếp implementation decisions — DOM/CSS+canvas fallback, error policy, rvfc only, message bus chưa chốt. *(5 số câu nhưng chỉ 4 ý được ghi lại — 1 ý chưa được tóm tắt, transcript không persist.)*
- R12 (Q44–Q47): tóm tắt search; spec VN; file ở `docs/specs/v1-renderer.md` *(tên đề xuất lúc grilling — sau đổi thành `docs/specs/v1-pd47ass.md`, xem §8; file `v1-renderer.md` chưa từng tồn tại)*; full flow file+issue.
- R13 (Q49–Q52): empty state; self-host; cleanup như ASS-CEE; permission thêm khi cần.
- R14 (Q53–Q56): dynamic inject; BG chỉ fetch on options page action; migration on-demand; cooldown 60s/source.
- R15 (Q57–Q60): options↔CS qua BG; CS gọi BG qua message; spec không liệt kê config keys; không telemetry.
- R16 (Q61–Q64): manual re-fetch + auto overwrite cùng videoId; sibling với parent div; skip frame dynamic + auto-detect; show TOC.
