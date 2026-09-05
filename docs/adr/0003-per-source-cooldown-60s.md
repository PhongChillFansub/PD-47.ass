# 0003 — Per-source cooldown 60s thay vì retry with exponential backoff

**Status**: accepted — chủ repo xác nhận lại 05sep26: **không** có retry với exponential backoff.

**Bối cảnh**: Extension fetch folder Drive/GitHub để lấy danh sách file `.ass`. Drive API và GitHub API có rate limit. Nếu viewer có nhiều source, scan đồng thời có thể trigger rate limit.

**Quyết định**: Mỗi source có 1 cooldown 60s ở BG memory (không persist). Nếu `source/refresh` được gọi và `Date.now() - lastFetched[storageId] < 60_000` thì bỏ qua source đó, trả warning `"source: cooldown active"`. KHÔNG có retry với exponential backoff.

**Tại sao**: Cooldown đơn giản hơn retry backoff (1 timestamp vs 1 cơ chế retry + state machine). Drive/GitHub rate limit thường là per-minute, 60s cooldown đủ rộng để tránh spam. Viewer hiếm khi refresh liên tục; nếu cần gấp thì đợi 60s. Trade-off: nếu Drive/GitHub fail vì rate limit (429), extension chỉ đợi 60s thay vì tự retry → viewer thấy lỗi và tự bấm refresh lại. Chấp nhận được cho MVP.
