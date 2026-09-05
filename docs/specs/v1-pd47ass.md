# Spec `v1-pd47ass` — Phiên bản 1 của extension PD-47.ass

> **Trạng thái**: Ready for agent.
> **Nguồn ra quyết định**: Hội thoại `/grilling` session `arena/01a06dcc-pd-47-ass` (64 câu Q&A, 16 round) + `pipeline.txt` + code hiện tại.
> **Phụ lục lịch sử**: [`v1-pd47ass.toc.md`](./v1-pd47ass.toc.md) (outline trước khi viết spec).
> **Kiến trúc hiện tại (khi viết spec)**: `pipeline.txt` — vì `CONTEXT.md` chưa được tạo, theo `docs/agents/domain.md`.

---

## 1. Problem Statement

### 1.1 Vấn đề của người dùng

Người xem phim/sub fansub Việt trên YouTube thường gặp 2 vấn đề khi muốn đọc sub Aegisub (file `.ass`):

1. **YouTube không render sub Aegisub đúng chuẩn.** Sub fansub thường có hiệu ứng (style, karaoke, `\t`, `\move`, vector…) mà sub mặc định của YouTube không hỗ trợ. Người xem chỉ thấy text thường hoặc timing lệch.
2. **Sub Aegisub thường nằm rải rác ở nhiều nơi** (Google Drive của fansub, GitHub repo, server cá nhân). Mỗi lần muốn xem phim, người xem phải tự tìm file `.ass` rồi mở bằng phần mềm ngoài (Aegisub, mpv, …), không xem được ngay trong trình duyệt.

### 1.2 Giải pháp hiện có và hạn chế

ASS-CEE là extension Chrome cũ (đã chết/repo không còn) giải quyết 2 vấn đề trên. PD-47.ass là bản viết lại gần như toàn bộ code của ASS-CEE, với mục tiêu:

- Tương thích Chrome Manifest V3 (MV3).
- Tái sử dụng pipeline xử lý phụ đề cũ nhưng code lại từ đầu để dễ bảo trì.
- Hỗ trợ chuẩn Aegisub/libass đầy đủ (text, style, karaoke, animation, motion, clip, vector).
- Cấu hình extension dễ hơn (popup, options page tiếng Việt).

### 1.3 Trạng thái hiện tại của repo (cutoff 03sep26)

| Module | Trạng thái | Ghi chú |
|---|---|---|
| `background/fetcher.js` | beta | Đã có đầy đủ 3 export: `fetchSubtitleFileList`, `searchSubtitleFile`, `fetchSubtitleText`. Search algorithm hoàn chỉnh (Levenshtein + scoring + token group). |
| `background/parser.js` | beta | Đã xử lý 2.4 (Layout Local) + động `\t`/`\k`; `tagProcess` strip mode đã làm; lineCss struct đích `{base, collision, clip}` đã chốt. |
| `background/tagProcess.js` | partial | `classifyLayoutLocal` (2.4) đã làm thật; `classifyDecoration` (2.3) / `classifyCollision` (2.2 an/pos/move/org) / `classifyClip` (2.1) còn stub. |
| `background/storage.js` | alpha | 11 export + 5 key, race-condition-safe với write queue private. |
| `background/background.js` | alpha | Hầu như rỗng (chỉ có comment). |
| `background/utils.js` | ổn | Logger + HTML/URI entity helpers. |
| `popup.html` | đã thiết kế | 4 cột: logo+setting, 3 stat (FPS/NPS/DFPS), Script Info Title, log. |
| `popup.js` | rỗng | **Chưa viết** (không phải design choice). |
| `background/options.html`, `background/options.js` | chưa có | |
| Content script (renderer) | chưa có | |
| Message bus BG ↔ CS ↔ Options | chưa có | |
| `manifest.json` | ổn | MV3, chromium 131+, permissions + host_permissions. |
| `tests/parser.test.mjs` | 90/90 pass | |
| `tests/storage.test.mjs` | pass | |
| `tests/fetcher.test.mjs` | pass | |
| `tests/tagProcess.test.mjs` | pass | |

**Người dùng cuối (viewer) hiện chưa thể dùng extension** vì thiếu content script renderer, popup.js, options page, message bus.

### 1.4 Outcome mong đợi

Sau khi spec này được implement đầy đủ, viewer cài extension, add 1+ nguồn file `.ass`, mở video YouTube có sub Aegisub thì sub tự động render đúng chuẩn, hiệu ứng chạy mượt, hiệu năng best-effort có skip-frame thích nghi.

---

## 2. Solution

### 2.1 Tổng quan

Hoàn thiện extension v0.1.0 đạt **v1** theo nghĩa chạy được end-to-end trên YouTube:

1. **Content script renderer** (mới): dựng DOM từ `parsedData`, chạy animation loop theo `requestVideoFrameCallback`, dọn dẹp khi đổi video. Inject 1 div sibling với parent div của YouTube player.
2. **Background message bus** (mới): BG giao tiếp với content script + options page qua `chrome.runtime.sendMessage`. Options ↔ CS thông qua BG.
3. **Popup.js** (mới): dùng `popup.html` đã thiết kế sẵn — 3 stat + Title + log + 2 nút (reload renderer, mở options page).
4. **Options page** (mới): quản lý sources, per-video sub cache, config keys, manual re-fetch.
5. **Tiếp tục classify 2.3 / 2.2 an-pos-move-org / 2.1** ở `tagProcess.js`, theo checklist 29aug26 mục #14-#16.
6. **Per-source cooldown 60s** ở BG.
7. **Platform adapter** từ đầu (`PlayerAdapter` interface) — YouTube là adapter đầu tiên, Bilibili/Twitch/Vimeo để session sau.

### 2.2 Kiến trúc

#### 2.2.1 Module map

```
PD-47.ass/
├── background/
│   ├── background.js          (MỚI - message bus + lifecycle)
│   ├── fetcher.js             (beta, giữ; thêm cooldown wrapper)
│   ├── parser.js              (beta, giữ)
│   ├── tagProcess.js          (partial, mở rộng 2.3/2.2/2.1)
│   ├── storage.js             (alpha, ổn)
│   ├── utils.js               (ổn)
│   ├── options.html           (MỚI)
│   └── options.js             (MỚI)
├── content/                   (MỚI TOÀN BỘ)
│   ├── overlay.js             (entry point của content script)
│   ├── renderer.js            (DOM build + animation loop)
│   ├── stat.js                (FPS/NPS/DFPS tracking)
│   ├── skip-frame.js          (skip dynamic + auto-detect)
│   ├── measure.js             (pretext core: đo chữ, layout)
│   └── adapters/
│       ├── player-adapter.js  (interface)
│       ├── youtube.js         (YouTube adapter)
│       └── index.js           (registry)
├── popup/
│   ├── popup.html             (đã có, giữ nguyên)
│   └── popup.js               (MỚI)
├── popup-only-ui-theme/       (giữ nguyên)
├── tests/
│   ├── parser.test.mjs        (mở rộng)
│   ├── storage.test.mjs       (giữ)
│   ├── fetcher.test.mjs       (mở rộng)
│   ├── tagProcess.test.mjs    (mở rộng)
│   └── renderer.test.mjs      (MỚI - mid-level)
├── manifest.json              (giữ + điều chỉnh host_permissions nếu cần)
├── pipeline.txt               (primary architecture doc, cập nhật theo)
└── docs/specs/
    ├── v1-pd47ass.md          (file này)
    └── v1-pd47ass.toc.md      (phụ lục lịch sử)
```

#### 2.2.2 Luồng dữ liệu

```
                          ┌────────────────────────┐
                          │   Options page (UI)    │
                          │   (add/remove source,  │
                          │   re-fetch, config)    │
                          └──────────┬─────────────┘
                                     │ message
                                     ▼
┌─────────────────────────────────────────────────────┐
│           Background service worker                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ fetcher  │  │ parser   │  │ storage  │          │
│  │ (Drive,  │→ │ (Aegisub │→ │ (chrome.  │          │
│  │  GitHub) │  │  → JSON) │  │  storage) │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│         │                            │              │
│         └────── message bus ────────┘              │
└──────────────────────┬──────────────────────────────┘
                       │ {type:'sub/parsed', payload}
                       ▼
┌─────────────────────────────────────────────────────┐
│       Content script (renderer, mỗi tab YouTube)    │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Player     │→ │ Renderer     │→ │ Animation    │  │
│  │ Adapter    │  │ (DOM build)  │  │ loop (rVFC)  │  │
│  │ (YouTube)  │  │              │  │ + skip-frame │  │
│  └────────────┘  └──────────────┘  └──────────────┘  │
│         │                              │             │
│         └── inject sibling div ────────┘             │
└─────────────────────────────────────────────────────┘
```

#### 2.2.3 Trách nhiệm tách bạch

- **Background (BG)**: xử lý tất cả logic nặng (fetch, parse, classify, search, scan folder, storage).
- **Content script (CS)**: **thuần renderer**. Mount/unmount DOM, animation loop, đo chữ, dọn dẹp. **Không fetch, không parse, không scan folder.** Nhận `parsedData` từ BG 1 lần (không gửi theo frame).
- **Options page**: UI quản lý. Mọi thao tác ghi/đọc storage đi qua BG.
- **Popup**: read-only view từ BG (stat, title, log) + 2 nút reload/mở options.

### 2.3 User-facing behavior

- **Empty state (fresh install)**: viewer mở YouTube, không có source nào → renderer không inject gì. Viewer click icon extension → popup hiện "Không có phụ đề." ở cột 3. Click nút settings → options page → add source đầu tiên.
- **Source added**: options page → "Refresh sources" → BG fetch + scan folder Drive/GitHub, lưu `source.fileList` vào storage. Cooldown 60s áp dụng per source.
- **Video mở trên YouTube**: CS inject → adapter lấy `videoId` từ URL → BG lookup `ASSCEE_subData_<videoId>`. Có → BG gửi `parsedData` cho CS → renderer mount. Không có → renderer auto-hide (không inject DOM).
- **Sub đang chạy**: animation loop render theo `rVFC`. 3 stat (FPS/NPS/DFPS) update ~1 lần/giây lên popup qua BG.
- **Re-fetch sub**: options page → click "Re-fetch" trên 1 videoId → BG fetch file mới theo URL lưu → nếu fail → dialog 3 nút (Hủy/Thử lại/Xóa) auto-cancel 15s.
- **Tắt sub extension**: click icon extension → popup → reload renderer (CS unmount → re-mount).

### 2.4 Phạm vi phân phối

- **MVP**: chỉ Chromium 131+.
- **Self-host qua GitHub Releases** (file `.crx` hoặc zip load unpacked). Chrome sẽ cảnh báo "extension ngoài store" — chấp nhận được cho MVP.
- **Định hướng tương lai** (OOS, không thuộc spec này): Chrome Web Store, Firefox Add-ons.

---

## 3. User Stories

Định dạng: `As a <actor>, I want <feature>, so that <benefit>`. Đánh số liên tục.

### 3.1 Viewer (primary actor)

1. As a viewer, I want to add a Google Drive folder containing `.ass` files as a subtitle source, so that I can use fan-sub uploaded by the fansub team without hosting it myself.
2. As a viewer, I want to add a GitHub folder (raw URL) containing `.ass` files as a subtitle source, so that I can use fan-sub hosted on GitHub.
3. As a viewer, I want to upload a local `.ass` file from my computer as a subtitle source, so that I can use sub that I have locally without uploading anywhere.
4. As a viewer, I want sub files in a source folder to be **auto-mapped to videos** whose YouTube video ID appears anywhere in the file name as a `#<videoId>` tag (case-insensitive), so that I don't have to map manually.
5. As a viewer, I want a **fuzzy search** over all loaded sources to find sub when the file name doesn't contain the video ID, supporting:
   - Multiple tokens (space-separated) scored independently.
   - Exact-phrase tokens (wrapped in `"…"`) matched as a whole.
   - Case-sensitive tokens (prefixed with `#`, intended for video IDs).
   - OR groups (separated by `|`) to broaden results.
   - Diacritic-insensitive matching (tìm "Van" cũng khớp "Vân").
   - Levenshtein-based ranking with phrase-run bonus.
6. As a viewer, I want sub to render in the YouTube player with full Aegisub fidelity — text style, border, shadow, opaque box, alignment, margin, scale, rotate, karaoke `\k`/`\kf`/`\K`/`\ko`, animated `\t`, motion `\move`, clip, vector — so that fan-sub looks identical to what Aegisub shows.
7. As a viewer, I want sub to animate at the video's presented frame rate via `requestVideoFrameCallback`, so that karaoke and `\t` are smooth and pause freezes them.
8. As a viewer, I want the renderer to **skip frames dynamically + auto-detect low-end machines** to keep playback smooth, so that weak laptops can still play fan-sub.
9. As a viewer, I want to **manually re-fetch a sub** (per-video slot) from the options page; if the URL is dead, the extension must give me 3 choices: cancel (keep old), retry, or delete the cache. The dialog must auto-cancel after 15 seconds and let me customize the behavior (toast / timeout / post-timeout action) later.
10. As a viewer, I want the popup to show me:
    - 2 buttons (reload renderer, open options page).
    - 3 live stats (FPS, NPS, DFPS).
    - The current sub's `[Script Info] Title`.
    - A log of extension messages.
11. As a viewer, I want the renderer to **auto-hide** when the current YouTube video has no matching sub in any source, so that I'm not paying rendering cost for nothing.
12. As a viewer, I want the renderer to **NOT conflict technically** with YouTube's built-in CC (it injects a separate DOM node as a sibling of the player's parent), so that I can independently toggle either sub.
13. As a viewer, I want source list fetch to be **manual** (only when I click "Refresh sources" in options page) with **60-second per-source cooldown**, so that the extension doesn't hammer Drive/GitHub.
14. As a viewer, I want sub data to live in `chrome.storage.local` (unlimitedStorage), with **per-video slots auto-overwritten** when a new sub for the same video ID is fetched, so that I never have stale sub.

### 3.2 Sub provider (fansub author)

15. As a sub provider, I want to keep the `.ass` file in **plain Aegisub V4+ format** (Aegisub v3.4.2 keys only in `[Script Info]`: Title, Original Script, Original Translation, Original Editing, Original Timing, Synch Point, Script Updated By, Update Details), so that the file opens in Aegisub without warnings; the extension reads those keys for display and future offset feature.
16. As a sub provider, I want to name files with `#<videoId>` tag anywhere in the name (case-insensitive), so the extension auto-maps sub to video; if I don't add the tag, the viewer's fuzzy search can still find the file by name.
17. As a sub provider, I want the extension to **NOT modify** my `[V4+ Styles]` and `[Events]` sections in any way, so that the file remains valid Aegisub output for all consumers.

### 3.3 Maintainer

18. As a maintainer, I want the extension to define a clear **"chuẩn bổ sung"** (extension standard) that lives in only 2 places: file name pattern (`#<videoId>`) and `[Script Info]` keys (8 Aegisub v3.4.2 keys), so that sub providers have a stable, opt-in way to add features without breaking Aegisub compatibility.
19. As a maintainer, I want the spec to make the **3 main reader-facing decisions** (OOS included) explicit and referenceable, so that future spec/issue can point back to this one without re-discovering decisions.

---

## 4. Implementation Decisions

Mỗi quyết định đi kèm module/file chịu trách nhiệm. KHÔNG include code snippet chi tiết — chỉ contract + tên hàm + behavior; chi tiết thuộc về implementation.

### 4.1 Module map (xem §2.2.1)

### 4.2 Data contracts

#### 4.2.1 `parsedData` (đã chốt ở `parser.js`, typedef `parsedDataFormat`)

Shape (theo `pipeline.txt`):

```text
parsedData = {
  info:     { Title, ScriptType, WrapStyle, PlayResX, PlayResY, ScaledBorderAndShadow, ... },
  styles:   Array<Style>,         // [V4+ Styles] đã chuẩn hóa
  events:   Array<Dialogue>,      // [Events] đã parse
  globalCss: CSSObject,           // seed WrapStyle, white-space, text-wrap, max-width
  styleCss: Array<{ container, text, data }>,  // CSS-cooked + raw data, cùng index với styles
  lineCss:  Array<{ base, collision, clip }>   // cùng index với events
}

lineCss[i].base[j] = {
  tags: Array<string>,            // tag raw nguyên văn (giữ lại, không xóa khi consume)
  text: string,                   // text segment
  delta?: { text?: CSSObject, data?: object },  // delta tag 2.4
  anim?: { t?: Array, k?: { type, durationMs, startMs } }
}

lineCss[i].collision = { t?: boolean, an?, org?, pos?, move? }
lineCss[i].clip = { rawList: string[], effectiveType: 'clip'|'iclip'|null, effectiveRaw: string|null }
```

BG gửi nguyên object `parsedData` cho CS **1 lần** khi video khớp, không gửi theo frame. CS giữ reference trong memory cho đến khi đổi video hoặc reload.

#### 4.2.2 Message schema BG ↔ CS (chưa chốt cụ thể — sẽ tham chiếu file `background.js` cũ của ASS-CEE mà chủ repo sẽ gửi)

Dự kiến:

| Direction | Type | Payload | Mục đích |
|---|---|---|---|
| CS → BG | `sub/request` | `{ videoId }` | Yêu cầu sub cho video hiện tại. |
| CS → BG | `renderer/reload` | (none) | Yêu cầu BG gửi lại `parsedData` cho tab hiện tại. |
| CS → BG | `renderer/stat` | `{ fps, nps, dfps, title }` | Update stat lên storage ~1 lần/giây. |
| BG → CS | `sub/parsed` | `{ parsedData }` | Gửi sub đã parse. |
| BG → CS | `sub/none` | `{ videoId }` | Thông báo video hiện tại không có sub → renderer auto-hide. |

| Direction | Type | Payload | Mục đích |
|---|---|---|---|
| Options → BG | `source/list` | (none) | Lấy danh sách source. |
| Options → BG | `source/add` | `{ url }` | Thêm source (Drive/GitHub URL). |
| Options → BG | `source/remove` | `{ id }` | Xóa source theo `storageId`. |
| Options → BG | `source/refresh` | (none) | Fetch + scan lại tất cả source (manual, có cooldown). |
| Options → BG | `subdata/list` | (none) | Lấy danh sách sub cached (từ `ASSCEE_subIndex`). |
| Options → BG | `subdata/refetch` | `{ videoId }` | Re-fetch sub cho 1 video. |
| Options → BG | `subdata/remove` | `{ videoId }` | Xóa cache sub. |
| Options → BG | `config/get` | `{ key? }` | Đọc config. |
| Options → BG | `config/set` | `{ key, value }` | Ghi config. |

#### 4.2.3 Source shape (giữ nguyên hiện tại)

`ASSCEE_sourceList` = Array<Source>, mỗi Source:

```text
{
  url: string,                    // URL chuẩn hóa folder Drive/GitHub
  folderId: string,               // GDrive ID hoặc owner/repo/branch/path
  sourceType: 'gdrive'|'github',
  name: string,                   // tên hiển thị folder
  storageId: string (UUID),       // định danh ổn định để xóa
  savedAt: number,                // Date.now() metadata
  fileList: Array<FileEntry>      // rỗng nếu lỗi scan
}

FileEntry = {
  id: string,                     // GDrive fileId hoặc GitHub sha
  fileName: string,               // tên file đã decode HTML
  fetchUrl: string,               // URL tải trực tiếp
  folderUrl: string,              // = source.url
  sourceType: 'gdrive'|'github',
  groupName: string               // = source.name
}
```

(Đã có trong `fetcher.js`; chi tiết xem `pipeline.txt` mục "fetcher.js * (cấu trúc dữ liệu)".)

#### 4.2.4 Local upload sub (chưa có spec cụ thể — sẽ chốt khi viết options page)

Dự kiến:

```text
ASSCEE_subData_<videoId> = {
  videoId: string,
  fileName: string,               // tên file upload
  rawText: string,                // nội dung file .ass
  parsedData: object,             // output parser()
  cachedAt: number,               // Date.now()
  cachedId: string (UUID),
  source: 'local',                // đánh dấu là local upload (khác 'gdrive'/'github')
}
```

`ASSCEE_subIndex[<videoId>]` thêm `source: 'local'` cho slot upload. Storage không cần refactor lớn — chỉ thêm field `source`.

### 4.3 Chuẩn bổ sung cho sub provider (extension standard)

#### 4.3.1 File name pattern

Tên file `.ass` **nên chứa** `#<videoId>` ở bất kỳ vị trí nào, case-insensitive khi khớp. Extension tự tách `videoId` từ tên file bằng regex (vd `/#([A-Za-z0-9_-]{11})/` cho YouTube ID 11 ký tự).

- **Có tag** → auto-map với video có cùng `videoId`.
- **Không có tag** → viewer dùng fuzzy search (xem §4.4).

#### 4.3.2 `[Script Info]` keys

Sub provider **chỉ được sửa** các key mà Aegisub v3.4.2 cho phép edit trong `[Script Info]` (8 key):

1. `Title` — hiển thị trong popup (cột 3 của `popup.html`).
2. `Original Script` — tên người viết sub gốc.
3. `Original Translation` — tên người dịch.
4. `Original Editing` — tên người edit.
5. `Original Timing` — tên người timing.
6. `Synch Point` — điểm đồng bộ (tương lai: shift offset từ đây).
7. `Script Updated By` — tên người cập nhật.
8. `Update Details` — chi tiết cập nhật.

**Tool đọc** 8 key này cho:
- **Hiện tại**: hiển thị `Title` trong popup.
- **Tương lai** (OOS): shift offset từ `Synch Point`, tìm sub kế tiếp từ `Original Script`/…, cache-bust dựa trên `Update Details`.

**Sub provider thêm key ngoài 8 key này** → tool **không đọc** (theo chuẩn Aegisub v3.4.2). Khi Aegisub update lên version mới với key mới → sửa tool sau.

#### 4.3.3 Phần giữ nguyên

`[V4+ Styles]` và `[Events]` giữ nguyên chuẩn Aegisub/libass. Tool **KHÔNG** thêm tag, không thêm field, không thay đổi format. Đây là điểm quan trọng nhất của "chuẩn bổ sung": nó chỉ động vào metadata, không động vào nội dung sub.

### 4.4 Search algorithm (giữ nguyên `fetcher.js`)

Thuật toán đã implement đầy đủ ở `fetcher.js` (xem `pipeline.txt` mục "cụm xử lí tìm kiếm"):

- `parseSearchQuery(searchKey) → { groups: Array<Array<{ value, caseSensitive }>> }`
  - Token space-separated ngoài ngoặc kép.
  - Token trong `"…"` là exact phrase.
  - Token prefix `#` → case-sensitive.
  - `|` ngăn nhóm OR.
- `foldText(text) → string` — bỏ dấu tiếng Việt.
- `editDistanceSubstring(pattern, target) → number` — Levenshtein giữa pattern (đã fold) và substring của target (đã fold).
- `scoreSearchToken(token, name) → { score, exact }` — chấm 1 token, có exact match.
- `scorePhraseRuns(name, pattern) → number` — bonus khi tìm thấy phrase nguyên văn liên tiếp.
- `scoreSearchGroup(group, name) → number` — chấm 1 group, có 3 mức (0 / 1xxx-4xxx / ≥1_000_000).
- `matchSubtitle(name, searchKey) → { score, exact }` — tổng hợp điểm theo best group.
- `searchSubtitleFile(sources, searchKey) → Array<Candidate>` — lọc + sắp xếp.

User-facing syntax (sẽ document ở options page / README):

| Cú pháp | Ý nghĩa | Ví dụ |
|---|---|---|
| `hello world` | Tìm cả "hello" VÀ "world" (thiếu 1 → tụt điểm, không loại) | |
| `"nice shot sir"` | Exact phrase "nice shot sir" | |
| `#abc123` | Case-sensitive token "abc123" (dùng cho video ID) | |
| `a \| b` | OR group — tìm "a" HOẶC "b" (lấy kết quả nhóm điểm cao nhất) | |
| `one piece` | Match "One Piece" do fold tiếng Việt (chỉ áp dụng ký tự Latin) | |
| Kết hợp | `"one piece" #abc123` | Tìm sub chứa exact "one piece" + case-sensitive "abc123" |

Spec **không** thay đổi thuật toán; chỉ tóm tắt + link `pipeline.txt` + đưa vài ví dụ user-facing.

### 4.5 Renderer architecture

#### 4.5.1 Content script (CS) là pure renderer

CS **không bao giờ cần source data** (xem Q54 đã chốt). CS chỉ làm:
- Mount/unmount sub DOM.
- Áp dụng CSS từ `styleCss`.
- Chạy animation loop theo `rVFC`.
- Đo chữ (pretext core) cho layout/collision.
- Dọn dẹp khi đổi video, pause, hoặc tab ẩn.

#### 4.5.2 Sub DOM injection

- **Vị trí**: sub DOM = 1 `div` sibling với **parent div của YouTube player** (giống ASS-CEE cũ). Chọn `parent` chứ không phải `player` chính nó vì player có thể bị reload bởi YouTube SPA navigation.
- **Style**: `position: absolute` relative to parent, `pointer-events: none` (không chặn click), `z-index` cao hơn sub YouTube.
- **Selector parent div**: `PlayerAdapter.youtube.getPlayerParentSelector()` trả về selector. YouTube adapter đề xuất: `ytd-watch-flexy #player-container-outer.ytd-watch-flexy` hoặc fallback `ytd-watch-flexy #player`.
- **Shadow DOM**: chưa áp dụng. Nếu cần (vd YouTube CSS can thiệp) thì chuyển sang Shadow DOM ở session sau.

#### 4.5.3 Hybrid render: DOM/CSS + canvas fallback

- **DOM/CSS** cho phần lớn: text + style + karaoke + `\t` (CSS animation/transition).
- **Canvas fallback** cho:
  - Vector drawing (`\p` shape).
  - Complex motion (`\move` với curve, multi-segment).
  - Effect không thể hiện được bằng CSS (vd SVG path animation).
- Quyết định "dùng canvas" được quyết ở **runtime**, dựa trên `lineCss[i].clip` (nếu có vector) hoặc `anim.t` (nếu target không map sang CSS) — chưa chốt logic cụ thể, sẽ implement ở session classify.

#### 4.5.4 Animation loop

```text
rVFC(now, metadata) callback:
  if (mediaTime == lastMediaTime) return  // trùng frame, skip
  lastMediaTime = mediaTime
  for each active line:
    resolve tags at mediaTime (\\t interpolate, \\k progress, \\move position)
    update DOM (transform, color, opacity, etc.)
  update stat counters (NPS += nodesTouched, FPS++, DFPS += skippedThisTick)
  schedule next rVFC
```

- **Pause**: `rVFC` không bắn → sub tự đứng yên (đúng `pipeline.txt` đã chốt — dùng `rVFC` thay vì CSS transition/animation để tận dụng đặc tính này).
- **Seek**: `metadata.mediaTime` thay đổi đột ngột → `lastMediaTime` check thấy khác → re-resolve.
- **Tab ẩn**: `rVFC` ngừng bắn → sub tự pause. Khi tab hiện lại, tiếp tục.

#### 4.5.5 Frame skip: dynamic + auto-detect

2 cơ chế kết hợp:

1. **Skip dynamic theo preset**: BG cung cấp config (vd `skipEvery: 1` = render frame N, skip frame N+1, render N+2, …). Mặc định `skipEvery: 0` (render mọi frame). Viewer tùy chỉnh qua options page (chưa liệt kê config key cụ thể, để session sau).
2. **Auto-detect low-end**: renderer đo `DFPS` liên tục. Nếu `DFPS / (FPS + DFPS) > 0.3` (drop > 30%) trong 5 giây liên tiếp → tăng `skipEvery` lên 1. Nếu vẫn drop → tăng lên 2. Nếu ổn định → giảm dần về 0.

Stat hiển thị (đúng `popup.html`, không thêm):
- **FPS**: số frame renderer thực sự render trong giây (sau skip).
- **NPS**: số DOM node cần update trong giây (tổng `nodesTouched` của tất cả active line).
- **DFPS**: số frame extension chủ động bỏ qua trong giây (do skip preset + tự detect). Tổng cộng dồn hiển thị trong tooltip.

#### 4.5.6 Performance target

- **Best-effort**, không cam kết FPS cụ thể.
- Skip dynamic + auto-detect đảm bảo máy yếu vẫn chạy được, dù sub có thể giật.
- Test trên máy: target 60fps cho video 60fps với sub ~200 active line.

### 4.6 Parser / classify — tiếp tục từ 03sep26

Còn lại của checklist 29aug26 (cập nhật 02sep26 + 03sep26), cần làm trong spec này:

- [ ] #14. **2.3 `classifyDecoration`** (`tagProcess.js`): màu (`\1c`-`\4c`, `\alpha`), bord (`\bord`, `\xbord`, `\ybord`), shad (`\shad`, `\xshad`, `\yshad`), `\be`, `\blur`, `\fa`, `\fr`, `\fax`/`\fay`/`\frx`/`\fry`/`\frz`. Merge delta vào `item.delta` đã có (từ 2.4). Bổ sung target 2.3 vào `anim.t[].to` (đọc lại từ `tags` raw).
- [ ] #15. **2.2 `classifyCollision`** (`tagProcess.js`) làm đầy `an`, `pos`, `move`, `org` (first-wins; `\an` vẫn tính collision; `pos`/`move`/`org` → renderer tự disable collision). Cộng thêm signal hiện có `t` (đã có ở 03sep26).
- [ ] #16. **2.1 `classifyClip`** (`tagProcess.js`): `rawList` + `effectiveType`/`effectiveRaw` last-wins (kể cả `\clip` trong `\t`). Renderer tự quyết clip-path vs inverse clip-path theo `effectiveType`.

Phần đã làm (giữ nguyên, không thay đổi):
- 2.4 `classifyLayoutLocal` (đã làm 03sep26).
- Động `\t`/`\k` metadata (đã làm 03sep26).
- `tagProcess` strip mode (đã làm 02sep26 bản 2 — boolean `doStripTags`).
- `lineCss` struct `{base, collision, clip}` (đã chốt 03sep26).
- `styleCss` triết lý container/text/data (đã chốt 31aug26).
- Stroke ×2 cho borderStyle=1 (đã chốt 02sep26).

### 4.7 Background ↔ Content Script ↔ Options page

#### 4.7.1 Quy tắc giao tiếp

- **CS ↔ BG**: message qua `chrome.runtime.sendMessage` + `chrome.runtime.onMessage`. CS gọi BG (parser ở BG, fetcher ở BG, storage ở BG).
- **Options ↔ BG**: cùng cơ chế message. Options page không gọi `chrome.storage` trực tiếp — tất cả qua BG.
- **Options ↔ CS**: thông qua BG (nếu cần). Ví dụ: options muốn bảo CS reload → gửi message BG → BG forward sang CS qua `chrome.tabs.sendMessage`.

#### 4.7.2 CS injection (dynamic)

- `manifest.json` không có `content_scripts.matches` YouTube (vì dùng dynamic).
- `host_permissions`: chuyển `https://www.youtube.com/*` từ `optional_host_permissions` sang `host_permissions` (cần cho `chrome.scripting.executeScript`). **Chưa chốt chắc**, sẽ verify khi viết background.js.
- BG inject CS khi:
  - Tab YouTube mới được activate.
  - Viewer click nút "Reload renderer" trong popup.
  - Viewer mở options page → "Reload all renderers".
- Script: `chrome.scripting.executeScript({ target: { tabId }, files: ['content/overlay.js'] })`.

#### 4.7.3 BG lifecycle

- **Service worker** (MV3, `background/background.js`).
- Luôn chạy khi extension enabled.
- Handle events: `chrome.runtime.onInstalled`, `chrome.runtime.onMessage`, `chrome.tabs.onActivated`, `chrome.tabs.onUpdated` (cho tab YouTube → inject CS).
- Không tự fetch source list. Chỉ fetch khi có message `source/refresh` từ options.

### 4.8 Re-fetch policy

#### 4.8.1 Renderer re-fetch (CS khởi xướng qua BG)

- Trigger: CS gặp lỗi parse / sub bị mất giữa chừng (rất hiếm).
- UI: `alert()` trong CS (gọi `window.alert()`) + ghi log vào popup qua `renderer/log` message.
- Lý do popup quá nhỏ, không đủ dialog.

#### 4.8.2 Storage re-fetch (options page khởi xướng)

- Trigger: viewer click "Re-fetch" trên 1 videoId trong options page.
- Flow:
  1. Options gửi `subdata/refetch` { videoId } → BG.
  2. BG lookup URL từ `ASSCEE_subIndex[videoId]`. Nếu không có URL → báo lỗi.
  3. BG fetch URL. Nếu OK → parse → lưu vào `ASSCEE_subData_<videoId>` (overwrite slot cũ, nếu có) → update `ASSCEE_subIndex[videoId]` → trả success.
  4. Nếu fail → BG trả error → options page hiện dialog 3 nút:
     - **Hủy** (giữ file cũ): đóng dialog, không làm gì.
     - **Thử lại**: lặp lại bước 3.
     - **Xóa cache**: gọi `subdata/remove` → đóng dialog.
  - Auto-cancel sau 15s: mặc định "Hủy (giữ file cũ)".
  - Behavior tùy chỉnh (toast / timeout / post-timeout action): sẽ làm ở spec sau khi liệt kê config keys.

#### 4.8.3 Cache invalidation

- **Manual only**. Không có ETag, không auto-refresh.
- **Cache không phụ thuộc folder sub provider**: nếu sub provider xóa file khỏi folder Drive/GitHub, cache vẫn giữ. Chỉ khi viewer tự re-fetch (hoặc file mới cho cùng videoId) thì mới thay đổi.
- **Slot trong cache = 1 videoId** (`ASSCEE_subData_<videoId>`). Nếu sub provider đẩy file mới cho cùng videoId thì **tự động xóa cũ + ghi đè** (đúng behavior hiện tại của `addSubData`).

### 4.9 Storage / source management

#### 4.9.1 Storage keys (giữ nguyên hiện tại)

| Key | Mục đích | Shape |
|---|---|---|
| `ASSCEE_sourceList` | Danh sách source | Array<Source> |
| `ASSCEE_subData_<videoId>` | Sub data ĐẦY ĐỦ (parsedData) cho 1 video | SubObj (xem §4.2.4) |
| `ASSCEE_subIndex` | Chỉ mục NHẸ (không có parsedData) | `{ [videoId]: { ...fileObj, videoId, cachedId, cachedAt } }` |
| `ASSCEE_config` | Settings (string/number/boolean) | object |
| `ASSCEE_renderData` | Stat render (fps, nps, dfps, title) + `lastTimeSet` cooldown nội bộ | object |

(Đã chốt ở `storage.js` xem `pipeline.txt` mục "storage.js".)

#### 4.9.2 Versioning

- **Không có versioning từ đầu.** Key prefix cố định `ASSCEE_*` cho đến khi có lý do phải đổi.
- **Migration on-demand**: khi thay đổi storage key/format, viết migration script trong `storage.js` chạy 1 lần lúc `chrome.runtime.onInstalled` với reason `update`. KHÔNG viết migration trước.

#### 4.9.3 Per-source cooldown 60s

- Lưu `lastFetched[storageId]` trong BG memory (không persist).
- Mỗi lần `source/refresh`, BG check `Date.now() - lastFetched[storageId] < 60_000` → bỏ qua source đó, trả warning `"source: cooldown active"`.
- Cooldown áp dụng cho cả `source/add` (add source mới cũng trigger scan đầu tiên) và `source/refresh` (refresh tất cả).
- 60s chọn vì Drive/GitHub rate limit thoáng; nếu thực nghiệm thấy cần thay đổi → chỉnh ở implementation.

#### 4.9.4 Source refresh: manual only

- BG KHÔNG tự động fetch source list khi tab YouTube mở.
- BG chỉ fetch khi:
  - Viewer click "Add source" trong options page (fetch source mới).
  - Viewer click "Refresh sources" trong options page (fetch tất cả).

#### 4.9.5 Fetch error policy (giữ quy ước hiện tại)

- `addSource` / `removeSource` / `addSubData` / `removeSubData`:
  - Thành công → `""` (falsy).
  - Lỗi input/nghiệp vụ → chuỗi lỗi (truthy).
  - Lỗi lập trình → `throw`.
- Caller (options page, BG message handler) check truthy/falsy và hiển thị.

#### 4.9.6 Rate limiting / retry

- **Cooldown per source 60s** đã đủ cho MVP.
- **Retry với backoff** (1s, 2s, 4s, 8s, max 3 lần): **CHƯA CHỐT**, có thể không cần vì cooldown đã đủ. Nếu implement sau, sẽ là wrapper quanh `loggedFetch` trong `fetcher.js`.

### 4.10 Manifest / permissions

- **Giữ nguyên** `permissions: ["storage", "activeTab", "scripting", "unlimitedStorage"]`.
- **Host permissions** (giữ nguyên):
  - `https://drive.google.com/embeddedfolderview?id=*`
  - `https://docs.google.com/uc?export=download&id=*`
  - `https://drive.usercontent.google.com/download?id=*`
  - `https://api.github.com/*`
  - `https://raw.githubusercontent.com/*`
- **Optional host permissions** (chỉnh nếu cần):
  - `https://www.youtube.com/*` — **có thể chuyển sang `host_permissions`** để `chrome.scripting.executeScript` dynamic work. **Chưa chốt chắc**, sẽ verify khi viết `background.js`.
  - `https://www.bilibili.tv/*`, `https://www.bilibili.com/*` — OOS cho spec này, có thể bỏ.
- **Thêm permission sau này** nếu cần (vd `declarativeNetRequest`, `alarms`) — không liệt kê trong spec này.
- **Content security policy**: `script-src 'self'; object-src 'self'` — giữ.

### 4.11 Distribution

- **Self-host qua GitHub Releases** (file `.crx` hoặc zip load unpacked).
- Chrome cảnh báo "extension ngoài store" — chấp nhận được cho MVP.
- Định hướng tương lai: Chrome Web Store, Firefox Add-ons (OOS).

### 4.12 Telemetry / privacy

- **Không telemetry, không analytics.**
- Viewer kiểm soát hoàn toàn. Không gửi data ra ngoài.

### 4.13 i18n

- **UI extension (popup, options page)**: Tiếng Việt only (đúng `AGENTS.md`).
- **File sub**: bất kỳ ngôn ngữ nào Aegisub hỗ trợ.
- **Spec chính thức**: Tiếng Việt, giữ thuật ngữ kĩ thuật tiếng Anh.

### 4.14 Popup (mới)

`popup.html` đã thiết kế sẵn (4 cột) — **không thay đổi HTML**. Chỉ viết `popup.js` để:

1. Cột 1 (nút logo + settings):
   - **Reload renderer** (logo `🅿️`): gửi message `renderer/reload` → BG forward sang CS ở tab active.
   - **Open options** (icon `⚙️`): mở `chrome.runtime.openOptionsPage()`.
2. Cột 2 (3 stat):
   - Đọc `ASSCEE_renderData` từ storage mỗi 1s.
   - Hiển thị FPS / NPS / DFPS.
3. Cột 3 (Script Info Title):
   - Đọc từ `ASSCEE_renderData.subTitle` (BG update từ `lineCss` của `parsedData`).
   - Nếu không có sub → hiển thị "Không có phụ đề." (đúng `popup.html`).
4. Cột 4 (Log):
   - Đọc log từ storage (BG append mỗi message).
   - Auto-scroll xuống dòng mới nhất; nút "Mới nhất" hiện khi user scroll lên.

CSS theme từ `popup-only-ui-theme/high-density-ai.css` — giữ nguyên.

### 4.15 Options page (mới)

`background/options.html` + `background/options.js`. UI tiếng Việt. Tính năng tối thiểu:

- **Quản lý sources**: list + add (URL Drive/GitHub) + remove (theo `storageId`) + refresh all.
- **Quản lý sub cache**: list (đọc `ASSCEE_subIndex`) + re-fetch (1 videoId) + remove (1 videoId).
- **Config keys**: (sẽ liệt kê ở spec sau — hiện tại chỉ placeholder).
- **Re-fetch dialog**: 3 nút Hủy/Thử lại/Xóa + auto-cancel 15s (xem §4.8.2).

Style: dùng theme `popup-only-ui-theme/high-density-ai.css` (hoặc subset phù hợp).

### 4.16 `PlayerAdapter` interface (mới, cho Q15 platform abstraction)

```text
interface PlayerAdapter {
  // Trả về video ID hiện tại (vd YouTube 11 ký tự), hoặc null nếu chưa có video.
  getVideoId(): string | null;

  // Trả về DOM node parent của player (để inject sub DOM sibling).
  getPlayerParentNode(): HTMLElement | null;

  // Subscribe videoId change (SPA navigation). Callback nhận videoId mới.
  onVideoIdChange(callback: (videoId: string | null) => void): void;

  // Trả về thời gian hiện tại của video (giây). Dùng để init renderer.
  getCurrentTime(): number;

  // Trả về HTMLVideoElement (cho rVFC). null nếu chưa có.
  getVideoElement(): HTMLVideoElement | null;
}
```

**YouTube adapter** (đề xuất):
- `getVideoId`: parse từ URL `youtube.com/watch?v=<id>` trước, fallback `document.querySelector('ytd-watch-flexy')` dataset.
- `getPlayerParentNode`: `document.querySelector('#player-container-outer')` hoặc `ytd-watch-flexy #player`.
- `onVideoIdChange`: lắng `yt-navigate-finish` event (YouTube custom event) + `popstate` + observer `document.title`.
- `getCurrentTime`: `document.querySelector('video').currentTime`.
- `getVideoElement`: `document.querySelector('video')`.

**Bilibili/Twitch/Vimeo**: stub trong `adapters/index.js`, trả về `null` cho tất cả method. Khi mở rộng, thêm file mới và register.

### 4.17 Auto-hide khi không có sub

- Khi CS nhận `{type: 'sub/none', videoId}` từ BG → unmount sub DOM nếu đang mount, xóa `parsedData` reference.
- Khi video khớp lại (viewer navigate về video cũ) → tự động re-request.
- Tiết kiệm CPU khi viewer xem phim không có sub.

---

## 5. Testing Decisions

### 5.1 Seams

Theo skill `/to-spec`: dùng seam cao nhất có thể, ưu tiên seam hiện có. Repo này đã có test ở **low + mid level** — giữ nguyên và mở rộng.

#### 5.1.1 Low level (đã có, mở rộng)

- `tests/parser.test.mjs` — 90/90 pass (03sep26). Mở rộng tests cho `classifyDecoration` (2.3), `classifyCollision` (2.2 an/pos/move/org), `classifyClip` (2.1).
- `tests/storage.test.mjs` — pass. Mở rộng tests cho cooldown logic, error policy edge cases.
- `tests/fetcher.test.mjs` — pass. Mở rộng tests cho `searchSubtitleFile` edge cases (chỉ happy path hiện tại).
- `tests/tagProcess.test.mjs` — pass. Mở rộng tests cho 2.3/2.2/2.1.

#### 5.1.2 Mid level (mới)

- `tests/renderer.test.mjs` — test deterministic, không cần browser.
  - Stub `PlayerAdapter` (mock getVideoId, onVideoIdChange, getVideoElement).
  - Stub `document` và `requestAnimationFrame` qua jsdom.
  - Test:
    - DOM mounting/unmounting theo videoId change.
    - Style application từ `styleCss`.
    - Frame skip logic (counter + threshold).
    - Stat calculation (FPS/NPS/DFPS) từ mock rVFC.
    - Auto-hide khi `sub/none` received.
- `tests/background.test.mjs` (mới) — test message routing + cooldown.
  - Mock `chrome.runtime`, `chrome.tabs`, `chrome.storage`.
  - Test các message handler (CS → BG, Options → BG).

#### 5.1.3 E2E (OOS cho spec này)

- **Không yêu cầu E2E trong spec này.**
- Sẽ làm ở spec sau với Playwright/Puppeteer + load extension unpacked. E2E phụ thuộc vào YouTube DOM (thay đổi thường xuyên) nên không stable cho CI.

### 5.2 Quy tắc test

Theo skill `/to-spec`: chỉ test **external behavior**, không test implementation details.

- Mỗi test phải có thể đọc được như user story.
- Tên test: mô tả behavior, không mô tả hàm nội bộ. Ví dụ: `"renderer: gặp sub/none thì unmount DOM"` thay vì `"renderer.unmount() calls removeChild"`.
- Assertion: chỉ check public output (return value, message gửi ra, DOM state quan sát được), không check internal state.

### 5.3 Coverage mục tiêu

- Parser + classify: ≥ 90% statement (giữ vì đã pass 90/90 tests ở 03sep26).
- Storage: ≥ 90% branch (test race condition, cooldown, error).
- Fetcher: tăng coverage cho `searchSubtitleFile` (chỉ happy path ở hiện tại).
- Renderer (mid level): chưa chốt %; ưu tiên edge case:
  - Video pause rồi play.
  - Tab switch.
  - Race với reload renderer.
  - Auto-hide khi sub/none.
  - Skip frame tăng/giảm dynamic.

### 5.4 Prior art

- `tests/parser.test.mjs` (đã có) — pattern: parse raw text → assert `parsedData` shape → so sánh từng field.
- `tests/storage.test.mjs` (đã có) — pattern: mock `chrome.storage.local` → test race condition với `Promise.all`.
- `tests/tagProcess.test.mjs` (đã có) — pattern: classify entry → assert `lineCss[i]` shape.

---

## 6. Out of Scope

> Ghi chú: trong grilling, chủ repo ban đầu trả lời Q33 với ý nhắc riêng về `popup.js` (chưa viết, không phải design choice), không phải từ chối khái niệm OOS. Tôi tự suy ra các OOS dưới đây dựa trên toàn bộ Q&A; spec chính thức sẽ chốt lại ở session sau.

Các OOS cho spec này (cố ý KHÔNG làm):

1. **Bilibili, Twitch, Vimeo, …** — chỉ YouTube cho v1 (đúng Q22, Q35).
2. **Firefox Add-ons** — chỉ Chromium 131+ cho MVP (Q35).
3. **Chrome Web Store publish** — self-host qua GitHub Releases cho MVP (Q30).
4. **A11y đầy đủ** — chỉ có một số thẻ role/text cơ bản nếu render DOM; nếu canvas thì a11y = 0 (Q25b).
5. **Sub editor trong extension** — chỉ render, không edit.
6. **Auto-translate sub** — không có.
7. **Sub sync giữa nhiều người** — không có (cộng tác).
8. **Migration script cho data từ ASS-CEE cũ** — chưa yêu cầu (Q55).
9. **Onboarding flow cho fresh install** — chỉ empty state + hướng dẫn ở README; popup note sau (Q49).
10. **Telemetry / analytics** — không (Q60).
11. **Storage schema versioning** — chỉ migration on-demand khi cần (Q55).
12. **ETag / If-Modified-Since** — chỉ manual re-fetch (Q20).
13. **Auto-refresh source list** khi sub provider update folder — chỉ manual (Q54).
14. **Config keys cụ thể** (cho `ASSCEE_config`) — chưa liệt kê, để session sau khi viết options page (Q59).
15. **AST/parser cho `[Aegisub Project Garbage]` section** — giữ nguyên `pipeline.txt` đã nói "Bỏ qua phần [Aegisub Project Garbage]".
16. **Shadow DOM injection** — chưa áp dụng, sẽ xét ở session sau nếu cần.
17. **Retry với exponential backoff** (1s, 2s, 4s, 8s) — chưa chốt, có thể không cần vì cooldown 60s đã đủ.
18. **Popup log filtering** — log hiển thị tất cả, không filter theo level (info/warn/error).
19. **Multi-language UI** — chỉ Tiếng Việt.
20. **E2E test với Playwright/Puppeteer** — chỉ low + mid level test (Q34).
21. **Retry policy cho storage re-fetch khi fail** — chỉ manual qua dialog, không tự retry.

---

## 7. Further Notes

### 7.1 Open question cần chốt trước khi implement

1. **Schema message BG ↔ CS ↔ Options cụ thể** — sẽ dùng file `background.js` cũ của ASS-CEE mà chủ repo sẽ gửi. Spec này mới chỉ liệt kê type/payload dự kiến (xem §4.2.2).
2. **`host_permissions` cho YouTube** — giữ `optional_host_permissions` hay chuyển sang `host_permissions`? Cần cho `chrome.scripting.executeScript` dynamic. Sẽ verify khi viết `background.js`.
3. **Retry policy với backoff** (1s, 2s, 4s, 8s, max 3 lần) có cần không? Cooldown 60s đã có thể đủ. Nếu thực nghiệm thấy cần, sẽ thêm ở implementation sau.
4. **Tên file content script** — đề xuất `content/overlay.js` (entry point), `content/renderer.js` (core). Cần chốt để đồng bộ với `manifest.json` (nếu dùng static `content_scripts`).
5. **Tên file `PlayerAdapter` interface** — đề xuất `content/adapters/player-adapter.js`. Cần JSDoc typedef để IDE check.
6. **Selector parent div của YouTube player** — đề xuất `#player-container-outer` hoặc `ytd-watch-flexy #player`. Cần verify với YouTube DOM hiện tại.
7. **Thứ tự dialog 3 nút** — Hủy / Thử lại / Xóa (theo §4.8.2). Cần verify có đúng thứ tự UX không (vd Hủy nên ở góc phải như cancel convention).

### 7.2 Phụ thuộc upstream

Theo `pipeline.txt` đã chốt, **KHÔNG thay đổi trong spec này**:

- **Algorithm pretext của chenglou** (github.com/chenglou/pretext) — chỉ lấy core (prepare/đo segment một lần + layout thuần toán, kể cả rich-inline), đưa vào repo. KHÔNG bundle như dependency. Parser/bg vẫn thuần PlayRes, pretext chỉ dùng ở renderer.
- **YouTube IFrame Player API** — cho rVFC + video metadata.
- **Aegisub v3.4.2 spec** — cho phần Script Info (8 key) + V4+ Styles + Events.

### 7.3 Rủi ro đã biết

- **Aegisub/libass khác nhau** ở 1 số tag hiếm (vector drawing, complex `\t`) — canvas fallback sẽ giả lỏng, không bám 100%. Chấp nhận được cho v1.
- **Firefox MV3 API khác biệt** (`browser.*` namespace, sidePanel, action API) — sẽ làm riêng ở spec sau.
- **YouTube đổi DOM thường xuyên** — `PlayerAdapter.getVideoId` phải có fallback (URL → `ytInitialPlayerResponse` → DOM dataset). Cần monitor và update adapter khi YouTube release thay đổi.
- **rVFC trên video YouTube** có thể không khả dụng trong một số trường hợp (vd tab throttled) — sẽ rơi về `requestAnimationFrame` (chưa implement ở spec này, OOS).
- **`chrome.storage.local` quota** — `unlimitedStorage` đã có trong manifest, nhưng thực tế vẫn có giới hạn (browser-specific). Nếu user có nhiều cache, có thể đầy. Giải pháp: giới hạn số file cached (chưa chốt, sẽ xét ở config key).

### 7.4 Khả năng tham chiếu

Spec này là điểm khởi đầu cho các spec/issue sau:

- **`v2-bilibili`**: thêm Bilibili adapter, mở rộng `PlayerAdapter`.
- **`v2-firefox`**: port sang Firefox MV3 (xử lý `browser.*` namespace, sidePanel, action).
- **`v2-config-keys`**: liệt kê chi tiết config keys cho `ASSCEE_config`.
- **`v2-telemetry-opt-in`**: thêm opt-in anonymous telemetry nếu cần.
- **`v2-offset-feature`**: dùng `Synch Point` để shift offset sub.
- **`v2-cache-bust`**: dùng `Update Details` để tự động invalidate cache.
- **`v2-onboarding`**: thêm onboarding flow cho fresh install.

Mỗi spec/issue sau sẽ tham chiếu lại spec này để giữ tính nhất quán.

### 7.5 Quy trình review code

Sau khi spec này được implement, có thể chạy skill `/code-review` để review diff giữa code hiện tại và code mới theo 2 trục:
- **Standards**: tuân thủ chuẩn bổ sung + coding convention của repo.
- **Spec**: implementation có khớp với user stories + implementation decisions trong spec này không.

---

## 8. Workflow tiếp theo

1. **Chốt 7 open questions** trong §7.1 (chủ repo cung cấp file `background.js` cũ ASS-CEE, verify YouTube DOM, chốt manifest permissions).
2. **Implement theo thứ tự**:
   - Bước 1: Tiếp tục classify 2.3/2.2/2.1 ở `tagProcess.js` + mở rộng tests.
   - Bước 2: Viết `background/background.js` (message bus + lifecycle + cooldown).
   - Bước 3: Viết `content/overlay.js` + `content/renderer.js` + `content/adapters/youtube.js`.
   - Bước 4: Viết `background/options.html` + `background/options.js`.
   - Bước 5: Viết `popup/popup.js`.
   - Bước 6: Mở rộng tests ở low + mid level.
3. **Test trên máy thật**: load extension unpacked vào Chromium 131+, mở YouTube có sub fan-sub, kiểm tra render + popup + options page + re-fetch.
4. **Review code** với `/code-review` (optional).
5. **Đóng gói và self-host**: build `.crx` hoặc zip, đẩy lên GitHub Releases.
6. **Publish spec**: mở GitHub Issue với label `ready-for-agent`, body link file spec (sau khi spec đã chốt).

---

## Phụ lục A: Tham chiếu chéo

| Quyết định trong spec này | Liên quan đến |
|---|---|
| §4.3 Chuẩn bổ sung | User story #15, #16, #17 |
| §4.4 Search algorithm | User story #5 |
| §4.5 Renderer | User story #6, #7, #8, #10, #11, #12 |
| §4.6 Parser/classify | Phần 2.3/2.2/2.1 của checklist 29aug26 mục #14-#16 |
| §4.7 BG ↔ CS ↔ Options | User story #13 (manual refresh) |
| §4.8 Re-fetch | User story #9 |
| §4.9 Storage | User story #1, #2, #3, #13, #14 |
| §4.16 PlayerAdapter | Q15 (platform abstraction), Q22 (YouTube only) |
| §6 OOS | Q25b, Q30, Q34, Q35, Q49, Q54, Q55, Q59, Q60 |

## Phụ lục B: Glossary

- **Aegisub**: phần mềm tạo và edit sub `.ass` phổ biến.
- **ASS (Advanced SubStation Alpha)**: định dạng sub, kế thừa từ SubStation Alpha. File extension `.ass`.
- **libass**: thư viện render ASS phổ biến (dùng trong mpv, VLC, …).
- **MV3 (Manifest V3)**: phiên bản thứ 3 của Chrome Extension manifest, yêu cầu service worker thay về background page.
- **rVFC (requestVideoFrameCallback)**: API cho phép callback chạy mỗi khi video presented frame mới. Có sẵn trên HTMLVideoElement.
- **Karaoke** (`\k`, `\kf`, `\K`, `\ko`): hiệu ứng sub "lộ" từng từ theo nhịp, phổ biến trong sub fansub Việt.
- **pretext**: thuật toán đo chữ + layout của chenglou (github.com/chenglou/pretext).
- **Chuẩn bổ sung**: extension standard do maintainer PD-47.ass định nghĩa, optional cho sub provider, chỉ ở file name + Script Info.
- **PlayerAdapter**: interface cho từng nền tảng (YouTube, Bilibili, …) để renderer lấy videoId + inject DOM.
- **Sub provider**: người tạo và host file `.ass` (fansub author).
- **Sub slot**: 1 entry trong cache `ASSCEE_subData_<videoId>`, ứng với 1 video ID.
