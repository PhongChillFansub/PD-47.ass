# 0002 — Chuẩn bổ sung chỉ ở filename + 8 Script Info keys (không đụng events)

**Bối cảnh**: Maintainer muốn cho phép sub provider thêm metadata để extension dùng (vd auto-map video qua tên file, hiển thị title trong popup, tương lai shift offset từ `Synch Point`). Nhưng extension này tái sử dụng file `.ass` bằng Aegisub nên không thể thêm field tùy ý — sẽ làm Aegisub hiện warning.

**Quyết định**: Chuẩn bổ sung giới hạn ở 2 chỗ: (1) quy ước đặt tên file `#<videoId>` (case-insensitive, optional), (2) 8 key Script Info mà Aegisub v3.4.2 cho phép edit (`Title`, `Original Script`, `Original Translation`, `Original Editing`, `Original Timing`, `Synch Point`, `Script Updated By`, `Update Details`). Tool KHÔNG đọc các key ngoài 8 key này. Tool KHÔNG đụng vào `[V4+ Styles]` và `[Events]`.

**Tại sao**: Sub provider dùng Aegisub chuẩn — file mở được không warning. Khi Aegisub update version mới với key mới, tool không tự động break (chỉ đọc 8 key cố định). Giữ ranh giới rõ: extension chỉ đọc metadata, không modify nội dung sub. Trade-off đã cân nhắc: cho phép sub provider dùng comment field (vd `; PhongChill: key=value`) bị loại vì Aegisub không hỗ trợ edit comment trong Script Info editor.
