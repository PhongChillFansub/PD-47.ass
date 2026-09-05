# 0004 — Render bằng DOM/CSS trước, canvas fallback cho effect phức tạp

**Bối cảnh**: Sub Aegisub có nhiều effect: text + style + karaoke + animation (đa số dùng DOM/CSS được), nhưng cũng có vector drawing (`\p`) và complex motion (multi-segment `\move`) mà DOM/CSS không diễn tả chính xác. Có 3 hướng: (a) 100% DOM/CSS, (b) 100% canvas, (c) hybrid.

**Quyết định**: Hybrid. Renderer dùng DOM/CSS cho phần lớn (text + style + karaoke + `\t` cơ bản). Chỉ dùng canvas cho effect không thể hiện được bằng DOM/CSS (vector drawing, complex `\move`).

**Tại sao**: 100% canvas chính xác nhất nhưng mất a11y (screen reader không đọc text trong canvas), text kém khả năng copy/select, debug khó. 100% DOM/CSS có a11y tốt, debug dễ (mở DevTools thấy ngay), nhưng vector drawing không hiển thị được → degrade. Hybrid lấy ưu điểm cả 2: phần lớn viewer vẫn có a11y + debug được, effect hiếm (vector) vẫn hiển thị được. Trade-off: code phức tạp hơn (2 path render), phải detect lúc nào dùng canvas.
