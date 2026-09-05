# PD-47.ass — Domain Context

PD-47.ass là extension Chrome cho phép viewer xem phụ đề Aegisub (file `.ass`) trên YouTube. Repo này là **single context** (theo `docs/agents/domain.md`).

File này là **glossary thuần**, KHÔNG chứa implementation detail (không storage key, không tên hàm, không đường dẫn file, không ngưỡng số). Muốn biết spec/decision/con số, đọc `docs/specs/v1-pd47ass.md` + `pipeline.txt` + `docs/adr/`. Bản 05sep26: 40 term.

## Language

### Actors

**viewer**:
Người xem video YouTube và đọc sub Aegisub thông qua extension.
_Avoid_: end-user, user, người dùng, người xem phim (dài).

**sub provider**:
Người tạo và host file `.ass` cho viewer dùng.
_Avoid_: fansub author, người làm sub, fansub team.

**maintainer**:
Chủ repo PD-47.ass, người định nghĩa chuẩn bổ sung và implement extension.
_Avoid_: author, dev, developer.

### Sub files & Aegisub

**Aegisub**:
Phần mềm tạo và edit file sub ASS; là mốc mà extension phải bám theo về cách sub trông như thế nào.
_Avoid_: (giữ — tên riêng).

**ASS**:
Định dạng sub mà extension đọc, kế thừa SubStation Alpha; file có đuôi `.ass`.
_Avoid_: Advanced SubStation Alpha (dài), subtitle format (chung chung).

**libass**:
Thư viện render ASS phổ biến ngoài trình duyệt (mpv, VLC…). Là mốc so sánh khi nói sub của extension render "đúng chuẩn" tới đâu.
_Avoid_: (giữ — tên riêng), ASS renderer (chung chung).

**sub file**:
Một file `.ass` hoàn chỉnh, có đủ metadata, danh sách style và danh sách event.
_Avoid_: subtitle file, file sub, ASS file (viết liền dễ nhầm với "ASS format").

**Script Info**:
Phần metadata dạng key:value của một sub file; là nơi duy nhất chuẩn bổ sung được phép đụng tới.
_Avoid_: script info (lowercase — đây là tên section cố định theo Aegisub), metadata (chung chung).

**event**:
Một dòng sub: một câu thoại, một hiệu ứng karaoke, hoặc một comment.
_Avoid_: dialogue (chỉ là một loại event), line (trùng với "dòng vật lý trong DOM").

**style**:
Bộ mô tả cách trình bày (font, màu, viền, canh lề…) mà event tham chiếu tới.
_Avoid_: (giữ — tên cố định theo ASS), CSS class (là chuyện của renderer, không phải của file sub).

**karaoke**:
Hiệu ứng sub "lộ" từng từ theo nhịp.
_Avoid_: (giữ — tên kĩ thuật phổ biến), hát karaoke (nghĩa đời thường).

**clip**:
Hiệu ứng cắt sub theo một hình, hoặc phần bị cắt đi.
_Avoid_: (giữ), video clip (dễ nhầm với video).

**vector drawing**:
Hình vẽ bằng vector nằm trong sub (logo, mũi tên…).
_Avoid_: drawing, shape (chung chung).

### Extension architecture

**MV3**:
Thế hệ manifest thứ ba của Chrome extension; lý do extension này chạy nền bằng service worker thay vì background page.
_Avoid_: Manifest V3 (sau khi đã viết tắt lần đầu), MV2.

**background** (BG):
Phần extension chạy nền, gánh toàn bộ việc nặng: lấy file sub, đọc hiểu, cất giữ, tìm kiếm, quét thư mục source.
_Avoid_: SW, service worker (chỉ dùng khi nói về khái niệm MV3), backend.

**content script** (CS):
Phía **content-side** của extension: phần chạy bên trong trang web của nền tảng video, đối lập với phía background-side (`background`). Trong repo này CS chỉ đóng vai renderer.
_Avoid_: renderer (nói về chức năng, không phải identity), injected script, overlay script.

**popup**:
UI nhỏ hiện khi viewer click icon extension, để xem nhanh sub đang chạy thế nào và log của extension.
_Avoid_: (giữ), dashboard.

**options page**:
UI đầy đủ trong tab riêng, nơi viewer quản lý source, sub đã cache và cấu hình.
_Avoid_: (giữ), settings page, trang cài đặt.

**source**:
Một thư mục do sub provider host (Google Drive hoặc GitHub) chứa nhiều file `.ass`; là đầu vào của viewer.
_Avoid_: feed, playlist, repo (chỉ đúng cho source GitHub).

**FileEntry**:
Một file `.ass` thuộc về một source, ở mức extension biết tới: tên gì, lấy ở đâu, thuộc source nào.
_Avoid_: file sub (dễ nhầm với `sub file` là file vật lý), entry, item.

**sub slot**:
Chỗ chứa sub của đúng một video trong cache của extension. Mỗi videoId có một slot; có sub mới cho cùng video thì slot bị ghi đè.
_Avoid_: sub cache entry, sub record, cache (chung chung).

**sub index**:
Mục lục nhẹ các sub slot đã cache, đủ để options page liệt kê mà không phải đọc nội dung sub.
_Avoid_: sub list, danh sách sub (chung chung), table of contents.

**renderer stat**:
Số liệu cho biết sub đang được render thế nào: FPS, NPS, DFPS và title của sub đang hiện.
_Avoid_: render data, telemetry (extension này không có telemetry), stats.

**videoId**:
Chuỗi định danh một video trên YouTube. Là identity của sub slot, và là thứ chuẩn bổ sung nhúng vào tên file.
_Avoid_: video id (viết cách), video URL (dài hơn, có query string).

**storageId**:
Identity ổn định của một source, do extension tự sinh ra, dùng để xóa hoặc so sánh source.
_Avoid_: id (dễ nhầm với identity của `FileEntry` — luôn nói rõ "storageId" khi nói về source).

**chuẩn bổ sung**:
Chuẩn riêng của extension, sub provider có thể chọn theo hoặc không: đặt tên file để extension tự nhận ra video, và chỉ dùng những key Script Info mà Aegisub cho phép sửa.
_Avoid_: extension standard (dễ nhầm với chuẩn W3C), custom standard (không "custom" — đây là một chuẩn cụ thể, đóng).

**message bus**:
Cách các phần của extension (background, content script, options page) nói chuyện với nhau.
_Avoid_: message queue (có thể nhầm với queue thật), event bus (chung chung hơn), IPC.

### Renderer internals

**PlayerAdapter**:
Lớp trung gian cho từng nền tảng video, để renderer lấy videoId và chỗ gắn sub DOM mà không cần biết mình đang chạy trên YouTube hay nền tảng nào khác.
_Avoid_: platform adapter (chung chung), YouTube adapter (chỉ là một implementation của interface này).

**rVFC** (requestVideoFrameCallback):
Tín hiệu của trình duyệt báo cho renderer mỗi khi video thực sự hiện một frame mới; nhờ nó sub tự đứng yên khi video pause hoặc tab bị ẩn.
_Avoid_: (giữ — tên API cố định), animation frame (là API khác, chạy kể cả khi video đứng).

**pretext**:
Thuật toán đo chữ và dàn trang mà renderer dùng để quy đổi sub từ hệ tọa độ trong file ASS sang kích thước video thật.
_Avoid_: (giữ — tên thuật toán), text measurer, layout engine.

**parsedData**:
Toàn bộ kết quả đọc hiểu một sub file, đủ để renderer dựng lại sub mà không cần nhìn file gốc.
_Avoid_: parsed data (2 từ — đây là một khối dữ liệu cụ thể), parsed sub.

**styleCss**:
Phần kết quả đọc hiểu mô tả cách trình bày từng style: vỏ dòng, ruột chữ, và số liệu thô để renderer đo.
_Avoid_: lineCss (là khái niệm khác, ở mức event), style CSS thường.

**lineCss**:
Phần kết quả đọc hiểu mô tả từng event: nội dung đã phân loại, thông tin va chạm, và clip.
_Avoid_: line CSS (2 từ — dễ nhầm với CSS thường), styleCss.

**base** (một mục của lineCss):
Một khúc của dòng sub: các tag đi kèm (giữ nguyên văn) và phần chữ của khúc đó, cộng với khác biệt trình bày và metadata animation nếu có.
_Avoid_: segment (đã đổi tên ở 02sep26 — xem `pipeline.txt`. Lưu ý: "segment" trong ngữ cảnh pretext hoặc trong quỹ đạo `\move` nhiều chặng là khái niệm khác, không phải term này), run (chưa dùng trong code hiện tại).

**FALLBACK_DEFAULT_STYLE**:
Style mặc định mà parser rơi về khi một event tham chiếu tới style không tồn tại trong sub file.
_Avoid_: default style (chung chung), fallback (không nói lên đó là style).

**skip frame**:
Việc renderer cố tình bỏ bớt frame để máy yếu vẫn theo kịp: bỏ theo mức viewer chọn, và tự tăng lên khi thấy máy đang tụt frame.
_Avoid_: frame skip (cách viết khác), throttling (chung chung).

**FPS**:
Số frame renderer thực sự vẽ được trong một giây.
_Avoid_: (giữ — viết tắt phổ biến), frame rate (là của video, không phải của renderer).

**NPS**:
Số node sub cần cập nhật trong một giây. Viết tắt đặc thù của repo này, không phải thuật ngữ ngành.
_Avoid_: (giữ), requests per second (trùng viết tắt nhưng khác nghĩa hoàn toàn).

**DFPS**:
Số frame mà extension chủ động bỏ qua trong một giây.
_Avoid_: dropped frames (dài hơn, và dễ nhầm với frame bị trình duyệt rớt), FPS dropped.

**sub DOM**:
Phần DOM extension gắn vào trang để hiện sub; nằm cạnh player chứ không nằm bên trong player.
_Avoid_: subtitle element (chung chung), overlay div (có thể nhầm với overlay khác của YouTube).
