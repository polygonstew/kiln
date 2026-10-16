#!/usr/bin/env python3
"""Kiln smoke test: open every area in headless Chromium and report script errors and failed requests.

Read-only: it switches areas and opens the menus, the wheel, Ctrl+K and the help page, but never edits or saves.
Setup once:  python3 -m venv .venv-test && .venv-test/bin/pip install playwright
Run:         .venv-test/bin/python tools/smoke.py [http://127.0.0.1:8510]
Exit code 0 = clean, 1 = problems (listed).
"""
import sys
from playwright.sync_api import sync_playwright

URL = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8510').rstrip('/')
AREAS = ['gamedoc', 'files', 'forge', 'animate', 'scenes', 'levels', 'hud', 'stage', 'concepts', 'logic', 'dialogue', 'menus', 'rooms', 'flow']
problems = []

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/chromium')
    pg = b.new_page(viewport={'width': 1440, 'height': 900})
    pg.on('pageerror', lambda e: problems.append(f'script error: {e}'))
    pg.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and problems.append(f'console: {m.text[:200]}'))
    pg.on('response', lambda r: r.status >= 500 and problems.append(f'HTTP {r.status}: {r.url[:160]}'))
    pg.on('dialog', lambda d: d.dismiss())
    pg.goto(URL + '/'); pg.wait_for_timeout(2500)
    # the tab bar shows the game path's own tabs (the rest sit under More), so every area is opened by name
    tabs = pg.evaluate("[...document.querySelectorAll('#tabs button[data-id]')].map(b => b.dataset.id)")
    if not tabs: problems.append('the tab bar is empty (topbar.js failed?)')
    for a in AREAS:
        pg.evaluate(f"import('/js/core.js').then(c => c.emit('tab', '{a}'))"); pg.wait_for_timeout(2200)
        if not pg.locator(f'#v-{a}').count(): problems.append(f'{a}: view did not mount')
        w = pg.evaluate(f"document.querySelector('#v-{a} > section.stage')?.getBoundingClientRect().width ?? 999")
        if w < 200: problems.append(f'{a}: the middle column is {w:.0f}px wide (dock layout broken: does the view have class ws?)')
        print(f'  {a:9s} ok')
    pg.locator('#logo').click(); pg.wait_for_timeout(200)
    if pg.locator('.mb-panel').count() < 2: problems.append('logo menu: File menu did not open')
    pg.keyboard.press('Escape')
    pg.keyboard.press('Shift+A'); pg.wait_for_timeout(300)
    if not pg.locator('.dx-wheel').count(): problems.append('command wheel did not open')
    pg.keyboard.press('Escape')
    pg.keyboard.press('Control+k'); pg.wait_for_timeout(600)
    if not pg.locator('.qk-box').count(): problems.append('Ctrl+K did not open')
    pg.keyboard.press('Escape')
    pg.goto(URL + '/help'); pg.wait_for_timeout(1200)
    if pg.locator('section').count() < 8: problems.append('help page: sections missing')
    pg.goto(URL + '/desk'); pg.wait_for_timeout(1200)
    if not pg.locator('.ic').count(): problems.append('desk: no app icons')
    b.close()

import subprocess, os
if subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'map.py')], capture_output=True).returncode:
    problems.append('code map: a module is over the size limit or has no header (run python3 tools/map.py)')
print('\n'.join(['', 'PROBLEMS:'] + ['  - ' + x for x in problems]) if problems else '\nall clean')
sys.exit(1 if problems else 0)
