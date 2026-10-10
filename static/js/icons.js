// Small line icons, drawn on a 16px grid.
const P = {
  play: '<path d="M4 2.5v11l9-5.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" stroke="none"/>',
  prev: '<path d="M11 3 5 8l6 5M4 3v10"/>',
  next: '<path d="m5 3 6 5-6 5M12 3v10"/>',
  pingpong: '<path d="M2 6h10l-2.5-2.5M14 10H4l2.5 2.5"/>',
  onion: '<circle cx="6" cy="8" r="4"/><circle cx="10" cy="8" r="4" stroke-dasharray="1.5 1.5"/>',
  flip: '<path d="M8 1.5v13M6 4 2 12h4zM10 4l4 8h-4z"/>',
  grid: '<path d="M1.5 5.5h13M1.5 10.5h13M5.5 1.5v13M10.5 1.5v13"/>',
  pencil: '<path d="m3 13 1-4 7-7 3 3-7 7zM9.5 3.5l3 3"/>',
  eraser: '<path d="m6 13.5-4-4 7-7 5 5-5.5 5.5zM5 13.5h9M4 7.5l5 5"/>',
  fill: '<path d="m7 2 6 6-5 5-6-6zM2 7h11M14 11s1.5 2 0 3-1.5-3 0-3z"/>',
  pick: '<path d="m10 2 4 4-2 2-4-4zM9 5l-6 6-1 3 3-1 6-6"/>',
  select: '<path d="M2 2h3M7 2h2M11 2h3v3M14 7v2M14 11v3h-3M9 14H7M5 14H2v-3M2 9V7M2 5V2" />',
  move: '<path d="M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2"/>',
  line: '<path d="m2.5 13.5 11-11"/>',
  rect: '<path d="M2.5 3.5h11v9h-11z"/>',
  mirror: '<path d="M8 1v14" stroke-dasharray="2 1.5"/><path d="M6 4 2 8l4 4M10 4l4 4-4 4"/>',
  undo: '<path d="M5 3 2 6l3 3M2 6h8a4 4 0 0 1 0 8H7"/>',
  redo: '<path d="m11 3 3 3-3 3M14 6H6a4 4 0 0 0 0 8h3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  dup: '<path d="M5 5h8v8H5z"/><path d="M3 11V3h8"/>',
  trash: '<path d="M3 4h10M6 4V2.5h4V4M4.5 4l.8 9.5h5.4l.8-9.5"/>',
  folder: '<path d="M1.5 3.5h5l1.5 1.5h6.5v8h-13z"/>',
  file: '<path d="M3.5 1.5h6l3 3v10h-9z M9.5 1.5v3h3"/>',
  eye: '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>',
  eyeoff: '<path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5zM2 14 14 2"/>',
  up: '<path d="m4 10 4-4 4 4"/>', down: '<path d="m4 6 4 4 4-4"/>',
  star: '<path d="m8 1.8 1.9 4 4.3.5-3.2 3 .9 4.3L8 11.5l-3.9 2.1.9-4.3-3.2-3 4.3-.5z"/>',
  dice: '<path d="M2.5 2.5h11v11h-11z"/><circle cx="5.5" cy="5.5" r=".8" fill="currentColor"/><circle cx="10.5" cy="10.5" r=".8" fill="currentColor"/><circle cx="8" cy="8" r=".8" fill="currentColor"/>',
  wand: '<path d="m2 14 8-8M11 2v3M9.5 3.5h3M13.5 6v2M12.5 7h2"/>',
  export: '<path d="M8 10V2M5 5l3-3 3 3M2.5 9v4.5h11V9"/>',
};
export function icon(name, cls = '') {
  const s = document.createElement('span');
  s.className = 'ico ' + cls;
  s.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;
  s.style.display = 'inline-grid';
  return s;
}
