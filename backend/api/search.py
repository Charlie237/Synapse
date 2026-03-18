"""Search endpoint."""
from fastapi import APIRouter, Request
from pydantic import BaseModel
from core import settings

router = APIRouter()

RATIOS = {"loose": 0.85, "normal": 0.92, "strict": 0.97}


class SearchRequest(BaseModel):
    query: str
    limit: int = 50
    mode: str = "normal"


@router.post("/search")
async def search(req: SearchRequest, request: Request):
    from core.query_parser import parse_local, parse_cloud, refresh_location_cache
    from db.queries import get_image_by_id
    from db.database import get_connection

    data_dir = request.app.state.data_dir

    # Parse query based on search mode setting
    search_mode = settings.get("search_mode")
    if search_mode == "cloud" and settings.get("openai_api_key"):
        parsed = parse_cloud(
            req.query,
            api_key=settings.get("openai_api_key"),
            base_url=settings.get("openai_base_url") or None,
            model=settings.get("openai_model") or "gpt-4o-mini",
        )
    else:
        parsed = parse_local(req.query)

    date_from = parsed["date_from"]
    date_to = parsed["date_to"]
    locations = parsed["locations"]
    visual = parsed["visual"]

    # Try CLIP semantic search if there's visual content
    clip_results = []
    if visual.strip():
        try:
            from core.models import get_clip_model
            from core.indexer import search_clip_index
            model = get_clip_model()
            text_features = model.encode_text(req.query)
            clip_results = search_clip_index(data_dir, text_features, req.limit * 3)
        except Exception:
            pass

    if clip_results:
        top_score = clip_results[0][1]
        min_score = top_score * RATIOS.get(req.mode, 0.92)

        search_results = []
        for image_id, score in clip_results:
            if score < min_score:
                break
            img = get_image_by_id(image_id)
            if not img or img.get("deleted_at"):
                continue
            if date_from or date_to:
                dv = (img.get("taken_at") or img.get("created_at") or "")[:7]
                if date_from and dv < date_from:
                    continue
                if date_to and dv > date_to:
                    continue
            if locations:
                loc = (img.get("location_name") or "").lower()
                if not any(l.lower() in loc for l in locations):
                    continue
            search_results.append({"image": img, "score": float(score)})
            if len(search_results) >= req.limit:
                break
        return {"results": search_results, "parsed": parsed}

    # Fallback: pure DB filter
    if date_from or date_to or locations:
        conn = get_connection()
        conds = ["deleted_at IS NULL"]
        params: list = []
        if date_from:
            conds.append("substr(COALESCE(taken_at, created_at), 1, 7) >= ?")
            params.append(date_from)
        if date_to:
            conds.append("substr(COALESCE(taken_at, created_at), 1, 7) <= ?")
            params.append(date_to)
        if locations:
            loc_conds = ["location_name LIKE ?" for _ in locations]
            conds.append(f"({' OR '.join(loc_conds)})")
            params.extend(f"%{l}%" for l in locations)
        sql = f"SELECT * FROM images WHERE {' AND '.join(conds)} ORDER BY COALESCE(taken_at, created_at) DESC LIMIT ?"
        params.append(req.limit)
        rows = conn.execute(sql, params).fetchall()
        return {"results": [{"image": dict(r), "score": 1.0} for r in rows], "parsed": parsed}

    return {"results": [], "parsed": parsed}
