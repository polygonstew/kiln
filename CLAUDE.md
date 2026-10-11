# Kiln: notes for Claude

Read `docs/HANDOFF.md` first (state, safe testing, what is next), then `docs/ARCHITECTURE.md`; `docs/RESUME.md` is the
long running log (machine limits, engines, gotchas).
Timed improvement runs: follow `docs/LOOP.md` (rules, backlog, log). Code map, events, API, safe testing:
`docs/DEVELOPING.md`; run `tools/smoke.py` after changes. Keep `static/help.html` (the in-app guide) current.
The user's priority is **consistency** (characters/items/styles staying on-model), see
`docs/CONSISTENCY.md`, then a clean, non-generic UI. Keep docs/RESUME.md updated at the end of
every session.

- Run/restart: `systemctl --user restart kiln` (port 8510, LAN). Never `pkill -f server.py`.
- No build step: edit `static/js/*.js`, reload the browser. Syntax-check modules via a `.mjs` copy.
- Verify UI changes with headless Chromium/Playwright screenshots before saying they work.
- Commit attribution: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Stay understandable (user, 2026-10-10: "we do not want codebase comprehension loss")
Kiln must stay small and plain enough for a person to read and debug by hand. Every run:
- **One job per module**, each with a header comment saying what it is for. Nothing over 1000 lines: split
  before adding (`python3 tools/map.py` prints the map and fails past the limit; smoke.py runs it).
- **New feature → its own module** when it is more than a few functions (workshop.js, actor_godot.js, hud_godot.js).
- **Delete before you add:** remove dead code, duplicate helpers and unused options you touch. Prefer one
  obvious way over several clever ones; no frameworks, no build step, no clever metaprogramming.
- **Keep the map current:** docs/DEVELOPING.md code map and FORMATS.md change in the same commit as the code.
- **The games stay understandable too:** the GDScript Kiln writes is short, commented, one job per script, plain
  Godot nodes, no hidden runtime: a Godot developer can open any generated file and follow it.
