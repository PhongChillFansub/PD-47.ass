# AGENTS.md

Hướng dẫn cho coding agents làm việc trong repo này. Tiếng Việt là ngôn ngữ làm việc của project.

## Agent skills

### Issue tracker

Issues được track trên GitHub Issues của repo này, thao tác qua `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Dùng 5 nhãn triage mặc định của mattpocock/skills, tên nhãn trùng tên vai trò. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: một `CONTEXT.md` + `docs/adr/` ở repo root (tạo lười khi cần, chưa có sẵn). See `docs/agents/domain.md`.

### Installed skills

25 skill từ [mattpocock/skills](https://github.com/mattpocock/skills) (MIT — bản quyền xem `LICENSE` trong thư mục) đã cài sẵn vào `.agents/skills/` — bucket engineering + productivity; bucket `deprecated`/`misc`/`in-progress` của repo nguồn KHÔNG cài. Nguồn cài: commit `3cca18b` (05sep26).

Cách dùng cho mọi agent session (Arena, Claude Code, Codex, Cursor...):

- Khi user gọi `/tên-skill` (vd `/grill-me`, `/tdd`, `/code-review`, `/triage`...) hoặc hỏi "dùng skill X" → đọc `.agents/skills/<tên>/SKILL.md` và LÀM THEO ĐÚNG process trong file đó. Skill là prompt có kỷ luật, không phải code.
- Frontmatter `disable-model-invocation: true` = skill chỉ chạy khi user chủ động gọi, không tự kích hoạt.
- Liệt kê skill có sẵn: `ls .agents/skills/`.
- Cập nhật: `npx skills@latest update` (đọc `skills-lock.json` ở repo root).
- Cài thêm: `npx skills@latest add mattpocock/skills --skill <tên> --agent universal -y --copy` (lặp cờ `--skill` cho nhiều skill; phân cách bằng comma KHÔNG hoạt động).
