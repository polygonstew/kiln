// "Send to…": the same destinations for every image in Kiln, on right-click. Any element showing an <img> or a
// <canvas> in the places below gets them, so a picture can move between tabs without saving and re-opening it.
import { emit, imgData, toast, pref } from './core.js';
import { registerMenu } from './wheel.js';
import { saveFiles } from './files.js';

const slug = s => (s || 'image').toLowerCase().replace(/\.\w+$/, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 24) || 'image';
async function asDataURL(url) {
  if (url.startsWith('data:')) return url;
  const b = await (await fetch(url)).blob();
  return await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
}
export function sendItems(url, name = 'image') {
  const n = slug(name);
  return [
    { head: 'Send to' },
    { label: 'Forge: pixelize it', run: () => emit('forge-image', url) },
    { label: 'Forge: guide image', run: () => emit('forge-guide', url) },
    { label: 'Animate: new frame', run: async () => emit('to-animate', { mode: 'add', img: await imgData(url), pal: [], name: n }) },
    { label: 'New actor + animations', run: () => { const v = prompt('Name for the actor', n); if (v) emit('make-actor', { url, name: slug(v), set: 'hero' }); } },
    { label: 'Scenes: new layer', run: () => emit('scene-layer', url) },
    { label: 'Levels: tileset (16 px)', run: () => emit('level-tileset', { url, tile: 16, name: n }) },
    { label: 'Concept board', run: async () => {
      const s = pref.get('concepts.session', 'ideas'), stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      await saveFiles(`concepts/${s}`, [{ name: `${stamp}-${n}.png`, b64: await asDataURL(url) }]).then(() => toast(`Added to concept board "${s}"`, 'ok')).catch(e => toast(e.message, 'bad'));
    } },
  ];
}
const PLACES = ['.ccard', '#v-forge .results .r', '#v-files .it', '#v-animate .frame:not(.add)', '#v-scenes .ly', '.bcard', '#v-forge .viewport'];
registerMenu(PLACES.join(', '), el => {
  const img = el.querySelector('img'), cv = el.querySelector('canvas');
  if (img && !/\.(png|jpe?g|gif|webp)|cloudimg|data:image/i.test(img.src)) return [];
  if (!img && !cv) return [];
  const url = img ? img.getAttribute('src') : cv.toDataURL('image/png');
  const name = el.dataset.name || img?.title || el.querySelector('.nm, input[type=text]')?.textContent || img?.alt || 'image';
  return sendItems(url, name);
});
