// Fonts for the Menus: Godot's own (plain), a dozen bundled open fonts (static/fonts, SIL OFL), or any .ttf / .otf in
// the game's fonts/ folder. useFont(file) loads one into the page for the preview; fontFile(file) gives the bytes to
// copy into the game's fonts/ when the menus are saved.
import { S as FS } from './files.js';
import { rawURL } from './core.js';

export const BUNDLED = [
  ['PressStart2P-Regular.ttf', 'Press Start 2P (arcade pixels)'], ['Silkscreen-Regular.ttf', 'Silkscreen (tiny pixels)'], ['VT323-Regular.ttf', 'VT323 (old terminal)'],
  ['Jacquard24-Regular.ttf', 'Jacquard 24 (pixel blackletter)'], ['IBMPlexMono-Regular.ttf', 'IBM Plex Mono (clean typewriter)'], ['Bangers-Regular.ttf', 'Bangers (comic)'],
  ['MedievalSharp.ttf', 'MedievalSharp (fantasy)'], ['UncialAntiqua-Regular.ttf', 'Uncial Antiqua (old runes)'], ['PirataOne-Regular.ttf', 'Pirata One (blackletter)'],
  ['Almendra-Regular.ttf', 'Almendra (storybook)'], ['Creepster-Regular.ttf', 'Creepster (horror)'], ['MetalMania-Regular.ttf', 'Metal Mania (heavy metal)'],
];
const loaded = new Set();

// fonts the user put in the game's fonts/ folder
export async function gameFonts() {
  const r = await fetch('/api/fs?path=' + encodeURIComponent(FS.root + '/fonts')).then(r => r.json()).catch(() => ({ items: [] }));
  return (r.items || []).filter(i => /\.(ttf|otf)$/i.test(i.name) && !BUNDLED.some(b => b[0] === i.name)).map(i => [i.name, i.name.replace(/\.\w+$/, '') + ' (yours)']);
}
const urlOf = file => BUNDLED.some(b => b[0] === file) ? '/fonts/' + file : rawURL(`${FS.root}/fonts/${file}`);
export const cssFamily = file => file ? `"kiln-${file.replace(/\W/g, '_')}", var(--sans)` : 'var(--sans)';

export async function useFont(file) {
  if (!file || loaded.has(file)) return;
  try { const f = new FontFace('kiln-' + file.replace(/\W/g, '_'), `url(${urlOf(file)})`); document.fonts.add(await f.load()); loaded.add(file); } catch { /* the preview falls back to the plain font */ }
}

// the font's bytes as a data URL, or null when it already lives in the game's fonts/ folder
export async function fontFile(file) {
  if (!BUNDLED.some(b => b[0] === file)) return null;
  const blob = await fetch('/fonts/' + file).then(r => r.blob());
  return new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
}
