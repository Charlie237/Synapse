"""Similar images endpoint."""
from fastapi import APIRouter, HTTPException, Request
from core.indexer import search_dino_index, _get_dino
from db.queries import get_image_by_id

router = APIRouter()


@router.get("/images/{image_id}/similar")
async def get_similar_images(image_id: int, request: Request, limit: int = 12):
    img = get_image_by_id(image_id)
    if not img:
        raise HTTPException(404, "Image not found")

    data_dir = request.app.state.data_dir
    store = _get_dino(data_dir)
    if image_id not in store:
        return {"results": []}

    query_vec = store[image_id]
    results = search_dino_index(data_dir, query_vec, limit + 1)
    # Filter out the query image itself
    results = [(rid, score) for rid, score in results if rid != image_id and score >= 0.5][:limit]

    return {"results": [{"image_id": rid, "score": score} for rid, score in results]}
