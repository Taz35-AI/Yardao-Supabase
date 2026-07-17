#!/usr/bin/env bash
# Sets up ComfyUI + the Persephone FLUX checkpoint on a RunPod pod.
#
# Usage (in the pod's web terminal):
#   export CIVITAI_TOKEN=<your civitai api key>
#   export PERSEPHONE_VERSION_ID=<version id from the model's download link>
#   bash setup-persephone-comfyui.sh
#
# Optional:
#   PERSEPHONE_IS_UNET=1   # set if the file you picked is UNET-only (no baked VAE/CLIP);
#                          # also downloads the FLUX text encoders + VAE
#   COMFY_DIR=/workspace/ComfyUI

set -euo pipefail

COMFY_DIR="${COMFY_DIR:-/workspace/ComfyUI}"

if [[ -z "${CIVITAI_TOKEN:-}" || -z "${PERSEPHONE_VERSION_ID:-}" ]]; then
  echo "ERROR: set CIVITAI_TOKEN and PERSEPHONE_VERSION_ID first (see usage header)." >&2
  exit 1
fi

# --- 1. ComfyUI ---------------------------------------------------------------
if [[ ! -d "$COMFY_DIR" ]]; then
  # Not a ComfyUI template — install from scratch (needs a CUDA/pytorch base image)
  echo ">> Installing ComfyUI into $COMFY_DIR"
  git clone https://github.com/comfyanonymous/ComfyUI.git "$COMFY_DIR"
  pip install -r "$COMFY_DIR/requirements.txt"
else
  echo ">> Found existing ComfyUI at $COMFY_DIR"
fi

# --- 2. Persephone checkpoint from Civitai -------------------------------------
if [[ "${PERSEPHONE_IS_UNET:-0}" == "1" ]]; then
  DEST="$COMFY_DIR/models/unet"
else
  DEST="$COMFY_DIR/models/checkpoints"
fi
mkdir -p "$DEST"

echo ">> Downloading Persephone (version $PERSEPHONE_VERSION_ID) to $DEST"
wget --content-disposition -P "$DEST" \
  "https://civitai.com/api/download/models/${PERSEPHONE_VERSION_ID}?token=${CIVITAI_TOKEN}"

# --- 3. FLUX text encoders + VAE (only needed for UNET-only files) -------------
if [[ "${PERSEPHONE_IS_UNET:-0}" == "1" ]]; then
  echo ">> Downloading FLUX text encoders and VAE"
  mkdir -p "$COMFY_DIR/models/clip" "$COMFY_DIR/models/vae"
  wget -nc -P "$COMFY_DIR/models/clip" \
    https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors
  wget -nc -P "$COMFY_DIR/models/clip" \
    https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors
  wget -nc -P "$COMFY_DIR/models/vae" \
    https://huggingface.co/black-forest-labs/FLUX.1-schnell/resolve/main/ae.safetensors
fi

echo ">> Done. Refresh the ComfyUI browser tab (or restart ComfyUI) and the model"
echo "   will appear in the Load Checkpoint / Load Diffusion Model node."
echo "   FLUX settings: CFG 1.0, FluxGuidance ~3.5, euler/simple, 20-30 steps."
