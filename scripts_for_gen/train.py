from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

import matplotlib.pyplot as plt
import torch
import yaml
from PIL import Image
from peft import LoraConfig
from peft.utils import get_peft_model_state_dict
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from torchvision.transforms import functional as TF
from diffusers import ZImageImg2ImgPipeline
from diffusers.utils import convert_state_dict_to_diffusers
from torchmetrics.image.fid import FrechetInceptionDistance
from torchmetrics.image.lpip import LearnedPerceptualImagePatchSimilarity
from torchmetrics.image import PeakSignalNoiseRatio, StructuralSimilarityIndexMeasure
#from torchmetrics.multimodal import CLIPScore

from utils import choose_device, choose_dtype, load_json_container, resolve_path


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--config", required=True)
    return p.parse_args()


class ImageDataset(Dataset):
    def __init__(self, items, root: Path, src_key: str, tgt_key: str, prompt_key: str, resolution: int):
        self.items = items
        self.root = root
        self.src_key = src_key
        self.tgt_key = tgt_key
        self.prompt_key = prompt_key
        self.transform = transforms.Compose(
            [
                transforms.Resize(resolution, interpolation=transforms.InterpolationMode.BILINEAR),
                transforms.CenterCrop(resolution),
                transforms.ToTensor(),
                transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
            ]
        )

    def __len__(self):
        return len(self.items)

    def __getitem__(self, idx: int):
        item = self.items[idx]
        src_path = resolve_path(str(item[self.src_key]), self.root)
        tgt_path = resolve_path(str(item[self.tgt_key]), self.root)
        prompt = item.get(self.prompt_key) or item.get("prompt") or item.get("caption") or ""
        src_image = Image.open(src_path).convert("RGB")
        tgt_image = Image.open(tgt_path).convert("RGB")
        return {
            "src_pixel_values": self.transform(src_image),
            "tgt_pixel_values": self.transform(tgt_image),
            "prompt": str(prompt),
        }


def collate(batch):
    return {
        "src_pixel_values": torch.stack([x["src_pixel_values"] for x in batch]),
        "tgt_pixel_values": torch.stack([x["tgt_pixel_values"] for x in batch]),
        "prompt": [x["prompt"] for x in batch],
    }


def save_lora(pipe: ZImageImg2ImgPipeline, output_dir: Path):
    state_dict = get_peft_model_state_dict(pipe.transformer)
    state_dict = convert_state_dict_to_diffusers(state_dict)
    pipe.save_lora_weights(output_dir, transformer_lora_layers=state_dict)


def grad_norm(params):
    total = torch.zeros((), device=params[0].device)
    for p in params:
        if p.grad is not None:
            total = total + p.grad.detach().float().pow(2).sum()
    return float(total.sqrt().detach().cpu())


def load_eval_image(path: Path, resolution: int):
    image = Image.open(path).convert("RGB")
    image = transforms.Resize(resolution, interpolation=transforms.InterpolationMode.BILINEAR)(image)
    image = transforms.CenterCrop(resolution)(image)
    return image


@torch.no_grad()
def evaluate(
    pipe: ZImageImg2ImgPipeline,
    items,
    root,
    src_key,
    tgt_key,
    prompt_key,
    resolution,
    device,
    #clip_metric,
    fid_metric,
    lpips_metric,
    ssim_metric,
    psnr_metric,
    num_inference_steps,
    guidance_scale,
    strength,
    seed,
):
    #clip_metric.reset()
    fid_metric.reset()
    lpips_metric.reset()
    ssim_metric.reset()
    psnr_metric.reset()
    pipe.transformer.eval()
    for i, item in enumerate(items):
        prompt = str(item.get(prompt_key) or item.get("prompt") or item.get("caption") or "")
        src_path = resolve_path(str(item[src_key]), root)
        tgt_path = resolve_path(str(item[tgt_key]), root)
        src_pil = load_eval_image(src_path, resolution)
        tgt_pil = load_eval_image(tgt_path, resolution)
        fake_pil = pipe(
            prompt=prompt,
            image=src_pil,
            strength=strength,
            num_inference_steps=num_inference_steps,
            guidance_scale=guidance_scale,
            generator=torch.Generator(device=device).manual_seed(seed + i),
        ).images[0]
        real_u8 = TF.pil_to_tensor(tgt_pil).unsqueeze(0).to(device)
        fake_u8 = TF.pil_to_tensor(fake_pil).unsqueeze(0).to(device)
        real_01 = real_u8.float() / 255.0
        fake_01 = fake_u8.float() / 255.0
        #clip_metric.update(fake_u8, [prompt])
        fid_metric.update(real_u8, real=True)
        fid_metric.update(fake_u8, real=False)
        lpips_metric.update(fake_01, real_01)
        ssim_metric.update(fake_01, real_01)
        psnr_metric.update(fake_01, real_01)
    #clip_score = float(clip_metric.compute().detach().cpu())
    fid = float(fid_metric.compute().detach().cpu())
    lpips = float(lpips_metric.compute().detach().cpu())
    ssim = float(ssim_metric.compute().detach().cpu())
    psnr = float(psnr_metric.compute().detach().cpu())
    pipe.transformer.train()
    return fid, lpips, ssim, psnr


def save_curve(path: Path, xs, ys, ylabel: str):
    plt.figure(figsize=(8, 5))
    plt.plot(xs, ys)
    plt.xlabel("step")
    plt.ylabel(ylabel)
    plt.tight_layout()
    plt.savefig(path, dpi=150)
    plt.close()


def main() -> None:
    args = parse_args()
    config_path = Path(args.config).resolve()
    cfg = yaml.safe_load(config_path.read_text(encoding="utf-8"))

    imagedataset = cfg.get("imagedataset", {})
    model_cfg = cfg.get("model", {})
    train_cfg = cfg.get("train", {})
    lora_cfg = cfg.get("lora", {})
    eval_cfg = cfg.get("eval", {})
    system_cfg = cfg.get("system", {})

    seed = int(system_cfg.get("seed", 42))
    torch.manual_seed(seed)

    dataset_path = resolve_path(str(imagedataset.get("path", "train.json")), config_path.parent)
    output_dir = resolve_path(str(train_cfg.get("output_dir", "zimage_lora_out")), config_path.parent)
    output_dir.mkdir(parents=True, exist_ok=True)

    _, items = load_json_container(dataset_path)
    root = dataset_path.parent
    src_key = str(imagedataset.get("src_key", "src_img"))
    tgt_key = str(imagedataset.get("tgt_key", "tgt_img"))
    prompt_key = str(imagedataset.get("prompt_key", "gen_prompt"))
    items = [x for x in items if x.get(src_key) and x.get(tgt_key) and (x.get(prompt_key) or x.get("prompt") or x.get("caption"))]

    eval_path_raw = eval_cfg.get("path")
    eval_path = resolve_path(str(eval_path_raw), config_path.parent) if eval_path_raw else dataset_path
    _, eval_items = load_json_container(eval_path)
    eval_root = eval_path.parent
    eval_items = [x for x in eval_items if x.get(src_key) and x.get(tgt_key) and (x.get(prompt_key) or x.get("prompt") or x.get("caption"))]
    eval_items = eval_items[: int(eval_cfg.get("num_items", 8))]

    device = choose_device(system_cfg.get("device"))
    dtype = choose_dtype(device, str(system_cfg.get("precision", "bf16")))

    dataset = ImageDataset(
        items=items,
        root=root,
        src_key=src_key,
        tgt_key=tgt_key,
        prompt_key=prompt_key,
        resolution=int(imagedataset.get("resolution", 1024)),
    )
    loader = DataLoader(
        dataset,
        batch_size=int(train_cfg.get("batch_size", 1)),
        shuffle=True,
        num_workers=int(imagedataset.get("num_workers", 0)),
        collate_fn=collate,
        drop_last=True,
    )

    pipe = ZImageImg2ImgPipeline.from_pretrained(
        model_cfg.get("id", "ostris/Z-Image-De-Turbo"),
        torch_dtype=dtype,
    ).to(device)

    pipe.vae.requires_grad_(False)
    pipe.text_encoder.requires_grad_(False)
    pipe.transformer.requires_grad_(False)

    pipe.transformer.add_adapter(
        LoraConfig(
            r=int(lora_cfg.get("rank", 16)),
            lora_alpha=int(lora_cfg.get("alpha", 16)),
            lora_dropout=float(lora_cfg.get("dropout", 0.0)),
            target_modules=lora_cfg.get("target_modules", "all-linear"),
            bias="none",
        )
    )

    params = [p for p in pipe.transformer.parameters() if p.requires_grad]
    optimizer = torch.optim.AdamW(params, lr=float(train_cfg.get("learning_rate", 1e-4)))

    pipe.scheduler.set_timesteps(pipe.scheduler.config.num_train_timesteps, device=device)
    timesteps_all = pipe.scheduler.timesteps.to(device)
    sigmas_all = pipe.scheduler.sigmas.to(device=device, dtype=torch.float32)

    #clip_metric = CLIPScore(model_name_or_path=str(eval_cfg.get("clip_model", "openai/clip-vit-large-patch14"))).to(device)
    fid_metric = FrechetInceptionDistance(feature=2048).to(device)
    fid_metric.set_dtype(torch.float64)
    lpips_metric = LearnedPerceptualImagePatchSimilarity(net_type=str(eval_cfg.get("lpips_backbone", "alex")), normalize=True).to(device)
    ssim_metric = StructuralSimilarityIndexMeasure(data_range=1.0).to(device)
    psnr_metric = PeakSignalNoiseRatio(data_range=1.0).to(device)

    log_jsonl = output_dir / "train_log.jsonl"
    log_csv = output_dir / "train_log.csv"
    losses = []
    grad_norms = []
    lrs = []
    loss_steps = []
    eval_steps = []
    #clip_scores = []
    fids = []
    lpips_scores = []
    ssims = []
    psnrs = []

    with log_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["step", "loss", "grad_norm", "lr", "fid", "lpips", "ssim", "psnr"])

    step = 0
    loader_iter = iter(loader)
    max_train_steps = int(train_cfg.get("max_train_steps", 3000))
    gradient_accumulation_steps = int(train_cfg.get("gradient_accumulation_steps", 1))
    save_every = int(train_cfg.get("save_every", 500))
    eval_every = int(eval_cfg.get("every", save_every))
    eval_steps_count = int(eval_cfg.get("num_inference_steps", 9))
    eval_guidance_scale = float(eval_cfg.get("guidance_scale", 0.0))
    eval_strength = float(eval_cfg.get("strength", 0.6))
    strength_min = float(train_cfg.get("strength_min", 0.4))
    strength_max = float(train_cfg.get("strength_max", 0.8))

    while step < max_train_steps:
        optimizer.zero_grad(set_to_none=True)

        for _ in range(gradient_accumulation_steps):
            try:
                batch = next(loader_iter)
            except StopIteration:
                loader_iter = iter(loader)
                batch = next(loader_iter)

            src_pixel_values = batch["src_pixel_values"].to(device=device, dtype=dtype)
            tgt_pixel_values = batch["tgt_pixel_values"].to(device=device, dtype=dtype)

            with torch.no_grad():
                src_latents = pipe.vae.encode(src_pixel_values).latent_dist.sample()
                src_latents = src_latents * pipe.vae.config.scaling_factor
                tgt_latents = pipe.vae.encode(tgt_pixel_values).latent_dist.sample()
                tgt_latents = tgt_latents * pipe.vae.config.scaling_factor

                tokenized = pipe.tokenizer(
                    batch["prompt"],
                    padding="max_length",
                    truncation=True,
                    max_length=pipe.tokenizer.model_max_length,
                    return_tensors="pt",
                )
                input_ids = tokenized.input_ids.to(device)
                attention_mask = tokenized.attention_mask.to(device)
                encoder_hidden_states = pipe.text_encoder(
                    input_ids=input_ids,
                    attention_mask=attention_mask,
                ).last_hidden_state

            noise = torch.randn_like(tgt_latents)
            strengths = torch.empty((tgt_latents.shape[0],), device=device).uniform_(strength_min, strength_max)
            sigma_ids = torch.clamp((strengths * (sigmas_all.shape[0] - 1)).long(), 0, sigmas_all.shape[0] - 1)
            timesteps = timesteps_all[sigma_ids]
            sigmas = sigmas_all[sigma_ids].to(dtype=tgt_latents.dtype).view(-1, 1, 1, 1)
            noisy_src_latents = (1.0 - sigmas) * src_latents + sigmas * noise
            target = noise - tgt_latents

            model_pred = pipe.transformer(
                hidden_states=noisy_src_latents,
                encoder_hidden_states=encoder_hidden_states,
                timestep=timesteps,
                encoder_attention_mask=attention_mask,
                return_dict=False,
            )[0]

            loss = torch.nn.functional.mse_loss(model_pred.float(), target.float(), reduction="mean")
            (loss / gradient_accumulation_steps).backward()

        grad_value = grad_norm(params)
        optimizer.step()
        step += 1

        loss_value = float(loss.item())
        lr_value = float(optimizer.param_groups[0]["lr"])
        #clip_value = None
        fid_value = None
        lpips_value = None
        ssim_value = None
        psnr_value = None

        loss_steps.append(step)
        losses.append(loss_value)
        grad_norms.append(grad_value)
        lrs.append(lr_value)

        if eval_every and step % eval_every == 0:
            fid_value, lpips_value, ssim_value, psnr_value = evaluate(
                pipe=pipe,
                items=eval_items,
                root=eval_root,
                src_key=src_key,
                tgt_key=tgt_key,
                prompt_key=prompt_key,
                resolution=int(imagedataset.get("resolution", 1024)),
                device=device,
                #clip_metric=clip_metric,
                fid_metric=fid_metric,
                lpips_metric=lpips_metric,
                ssim_metric=ssim_metric,
                psnr_metric=psnr_metric,
                num_inference_steps=eval_steps_count,
                guidance_scale=eval_guidance_scale,
                strength=eval_strength,
                seed=seed,
            )
            eval_steps.append(step)
            #clip_scores.append(clip_value)
            fids.append(fid_value)
            lpips_scores.append(lpips_value)
            ssims.append(ssim_value)
            psnrs.append(psnr_value)

        row = {
            "step": step,
            "loss": loss_value,
            "grad_norm": grad_value,
            "lr": lr_value,
            #"clip_score": clip_value,
            "fid": fid_value,
            "lpips": lpips_value,
            "ssim": ssim_value,
            "psnr": psnr_value,
        }

        with log_jsonl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

        with log_csv.open("a", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            writer.writerow([step, loss_value, grad_value, lr_value, fid_value, lpips_value, ssim_value, psnr_value])

        if save_every and step % save_every == 0:
            save_dir = output_dir / f"checkpoint-{step}"
            save_dir.mkdir(parents=True, exist_ok=True)
            save_lora(pipe, save_dir)

        print(
            f"step={step} loss={loss_value:.6f} grad_norm={grad_value:.6f} lr={lr_value:.8f} "
            f"fid={fid_value} lpips={lpips_value} ssim={ssim_value} psnr={psnr_value}"
        )

    save_lora(pipe, output_dir)

    save_curve(output_dir / "loss.png", loss_steps, losses, "loss")
    save_curve(output_dir / "grad_norm.png", loss_steps, grad_norms, "grad_norm")
    save_curve(output_dir / "lr.png", loss_steps, lrs, "lr")
    if eval_steps:
        #save_curve(output_dir / "clip_score.png", eval_steps, clip_scores, "clip_score")
        save_curve(output_dir / "fid.png", eval_steps, fids, "fid")
        save_curve(output_dir / "lpips.png", eval_steps, lpips_scores, "lpips")
        save_curve(output_dir / "ssim.png", eval_steps, ssims, "ssim")
        save_curve(output_dir / "psnr.png", eval_steps, psnrs, "psnr")

    print(f"saved: {output_dir}")


if __name__ == "__main__":
    main()
