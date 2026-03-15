"""DINOv2 + Chinese-CLIP model management using ONNX Runtime.

Export: FP32 ONNX (build-time or first launch via torch).
Quantize: INT8 at runtime based on platform (only needs onnxruntime).

  x86_64: all models INT8 (Conv + Linear supported, VNNI acceleration)
  arm64:  vision FP32 (Conv INT8 broken) + text INT8 (pure Linear)
"""
import glob
import logging
import os
import platform
import shutil
import threading

import numpy as np
import onnxruntime as ort

logging.getLogger("transformers.modeling_utils").setLevel(logging.ERROR)

DINO_DIM = 768
CLIP_DIM = 512

# FP32 base files (from export) → quantized files (runtime)
_MODEL_FILES = {
    "dinov2":     {"fp32": "dinov2.onnx",     "int8": "dinov2_int8.onnx"},
    "clip_image": {"fp32": "clip_image.onnx", "int8": "clip_image_int8.onnx"},
    "clip_text":  {"fp32": "clip_text.onnx",  "int8": "clip_text_int8.onnx"},
}


def _is_x86() -> bool:
    return platform.machine().lower() in ("x86_64", "amd64", "x86")


def _get_models_dir(base_dir: str | None = None) -> str:
    if base_dir:
        d = os.path.join(base_dir, "onnx_models")
    else:
        d = os.path.join(os.path.expanduser("~"), ".synapse", "onnx_models")
    os.makedirs(d, exist_ok=True)
    return d


def _fp32_models_exist(models_dir: str) -> bool:
    """Check if FP32 base models exist (from export or bundled)."""
    needed = [m["fp32"] for m in _MODEL_FILES.values()] + ["clip_processor", "dinov2_processor"]
    return all(os.path.exists(os.path.join(models_dir, f)) for f in needed)


def _check_model_version(models_dir: str) -> bool:
    from core.export_onnx import MODEL_VERSION

    version_file = os.path.join(models_dir, "model_version.txt")
    if not os.path.exists(version_file):
        return False
    with open(version_file) as f:
        return f.read().strip() == MODEL_VERSION


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


def _quantize_int8(fp32_path: str, int8_path: str) -> bool:
    """Quantize a single model to INT8. Returns True on success."""
    from onnxruntime.quantization import quantize_dynamic, QuantType

    print(f"[Quantize] {os.path.basename(fp32_path)} -> {os.path.basename(int8_path)}", flush=True)
    try:
        quantize_dynamic(
            fp32_path, int8_path,
            weight_type=QuantType.QInt8,
            extra_options={"MatMulConstBOnly": True},
        )
        return True
    except Exception as e:
        print(f"[Quantize] INT8 failed for {os.path.basename(fp32_path)}: {e}", flush=True)
        return False


def _quantize_for_platform(models_dir: str):
    """Quantize models to INT8 based on current platform.

    x86_64: all models (Conv + Linear INT8 supported)
    arm64:  text only (Conv INT8 broken on ARM)
    """
    arch = platform.machine().lower()
    x86 = _is_x86()
    print(f"[Models] Platform: {arch}, quantizing {'all models' if x86 else 'text only'} to INT8...", flush=True)

    if x86:
        # x86: quantize everything
        targets = ["dinov2", "clip_image", "clip_text"]
    else:
        # ARM: only text encoder (pure Linear layers)
        targets = ["clip_text"]

    for name in targets:
        fp32_path = os.path.join(models_dir, _MODEL_FILES[name]["fp32"])
        int8_path = os.path.join(models_dir, _MODEL_FILES[name]["int8"])
        if os.path.exists(int8_path):
            continue
        if not os.path.exists(fp32_path):
            continue
        _quantize_int8(fp32_path, int8_path)

    print("[Models] Quantization complete.", flush=True)


def _get_model_path(models_dir: str, name: str) -> str:
    """Return INT8 path if available, else FP32."""
    int8 = os.path.join(models_dir, _MODEL_FILES[name]["int8"])
    if os.path.exists(int8):
        return int8
    return os.path.join(models_dir, _MODEL_FILES[name]["fp32"])


def _auto_export(models_dir: str):
    """Auto-export FP32 ONNX models on first launch (needs torch + transformers)."""
    print("[Models] ONNX models not found, exporting (this only happens once)...", flush=True)
    from core.export_onnx import export_dinov2, export_clip, write_model_version

    if not os.path.exists(os.path.join(models_dir, "dinov2.onnx")):
        export_dinov2(models_dir)
    clip_image = os.path.join(models_dir, "clip_image.onnx")
    clip_text = os.path.join(models_dir, "clip_text.onnx")
    if not os.path.exists(clip_image) or not os.path.exists(clip_text):
        export_clip(models_dir)

    write_model_version(models_dir)
    print("[Models] FP32 export complete.", flush=True)


def _create_session(model_path: str) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    opts.inter_op_num_threads = 2
    opts.intra_op_num_threads = 4
    return ort.InferenceSession(model_path, opts, providers=["CPUExecutionProvider"])


class DinoModel:
    def __init__(self, models_dir: str):
        from transformers import AutoImageProcessor

        path = _get_model_path(models_dir, "dinov2")
        print(f"[Models] Loading DINOv2 from {os.path.basename(path)}", flush=True)
        self.session = _create_session(path)
        self.processor = AutoImageProcessor.from_pretrained(
            os.path.join(models_dir, "dinov2_processor")
        )

    def encode_image(self, image) -> np.ndarray:
        inputs = self.processor(images=image, return_tensors="np")
        pixel_values = inputs["pixel_values"].astype(np.float32)
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
        from transformers import ChineseCLIPProcessor

        img_path = _get_model_path(models_dir, "clip_image")
        txt_path = _get_model_path(models_dir, "clip_text")
        print(f"[Models] Loading CLIP image from {os.path.basename(img_path)}", flush=True)
        print(f"[Models] Loading CLIP text from {os.path.basename(txt_path)}", flush=True)
        self.image_session = _create_session(img_path)
        self.text_session = _create_session(txt_path)
        self.processor = ChineseCLIPProcessor.from_pretrained(
            os.path.join(models_dir, "clip_processor")
        )

    def encode_image(self, image) -> np.ndarray:
        inputs = self.processor(images=image, return_tensors="np")
        pixel_values = inputs["pixel_values"].astype(np.float32)
        (features,) = self.image_session.run(None, {"pixel_values": pixel_values})
        return features.flatten().astype(np.float32)

    def encode_text(self, text: str) -> np.ndarray:
        prompts = [t.format(text) for t in self.PROMPT_TEMPLATES]
        inputs = self.processor(text=prompts, return_tensors="np", padding=True)
        input_ids = inputs["input_ids"].astype(np.int64)
        attention_mask = inputs["attention_mask"].astype(np.int64)
        token_type_ids = inputs["token_type_ids"].astype(np.int64)
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

    # Step 1: ensure FP32 base models exist and version matches
    version_ok = _check_model_version(_models_dir)
    models_ok = _fp32_models_exist(_models_dir)
    if not models_ok or not version_ok:
        if not version_ok:
            _clear_old_models(_models_dir, data_dir)
        _auto_export(_models_dir)

    # Step 2: quantize to INT8 based on platform (no torch needed)
    _quantize_for_platform(_models_dir)


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
