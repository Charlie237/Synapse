"""Timeline & Stats API endpoints."""
from fastapi import APIRouter
from db.database import get_connection

router = APIRouter()


@router.get("/timeline")
async def get_timeline():
    """Group images by year-month, with location summary."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT
            substr(taken_at, 1, 7) AS month,
            COUNT(*) AS count,
            GROUP_CONCAT(DISTINCT location_name) AS locations
        FROM images
        WHERE deleted_at IS NULL AND taken_at IS NOT NULL
        GROUP BY month
        ORDER BY month DESC
    """).fetchall()
    return {"months": [{"month": r[0], "count": r[1], "locations": r[2] or ""} for r in rows]}


@router.get("/timeline/{month}")
async def get_timeline_month(month: str):
    """Get images for a specific year-month."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT * FROM images
        WHERE deleted_at IS NULL AND taken_at IS NOT NULL AND substr(taken_at, 1, 7) = ?
        ORDER BY taken_at DESC
    """, (month,)).fetchall()
    return {"images": [dict(r) for r in rows]}


@router.get("/stats")
async def get_stats(date_from: str | None = None, date_to: str | None = None):
    """Aggregate statistics for the dashboard."""
    conn = get_connection()
    date_filter = ""
    params: list = []
    if date_from:
        date_filter += " AND substr(COALESCE(taken_at, created_at), 1, 7) >= ?"
        params.append(date_from)
    if date_to:
        date_filter += " AND substr(COALESCE(taken_at, created_at), 1, 7) <= ?"
        params.append(date_to)

    r = conn.execute(f"""
        SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN is_favorite = 1 THEN 1 ELSE 0 END) AS favorites,
            COUNT(DISTINCT location_name) AS cities,
            MIN(COALESCE(taken_at, created_at)) AS earliest,
            MAX(COALESCE(taken_at, created_at)) AS latest,
            SUM(file_size) AS total_size
        FROM images WHERE deleted_at IS NULL{date_filter}
    """, params).fetchone()

    # Monthly distribution
    monthly = conn.execute(f"""
        SELECT substr(COALESCE(taken_at, created_at), 1, 7) AS month, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL{date_filter}
        GROUP BY month ORDER BY month
    """, params).fetchall()

    # Top locations
    top_locations = conn.execute(f"""
        SELECT location_name, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL AND location_name IS NOT NULL{date_filter}
        GROUP BY location_name ORDER BY count DESC LIMIT 10
    """, params).fetchall()

    # Hour distribution (shooting time)
    hours = conn.execute(f"""
        SELECT CAST(substr(taken_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL AND taken_at IS NOT NULL{date_filter}
        GROUP BY hour ORDER BY hour
    """, params).fetchall()

    # Camera stats
    top_cameras = conn.execute(f"""
        SELECT camera_model, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL AND camera_model IS NOT NULL{date_filter}
        GROUP BY camera_model ORDER BY count DESC LIMIT 10
    """, params).fetchall()

    top_lenses = conn.execute(f"""
        SELECT lens_model, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL AND lens_model IS NOT NULL{date_filter}
        GROUP BY lens_model ORDER BY count DESC LIMIT 10
    """, params).fetchall()

    focal_lengths = conn.execute(f"""
        SELECT CAST(focal_length AS INTEGER) AS fl, COUNT(*) AS count
        FROM images WHERE deleted_at IS NULL AND focal_length IS NOT NULL{date_filter}
        GROUP BY fl ORDER BY fl
    """, params).fetchall()

    return {
        "total": r[0],
        "favorites": r[1],
        "cities": r[2],
        "earliest": r[3],
        "latest": r[4],
        "total_size": r[5],
        "monthly": [{"month": m[0], "count": m[1]} for m in monthly],
        "top_locations": [{"name": l[0], "count": l[1]} for l in top_locations],
        "hours": [{"hour": h[0], "count": h[1]} for h in hours],
        "top_cameras": [{"name": c[0], "count": c[1]} for c in top_cameras],
        "top_lenses": [{"name": l[0], "count": l[1]} for l in top_lenses],
        "focal_lengths": [{"fl": f[0], "count": f[1]} for f in focal_lengths],
    }
