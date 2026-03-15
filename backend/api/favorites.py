"""Favorite endpoints."""
from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/images/{image_id}/favorite")
async def toggle_favorite(image_id: int):
    from db.queries import toggle_favorite, get_image_by_id

    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")
    new_state = toggle_favorite(image_id)
    return {"is_favorite": new_state}


@router.get("/favorites")
async def get_favorites():
    from db.queries import get_favorite_images

    images = get_favorite_images()
    return {"images": images}
