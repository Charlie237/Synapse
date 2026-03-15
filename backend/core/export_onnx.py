"""Export DINOv2 + Chinese-CLIP models to ONNX (FP32).

Build-time: python -m core.export_onnx --output-dir ./models
Runtime quantization (INT8) is handled by models.py based on platform.
"""
import argparse
import os

import torch
import torch.nn as nn


MODEL_VERSION = "3"  # Bump when changing models to trigger re-export


class DINOv2Wrapper(nn.Module):
    """Wraps DINOv2 to output normalized CLS token."""

    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, pixel_values):
        outputs = self.model(pixel_values=pixel_values)
        features = outputs.last_hidden_state[:, 0]  # CLS token
        features = features / features.norm(dim=-1, keepdim=True)
        return features


class ChineseCLIPImageWrapper(nn.Module):
    """Wraps Chinese-CLIP vision to output normalized image features."""

    def __init__(self, model):
        super().__init__()
        self.vision_model = model.vision_model
        self.visual_projection = model.visual_projection

    def forward(self, pixel_values):
        outputs = self.vision_model(pixel_values=pixel_values)
        pooled = outputs.pooler_output
        features = self.visual_projection(pooled)
        features = features / features.norm(dim=-1, keepdim=True)
        return features


class ChineseCLIPTextWrapper(nn.Module):
    """Wraps Chinese-CLIP text (BERT-based) to output normalized text features."""

    def __init__(self, model):
        super().__init__()
        self.text_model = model.text_model
        self.text_projection = model.text_projection

    def forward(self, input_ids, attention_mask, token_type_ids):
        outputs = self.text_model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )
        # Chinese-CLIP uses CLS token from last_hidden_state, not pooler_output
        pooled = outputs[0][:, 0]
        features = self.text_projection(pooled)
        features = features / features.norm(dim=-1, keepdim=True)
        return features


def export_dinov2(output_dir: str) -> str:
    from transformers import AutoImageProcessor, AutoModel

    print("[Export] Loading DINOv2...")
    model = AutoModel.from_pretrained("facebook/dinov2-base")
    processor = AutoImageProcessor.from_pretrained("facebook/dinov2-base")
    model.eval()

    wrapper = DINOv2Wrapper(model)
    wrapper.eval()
    dummy_input = torch.randn(1, 3, 224, 224)

    onnx_path = os.path.join(output_dir, "dinov2.onnx")
    print(f"[Export] Exporting DINOv2 to {onnx_path}...")
    torch.onnx.export(
        wrapper,
        (dummy_input,),
        onnx_path,
        input_names=["pixel_values"],
        output_names=["features"],
        dynamic_axes={"pixel_values": {0: "batch"}, "features": {0: "batch"}},
        opset_version=14,
        dynamo=False,
    )

    processor.save_pretrained(os.path.join(output_dir, "dinov2_processor"))
    return onnx_path


def export_clip(output_dir: str) -> tuple[str, str]:
    from transformers import ChineseCLIPModel, ChineseCLIPProcessor

    print("[Export] Loading Chinese-CLIP (OFA-Sys/chinese-clip-vit-base-patch16)...")
    model_name = "OFA-Sys/chinese-clip-vit-base-patch16"
    model = ChineseCLIPModel.from_pretrained(model_name)
    processor = ChineseCLIPProcessor.from_pretrained(model_name)
    model.eval()

    # Image encoder
    image_wrapper = ChineseCLIPImageWrapper(model)
    image_wrapper.eval()
    dummy_pixel = torch.randn(1, 3, 224, 224)

    image_path = os.path.join(output_dir, "clip_image.onnx")
    print(f"[Export] Exporting Chinese-CLIP image encoder to {image_path}...")
    torch.onnx.export(
        image_wrapper,
        (dummy_pixel,),
        image_path,
        input_names=["pixel_values"],
        output_names=["features"],
        dynamic_axes={"pixel_values": {0: "batch"}, "features": {0: "batch"}},
        opset_version=14,
        dynamo=False,
    )

    # Text encoder (BERT-based, needs token_type_ids)
    text_wrapper = ChineseCLIPTextWrapper(model)
    text_wrapper.eval()
    dummy_ids = torch.randint(0, 21128, (1, 52))
    dummy_mask = torch.ones(1, 52, dtype=torch.long)
    dummy_token_type = torch.zeros(1, 52, dtype=torch.long)

    text_path = os.path.join(output_dir, "clip_text.onnx")
    print(f"[Export] Exporting Chinese-CLIP text encoder to {text_path}...")
    torch.onnx.export(
        text_wrapper,
        (dummy_ids, dummy_mask, dummy_token_type),
        text_path,
        input_names=["input_ids", "attention_mask", "token_type_ids"],
        output_names=["features"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq_len"},
            "attention_mask": {0: "batch", 1: "seq_len"},
            "token_type_ids": {0: "batch", 1: "seq_len"},
            "features": {0: "batch"},
        },
        opset_version=14,
        dynamo=False,
    )

    processor.save_pretrained(os.path.join(output_dir, "clip_processor"))
    return image_path, text_path


def write_model_version(output_dir: str):
    with open(os.path.join(output_dir, "model_version.txt"), "w") as f:
        f.write(MODEL_VERSION)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    export_dinov2(args.output_dir)
    export_clip(args.output_dir)
    write_model_version(args.output_dir)

    print("[Done] All models exported as FP32 ONNX.")
    print("[Info] INT8 quantization will happen at runtime based on platform.")


if __name__ == "__main__":
    main()
