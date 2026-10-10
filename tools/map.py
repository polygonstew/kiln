#!/usr/bin/env python3
"""Kiln code map + size guard: keeps the codebase small enough to read and debug by hand.

Prints every source file with its line count and the one-line purpose from its header comment, then fails
(exit 1) if a file breaks a rule:
  * a JS or Python module over LIMIT lines (split it: one job per module, e.g. animate.js → actor_godot.js)
  * a module without a header comment / docstring saying what it is for
Run: python3 tools/map.py        (tools/smoke.py runs it too)
"""
import pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LIMIT, WARN = 1000, 800
SKIP = {'fonts.js'}                    # generated data, not code

def purpose(p):
    for line in p.read_text().splitlines()[:4]:
        line = line.strip()
        if line.startswith('//'):
            return line.lstrip('/ ').strip()
        if line.startswith('"""') or line.startswith('#!'):
            continue
    return ''

def main():
    bad, rows = [], []
    files = sorted((ROOT / 'static/js').glob('*.js')) + sorted(ROOT.glob('*.py'))
    for p in files:
        if p.name in SKIP:
            continue
        n = sum(1 for _ in p.open())
        what = purpose(p) if p.suffix == '.js' else (p.read_text().split('"""')[1].strip().splitlines()[0] if '"""' in p.read_text()[:400] else '')
        flag = '!!' if n > LIMIT else ('! ' if n > WARN else '  ')
        rows.append((n, p.relative_to(ROOT), what, flag))
        if n > LIMIT:
            bad.append(f'{p.name}: {n} lines (limit {LIMIT}): split it into modules with one job each')
        if not what:
            bad.append(f'{p.name}: no header comment (first lines should say what the module is for)')
    total = sum(r[0] for r in rows)
    for n, path, what, flag in sorted(rows, key=lambda r: -r[0]):
        print(f'{flag}{n:5}  {str(path):28} {what[:90]}')
    print(f'   {total:5}  total in {len(rows)} files (warn > {WARN}, limit {LIMIT} per module)')
    for b in bad:
        print('FAIL', b)
    return 1 if bad else 0

if __name__ == '__main__':
    sys.exit(main())
