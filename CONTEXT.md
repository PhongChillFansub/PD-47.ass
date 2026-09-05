# PD-47.ass — Domain Context

PD-47.ass là extension Chrome MV3 cho phép viewer xem phụ đề Aegisub (file `.ass`) trên YouTube. Repo này là **single context** (theo `docs/agents/domain.md`).

File này là **glossary thuần**, KHÔNG chứa implementation detail. Để biết spec/decision, đọc `docs/specs/v1-pd47ass.md` + `pipeline.txt` + `docs/adr/`.

## Language

### Actors

**viewer**:
Người dùng extension, xem video YouTube và đọc sub Aegisub qua extension.
_Avoid_: end-user, user, người dùng.

**sub provider**:
Người tạo và host file `.ass` cho viewer dùng.
_Avoid_: fansub author, người làm sub.

**maintainer**:
Chủ repo PD-47.ass, chịu trách nhiệm thiết kế chuẩn bổ sung và implement extension.
_Avoid_: author, dev, developer.

### Sub files & Aegisub

**Aegisub**:
Phần mềm tạo và edit file sub ASS (PascalCase là tên riêng).
_Avoid_: (giữ — tên riêng).

**ASS**:
Định dạng sub (Advanced SubStation Alpha), kế thừa SubStation Alpha. File extension `.ass`.
_Avoid_: Advanced SubStation Alpha (dài), subtitle format (chung chung).

**sub file**:
Một file `.ass` chứa đầy đủ `[Script Info]`, `[V4+ Styles]`, `[Events]`.
_Avoid_: subtitle file, file sub, ASS file (viết liền dễ nhầm với "ASS format").

**Script Info**:
Section `[Script Info]` trong file ASS, chứa metadata key:value.
_Avoid_: script info (lowercase — đây là section có tên cố định trong spec Aegisub).

**event**:
Một dòng sub trong section `[Events]` (vd 1 câu thoại, 1 hiệu ứng karaoke, 1 comment).
_Avoid_: dialogue (chỉ là 1 loại event), line (trùng với "dòng vật lý trong DOM").

**style**:
Một style trong section `[V4+ Styles]`, định nghĩa font, màu, border, alignment, margin cho event.
_Avoid_: (giữ — tên cố định trong ASS spec).

**karaoke**:
Hiệu ứng sub "lộ" từng từ theo nhịp, dùng tag `\k`, `\kf`, `\K`, `\ko`.
_Avoid_: (giữ — tên kĩ thuật phổ biến).

**clip**:
Hiệu ứng cắt sub theo hình (vd hình tròn, ellipse), dùng tag `\clip` hoặc `\iclip`.
_Avoid_: (giữ).

**vector drawing**:
Vẽ hình vector trong sub (vd logo, mũi tên), dùng tag `\p`.
_Avoid_: drawing, shape (chung chung).

### Extension architecture

**background** (BG):
Service worker MV3 của extension, xử lý logic nặng (fetch, parse, storage, search, scan folder).
_Avoid_: SW (chung chung cho service worker), service worker (chỉ dùng khi nói về MV3 concept).

**content script** (CS):
Script inject vào web page. Trong repo này, CS chỉ làm renderer (DOM + animation loop), không fetch/parse/storage.
_Avoid_: renderer (nói về chức năng, không phải identity), injected script.

**popup**:
UI nhỏ hiện khi click icon extension trên toolbar Chrome, hiện 3 stat (FPS/NPS/DFPS) + title + log.
_Avoid_: (giữ).

**options page**:
UI đầy đủ trong tab riêng (`chrome.runtime.openOptionsPage`), quản lý sources, sub cache, config.
_Avoid_: (giữ).

**source**:
Một folder Google Drive hoặc GitHub chứa nhiều file `.ass`, là đầu vào cho viewer.
_Avoid_: feed, playlist (có nghĩa khác trong context khác).

**FileEntry**:
Một file `.ass` trong `source.fileList`, có `id` (GDrive ID hoặc GitHub sha), `fileName`, `fetchUrl`, `folderUrl`, `sourceType`, `groupName`.

**sub slot**:
Một entry trong cache sub của extension, key lưu = `ASSCEE_subData_<videoId>`, ứng với 1 videoId. Tự động overwrite nếu có file mới cho cùng videoId.
_Avoid_: sub cache entry, sub record.

**videoId**:
Chuỗi 11 ký tự định danh 1 video trên YouTube (vd `dQw4w9WgXcQ`). Là identity trong cache và trong tên file sub (chuẩn bổ sung dùng pattern `#<videoId>`).
_Avoid_: video id (chữ cách), video URL (dài hơn, có query string).

**storageId**:
UUID do extension sinh bằng `crypto.randomUUID()`, identity ổn định của 1 source để xóa/so sánh.
_Avoid_: id (trùng với FileEntry.id — phải luôn ghi rõ "storageId" khi nói về source).

**chuẩn bổ sung**:
Extension standard do maintainer định nghĩa, optional cho sub provider. Gồm 2 phần: (1) quy ước đặt tên file `#<videoId>`, (2) 8 key Script Info của Aegisub v3.4.2 (Title, Original Script, Original Translation, Original Editing, Original Timing, Synch Point, Script Updated By, Update Details).
_Avoid_: extension standard (dài hơn + có thể nhầm với "W3C standard"), custom standard (không "custom" — đây là 1 chuẩn cụ thể, không phải mở).

**message bus**:
Cơ chế giao tiếp giữa background ↔ content script ↔ options page qua `chrome.runtime.sendMessage` + `chrome.runtime.onMessage`.
_Avoid_: message queue (có thể nhầm với queue thật), event bus (chung chung hơn).

### Renderer internals

**rVFC (requestVideoFrameCallback)**:
API trên HTMLVideoElement, callback chạy mỗi khi video presented frame mới. Renderer dùng để sync sub animation. Khi video pause hoặc tab ẩn → callback ngừng → sub tự đứng yên.
_Avoid_: (giữ — tên API cố định).

**pretext**:
Thuật toán đo chữ + layout của chenglou (github.com/chenglou/pretext). Chỉ lấy core, đưa vào repo, dùng ở renderer để scale từ PlayRes sang kích thước video thật.
_Avoid_: (giữ — tên thuật toán).

**parsedData**:
Object output của parser, gồm `info, styles, events, globalCss, styleCss, lineCss`. BG gửi nguyên object này cho CS 1 lần.
_Avoid_: parsed data (2 từ — đây là 1 property cụ thể trong object), parsed sub (có thể nhầm).

**styleCss**:
Mảng CSS-cooked, cùng index với `parsedData.styles`. Mỗi phần tử gồm `container` (CSS vỏ dòng), `text` (CSS ruột chữ), `data` (số liệu thuần để renderer đo/collision/karaoke).
_Avoid_: (giữ).

**lineCss**:
Mảng per-event, cùng index với `parsedData.events`. Mỗi phần tử gồm `base, collision, clip`.
_Avoid_: line CSS (2 từ — có thể nhầm với style CSS thường).

**base** (lineCss[i].base[j]):
Một mục trong mảng `base`, gồm `tags` (raw nguyên văn, không xóa khi consume), `text`, `delta` (CSS-cooked + số liệu), `anim` (animation metadata cho `\t`/`\k`).
_Avoid_: segment (đã đổi tên ở 02sep26 — xem `pipeline.txt`), run (chưa dùng trong code hiện tại).

**FALLBACK_DEFAULT_STYLE**:
Style mặc định dùng khi 1 event tham chiếu style không tồn tại trong `[V4+ Styles]`. Định nghĩa trong `background/parser.js`.
_Avoid_: default style (chung chung), fallback (không nói lên là style).

**skip frame**:
Cơ chế renderer bỏ qua 1 số frame để giảm tải, gồm 2 dạng: `skip dynamic` (theo preset do BG cung cấp) + `auto-detect low-end` (tự tăng skip khi dropped ratio > 30% trong 5 giây).
_Avoid_: frame skip (cách viết khác), throttling (chung chung).

**FPS** (Frames Per Second):
Số frame renderer thực sự render trong giây (sau khi áp skip). Hiển thị trong popup.
_Avoid_: (giữ — viết tắt phổ biến).

**NPS** (Nodes Per Second):
Số DOM node cần update trong giây (tổng `nodesTouched` của tất cả active line). Hiển thị trong popup.
_Avoid_: (giữ — viết tắt đặc thù của repo này).

**DFPS** (Dropped FPS):
Số frame extension chủ động bỏ qua trong giây (do skip preset + tự detect). Hiển thị trong popup.
_Avoid_: dropped frames (dài hơn), FPS dropped (dễ nhầm với FPS thường).

**sub DOM**:
Div inject để hiển thị sub, là sibling với parent div của YouTube player. Renderer mount/unmount DOM này theo vòng đời sub.
_Avoid_: subtitle element (chung chung), overlay div (có thể nhầm với overlay khác).
