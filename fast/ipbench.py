import time, torch, resource
from pathlib import Path
from PIL import Image
from diffusers import StableDiffusionPipeline, LCMScheduler
D = Path(__file__).parent / 'models'
torch.set_num_threads(4)
p = StableDiffusionPipeline.from_pretrained(D / 'aiop-lcm', safety_checker=None, requires_safety_checker=False)
p.scheduler = LCMScheduler.from_config(p.scheduler.config); p.set_progress_bar_config(disable=True)
p.load_ip_adapter(str(D / 'ip'), subfolder='models', weight_name='ip-adapter_sd15.safetensors', image_encoder_folder='models/image_encoder')
ref = Image.open(Path.home() / '.jcodes/kiln/library/cloud/cloud-ea28b0bbfff3-0.png').convert('RGB')
for sc in (0.6, 0.8):
    p.set_ip_adapter_scale(sc)
    t = time.time()
    im = p('pixelsprite, armoured knight running, full body, side view, white background', ip_adapter_image=ref, num_inference_steps=4, guidance_scale=1.0,
           width=384, height=384, generator=torch.Generator().manual_seed(3)).images[0]
    im.save(D / f'ip_{sc}.png'); print(f'scale {sc}: {time.time()-t:.1f}s  maxrss {resource.getrusage(resource.RUSAGE_SELF).ru_maxrss/1e6:.1f} GB', flush=True)
