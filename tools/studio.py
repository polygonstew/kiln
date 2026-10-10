#!/usr/bin/python3
"""Kiln Studio: Kiln and the image sites you use for concepts, side by side in one window.

Two panes of tabs (like Zellij panes): Kiln on the left, meta.ai (or any site) on the right.
Concept sessions remember their tabs, layout and notes. Logins persist. Images you save
(right-click > Save image) go to <asset folder>/concepts/<session>/, where Kiln's Forge tray
picks them up. Nothing is automated on the sites: you use them as you would in a browser.

Run: kiln-studio [session]
"""
import json, re, sys, time
from pathlib import Path
from urllib.request import urlopen

from PyQt6.QtCore import Qt, QUrl, QTimer
from PyQt6.QtGui import QAction, QKeySequence, QFont
from PyQt6.QtWidgets import (QApplication, QMainWindow, QSplitter, QTabWidget, QToolBar, QInputDialog,
                             QMenu, QPlainTextEdit, QToolButton, QLabel, QWidget, QSizePolicy, QMessageBox)
from PyQt6.QtWebEngineCore import QWebEngineProfile, QWebEnginePage, QWebEngineDownloadRequest
from PyQt6.QtWebEngineWidgets import QWebEngineView

KILN = 'http://127.0.0.1:8510/'
DATA = Path.home() / '.local/share/kiln-studio'
SITES = [
    ('meta.ai', 'https://www.meta.ai/'),
    ('Gemini', 'https://gemini.google.com/'),
    ('ChatGPT', 'https://chatgpt.com/'),
    ('Bing Image Creator', 'https://www.bing.com/images/create'),
    ('OpenGameArt', 'https://opengameart.org/'),
    ('itch.io free assets', 'https://itch.io/game-assets/free/tag-pixel-art'),
    ('Lospec palettes', 'https://lospec.com/palette-list'),
]
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
STYLE = """
QMainWindow, QWidget { background: #161614; color: #d8d4cc; }
QToolBar { background: #1d1c1a; border: 0; border-bottom: 1px solid #2c2b28; padding: 3px 6px; spacing: 6px; }
QToolButton, QPushButton { background: transparent; color: #b9b4aa; border: 1px solid #34322e; border-radius: 2px; padding: 3px 9px; }
QToolButton:hover { border-color: #ff5b2e; color: #fff; }
QToolButton:checked { background: #3a1d12; border-color: #ff5b2e; color: #ffb59a; }
QTabWidget::pane { border: 0; }
QTabBar::tab { background: #1d1c1a; color: #8f8a80; padding: 5px 12px; border: 0; border-right: 1px solid #2c2b28; }
QTabBar::tab:selected { background: #161614; color: #ff7a4f; border-top: 2px solid #ff5b2e; }
QSplitter::handle { background: #2c2b28; width: 3px; }
QPlainTextEdit { background: #121211; color: #d8d4cc; border: 0; padding: 12px; selection-background-color: #ff5b2e; }
QLabel#sess { color: #ff7a4f; font-weight: 600; padding: 0 4px; }
QMenu { background: #1d1c1a; color: #d8d4cc; border: 1px solid #34322e; } QMenu::item:selected { background: #3a1d12; }
"""


def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'concepts'


def asset_root():
    """Kiln's asset folder (where its Files tab points), so saved images land beside the game's assets."""
    try:
        return Path(json.loads(urlopen(KILN + 'api/settings', timeout=2).read())['root'])
    except Exception:
        try:
            return Path(json.loads((Path(__file__).resolve().parent.parent / 'library/settings.json').read_text())['root'])
        except Exception:
            return Path.home() / 'Downloads'


class Page(QWebEnginePage):
    """Links that open new windows (target=_blank) open as a tab in the same pane instead."""
    def __init__(self, profile, win, pane):
        super().__init__(profile, win)
        self.win, self.pane = win, pane

    def createWindow(self, _type):
        view = self.win.add_web(self.pane, 'about:blank', 'New tab')
        return view.page()


class Studio(QMainWindow):
    def __init__(self, session):
        super().__init__()
        DATA.mkdir(parents=True, exist_ok=True)
        self.profile = QWebEngineProfile('kiln-studio', self)       # named = persistent (cookies, logins)
        self.profile.setPersistentStoragePath(str(DATA / 'profile'))
        self.profile.setCachePath(str(DATA / 'cache'))
        self.profile.setPersistentCookiesPolicy(QWebEngineProfile.PersistentCookiesPolicy.ForcePersistentCookies)
        self.profile.setHttpUserAgent(UA)
        self.profile.downloadRequested.connect(self.on_download)
        self.notes = None
        self.split = QSplitter(Qt.Orientation.Horizontal)
        self.panes = [self.make_pane(), self.make_pane()]
        for p in self.panes:
            self.split.addWidget(p)
        self.setCentralWidget(self.split)
        self.build_toolbar()
        self.setStyleSheet(STYLE)
        self.resize(1700, 1000)
        self.open_session(session)
        self.saver = QTimer(self, interval=20000, timeout=self.save_session)   # notes and tabs survive a crash
        self.saver.start()

    # ------------------------------------------------------------ layout ----
    def make_pane(self):
        t = QTabWidget()
        t.setTabsClosable(True)
        t.setMovable(True)
        t.setDocumentMode(True)
        t.tabCloseRequested.connect(lambda i, t=t: self.close_tab(t, i))
        return t

    def build_toolbar(self):
        tb = QToolBar(movable=False)
        self.addToolBar(tb)
        self.sess_lbl = QLabel(objectName='sess')
        sess = QToolButton(text='Session ▾', popupMode=QToolButton.ToolButtonPopupMode.InstantPopup)
        self.sess_menu = QMenu(self)
        self.sess_menu.aboutToShow.connect(self.fill_sessions)
        sess.setMenu(self.sess_menu)
        add = QToolButton(text='+ Tab ▾', popupMode=QToolButton.ToolButtonPopupMode.InstantPopup)
        m = QMenu(self)
        for name, url in [('Kiln', KILN)] + SITES:
            m.addAction(name, lambda u=url, n=name: self.add_web(self.target_pane(), u, n, focus=True))
        m.addSeparator()
        m.addAction('Notes', lambda: self.add_notes(self.target_pane(), focus=True))
        m.addAction('Other address…', self.add_custom)
        add.setMenu(m)
        self.split_btn = QToolButton(text='Split', checkable=True, checked=True, toolTip='Two panes side by side (Ctrl+\\)')
        self.split_btn.toggled.connect(self.set_split)
        nav = [('◀', 'Back', lambda: self.cur_view() and self.cur_view().back(), 'Alt+Left'),
               ('↻', 'Reload', lambda: self.cur_view() and self.cur_view().reload(), 'F5')]
        for w in (self.sess_lbl, sess, add, self.split_btn):
            tb.addWidget(w)
        for txt, tip, fn, key in nav:
            a = QAction(txt, self, toolTip=f'{tip} ({key})', shortcut=QKeySequence(key), triggered=fn)
            tb.addAction(a)
        spacer = QWidget(); spacer.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        tb.addWidget(spacer)
        self.status = QLabel('', styleSheet='color:#8f8a80; padding-right:6px')
        tb.addWidget(self.status)
        self.addAction(QAction(self, shortcut=QKeySequence('Ctrl+\\'), triggered=self.split_btn.toggle))
        self.addAction(QAction(self, shortcut=QKeySequence('Ctrl+W'), triggered=lambda: self.close_tab(self.target_pane(), self.target_pane().currentIndex())))

    def set_split(self, on):
        right = self.panes[1]
        if not on:      # one pane: move the right pane's tabs over so nothing disappears
            while right.count():
                w, label = right.widget(0), right.tabText(0)
                right.removeTab(0)
                self.panes[0].addTab(w, label)
        right.setVisible(on)
        if on and not right.count():
            self.add_web(right, SITES[0][1], SITES[0][0])

    def target_pane(self):
        """The pane that has focus, else the right one when split (sites live there), else the only one."""
        fw = QApplication.focusWidget()
        for p in self.panes:
            if p.isVisible() and fw and p.isAncestorOf(fw):
                return p
        return self.panes[1] if self.panes[1].isVisible() else self.panes[0]

    def cur_view(self):
        w = self.target_pane().currentWidget()
        return w if isinstance(w, QWebEngineView) else None

    # -------------------------------------------------------------- tabs ----
    def add_web(self, pane, url, label=None, focus=False):
        v = QWebEngineView()
        v.setPage(Page(self.profile, self, pane))
        v.setUrl(QUrl(url))
        i = pane.addTab(v, label or url)
        v.titleChanged.connect(lambda t, v=v, pane=pane: self.retitle(pane, v, t))
        if focus:
            pane.setCurrentIndex(i)
        return v

    def retitle(self, pane, v, title):
        i = pane.indexOf(v)
        if i >= 0:
            host = v.url().host().replace('www.', '')
            pane.setTabText(i, 'Kiln' if v.url().port() == 8510 else (title[:22] or host))

    def add_notes(self, pane, text=None, focus=False):
        if self.notes is None:
            self.notes = QPlainTextEdit(placeholderText='Concept notes for this session: ideas, prompts that worked, what to try next…')
            self.notes.setFont(QFont('IBM Plex Mono', 11))
        if text is not None:
            self.notes.setPlainText(text)
        if self.notes.parent() is None or pane.indexOf(self.notes) < 0:
            pane.addTab(self.notes, 'Notes')
        if focus:
            pane.setCurrentWidget(self.notes)

    def add_custom(self):
        url, ok = QInputDialog.getText(self, 'Open address', 'Web address:')
        if ok and url.strip():
            u = url.strip()
            self.add_web(self.target_pane(), u if '://' in u else 'https://' + u, focus=True)

    def close_tab(self, pane, i):
        if i < 0:
            return
        w = pane.widget(i)
        pane.removeTab(i)
        if w is self.notes:
            self.notes.setParent(None)      # keep the text; Notes can be reopened from + Tab
        elif w is not None:
            w.deleteLater()

    # ---------------------------------------------------------- sessions ----
    def sess_file(self, name):
        return DATA / 'sessions' / f'{slug(name)}.json'

    def concept_dir(self):
        d = asset_root() / 'concepts' / slug(self.session)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def fill_sessions(self):
        m = self.sess_menu
        m.clear()
        m.addAction('New session…', self.new_session)
        m.addAction('Rename…', self.rename_session)
        m.addAction('Open concepts folder', lambda: __import__('subprocess').Popen(['xdg-open', str(self.concept_dir())]))
        m.addSeparator()
        files = sorted((DATA / 'sessions').glob('*.json'), key=lambda f: -f.stat().st_mtime) if (DATA / 'sessions').exists() else []
        for f in files[:20]:
            try:
                name = json.loads(f.read_text()).get('name', f.stem)
            except Exception:
                name = f.stem
            a = m.addAction(('● ' if slug(name) == slug(self.session) else '   ') + name, lambda n=name: self.switch(n))

    def snapshot(self):
        panes = []
        for p in self.panes:
            tabs = []
            for i in range(p.count()):
                w = p.widget(i)
                if w is self.notes:
                    tabs.append({'notes': True})
                elif isinstance(w, QWebEngineView):
                    tabs.append({'url': w.url().toString(), 'label': p.tabText(i)})
            panes.append({'tabs': tabs, 'current': p.currentIndex()})
        return {'name': self.session, 'saved': time.time(), 'split': self.split_btn.isChecked(),
                'sizes': self.split.sizes(), 'panes': panes,
                'notes': self.notes.toPlainText() if self.notes else ''}

    def save_session(self):
        f = self.sess_file(self.session)
        f.parent.mkdir(parents=True, exist_ok=True)
        snap = self.snapshot()
        f.write_text(json.dumps(snap, indent=1))
        if snap['notes'].strip():      # notes also live with the concept images, readable outside the app
            (self.concept_dir() / 'notes.md').write_text(f'# {self.session}\n\n{snap["notes"]}\n')
        (DATA / 'last').write_text(self.session)

    def open_session(self, name):
        self.session = name
        self.sess_lbl.setText(name)
        self.setWindowTitle(f'Kiln Studio · {name}')
        for p in self.panes:
            while p.count():
                self.close_tab(p, 0)
        f = self.sess_file(name)
        s = json.loads(f.read_text()) if f.exists() else None
        if not s:      # a fresh session: Kiln left, meta.ai right, notes ready
            self.add_web(self.panes[0], KILN, 'Kiln')
            self.add_web(self.panes[1], SITES[0][1], SITES[0][0])
            self.add_notes(self.panes[1])
            self.panes[1].setCurrentIndex(0)
            self.split_btn.setChecked(True)
            self.split.setSizes([900, 800])
            return
        for p, ps in zip(self.panes, s['panes']):
            for t in ps['tabs']:
                if t.get('notes'):
                    self.add_notes(p, s.get('notes', ''))
                else:
                    self.add_web(p, t['url'], t.get('label'))
            if ps['tabs']:
                p.setCurrentIndex(max(0, min(ps.get('current', 0), p.count() - 1)))
        if self.notes is not None and not any(t.get('notes') for ps in s['panes'] for t in ps['tabs']):
            self.notes.setPlainText(s.get('notes', ''))
        self.split_btn.setChecked(s.get('split', True))
        self.panes[1].setVisible(s.get('split', True))
        if s.get('sizes'):
            self.split.setSizes(s['sizes'])

    def switch(self, name):
        self.save_session()
        self.notes = None
        self.open_session(name)

    def new_session(self):
        name, ok = QInputDialog.getText(self, 'New concept session', 'Name (e.g. "sewer level", "boss: the bell ringer"):')
        if ok and name.strip():
            self.switch(name.strip())

    def rename_session(self):
        name, ok = QInputDialog.getText(self, 'Rename session', 'Name:', text=self.session)
        if ok and name.strip() and name.strip() != self.session:
            old = self.sess_file(self.session)
            self.session = name.strip()
            self.sess_lbl.setText(self.session)
            self.setWindowTitle(f'Kiln Studio · {self.session}')
            self.save_session()
            if old.exists() and old != self.sess_file(self.session):
                old.unlink()

    # --------------------------------------------------------- downloads ----
    def on_download(self, d: QWebEngineDownloadRequest):
        # every saved image goes to this session's concepts folder (Kiln's Forge tray shows it as "new")
        d.setDownloadDirectory(str(self.concept_dir()))
        d.accept()
        self.status.setText(f'saving {d.downloadFileName()} …')
        d.isFinishedChanged.connect(lambda d=d: self.status.setText(
            f'saved {d.downloadFileName()} → concepts/{slug(self.session)}/' if d.state() == QWebEngineDownloadRequest.DownloadState.DownloadCompleted
            else f'download failed: {d.downloadFileName()}'))

    def closeEvent(self, e):
        self.save_session()
        super().closeEvent(e)


def main():
    app = QApplication(sys.argv[:1] + ['--disable-gpu-compositing'] if '--safe' in sys.argv else sys.argv[:1])
    app.setApplicationName('Kiln Studio')
    app.setDesktopFileName('kiln-studio')
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    last = DATA / 'last'
    session = args[0] if args else (last.read_text().strip() if last.exists() else 'concepts')
    w = Studio(session)
    w.show()
    shot = __import__('os').environ.get('KILN_STUDIO_SHOT')      # self-test: screenshot after load, then quit
    if shot:
        QTimer.singleShot(12000, lambda: (w.grab().save(shot), w.close(), app.quit()))
    sys.exit(app.exec())


if __name__ == '__main__':
    main()
