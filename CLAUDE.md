# Kiln: notes for Claude

Read `docs/RESUME.md` first (live state, machine limits, gotchas), then `docs/ARCHITECTURE.md`.
The user's priority is **consistency** (characters/items/styles staying on-model), see
`docs/CONSISTENCY.md`, then a clean, non-generic UI. Keep docs/RESUME.md updated at the end of
every session.

- Run/restart: `systemctl --user restart kiln` (port 8510, LAN). Never `pkill -f server.py`.
- No build step: edit `static/js/*.js`, reload the browser. Syntax-check modules via a `.mjs` copy.
- Verify UI changes with headless Chromium/Playwright screenshots before saying they work.
- Commit attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
