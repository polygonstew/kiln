import time, torch, numpy as np, openvino as ov
from pathlib import Path
from diffusers import StableDiffusionPipeline, LCMScheduler
D = Path(__file__).parent / 'models'
torch.set_num_threads(4)
pipe = StableDiffusionPipeline.from_pretrained(D / 'aiop-lcm', torch_dtype=torch.float32, safety_checker=None, requires_safety_checker=False)
pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
pipe.set_progress_bar_config(disable=True)
P = 'pixelsprite, hooded wanderer holding a lantern, full body, side view, white background'
def run(sz, tag):
    t = time.time(); im = pipe(P, num_inference_steps=4, guidance_scale=1.0, width=sz, height=sz, generator=torch.Generator().manual_seed(7)).images[0]
    dt = time.time() - t; im.save(D / f'{tag}_{sz}.png'); print(f'{tag} {sz}: {dt:.1f}s', flush=True)
run(384, 'torch')
# OpenVINO UNet
xml = D / 'unet-ov/unet.xml'
if not xml.exists():
    t = time.time()
    m = ov.convert_model(pipe.unet, example_input={'sample': torch.randn(1, 4, 64, 64), 'timestep': torch.tensor(999), 'encoder_hidden_states': torch.randn(1, 77, 768)},
                         input=[('sample', [1, 4, -1, -1]), ('timestep', []), ('encoder_hidden_states', [1, 77, 768])])
    xml.parent.mkdir(exist_ok=True); ov.save_model(m, xml, compress_to_fp16=True); print('unet converted', round(time.time() - t), 's', flush=True)
core = ov.Core(); core.set_property('CPU', {'CACHE_DIR': str(D / 'ov-cache')})
cu = core.compile_model(xml, 'CPU', {'PERFORMANCE_HINT': 'LATENCY'})
class OVUNet(torch.nn.Module):
    def __init__(s, base): super().__init__(); s.config = base.config; s.dtype_ = torch.float32; s.add_embedding = None
    @property
    def dtype(s): return torch.float32
    @property
    def device(s): return torch.device('cpu')
    def forward(s, sample, timestep, encoder_hidden_states, **kw):
        r = cu({'sample': sample.numpy(), 'timestep': np.array(float(timestep), dtype=np.float32) if False else timestep.numpy() if torch.is_tensor(timestep) else np.array(timestep), 'encoder_hidden_states': encoder_hidden_states.numpy()})
        out = torch.from_numpy(r[0])
        from diffusers.models.unets.unet_2d_condition import UNet2DConditionOutput
        return UNet2DConditionOutput(sample=out) if kw.get('return_dict', True) else (out,)
pipe.unet = OVUNet(pipe.unet)
run(384, 'ov'); run(384, 'ov'); run(512, 'ov')
