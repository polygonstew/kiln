"""Kiln's settings file (library/settings.json): the asset folder (root), bookmarks, the cloud budget spent and the free
images used today. Read fresh on every call (small file), written whole."""
import json
from pathlib import Path

LIB = Path(__file__).resolve().parent / 'library'
SETTINGS = LIB / 'settings.json'


def settings():
    try:
        s = json.loads(SETTINGS.read_text())
    except Exception:
        s = {}
    s.setdefault('root', str(LIB / 'games' / 'untitled'))
    s.setdefault('bookmarks', [])
    return s


def save_settings(s):
    SETTINGS.write_text(json.dumps(s, indent=1))
