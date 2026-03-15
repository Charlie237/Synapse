"""Image import processing pipeline.

Two-phase approach:
  Phase 1 (fast): hash dedup → EXIF → thumbnail → SQLite  (user sees images immediately)
  Phase 2 (background): DINOv2 + CLIP inference → FAISS index → auto-tags
"""
import asyncio
import hashlib
import os
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from PIL import Image
from pillow_heif import register_heif_opener

register_heif_opener()

from core.thumbnails import generate_thumbnail
from db.queries import (
    create_scan_job,
    update_scan_job,
    insert_image,
    image_exists_by_hash,
    image_exists_by_path,
    get_all_image_ids,
    get_image_by_id,
)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff", ".tif", ".heic", ".heif"}
_executor = ThreadPoolExecutor(max_workers=2)
_indexing_lock = threading.Lock()


def compute_sha256(file_path: str) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _rational_to_float(val) -> float:
    """Convert EXIF rational value to float. Handles IFDRational, tuple (num, den), and plain numbers."""
    if isinstance(val, tuple) and len(val) == 2:
        return float(val[0]) / float(val[1]) if val[1] else 0.0
    return float(val)


def _dms_to_decimal(dms, ref: str) -> float | None:
    """Convert EXIF GPS DMS (degrees, minutes, seconds) to decimal degrees."""
    try:
        d = _rational_to_float(dms[0])
        m = _rational_to_float(dms[1])
        s = _rational_to_float(dms[2])
        decimal = d + m / 60.0 + s / 3600.0
        if ref in ("S", "W"):
            decimal = -decimal
        return decimal
    except Exception:
        return None


def read_exif_metadata(image: Image.Image) -> tuple[str | None, float | None, float | None, dict]:
    """Extract date, GPS, and camera info from EXIF. Returns (date_iso, lat, lon, camera_info)."""
    date_str = None
    lat = None
    lon = None
    camera_info: dict = {}
    try:
        exif = image.getexif()
        if not exif:
            return None, None, None, {}
        from PIL.ExifTags import IFD
        exif_ifd = exif.get_ifd(IFD.Exif)

        # Date
        raw_date = exif_ifd.get(36867) if exif_ifd else None
        if not raw_date:
            raw_date = exif.get(306)
        if raw_date:
            date_str = datetime.strptime(raw_date, "%Y:%m:%d %H:%M:%S").isoformat()

        # Camera info from root IFD
        make = (exif.get(271) or "").strip()   # Make
        model = (exif.get(272) or "").strip()   # Model
        if make:
            camera_info["camera_make"] = make
        if model:
            camera_info["camera_model"] = model

        # Lens & shooting params from ExifIFD
        if exif_ifd:
            lens = (exif_ifd.get(42036) or "").strip()  # LensModel
            if lens:
                camera_info["lens_model"] = lens
            fl = exif_ifd.get(37386)  # FocalLength
            if fl:
                camera_info["focal_length"] = round(float(_rational_to_float(fl)), 1)
            ap = exif_ifd.get(33437)  # FNumber
            if ap:
                camera_info["aperture"] = round(float(_rational_to_float(ap)), 1)
            iso = exif_ifd.get(34855)  # ISOSpeedRatings
            if iso:
                camera_info["iso"] = int(iso)

        # GPS
        gps_info = exif.get_ifd(IFD.GPSInfo)
        if not gps_info:
            raw_gps = exif.get(34853)
            if isinstance(raw_gps, dict):
                gps_info = raw_gps
        if gps_info:
            lat_dms = gps_info.get(2)
            lat_ref = gps_info.get(1, "N")
            lon_dms = gps_info.get(4)
            lon_ref = gps_info.get(3, "E")
            if lat_dms and lon_dms:
                lat = _dms_to_decimal(lat_dms, lat_ref)
                lon = _dms_to_decimal(lon_dms, lon_ref)
                if lat is not None and lon is not None:
                    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                        lat, lon = None, None
    except Exception:
        pass
    return date_str, lat, lon, camera_info


# --- Reverse geocoding ---
import reverse_geocoder as _rg

_ADMIN1_ZH = {
    "Beijing": "北京", "Shanghai": "上海", "Tianjin": "天津", "Chongqing": "重庆",
    "Guangdong": "广东", "Zhejiang": "浙江", "Jiangsu": "江苏", "Shandong": "山东",
    "Henan": "河南", "Sichuan": "四川", "Hubei": "湖北", "Hunan": "湖南",
    "Fujian": "福建", "Anhui": "安徽", "Hebei": "河北", "Shaanxi": "陕西",
    "Jiangxi": "江西", "Liaoning": "辽宁", "Yunnan": "云南", "Guangxi": "广西",
    "Shanxi": "山西", "Guizhou": "贵州", "Gansu": "甘肃", "Heilongjiang": "黑龙江",
    "Jilin": "吉林", "Inner Mongolia": "内蒙古", "Xinjiang": "新疆", "Tibet": "西藏",
    "Hainan": "海南", "Ningxia": "宁夏", "Qinghai": "青海",
    "Hong Kong": "香港", "Macau": "澳门", "Taiwan": "台湾",
}


def reverse_geocode(lat: float, lon: float) -> str:
    """Convert GPS coordinates to a human-readable location name."""
    try:
        r = _rg.search([(lat, lon)])[0]
        city, admin1, cc = r["name"], r["admin1"], r["cc"]
        if cc == "CN":
            province = _ADMIN1_ZH.get(admin1, admin1)
            if admin1 in ("Beijing", "Shanghai", "Tianjin", "Chongqing"):
                return province
            city_zh = _CITY_ZH.get(city, city)
            return f"{province}{city_zh}"
        return f"{city}, {admin1}, {cc}"
    except Exception:
        return f"{lat:.4f}, {lon:.4f}"


def discover_images(folder_path: str) -> list[str]:
    files = []
    for root, _, filenames in os.walk(folder_path):
        for name in filenames:
            ext = os.path.splitext(name)[1].lower()
            if ext in IMAGE_EXTENSIONS:
                files.append(os.path.join(root, name))
    return sorted(files)


def import_image_fast(file_path: str, data_dir: str) -> int | None:
    """Phase 1: fast import - hash, EXIF, thumbnail, SQLite. No AI models."""
    if image_exists_by_path(file_path):
        return None

    file_hash = compute_sha256(file_path)
    if image_exists_by_hash(file_hash):
        return None

    # If same file is in trash, restore it instead of re-importing
    from db.queries import find_trashed_by_hash, restore_image
    trashed_id = find_trashed_by_hash(file_hash)
    if trashed_id:
        restore_image(trashed_id)
        return trashed_id

    try:
        img = Image.open(file_path)
        img.load()
    except Exception:
        return None

    taken_at, lat, lon, camera_info = read_exif_metadata(img)
    loc_name = reverse_geocode(lat, lon) if lat is not None else None

    if img.mode != "RGB":
        img = img.convert("RGB")

    width, height = img.size
    file_size = os.path.getsize(file_path)
    fmt = img.format or os.path.splitext(file_path)[1].lstrip(".").lower()
    thumb_path = generate_thumbnail(img, file_path, data_dir)

    image_id = insert_image(
        file_path=file_path,
        file_hash=file_hash,
        file_size=file_size,
        width=width,
        height=height,
        fmt=fmt,
        taken_at=taken_at,
        thumbnail=thumb_path,
        latitude=lat,
        longitude=lon,
        location_name=loc_name,
        **camera_info,
    )

    return image_id


def index_single_image(image_id: int, file_path: str, data_dir: str):
    """Phase 2: AI indexing for one image - DINOv2 + CLIP + auto-tag."""
    try:
        img = Image.open(file_path)
        img.load()
        if img.mode != "RGB":
            img = img.convert("RGB")
    except Exception:
        return

    try:
        from core.models import get_dino_model, get_clip_model
        from core.indexer import add_to_dino_index, add_to_clip_index

        dino = get_dino_model()
        dino_features = dino.encode_image(img)
        add_to_dino_index(data_dir, image_id, dino_features)

        clip = get_clip_model()
        clip_features = clip.encode_image(img)
        add_to_clip_index(data_dir, image_id, clip_features)
    except Exception:
        traceback.print_exc()


async def start_scan(folder_path: str, data_dir: str) -> int:
    """Start scanning a folder. Returns job_id."""
    job_id = create_scan_job(folder_path)

    files = discover_images(folder_path)
    update_scan_job(job_id, total=len(files))

    # Run fast import in background thread
    asyncio.get_event_loop().run_in_executor(
        _executor, _run_scan, job_id, files, data_dir
    )

    return job_id


def _run_scan(job_id: int, files: list[str], data_dir: str):
    """Phase 1: fast import all files, then Phase 2: AI indexing."""
    imported_ids: list[tuple[int, str]] = []

    # --- Phase 1: fast import (no AI) ---
    for i, file_path in enumerate(files):
        try:
            image_id = import_image_fast(file_path, data_dir)
            if image_id is not None:
                imported_ids.append((image_id, file_path))
        except Exception:
            traceback.print_exc()

        update_scan_job(job_id, processed=i + 1)

    update_scan_job(
        job_id, status="completed", finished_at=datetime.now().isoformat()
    )

    # Refresh location cache after import
    from core.query_parser import refresh_location_cache
    refresh_location_cache()

    # --- Phase 2: AI indexing in background ---
    # Include both new images AND existing images missing vectors
    all_to_index = list(imported_ids)  # new images
    _add_missing_vectors(files, all_to_index, data_dir)

    if all_to_index:
        threading.Thread(
            target=_run_indexing,
            args=(all_to_index, data_dir),
            daemon=True,
        ).start()


def _add_missing_vectors(files: list[str], items: list[tuple[int, str]], data_dir: str):
    """Find existing images that are missing CLIP/DINO vectors and add them to the index list."""
    from core.indexer import _get_clip, _get_dino
    from db.queries import get_image_by_id

    clip_store = _get_clip(data_dir)
    dino_store = _get_dino(data_dir)
    already = {img_id for img_id, _ in items}

    all_ids = get_all_image_ids()
    for img_id in all_ids:
        if img_id in already:
            continue
        if img_id not in clip_store or img_id not in dino_store:
            img = get_image_by_id(img_id)
            if img and os.path.exists(img["file_path"]):
                items.append((img_id, img["file_path"]))


def _run_indexing(items: list[tuple[int, str]], data_dir: str):
    """Background AI indexing - runs after fast import completes."""
    with _indexing_lock:
        print(f"[Indexing] Starting AI indexing for {len(items)} images...", flush=True)
        for i, (image_id, file_path) in enumerate(items):
            try:
                index_single_image(image_id, file_path, data_dir)
                if (i + 1) % 10 == 0 or i == 0:
                    print(f"[Indexing] {i + 1}/{len(items)} done", flush=True)
            except Exception:
                traceback.print_exc()
        print(f"[Indexing] Complete. {len(items)} images indexed.", flush=True)
