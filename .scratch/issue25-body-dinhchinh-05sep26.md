<!-- Body đã đính chính cho issue #25 — bot không có quyền `gh issue edit` (Resource not accessible by integration).
     Cách dùng: gh issue edit 25 --body-file .scratch/issue25-body-dinhchinh-05sep26.md   (chạy bằng token của anh)
     Hoặc copy phần dưới dòng này dán vào body issue, bỏ 4 link trỏ branch arena/01a06dcc đã đổi sang editor. -->

# Spec `v1-pd47ass` — Phiên bản 1 của extension PD-47.ass

> **Trạng thái**: Ready for agent.
> **Nguồn ra quyết định**: Hội thoại `/grilling` session `arena/01a06dcc-pd-47-ass` (16 round Q&A — phụ lục TOC truy vết được 63 câu, thiếu Q48; transcript không persist) + `pipeline.txt` + code hiện tại.
> **Phụ lục lịch sử**: [`docs/specs/v1-pd47ass.toc.md`](https://github.com/PhongChillFansub/PD-47.ass/blob/editor/docs/specs/v1-pd47ass.toc.md) (outline trước khi viết spec).

## Tóm tắt

Hoàn thiện extension v0.1.0 đạt **v1** theo nghĩa chạy được end-to-end trên YouTube:

1. **Content script renderer** (mới): dựng DOM từ `parsedData`, animation loop theo `requestVideoFrameCallback`, dọn dẹp khi đổi video.
2. **Background message bus** (mới): BG ↔ content script ↔ options page qua `chrome.runtime.sendMessage`.
3. **Popup.js** (mới): dùng `popup.html` đã thiết kế sẵn — 3 stat + Title + log + 2 nút.
4. **Options page** (mới): quản lý sources, per-video sub cache, manual re-fetch.
5. **Tiếp tục classify 2.3 / 2.2 an-pos-move-org / 2.1** ở `tagProcess.js` (checklist 29aug26 mục #14-#16).
6. **Per-source cooldown 60s** ở BG.
7. **Platform adapter** từ đầu (`PlayerAdapter` interface) — YouTube là adapter đầu tiên.

## Spec đầy đủ

Xem file spec tại:
**[`docs/specs/v1-pd47ass.md`](https://github.com/PhongChillFansub/PD-47.ass/blob/editor/docs/specs/v1-pd47ass.md)**

8 phần theo template `/to-spec`:
1. Problem Statement
2. Solution
3. User Stories (19 stories, 3 actor: viewer / sub provider / maintainer)
4. Implementation Decisions (17 mục con)
5. Testing Decisions
6. Out of Scope (21 OOS)
7. Further Notes (**6** open questions + rủi ro + tham chiếu tương lai)
8. Workflow tiếp theo (6 bước)

## Open questions cần chốt trước khi implement

Trích từ §7.1 của spec:

1. **Schema message BG ↔ CS ↔ Options cụ thể** — sẽ dùng file `background.js` cũ của ASS-CEE mà chủ repo sẽ gửi.
2. **`host_permissions` cho YouTube** — giữ `optional_host_permissions` hay chuyển sang `host_permissions`? Cần cho `chrome.scripting.executeScript` dynamic.
3. **Tên file content script** — đề xuất `content/overlay.js` (entry), `content/renderer.js` (core).
4. **Tên file `PlayerAdapter` interface** — đề xuất `content/adapters/player-adapter.js`.
5. **Selector parent div của YouTube player** — đề xuất `#player-container-outer` hoặc `ytd-watch-flexy #player`. Cần verify.
6. **Thứ tự dialog 3 nút re-fetch** — Hủy / Thử lại / Xóa. Cần verify UX.

*(Mục cũ #3 "Retry policy với backoff có cần không?" đã được maintainer chốt 05sep26: **KHÔNG làm** — ADR 0003. Danh sách còn 6 mục.)*

## Tham chiếu

- Kiến trúc hiện tại: [`pipeline.txt`](https://github.com/PhongChillFansub/PD-47.ass/blob/editor/pipeline.txt) (primary doc) + [`CONTEXT.md`](https://github.com/PhongChillFansub/PD-47.ass/blob/editor/CONTEXT.md) (glossary, 40 term) + [`docs/adr/`](https://github.com/PhongChillFansub/PD-47.ass/tree/editor/docs/adr) (7 ADR 0001-0007) — cả hai đã có từ 05sep26
- Code hiện tại: `background/{fetcher,parser,tagProcess,storage,utils}.js` + `popup.html` (rỗng popup.js)
- Tests: **91/91 pass** (chạy thật 05sep26 bằng `npm test` = `node --test`; `pipeline.txt` ghi "90 pass" tại 03sep26 — đó là toàn suite, không phải riêng `parser.test.mjs`)
- Trạng thái: chỉ Chromium 131+, YouTube only, self-host qua GitHub Releases

## Liên kết

- Spec: `docs/specs/v1-pd47ass.md`
- TOC (lịch sử): `docs/specs/v1-pd47ass.toc.md`
- Skill dùng: `/grilling` + `/to-spec` (xem `.agents/skills/`)

---

## Đính chính 05sep26 (sau khi verify lại bằng session `arena/01a0739a`)

Ba điểm cần biết trước khi nhận issue này — chi tiết trong `.scratch/verify-2026-09-05-2224.md`:

1. **`options.html` chưa tồn tại nhưng `manifest.json` đã khai `"options_page": "options.html"`.** Extension vì vậy **không load được** (Chrome validate path lúc load unpacked) cho tới khi tạo file này, kể cả placeholder. Việc đầu tiên cần làm.
2. **Auto-map `#<videoId>` (Story #4, §4.3.1) CHƯA implement ở bất kỳ đâu.** `grep videoId background/fetcher.js` = 0 kết quả; `pipeline.txt` không mô tả quy ước này. Chữ `#` trong `parseSearchQuery` (`fetcher.js:94–118`) là prefix case-sensitive cho **query viewer gõ tay**, không phải tag trong tên file — hai khái niệm này từng bị nhầm trong báo cáo code review. `storage.addSubData(videoId, …)` đã có nhưng bắt caller biết sẵn videoId, và hiện chưa có caller nào.
3. **`popup.html`, `popup.js`, `options.html`, `options.js` nằm ở REPO ROOT**, không phải trong thư mục con `popup/` hay `background/` — vì `manifest.json` trỏ `"default_popup": "popup.html"` + `"options_page": "options.html"`, và `popup.html:42` có `<script src="popup.js">`. Module map §2.2.1 của spec đã được sửa lại cho khớp.

Hai điểm từng treo đã được maintainer chốt 05sep26:

- **Retry với exponential backoff: KHÔNG làm.** ADR 0003 đã đúng; spec §7.1 open question #3 được rút (danh sách còn 6 mục), §4.9.6 và OOS #17 đổi từ "chưa chốt" thành "đã chốt KHÔNG làm". Cooldown 60s per source là cơ chế chống spam duy nhất; muốn thêm backoff thì phải mở lại ADR 0003.
- **"Content script không bao giờ cần source data": mệnh đề đúng, lý do là CS thuộc phía content-side** (script chạy trong web page), không phải background-side — source list, file sub và cache đều là chuyện của BG. ADR 0001 + spec §4.5.1 nay ghi thẳng lý do này thay vì trích "Q54" (phụ lục TOC mô tả Q54 là "BG chỉ fetch on options page action", thuộc OOS #13; transcript grilling không persist nên số câu không đối chiếu được).
