## Đính chính 05sep26 — verify lại output của session `arena/01a06dcc-pd-47-ass`

Session verify `arena/01a0739a` đã chạy lại toàn bộ checklist trong `.scratch/handoff-2026-09-05-2157.md`; báo cáo đầy đủ ở `.scratch/verify-2026-09-05-2224.md`. Ba điểm cần biết trước khi nhận issue này:

1. **`options.html` chưa tồn tại nhưng `manifest.json` đã khai `"options_page": "options.html"`.** Extension vì vậy **không load được** (Chrome validate path lúc load unpacked) cho tới khi tạo file này, kể cả placeholder. Việc đầu tiên cần làm.
2. **Auto-map `#<videoId>` (Story #4, §4.3.1) CHƯA implement ở bất kỳ đâu.** `grep videoId background/fetcher.js` = 0 kết quả; `pipeline.txt` không mô tả quy ước này. Chữ `#` trong `parseSearchQuery` (`fetcher.js:94–118`) là prefix case-sensitive cho **query viewer gõ tay**, không phải tag trong tên file — hai khái niệm này từng bị nhầm trong báo cáo code review. `storage.addSubData(videoId, …)` đã có nhưng bắt caller biết sẵn videoId, và hiện chưa có caller nào.
3. **`popup.html`, `popup.js`, `options.html`, `options.js` nằm ở REPO ROOT**, không phải trong thư mục con `popup/` hay `background/` — vì `manifest.json` trỏ `"default_popup": "popup.html"` + `"options_page": "options.html"`, và `popup.html:42` có `<script src="popup.js">`. Module map §2.2.1 của spec đã được sửa lại cho khớp.

Hai điểm từng treo đã được maintainer chốt 05sep26:

- **Retry với exponential backoff: KHÔNG làm.** ADR 0003 đã đúng; spec §7.1 open question #3 được rút (danh sách còn 6 mục), §4.9.6 và OOS #17 đổi từ "chưa chốt" thành "đã chốt KHÔNG làm". Cooldown 60s per source là cơ chế chống spam duy nhất; muốn thêm backoff thì phải mở lại ADR 0003.
- **"Content script không bao giờ cần source data": mệnh đề đúng, lý do là CS thuộc phía content-side** (script chạy trong web page), không phải background-side — source list, file sub và cache đều là chuyện của BG. ADR 0001 + spec §4.5.1 nay ghi thẳng lý do này thay vì trích "Q54" (phụ lục TOC mô tả Q54 là "BG chỉ fetch on options page action", thuộc OOS #13; transcript grilling không persist nên số câu không đối chiếu được).
