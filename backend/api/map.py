"""Map view endpoints."""
from fastapi import APIRouter
from db.database import get_connection

router = APIRouter()


@router.get("/map/images")
async def get_map_images():
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, latitude, longitude, thumbnail FROM images WHERE latitude IS NOT NULL AND longitude IS NOT NULL"
    ).fetchall()
    return {"images": [dict(r) for r in rows]}
