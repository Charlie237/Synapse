"""DINOv2 + Chinese-CLIP model management using ONNX Runtime.

Models are downloaded as pre-quantized packages from GitHub Releases (or a mirror).
  x86_64: all models INT8 (Conv + Linear supported, VNNI acceleration)
  arm64:  vision FP32 + text INT8 (Conv INT8/FP16 not supported by CPU EP)

Manual placement: put model files in ~/.synapse/onnx_models/
"""
import glob
import json
import logging
import os
import platform
import shutil
import threading
import zipfile

import numpy as np
import onnxruntime as ort
from PIL import Image

DINO_DIM = 768
CLIP_DIM = 512
MODEL_VERSION = "1"

DEFAULT_MODEL_URL = "https://github.com/Charlie237/Synapse/releases/download/models-v{version}/models-{arch}.zip"

_MODEL_FILES = {
    "dinov2":     {"fp32": "dinov2.onnx",     "int8": "dinov2_int8.onnx"},
    "clip_image": {"fp32": "clip_image.onnx", "int8": "clip_image_int8.onnx"},
    "clip_text":  {"fp32": "clip_text.onnx",  "int8": "clip_text_int8.onnx"},
}

_download_progress = {"downloading": False, "downloaded": 0, "total": 0}


def _is_x86() -> bool:
    return platform.machine().lower() in ("x86_64", "amd64", "x86")


def _get_arch_label() -> str:
    return "x86_64" if _is_x86() else "arm64"


def _get_models_dir(base_dir: str | None = None) -> str:
    if base_dir:
        d = os.path.join(base_dir, "onnx_models")
    else:
        d = os.path.join(os.path.expanduser("~"), ".synapse", "onnx_models")
    os.makedirs(d, exist_ok=True)
    return d


def _models_ready(models_dir: str) -> bool:
    """Check if the right model files + processors exist."""
    needed = ["clip_processor", "dinov2_processor"]
    for m in _MODEL_FILES.values():
        if not (os.path.exists(os.path.join(models_dir, m["int8"]))
                or os.path.exists(os.path.join(models_dir, m["fp32"]))):
            return False
    return all(os.path.exists(os.path.join(models_dir, f)) for f in needed)


def _check_model_version(models_dir: str) -> bool:
    version_file = os.path.join(models_dir, "model_version.txt")
    if not os.path.exists(version_file):
        return False
    with open(version_file) as f:
        return f.read().strip() == MODEL_VERSION


def _write_model_version(models_dir: str):
    with open(os.path.join(models_dir, "model_version.txt"), "w") as f:
        f.write(MODEL_VERSION)


def _clear_old_models(models_dir: str, data_dir: str):
    """Remove old ONNX models and stale CLIP vectors."""
    print("[Models] Model version mismatch, clearing old models...", flush=True)
    for f in glob.glob(os.path.join(models_dir, "*.onnx")):
        os.remove(f)
    for f in glob.glob(os.path.join(models_dir, "clip_*")):
        if os.path.isdir(f):
            shutil.rmtree(f)
    clip_npz = os.path.join(data_dir, "clip.npz")
    if os.path.exists(clip_npz):
        os.remove(clip_npz)
        print("[Models] Removed old clip.npz (embedding space changed)", flush=True)


def get_download_progress() -> dict:
    return dict(_download_progress)


def _download_models(models_dir: str):
    """Download pre-quantized models from GitHub Releases (or mirror)."""
    import urllib.request
    import urllib.error
    from core import settings

    arch = _get_arch_label()
    mirror = settings.get("model_mirror_url") or ""
    if mirror:
        url = mirror.format(version=MODEL_VERSION, arch=arch)
    else:
        url = DEFAULT_MODEL_URL.format(version=MODEL_VERSION, arch=arch)

    zip_path = os.path.join(models_dir, "models.zip")
    print(f"[Models] Downloading models from {url} ...", flush=True)

    _download_progress["downloading"] = True
    _download_progress["downloaded"] = 0
    _download_progress["total"] = 0

    max_retries = 3
    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Synapse"})
            with urllib.request.urlopen(req, timeout=120) as resp:
                total = int(resp.headers.get("Content-Length", 0))
                _download_progress["total"] = total
                downloaded = 0
                with open(zip_path, "wb") as f:
                    while True:
                        chunk = resp.read(256 * 1024)
                        if not chunk:
                            break
                        f.write(chunk)
                        downloaded += len(chunk)
                        _download_progress["downloaded"] = downloaded

            if not zipfile.is_zipfile(zip_path):
                raise RuntimeError("Downloaded file is not a valid zip")

            print(f"[Models] Download complete ({downloaded} bytes), extracting...", flush=True)
            with zipfile.ZipFile(zip_path, "r") as zf:
                zf.extractall(models_dir)
            os.remove(zip_path)
            _write_model_version(models_dir)
            print("[Models] Models ready.", flush=True)
            return

        except (urllib.error.URLError, OSError, RuntimeError) as e:
            print(f"[Models] Download attempt {attempt}/{max_retries} failed: {e}", flush=True)
            if os.path.exists(zip_path):
                os.remove(zip_path)
            if attempt == max_retries:
                raise RuntimeError(f"Failed to download models after {max_retries} attempts: {e}") from e
            _download_progress["downloaded"] = 0
        finally:
            if attempt == max_retries or not os.path.exists(zip_path):
                _download_progress["downloading"] = False


def get_models_dir(data_dir: str) -> str:
    return _get_models_dir(data_dir)


def check_models_available(data_dir: str) -> bool:
    """Check if models exist and version matches."""
    models_dir = _get_models_dir(data_dir)
    return _models_ready(models_dir) and _check_model_version(models_dir)


def download_models(models_dir: str, data_dir: str):
    """Download models. Clears old models if version mismatch."""
    if not _check_model_version(models_dir):
        _clear_old_models(models_dir, data_dir)
    _download_models(models_dir)


def _get_model_path(models_dir: str, name: str) -> str:
    """Return INT8 path if available, else FP32."""
    int8 = os.path.join(models_dir, _MODEL_FILES[name]["int8"])
    if os.path.exists(int8):
        return int8
    return os.path.join(models_dir, _MODEL_FILES[name]["fp32"])


def _ensure_models(models_dir: str, data_dir: str):
    """Check models exist. Raises if not."""
    if _models_ready(models_dir) and _check_model_version(models_dir):
        return
    raise RuntimeError(f"Models not found in: {models_dir}")


def _create_session(model_path: str) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.inter_op_num_threads = 2
    opts.intra_op_num_threads = 4
    return ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])


def _load_image_processor(config_dir: str):
    """Load image processor config from preprocessor_config.json or processor_config.json."""
    # Try preprocessor_config.json (DINOv2 style)
    path = os.path.join(config_dir, "preprocessor_config.json")
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    # Try processor_config.json with nested image_processor (CLIP style)
    path = os.path.join(config_dir, "processor_config.json")
    if os.path.exists(path):
        with open(path) as f:
            cfg = json.load(f)
        return cfg.get("image_processor", cfg)
    raise FileNotFoundError(f"No processor config found in {config_dir}")


def _preprocess_image(image, cfg: dict) -> np.ndarray:
    """Replicate transformers image preprocessing using PIL + numpy."""
    if not isinstance(image, Image.Image):
        image = Image.open(image)
    image = image.convert("RGB")

    size = cfg.get("size", {})
    crop_size = cfg.get("crop_size", {})

    # Resize
    if "shortest_edge" in size:
        short = size["shortest_edge"]
        w, h = image.size
        if w < h:
            new_w, new_h = short, int(short * h / w)
        else:
            new_w, new_h = int(short * w / h), short
        image = image.resize((new_w, new_h), Image.BICUBIC)
    elif "height" in size:
        image = image.resize((size["width"], size["height"]), Image.BICUBIC)

    # Center crop
    if cfg.get("do_center_crop", False) and crop_size:
        cw, ch = crop_size["width"], crop_size["height"]
        w, h = image.size
        left = (w - cw) // 2
        top = (h - ch) // 2
        image = image.crop((left, top, left + cw, top + ch))

    arr = np.array(image, dtype=np.float32)
    if cfg.get("do_rescale", True):
        arr *= cfg.get("rescale_factor", 1.0 / 255.0)
    if cfg.get("do_normalize", True):
        mean = np.array(cfg.get("image_mean", [0.5, 0.5, 0.5]), dtype=np.float32)
        std = np.array(cfg.get("image_std", [0.5, 0.5, 0.5]), dtype=np.float32)
        arr = (arr - mean) / std

    # HWC -> CHW, add batch dim
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, 0).astype(np.float32)


class DinoModel:
    def __init__(self, models_dir: str):
        path = _get_model_path(models_dir, "dinov2")
        print(f"[Models] Loading DINOv2 from {os.path.basename(path)}", flush=True)
        self.session = _create_session(path)
        self.cfg = _load_image_processor(os.path.join(models_dir, "dinov2_processor"))

    def encode_image(self, image) -> np.ndarray:
        pixel_values = _preprocess_image(image, self.cfg)
        (features,) = self.session.run(None, {"pixel_values": pixel_values})
        return features.flatten().astype(np.float32)


class ClipModel:
    PROMPT_TEMPLATES = [
        "一张{}的照片",
        "a photo of {}",
        "{}",
        "a picture of {}",
    ]

    def __init__(self, models_dir: str):
        from tokenizers import Tokenizer

        img_path = _get_model_path(models_dir, "clip_image")
        txt_path = _get_model_path(models_dir, "clip_text")
        print(f"[Models] Loading CLIP image from {os.path.basename(img_path)}", flush=True)
        print(f"[Models] Loading CLIP text from {os.path.basename(txt_path)}", flush=True)
        self.image_session = _create_session(img_path)
        self.text_session = _create_session(txt_path)
        self.img_cfg = _load_image_processor(os.path.join(models_dir, "clip_processor"))
        self.tokenizer = Tokenizer.from_file(
            os.path.join(models_dir, "clip_processor", "tokenizer.json")
        )

    def encode_image(self, image) -> np.ndarray:
        pixel_values = _preprocess_image(image, self.img_cfg)
        (features,) = self.image_session.run(None, {"pixel_values": pixel_values})
        return features.flatten().astype(np.float32)

    def encode_text(self, text: str) -> np.ndarray:
        prompts = [t.format(text) for t in self.PROMPT_TEMPLATES]
        encodings = self.tokenizer.encode_batch(prompts)
        max_len = max(len(e.ids) for e in encodings)
        input_ids = np.zeros((len(prompts), max_len), dtype=np.int64)
        attention_mask = np.zeros_like(input_ids)
        token_type_ids = np.zeros_like(input_ids)
        for i, e in enumerate(encodings):
            length = len(e.ids)
            input_ids[i, :length] = e.ids
            attention_mask[i, :length] = 1
            token_type_ids[i, :length] = e.type_ids
        (features,) = self.text_session.run(
            None, {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            }
        )
        avg = features.mean(axis=0, keepdims=True)
        avg = avg / np.linalg.norm(avg, axis=-1, keepdims=True)
        return avg.flatten().astype(np.float32)


_dino_model: DinoModel | None = None
_clip_model: ClipModel | None = None
_model_lock = threading.Lock()
_models_dir: str | None = None
_data_dir: str | None = None


def init_models_dir(data_dir: str):
    global _models_dir, _data_dir
    _data_dir = data_dir
    _models_dir = _get_models_dir(data_dir)
    _ensure_models(_models_dir, data_dir)


def get_dino_model() -> DinoModel:
    global _dino_model
    if _dino_model is None:
        with _model_lock:
            if _dino_model is None:
                _dino_model = DinoModel(_models_dir)
    return _dino_model


def get_clip_model() -> ClipModel:
    global _clip_model
    if _clip_model is None:
        with _model_lock:
            if _clip_model is None:
                _clip_model = ClipModel(_models_dir)
    return _clip_model
