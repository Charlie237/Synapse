"""Thumbnail generation."""
import hashlib
import os
from PIL import Image, ImageOps

THUMB_SIZE = (400, 400)


def generate_thumbnail(
    img: Image.Image, original_path: str, data_dir: str
) -> str:
    thumb_dir = os.path.join(data_dir, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)

    name_hash = hashlib.md5(original_path.encode()).hexdigest()
    thumb_path = os.path.join(thumb_dir, f"{name_hash}.jpg")

    if os.path.exists(thumb_path):
        return thumb_path

    thumb = ImageOps.exif_transpose(img)
    thumb.thumbnail(THUMB_SIZE, Image.LANCZOS)
    thumb.save(thumb_path, "JPEG", quality=85)

    return thumb_path
