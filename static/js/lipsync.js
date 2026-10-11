// Lip sync: a voice line → mouth shapes over time, worked out here in the browser (no service, nothing to install).
// The sound is cut into short slices (60 a second). How loud a slice is says how open the mouth is; where its energy
// sits (a low hum, the middle, hiss up high) says which shape: round O / OO for dark sounds, teeth for S T and F V,
// wide for loud open vowels, closed M B P for short dips between sounds. Shapes are face.js SHAPES (X A B … H).
// Result: cues [[seconds, shape], …] at each change, the same shape of data as Rhubarb Lip Sync gives.

const HOP = 1 / 60, N = 1024;

// any audio file the browser can play → one channel of samples
export async function decode(arrayBuffer) {
  const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(arrayBuffer);
  const data = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) { const ch = buf.getChannelData(c); for (let i = 0; i < ch.length; i++) data[i] += ch[i] / buf.numberOfChannels; }
  return { data, rate: buf.sampleRate, duration: buf.duration };
}

// in-place radix-2 FFT (re, im: length N, a power of two)
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
        re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

// each slice: loudness and how its energy splits between low (80–500 Hz), middle (500–2000) and high (2000–8000)
function slices({ data, rate }) {
  const out = [], hop = Math.round(rate * HOP), win = new Float64Array(N).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / (N - 1)));
  const bin = hz => Math.min(N / 2, Math.round(hz / rate * N));
  const [l0, l1, m1, h1] = [bin(80), bin(500), bin(2000), bin(8000)];
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s < data.length; s += hop) {
    let sum = 0;
    for (let i = 0; i < N; i++) { const v = data[s - N / 2 + i] || 0; sum += v * v; re[i] = v * win[i]; im[i] = 0; }
    fft(re, im);
    let lo = 0, mid = 0, hi = 0, c = 0;
    for (let k = l0; k < h1; k++) { const e = re[k] * re[k] + im[k] * im[k]; if (k < l1) lo += e; else if (k < m1) mid += e; else hi += e; c += e * k; }
    const tot = lo + mid + hi || 1;
    out.push({ rms: Math.sqrt(sum / N), lo: lo / tot, mid: mid / tot, hi: hi / tot, hz: c / tot * rate / N });
  }
  return out;
}

// the shape for one slice, from its level (0 = silent … 1 = the clip's loud parts), its energy's centre (hz) and
// how much of it is hiss (hi). Measured on speech: S/SH ≈ 5000+ Hz, a hummed M ≈ 350 Hz and quiet, OO/O 300–650 Hz,
// open vowels ≈ 1000 Hz, EE higher with some hiss.
function shapeOf(s, level) {
  if (level < .1) return 'X';
  if (s.hi > .6 || s.hz > 3500) return level < .5 ? 'B' : 'C';   // S T SH CH: teeth
  if (s.hz < 450 && level < .35) return 'A';                       // M (a hum): lips closed
  if (s.hz < 650) return level > .6 ? 'E' : 'F';                   // O, OO, W: round
  if (s.hi > .35 && level < .3) return 'G';                        // F V: soft hiss
  if (s.hz > 1250 && s.hi > .25) return 'B';                       // EE: lips spread, nearly closed
  return level > .7 ? 'D' : level > .4 ? 'C' : 'B';                // open vowels by how loud
}

export function analyse(sound) {
  const S = slices(sound), sorted = S.map(s => s.rms).sort((a, b) => a - b), loud = sorted[Math.floor(sorted.length * .95)] || 1;
  const level = S.map(s => Math.min(1.2, s.rms / loud));
  let shapes = S.map((s, i) => shapeOf(s, level[i]));
  // a short dip between sounds is lips closing (M, B, P), not a rest
  for (let i = 0; i < shapes.length;) {
    if (shapes[i] !== 'X') { i++; continue; }
    let j = i; while (j < shapes.length && shapes[j] === 'X') j++;
    if (i > 0 && j < shapes.length && j - i <= 5) for (let k = i; k < j; k++) shapes[k] = 'A';
    i = j;
  }
  // steadier: the most common shape of each 3 slices, then no shape shorter than 3 slices (50 ms)
  shapes = shapes.map((_, i) => { const w = [shapes[i - 1], shapes[i], shapes[i + 1]].filter(Boolean); return w.find(x => w.filter(y => y === x).length > 1) || shapes[i]; });
  const runs = [];
  for (const sh of shapes) { const r = runs[runs.length - 1]; if (r && r.s === sh) r.n++; else runs.push({ s: sh, n: 1 }); }
  for (let i = 1; i < runs.length; i++) if (runs[i].n < 3) { runs[i - 1].n += runs[i].n; runs.splice(i, 1); i--; }
  const cues = []; let t = 0;
  for (const r of runs) { if (!cues.length || cues[cues.length - 1][1] !== r.s) cues.push([+t.toFixed(3), r.s]); t += r.n * HOP; }
  if (cues.length && cues[cues.length - 1][1] !== 'X') cues.push([+Math.min(t, sound.duration).toFixed(3), 'X']);
  return { cues, level, step: HOP };
}
// the shape at a moment
export function shapeAt(cues, t) { let s = 'X'; for (const [ct, sh] of cues) { if (ct > t) break; s = sh; } return s; }
