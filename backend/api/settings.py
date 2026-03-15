"""Settings API."""
from fastapi import APIRouter
from pydantic import BaseModel
from core import settings

router = APIRouter()


class SettingsUpdate(BaseModel):
    search_mode: str | None = None
    openai_api_key: str | None = None
    openai_base_url: str | None = None
    openai_model: str | None = None
    vision_api_key: str | None = None
    vision_base_url: str | None = None
    vision_model: str | None = None
    scan_folders: list[str] | None = None


@router.get("/settings")
async def get_settings():
    data = settings.get_all()
    key = data.get("openai_api_key", "")
    if key:
        data["openai_api_key_masked"] = key[:8] + "..." + key[-4:] if len(key) > 12 else "***"
    else:
        data["openai_api_key_masked"] = ""
    del data["openai_api_key"]  # never expose raw key
    vkey = data.get("vision_api_key", "")
    if vkey:
        data["vision_api_key_masked"] = vkey[:8] + "..." + vkey[-4:] if len(vkey) > 12 else "***"
    else:
        data["vision_api_key_masked"] = ""
    del data["vision_api_key"]
    return data


@router.put("/settings")
async def update_settings(req: SettingsUpdate):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    settings.update(updates)
    return {"ok": True}


class RemoveFolderRequest(BaseModel):
    folder: str


@router.post("/remove-folder")
async def remove_folder(req: RemoveFolderRequest):
    """Remove a folder and delete all its images, vectors, and thumbnails."""
    import os
    from db.database import get_connection
    from core.indexer import remove_from_clip_index, remove_from_dino_index

    folder = req.folder
    if not folder:
        return {"ok": False, "removed": 0}

    data_dir = os.path.expanduser("~/.synapse")
    conn = get_connection()

    rows = conn.execute(
        "SELECT id, thumbnail FROM images WHERE file_path LIKE ?",
        (folder + "%",),
    ).fetchall()

    for row in rows:
        image_id, thumb = row[0], row[1]
        remove_from_clip_index(data_dir, image_id)
        remove_from_dino_index(data_dir, image_id)
        if thumb and os.path.exists(thumb):
            try:
                os.remove(thumb)
            except OSError:
                pass

    conn.execute("DELETE FROM album_images WHERE image_id IN (SELECT id FROM images WHERE file_path LIKE ?)", (folder + "%",))
    conn.execute("DELETE FROM images WHERE file_path LIKE ?", (folder + "%",))
    conn.commit()

    # Update scan_folders setting
    folders = settings.get("scan_folders") or []
    if folder in folders:
        folders = [f for f in folders if f != folder]
        settings.update({"scan_folders": folders})

    return {"ok": True, "removed": len(rows)}


@router.post("/reset-library")
async def reset_library(request_obj=None):
    """Clear all images, indexes, and thumbnails."""
    import glob
    import os
    from fastapi import Request
    from db.database import get_connection

    conn = get_connection()
    conn.execute("DELETE FROM album_images")
    conn.execute("DELETE FROM albums")
    conn.execute("DELETE FROM images")
    conn.execute("DELETE FROM scan_jobs")
    conn.commit()

    # Clear indexes and thumbnails
    data_dir = os.path.expanduser("~/.synapse")
    for f in glob.glob(os.path.join(data_dir, "*.npz")):
        os.remove(f)
    thumb_dir = os.path.join(data_dir, "thumbnails")
    if os.path.isdir(thumb_dir):
        import shutil
        shutil.rmtree(thumb_dir)
        os.makedirs(thumb_dir)

    return {"ok": True}
