"""Export and package models for distribution.

Usage:
    cd backend
    python -m tools.package_models --output-dir ./dist-models

Produces:
    models-x86_64.zip  (all INT8)
    models-arm64.zip   (vision FP32 + text INT8)

Upload both zips to GitHub Release tagged `models-v{MODEL_VERSION}`.
"""
import argparse
import os
import shutil
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.export_onnx import export_dinov2, export_clip
from core.models import MODEL_VERSION, _write_model_version


def _quantize_int8(fp32_path: str, int8_path: str):
    from onnxruntime.quantization import quantize_dynamic, QuantType
    print(f"[Quantize] {os.path.basename(fp32_path)} -> {os.path.basename(int8_path)}")
    quantize_dynamic(fp32_path, int8_path, weight_type=QuantType.QInt8,
                     extra_options={"MatMulConstBOnly": True})


def _zip_dir(src_dir: str, zip_path: str):
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(src_dir):
            for f in files:
                full = os.path.join(root, f)
                zf.write(full, os.path.relpath(full, src_dir))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="./dist-models")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    # Step 1: export FP32
    with tempfile.TemporaryDirectory() as fp32_dir:
        print("=== Exporting FP32 models ===")
        export_dinov2(fp32_dir)
        export_clip(fp32_dir)
        _write_model_version(fp32_dir)

        models = {
            "dinov2":     {"fp32": "dinov2.onnx",     "int8": "dinov2_int8.onnx"},
            "clip_image": {"fp32": "clip_image.onnx", "int8": "clip_image_int8.onnx"},
            "clip_text":  {"fp32": "clip_text.onnx",  "int8": "clip_text_int8.onnx"},
        }

        # Step 2: quantize all to INT8
        print("\n=== Quantizing all models to INT8 ===")
        for name, paths in models.items():
            fp32 = os.path.join(fp32_dir, paths["fp32"])
            int8 = os.path.join(fp32_dir, paths["int8"])
            _quantize_int8(fp32, int8)

        # Step 3: package x86_64 (all INT8)
        print("\n=== Packaging x86_64 (all INT8) ===")
        with tempfile.TemporaryDirectory() as pkg:
            for name, paths in models.items():
                shutil.copy2(os.path.join(fp32_dir, paths["int8"]), pkg)
            for d in ["clip_processor", "dinov2_processor"]:
                shutil.copytree(os.path.join(fp32_dir, d), os.path.join(pkg, d))
            with open(os.path.join(pkg, "model_version.txt"), "w") as f:
                f.write(MODEL_VERSION)
            zip_path = os.path.join(args.output_dir, "models-x86_64.zip")
            _zip_dir(pkg, zip_path)
            print(f"  -> {zip_path} ({os.path.getsize(zip_path) / 1024 / 1024:.1f} MB)")

        # Step 4: package arm64 (vision FP32 + text INT8)
        print("\n=== Packaging arm64 (vision FP32 + text INT8) ===")
        with tempfile.TemporaryDirectory() as pkg:
            for name, paths in models.items():
                if name == "clip_text":
                    shutil.copy2(os.path.join(fp32_dir, paths["int8"]), pkg)
                else:
                    shutil.copy2(os.path.join(fp32_dir, paths["fp32"]), pkg)
            for d in ["clip_processor", "dinov2_processor"]:
                shutil.copytree(os.path.join(fp32_dir, d), os.path.join(pkg, d))
            with open(os.path.join(pkg, "model_version.txt"), "w") as f:
                f.write(MODEL_VERSION)
            zip_path = os.path.join(args.output_dir, "models-arm64.zip")
            _zip_dir(pkg, zip_path)
            print(f"  -> {zip_path} ({os.path.getsize(zip_path) / 1024 / 1024:.1f} MB)")

    print(f"\nDone! Upload both zips to GitHub Release: models-v{MODEL_VERSION}")


if __name__ == "__main__":
    main()
