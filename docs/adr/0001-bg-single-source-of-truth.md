# 0001 — Background là single source of truth, content script thuần renderer

**Bối cảnh**: Extension Chrome MV3 có 2 loại script chạy được JS nặng — background service worker (BG) và content script (CS). Nếu CS cũng fetch + parse + scan folder, sẽ trùng code, khó test, MV3 service worker lại có giới hạn thời gian sống (sleep sau 30s không có message).

**Quyết định**: BG chịu trách nhiệm toàn bộ logic nặng (fetch, parse, classify, search, scan folder, storage). CS chỉ làm renderer (mount/unmount sub DOM, animation loop theo rVFC, đo chữ, dọn dẹp). BG gửi `parsedData` cho CS 1 lần, không gửi theo frame. Options page ↔ CS (nếu cần) thông qua BG.

**Tại sao**: Tách bạch trách nhiệm giúp test deterministic (BG test được với mock chrome.*; CS test được với mock document + rVFC). Tránh trùng code. BG có thể keep-alive qua message từ CS, không cần code phức tạp. CS không bao giờ cần source data — CS là phía **content-side** (script chạy trong web page), không phải background-side; source list, file sub và cache đều là chuyện của BG, nên việc thu hẹp CS là hợp lý (chủ repo xác nhận 05sep26). *(Bản đầu trích "Q&A Q54 trong grilling session arena/01a06dcc"; phụ lục TOC lại mô tả Q54 là "BG chỉ fetch on options page action" — mệnh đề đó thuộc OOS #13 của spec. Transcript grilling không persist nên không đối chiếu được, vì vậy ghi thẳng lý do thay vì dựa vào số câu.)*
