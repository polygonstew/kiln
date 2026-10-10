# AllInOnePixel (SD1.5 single file) + LCM-LoRA fused -> diffusers -> OpenVINO IR (models/aiop-lcm-ov)
import sys, time, torch
from pathlib import Path
from diffusers import StableDiffusionPipeline, LCMScheduler
M = Path.home() / 'stable-diffusion-webui/ComfyUI/models'
out = Path(__file__).parent / 'models'
t = time.time()
pipe = StableDiffusionPipeline.from_single_file(str(M / 'checkpoints/AllInOnePixel.safetensors'), torch_dtype=torch.float32, safety_checker=None)
pipe.scheduler = LCMScheduler.from_config(pipe.scheduler.config)
pipe.load_lora_weights(str(M / 'loras'), weight_name='lcm-lora-sdv1-5.safetensors')
pipe.fuse_lora(); pipe.unload_lora_weights()
pipe.save_pretrained(out / 'aiop-lcm')
print('diffusers saved', round(time.time() - t), 's'); del pipe
from optimum.intel import OVStableDiffusionPipeline
ov = OVStableDiffusionPipeline.from_pretrained(out / 'aiop-lcm', export=True, compile=False)
ov.save_pretrained(out / 'aiop-lcm-ov')
print('openvino saved', round(time.time() - t), 's')
