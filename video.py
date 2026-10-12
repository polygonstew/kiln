"""Videos for the game (Flow → video scenes, choices, quick-time moments): any video file becomes videos/<name>.ogv
(Ogg Theora + Vorbis, the format Godot plays by itself), at most 960 px wide, with the original kept beside it in
videos/.src/ for the page's preview (browsers do not play Theora). One conversion at a time, in a thread; the page
asks /api/video/status until it is done. card() makes a title card (words on a colour) at once."""
import shutil, subprocess, threading, time
from pathlib import Path

STATE = {'running': False, 'log': [], 'ok': None, 'file': ''}


def convert(src, name, root):
    """Start converting src (a path) to <root>/videos/<name>.ogv. Returns at once; STATE says how it goes."""
    if STATE['running']:
        raise RuntimeError('a video is already being converted')
    ff = shutil.which('ffmpeg')
    if not ff:
        raise RuntimeError('ffmpeg is not installed on this machine')
    src, out = Path(src), Path(root) / 'videos'
    if not src.is_file():
        raise ValueError(f'no such video: {src}')
    (out / '.src').mkdir(parents=True, exist_ok=True)
    STATE.update(running=True, log=[f'{time.strftime("%H:%M:%S")} converting {src.name}…'], ok=None, file=f'videos/{name}.ogv')

    def run():
        try:
            keep = out / '.src' / f'{name}{src.suffix.lower()}'
            if src.resolve() != keep.resolve():
                shutil.copyfile(src, keep)
            r = subprocess.run([ff, '-y', '-loglevel', 'error', '-i', str(keep), '-vf', "scale='min(960,iw)':-2", '-c:v', 'libtheora', '-q:v', '7',
                                '-c:a', 'libvorbis', '-q:a', '4', str(out / f'{name}.ogv')], capture_output=True, text=True, timeout=1800)
            STATE['ok'] = r.returncode == 0
            STATE['log'].append(r.stderr.strip()[-600:] or f'{time.strftime("%H:%M:%S")} videos/{name}.ogv is ready')
        except Exception as ex:
            STATE['ok'] = False
            STATE['log'].append(str(ex))
        STATE['running'] = False
    threading.Thread(target=run, daemon=True).start()


def card(text, seconds, name, root, colour='10223a', image=None):
    """A title card: words in the middle of a plain colour for `seconds`, fading in and out, as videos/<name>.ogv.
    With an image (bytes): the picture slowly zooming in (a Ken Burns move) with the words as a caption. Stand-ins
    for scenes not filmed yet, chapter titles, credits. Quick, so it runs straight away."""
    ff = shutil.which('ffmpeg')
    if not ff:
        raise RuntimeError('ffmpeg is not installed on this machine')
    out = Path(root) / 'videos'
    out.mkdir(parents=True, exist_ok=True)
    words = str(text).replace('\\', '').replace("'", '’').replace(':', '\\:')[:120]
    s = max(1.0, min(30.0, float(seconds)))
    fade = f"fade=in:0:12,fade=out:st={s - 0.5:.2f}:d=0.5"
    if image:
        pic = out / '.src' / f'{name}_still'
        pic.parent.mkdir(parents=True, exist_ok=True)
        pic.write_bytes(image)
        frames = int(s * 25)
        vf = (f"scale=1920:-2,zoompan=z='min(zoom+0.0007,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1280x720:fps=25,"
              f"drawtext=text='{words}':fontcolor=white:fontsize=38:x=(w-text_w)/2:y=h-80:box=1:boxcolor=black@0.45:boxborderw=14,{fade}")
        src = ['-i', str(pic)]                      # one picture: zoompan makes every frame from it
    else:
        vf = f"drawtext=text='{words}':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2,{fade}"
        src = ['-f', 'lavfi', '-i', f'color=c=0x{colour}:s=960x540:d={s}']
    r = subprocess.run([ff, '-y', '-loglevel', 'error', *src, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                        '-vf', vf, '-t', str(s), '-shortest', '-c:v', 'libtheora', '-q:v', '7', '-c:a', 'libvorbis', str(out / f'{name}.ogv')], capture_output=True, text=True, timeout=180)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-300:])
    return f'videos/{name}.ogv'
