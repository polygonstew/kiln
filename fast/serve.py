#!/usr/bin/env python3
"""Kiln "Fast" engine: the pixel model (AllInOnePixel + LCM, OpenVINO UNet) kept loaded between jobs.

127.0.0.1:8511. POST /gen {prompt, neg, w, h, steps, seed, batch, init?, denoise?} -> {images:[b64 png], seed}
GET /progress -> {busy, step, steps}; GET /health. Loads on first use, unloads after IDLE seconds so the
RAM goes back to ComfyUI and the rest of the machine (11 GB total).
"""
import base64, io, json, random, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path

import numpy as np
import openvino as ov
import torch
from diffusers import StableDiffusionPipeline, StableDiffusionImg2ImgPipeline, LCMScheduler
from diffusers.models.unets.unet_2d_condition import UNet2DConditionOutput
from PIL import Image

D = Path(__file__).resolve().parent / 'models'
PORT, IDLE = 8511, 15 * 60
torch.set_num_threads(4)
S = {'pipe': None, 'i2i': None, 'last': 0, 'busy': False, 'step': 0, 'steps': 0}
LOCK = threading.Lock()


class OVUNet(torch.nn.Module):
    """Stands in for the torch UNet; runs the compiled OpenVINO model (same output, a bit faster, less RAM)."""
    def __init__(self, base, compiled):
        super().__init__()
        self.config, self.cu = base.config, compiled

    @property
    def dtype(self): return torch.float32

    @property
    def device(self): return torch.device('cpu')

    def forward(self, sample, timestep, encoder_hidden_states, return_dict=True, **kw):
        t = timestep.numpy() if torch.is_tensor(timestep) else np.array(timestep)
        out = torch.from_numpy(self.cu({'sample': sample.numpy(), 'timestep': t, 'encoder_hidden_states': encoder_hidden_states.numpy()})[0])
        return UNet2DConditionOutput(sample=out) if return_dict else (out,)


def load():
    if S['pipe']:
        return
    t = time.time()
    pipe = StableDiffusionPipeline.from_pretrained(D / 'aiop-lcm', torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
    pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
    core = ov.Core(); core.set_property('CPU', {'CACHE_DIR': str(D / 'ov-cache')})
    pipe.unet = OVUNet(pipe.unet, core.compile_model(D / 'unet-ov/unet.xml', 'CPU', {'PERFORMANCE_HINT': 'LATENCY'}))
    pipe.set_progress_bar_config(disable=True)
    S['i2i'] = StableDiffusionImg2ImgPipeline(**pipe.components)
    S['i2i'].set_progress_bar_config(disable=True)
    S['pipe'] = pipe
    print(f'loaded in {time.time() - t:.0f}s', flush=True)


def unload_when_idle():
    while True:
        time.sleep(30)
        with LOCK:
            if S['pipe'] and not S['busy'] and time.time() - S['last'] > IDLE:
                S['pipe'] = S['i2i'] = None
                import gc; gc.collect()
                print('unloaded (idle)', flush=True)


def gen(r):
    w = max(256, min(768, int(r.get('w', 384)) // 8 * 8)); h = max(256, min(768, int(r.get('h', 384)) // 8 * 8))
    steps = max(2, min(8, int(r.get('steps') or 4))); n = max(1, min(4, int(r.get('batch', 1))))
    seed = int(r.get('seed', -1)); seed = random.randint(0, 2**31 - 1) if seed < 0 else seed
    cfg = float(r.get('cfg') or 1.0)
    S.update(steps=steps * n, step=0)
    def cb(p, i, t, kw):
        S['step'] += 1
        return kw
    out = []
    for k in range(n):
        g = torch.Generator().manual_seed(seed + k)
        args = dict(prompt=r.get('prompt', ''), negative_prompt=r.get('neg') or None, num_inference_steps=steps, guidance_scale=cfg,
                    generator=g, callback_on_step_end=cb)
        if r.get('init'):
            im = Image.open(io.BytesIO(base64.b64decode(r['init'].split(',', 1)[-1]))).convert('RGB').resize((w, h), Image.NEAREST)
            dn = max(0.2, min(0.95, float(r.get('denoise', 0.5))))
            # LCM img2img runs steps × strength actual steps: ask for enough that the chosen count really runs
            img = S['i2i'](image=im, strength=dn, **{**args, 'num_inference_steps': max(steps, round(steps / dn))}).images[0]
        else:
            img = S['pipe'](width=w, height=h, **args).images[0]
        b = io.BytesIO(); img.save(b, 'PNG'); out.append(base64.b64encode(b.getvalue()).decode())
    return {'images': out, 'seed': seed}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)

    def do_GET(self):
        if self.path == '/progress':
            return self.send(200, {'busy': S['busy'], 'step': S['step'], 'steps': S['steps'], 'loaded': bool(S['pipe'])})
        if self.path == '/health':
            return self.send(200, {'ok': (D / 'unet-ov/unet.xml').exists(), 'loaded': bool(S['pipe'])})
        self.send(404, {'err': 'not found'})

    def do_POST(self):
        if self.path != '/gen':
            return self.send(404, {'err': 'not found'})
        r = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        with LOCK:
            S['busy'] = True
            try:
                load()
                res = gen(r)
                self.send(200, res)
            except Exception as ex:
                self.send(500, {'err': str(ex)[:300]})
            finally:
                S['busy'] = False; S['last'] = time.time()


if __name__ == '__main__':
    threading.Thread(target=unload_when_idle, daemon=True).start()
    print(f'kiln-fast on 127.0.0.1:{PORT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), H).serve_forever()
