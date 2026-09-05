# 0006 — Skip frame dynamic + auto-detect low-end (không best-effort thuần)

**Bối cảnh**: Extension phải render sub theo rVFC (presented frame rate). Trên máy yếu (laptop cũ, Chromebook), có thể drop nhiều frame, sub giật khó xem. Có 3 hướng: (a) best-effort (render từng frame, máy yếu chịu), (b) skip preset cố định, (c) skip dynamic + tự điều chỉnh.

**Quyết định**: 2 cơ chế kết hợp. (1) `skip dynamic` theo preset do BG cung cấp (mặc định `skipEvery: 0` = render mọi frame; viewer tùy chỉnh qua options page). (2) `auto-detect low-end`: renderer đo dropped ratio liên tục; nếu `DFPS / (FPS + DFPS) > 0.3` trong 5 giây liên tiếp thì tăng `skipEvery` lên 1, 2, …; nếu ổn định thì giảm dần về 0.

**Tại sao**: Best-effort thuần (Q28 ban đầu) khiến máy yếu drop liên tục, sub không xem được. Skip preset cố định bất tiện (viewer phải biết máy mình yếu). Skip dynamic + auto-detect tự thích nghi, viewer không cần config. Trade-off: code phức tạp hơn (phải đo dropped ratio liên tục, có state machine cho skip level). Phải test trên nhiều máy để tune threshold (30% trong 5s).
