"""Sound tools for the game's sounds and music (the asset shelf → a sound → Sound tools), done with ffmpeg, no window:
trim the silence at both ends, fade in and out, even out the loudness (EBU R128 loudnorm), and save as .ogg (music,
smaller) or .wav (short effects). Audacity has no headless mode, so it (and Cutroom, the user's own editor) are offered for hand edits."""
import os, shutil, subprocess
from pathlib import Path


def process(src, dest, trim=False, fade_in=0.0, fade_out=0.0, normalize=False):
    """src → dest (the format from dest's extension). Returns dest's path."""
    ff = shutil.which('ffmpeg')
    if not ff:
        raise RuntimeError('ffmpeg is not installed on this machine')
    src, dest = Path(src), Path(dest)
    if not src.is_file():
        raise ValueError(f'no such sound: {src}')
    f = []
    if trim:            # silence off the start, then (reversed) off the end
        f += ['silenceremove=start_periods=1:start_threshold=-50dB', 'areverse', 'silenceremove=start_periods=1:start_threshold=-50dB', 'areverse']
    if normalize:
        f.append('loudnorm=I=-16:TP=-1.5:LRA=11')
    if fade_in:
        f.append(f'afade=t=in:d={float(fade_in):.2f}')
    if fade_out:        # fade the end: reverse, fade in, reverse back (no need to know the length)
        f += ['areverse', f'afade=t=in:d={float(fade_out):.2f}', 'areverse']
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name('.tmp_' + dest.name)
    codec = ['-c:a', 'libvorbis', '-q:a', '5'] if dest.suffix == '.ogg' else ['-c:a', 'pcm_s16le']
    r = subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(src), *(['-af', ','.join(f)] if f else []), *codec, str(tmp)], capture_output=True, text=True, timeout=300)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-300:])
    tmp.replace(dest)
    return str(dest)


def open_in(path, app='audacity'):
    """Open a sound for hand edits on this machine's desktop: Audacity (with the file) or Cutroom (the user's own
    editor: it opens its window; drag the sound onto an audio layer)."""
    exe = shutil.which(app) or (str(Path.home() / '.local/bin/cutroom') if app == 'cutroom' else None)
    if not exe or not Path(exe).exists():
        raise RuntimeError(f'{app} is not installed')
    env = {**os.environ}
    env.setdefault('DISPLAY', ':0')
    env.setdefault('WAYLAND_DISPLAY', 'wayland-0')
    subprocess.Popen([exe] + ([str(path)] if app == 'audacity' else []), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
