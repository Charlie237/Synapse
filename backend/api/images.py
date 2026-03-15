"""Image CRUD endpoints."""
import logging
import os
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from db.queries import (
    get_images_paginated,
    get_image_by_id,
    soft_delete_image,
)
from db.database import get_connection

logger = logging.getLogger(__name__)

router = APIRouter()


class ScanRequest(BaseModel):
    folder_path: str


@router.post("/library/scan")
async def scan_folder(req: ScanRequest, request: Request):
    from core.pipeline import start_scan
    from core import settings

    data_dir = request.app.state.data_dir
    job_id = await start_scan(req.folder_path, data_dir)

    # Record folder
    folders = settings.get("scan_folders") or []
    if req.folder_path not in folders:
        folders.append(req.folder_path)
        settings.update({"scan_folders": folders})

    return {"job_id": job_id}


@router.post("/library/refresh-metadata")
async def refresh_metadata():
    """Re-read EXIF metadata (dates, GPS, location) for all images."""
    from PIL import Image
    from pillow_heif import register_heif_opener
    from core.pipeline import read_exif_metadata, reverse_geocode
    from db.queries import get_all_image_paths, update_image_metadata

    register_heif_opener()
    paths = get_all_image_paths()
    updated = 0
    for image_id, file_path in paths:
        try:
            img = Image.open(file_path)
            img.load()
            taken_at, lat, lon, camera_info = read_exif_metadata(img)
            loc_name = reverse_geocode(lat, lon) if lat is not None else None
            update_image_metadata(image_id, taken_at, lat, lon, loc_name, **camera_info)
            if lat is not None:
                updated += 1
        except Exception:
            continue
    return {"total": len(paths), "updated_gps": updated}


@router.get("/library/scan/status")
async def scan_status(job_id: int | None = None):
    from db.queries import get_scan_job

    job = get_scan_job(job_id)
    if not job:
        raise HTTPException(404, "No scan job found")
    return job


@router.get("/images/grouped")
async def list_images_grouped(group_by: str = "camera_model",
                              camera: str | None = None, lens: str | None = None,
                              location: str | None = None, focal_length: int | None = None,
                              limit_per_group: int = 20):
    """Return images grouped by a field, with filters applied."""
    valid_groups = {"camera_model", "lens_model", "location_name", "focal_length"}
    if group_by not in valid_groups:
        group_by = "camera_model"

    conn = get_connection()
    where = ["deleted_at IS NULL"]
    params: list = []
    if camera:
        where.append("camera_model = ?"); params.append(camera)
    if lens:
        where.append("lens_model = ?"); params.append(lens)
    if location:
        where.append("location_name = ?"); params.append(location)
    if focal_length is not None:
        where.append("CAST(focal_length AS INTEGER) = ?"); params.append(focal_length)

    col = f"CAST(focal_length AS INTEGER)" if group_by == "focal_length" else group_by
    where.append(f"{col} IS NOT NULL")
    where_sql = " AND ".join(where)

    # Get groups
    groups = conn.execute(
        f"SELECT {col} AS grp, COUNT(*) AS cnt FROM images WHERE {where_sql} GROUP BY grp ORDER BY cnt DESC LIMIT 50",
        params
    ).fetchall()

    result = []
    for g in groups:
        rows = conn.execute(
            f"SELECT * FROM images WHERE {where_sql} AND {col} = ? ORDER BY taken_at DESC LIMIT ?",
            params + [g[0], limit_per_group]
        ).fetchall()
        label = f"{g[0]}mm" if group_by == "focal_length" else str(g[0])
        result.append({"label": label, "count": g[1], "images": [dict(r) for r in rows]})

    return {"groups": result}


@router.get("/images/filters")
async def get_filter_options():
    """Return distinct values for filter dropdowns."""
    conn = get_connection()
    cameras = [r[0] for r in conn.execute(
        "SELECT DISTINCT camera_model FROM images WHERE deleted_at IS NULL AND camera_model IS NOT NULL ORDER BY camera_model"
    ).fetchall()]
    lenses = [r[0] for r in conn.execute(
        "SELECT DISTINCT lens_model FROM images WHERE deleted_at IS NULL AND lens_model IS NOT NULL ORDER BY lens_model"
    ).fetchall()]
    locations = [r[0] for r in conn.execute(
        "SELECT DISTINCT location_name FROM images WHERE deleted_at IS NULL AND location_name IS NOT NULL ORDER BY location_name"
    ).fetchall()]
    focal_lengths = [r[0] for r in conn.execute(
        "SELECT DISTINCT CAST(focal_length AS INTEGER) AS fl FROM images WHERE deleted_at IS NULL AND focal_length IS NOT NULL ORDER BY fl"
    ).fetchall()]
    return {"cameras": cameras, "lenses": lenses, "locations": locations, "focal_lengths": focal_lengths}


@router.get("/images")
async def list_images(page: int = 1, size: int = 50, sort_by: str = "created_at", sort_order: str = "desc",
                      camera: str | None = None, lens: str | None = None, location: str | None = None,
                      focal_length: str | None = None):
    result = get_images_paginated(page, size, sort_by, sort_order, camera=camera, lens=lens, location=location, focal_length=focal_length)
    return result


@router.get("/images/{image_id}")
async def get_image(image_id: int):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    return img


@router.get("/images/{image_id}/thumbnail")
async def get_thumbnail(image_id: int):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")

    thumb_path = img.get("thumbnail")
    if thumb_path and os.path.exists(thumb_path):
        return FileResponse(thumb_path, media_type="image/jpeg")

    if os.path.exists(img["file_path"]):
        return FileResponse(img["file_path"])

    raise HTTPException(404, "Image file not found")


@router.get("/images/{image_id}/original")
async def get_original(image_id: int):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")

    if os.path.exists(img["file_path"]):
        return FileResponse(img["file_path"])

    raise HTTPException(404, "Original image file not found")


def _cleanup_thumbnail(thumbnail_path: str | None) -> None:
    """Delete a thumbnail file from disk.

    Skips silently when the path is None/empty or the file doesn't exist.
    Logs a warning instead of raising if deletion fails.
    """
    if not thumbnail_path:
        return
    if not os.path.exists(thumbnail_path):
        return
    try:
        os.remove(thumbnail_path)
    except OSError:
        logger.warning("Failed to delete thumbnail: %s", thumbnail_path)


@router.delete("/images/{image_id}")
async def remove_image(image_id: int, request: Request):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    # Soft delete — move to trash
    soft_delete_image(image_id)
    return {"ok": True}
