# 0007 — Stroke ×2 cho borderStyle=1 (để khớp hành vi libass)

**Bối cảnh**: Khi render sub có border (borderStyle=1 trong `[V4+ Styles]`), `-webkit-text-stroke` của CSS vẽ viền **cân giữa** đường bao glyph (½ trong, ½ ngoài). Còn `\bord` của Aegisub/libass vẽ viền **hoàn toàn ra ngoài** fill. Hai hành vi khác nhau.

**Quyết định**: Khi borderStyle=1, set `-webkit-text-stroke-width = outline × 2` (trong đơn vị px PlayRes), kèm `paint-order: stroke fill markers`. Nửa trong bị fill che, nửa ngoài còn đúng `outline` px → khớp Aegisub. `--outline-width` CSS var và `data.outline` vẫn giữ số **gốc** `outline` (số liệu thô cho tag override `\bord` và renderer scale). Box (borderStyle=3) KHÔNG đổi (đã dùng `padding` thay vì stroke).

**Tại sao**: Số `×2` trông như magic number. Nhưng nếu không nhân đôi, viền sub extension sẽ **mỏng hơn** Aegisub một nửa, viewer sẽ thấy sub khác. Magic number này là "necessary hack" để map CSS API (vẽ cân giữa) sang ASS semantic (vẽ ngoài). Có alternative là vẽ 2 lớp (1 lớp màu outline, 1 lớp fill) nhưng chậm hơn và khó control. Trade-off đã cân nhắc: bị surprising lúc đọc code (magic number 2) nhưng đã chốt với chủ repo (xem `pipeline.txt` 02sep26 §5) và có chú thích JSDoc giải thích.
