"""Small previews of big pictures, so grids and trays do not decode a 4000 px original for a 200 px card.

GET /api/thumb?path=<file>&w=<width>: the longest side is cut to w (default 256, 64-1024) and the result is a WebP kept in
~/.cache/kiln/thumbs (never in the user's game folder). The cache key has the file's path, size and mtime, so an edited picture
gets a fresh one. The original is never touched. A picture already small enough is sent as it is.
A video gets the same card from one of its frames (ffmpeg), so a game's clips show what they are."""
import hashlib, io, shutil, subprocess
from pathlib import Path

CACHE = Path.home() / '.cache' / 'kiln' / 'thumbs'
VIDEO = {'.ogv', '.mp4', '.webm', '.mov', '.mkv'}


def _frame(p, w):
    """A video's frame half a second in (the first one if it is shorter), as PNG bytes."""
    ff = shutil.which('ffmpeg')
    if not ff:
        raise RuntimeError('ffmpeg is not installed')
    for at in ('0.5', '0'):
        r = subprocess.run([ff, '-loglevel', 'error', '-ss', at, '-i', str(p), '-frames:v', '1', '-vf', f"scale='min({w},iw)':-2",
                            '-f', 'image2pipe', '-c:v', 'png', '-'], capture_output=True, timeout=30)
        if r.returncode == 0 and r.stdout:
            return r.stdout
    raise RuntimeError('no frame')


def thumb(p, w=256):
    """→ (bytes, content type) for the image file p (a Path)."""
    w = max(64, min(1024, int(w or 256)))
    st = p.stat()
    key = hashlib.sha1(f'{p}|{st.st_size}|{st.st_mtime_ns}|{w}'.encode()).hexdigest()
    cached = CACHE / (key + '.webp')
    if cached.is_file():
        return cached.read_bytes(), 'image/webp'
    from PIL import Image                       # system python has it; a missing PIL falls back to the original
    with Image.open(io.BytesIO(_frame(p, w)) if p.suffix.lower() in VIDEO else p) as im:
        im.draft('RGB', (w * 2, w * 2))         # JPEG: decode at a reduced size straight away
        if max(im.size) <= w and p.suffix.lower() not in VIDEO:
            return p.read_bytes(), {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif'}.get(p.suffix.lower(), 'image/png')
        im = im.convert('RGBA')
        im.thumbnail((w, w), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, 'WEBP', quality=85, method=4)
    CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(buf.getvalue())
    return buf.getvalue(), 'image/webp'
