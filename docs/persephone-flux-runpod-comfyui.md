# Persephone (FLUX) on ComfyUI — RunPod setup guide

Persephone is a FLUX.1-dev–based checkpoint hosted on Civitai. This guide gets it
running in ComfyUI on a rented RunPod GPU, from zero to first image.

---

## 1. What you need before starting

| Item | Where to get it |
|---|---|
| RunPod account + ~$10 credit | https://runpod.io |
| Civitai account + API key | https://civitai.com → profile icon → **Account Settings → API Keys → Add API key** |
| The Persephone model page | Search **"Persephone"** on Civitai, filter by *Checkpoint* / base model *Flux.1 D* |

The Civitai API key is required because Civitai blocks anonymous downloads of most
models — you'll paste it into the pod later.

## 2. Deploy the pod

1. In RunPod go to **Pods → Deploy**.
2. **GPU:** pick an **RTX 4090 (24 GB)** — the sweet spot for FLUX (~$0.30–0.70/hr).
   An L40S / A40 (48 GB) also works. 16 GB cards can run FLUX fp8 but are slower.
3. **Template:** search the template library for **"ComfyUI"** and use either:
   - the official **RunPod ComfyUI** template, or
   - the community **"ComfyUI with Flux.1 dev"** template (ValyrianTech) — this one
     pre-downloads FLUX.1-dev support files, which saves a step.
4. **Storage:** set the **volume** (mounted at `/workspace`) to **at least 60 GB**.
   The Persephone checkpoint alone is 12–23 GB depending on the version you pick.
   If you plan to come back regularly, create a **Network Volume** first and attach
   it, so models survive after you terminate the pod.
5. Deploy and wait for the pod to finish initializing (first boot can take 10–15 min
   while images/models download).
6. Click **Connect** → open the HTTP service for ComfyUI (port **8188**, or **3000**
   on some templates). You should see the ComfyUI graph editor in your browser.

## 3. Download Persephone into the pod

On the Civitai model page, pick the version you want and copy its **download link**
(right-click the Download button → copy link; it looks like
`https://civitai.com/api/download/models/<VERSION_ID>`).

Open a terminal on the pod (Connect → **Web Terminal**, or Jupyter → Terminal) and run:

```bash
export CIVITAI_TOKEN=your_api_key_here

cd /workspace/ComfyUI/models/checkpoints
wget --content-disposition \
  "https://civitai.com/api/download/models/<VERSION_ID>?token=${CIVITAI_TOKEN}"
```

> Path note: some templates install ComfyUI at `/ComfyUI` or `/workspace/comfyui` —
> `find / -maxdepth 3 -iname "checkpoints" -path "*models*" 2>/dev/null` will find
> the right folder.

Alternatively, `scripts/runpod/setup-persephone-comfyui.sh` in this repo automates
this step (and installs ComfyUI first if the pod doesn't have it).

### Which file to grab, and what else you might need

Civitai FLUX checkpoints come in two flavors — check the file list on the model page:

- **Full checkpoint (~17–23 GB, "includes VAE/CLIP")** → goes in `models/checkpoints`,
  loads with the normal **Load Checkpoint** node. Nothing else needed. ✅ easiest
- **UNET-only file (~11–12 GB fp8)** → goes in `models/unet` (or `models/diffusion_models`),
  and you also need the FLUX text encoders + VAE:

```bash
cd /workspace/ComfyUI/models/clip
wget https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors
wget https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors

cd /workspace/ComfyUI/models/vae
wget https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors
```

(The schnell repo is public and ships the same `ae.safetensors` VAE that dev uses,
so no HuggingFace license gate.)

## 4. Build the workflow

After downloading, click **Refresh** in ComfyUI (or restart it) so the model appears.

**Full checkpoint:** load the built-in template via *Workflow → Browse Templates →
Flux*, swap the checkpoint loader to your Persephone file — or wire it manually:

```
Load Checkpoint (Persephone)
 ├─ CLIP → CLIP Text Encode (your prompt) → FluxGuidance (3.5) → sampler positive
 ├─ CLIP → CLIP Text Encode (empty) → sampler negative
 └─ MODEL → KSampler ← Empty Latent Image (1024×1024)
KSampler → VAE Decode (checkpoint VAE) → Save Image
```

**UNET-only:** replace Load Checkpoint with **Load Diffusion Model** +
**DualCLIPLoader** (clip_l + t5xxl, type `flux`) + **Load VAE** (ae.safetensors).

**Sampler settings that matter for FLUX:**

| Setting | Value |
|---|---|
| CFG | **1.0** (always — guidance comes from the FluxGuidance node, ~2.5–3.5) |
| Steps | 20–30 |
| Sampler / scheduler | `euler` / `simple` |
| Resolution | 1024×1024 (FLUX handles up to ~2 MP well) |
| Negative prompt | leave empty — FLUX ignores it at CFG 1.0 |

Persephone responds well to natural-language prompts (full sentences), not
comma-separated tag soup — that's a FLUX trait.

## 5. Costs & housekeeping

- **Stop the pod** when you're done — you pay per minute while it runs. A stopped
  pod still bills a small amount for volume storage; **terminate** it if you used a
  network volume (the models live there, not in the pod).
- First image after boot is slow (model loads into VRAM); subsequent images on a
  4090 take roughly 15–30 s at 1024×1024 / 25 steps.
- Persephone inherits the **FLUX.1-dev non-commercial license** — check the model
  page's license notes if you plan commercial use.
