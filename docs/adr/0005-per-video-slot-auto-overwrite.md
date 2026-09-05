# 0005 — Per-video slot auto-overwrite thay vì version tracking qua ETag/Update Details

**Bối cảnh**: Sub provider có thể cập nhật file `.ass` cho cùng 1 video (vd sửa typo, sync lại timing). Extension cần quyết định có lấy file mới không khi viewer mở video. Có 2 hướng: (a) cache forever cho đến khi viewer tự re-fetch, (b) check ETag/Last-Modified/Update Details để auto-invalidate.

**Quyết định**: Mỗi videoId = 1 slot trong cache (`ASSCEE_subData_<videoId>`). Khi extension fetch sub cho video đã cache, fetch lại từ URL, nếu thành công thì tự overwrite slot cũ. KHÔNG check ETag, KHÔNG đọc `Update Details` để compare version. KHÔNG auto-refresh khi viewer mở video.

**Tại sao**: Auto-invalidate dựa trên ETag phức tạp (phải lưu ETag, gửi If-None-Match, xử lý 304). Dựa trên `Update Details` không đáng tin (sub provider có thể quên cập nhật field). Slot overwrite đơn giản: viewer tự bấm "Re-fetch" trong options page khi muốn cập nhật → extension fetch lại URL → nếu OK thì overwrite. Cache độc lập với folder của sub provider (nếu folder cập nhật mới mất file cũ → cache vẫn giữ). Trade-off: viewer phải chủ động re-fetch, không có auto-update — chấp nhận được vì sub Aegisub thay đổi không thường xuyên.
