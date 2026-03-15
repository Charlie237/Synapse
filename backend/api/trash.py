"""Trash (recycle bin) endpoints."""
from fastapi import APIRouter, Request, HTTPException
from core.indexer import remove_from_dino_index, remove_from_clip_index
from api.images import _cleanup_thumbnail
from db.queries import (
    get_trashed_images,
    get_image_by_id,
    restore_image,
    permanently_delete_trashed,
    delete_image,
)

router = APIRouter()


@router.get("/trash")
async def list_trash():
    return {"images": get_trashed_images()}


@router.post("/trash/{image_id}/restore")
async def restore(image_id: int):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    restore_image(image_id)
    return {"ok": True}


@router.delete("/trash/{image_id}")
async def permanently_delete_one(image_id: int, request: Request):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    data_dir = request.app.state.data_dir
    remove_from_dino_index(data_dir, image_id)
    remove_from_clip_index(data_dir, image_id)
    _cleanup_thumbnail(img.get("thumbnail"))
    delete_image(image_id)
    return {"ok": True}


@router.delete("/trash")
async def empty_trash(request: Request):
    data_dir = request.app.state.data_dir
    items = permanently_delete_trashed()
    for img in items:
        remove_from_dino_index(data_dir, img["id"])
        remove_from_clip_index(data_dir, img["id"])
        _cleanup_thumbnail(img.get("thumbnail"))
    return {"ok": True, "count": len(items)}
