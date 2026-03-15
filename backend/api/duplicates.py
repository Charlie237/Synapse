"""Duplicate detection endpoints."""
import logging
from fastapi import APIRouter, Request
from pydantic import BaseModel

from core.indexer import find_duplicates
from db.queries import get_image_by_id, get_all_image_ids, soft_delete_image

logger = logging.getLogger(__name__)

router = APIRouter()


class ResolveRequest(BaseModel):
    keep_id: int
    delete_ids: list[int]


@router.get("/duplicates")
async def get_duplicates(request: Request):
    data_dir = request.app.state.data_dir
    image_ids = get_all_image_ids()
    groups = find_duplicates(data_dir, image_ids)

    result = []
    for group_idx, group in enumerate(groups):
        images = []
        for image_id, similarity in group:
            img = get_image_by_id(image_id)
            if img:
                img["similarity"] = float(similarity)
                images.append(img)
        if len(images) > 1:
            result.append({"id": group_idx, "images": images})

    return {"groups": result}


@router.post("/duplicates/resolve")
async def resolve_duplicates(req: ResolveRequest):
    for img_id in req.delete_ids:
        soft_delete_image(img_id)
    return {"ok": True}
