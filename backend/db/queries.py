"""Database query helpers."""
import math
import os
from db.database import get_connection


def insert_image(
    file_path: str,
    file_hash: str,
    file_size: int,
    width: int,
    height: int,
    fmt: str,
    taken_at: str | None,
    thumbnail: str | None,
    created_at: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    location_name: str | None = None,
    camera_make: str | None = None,
    camera_model: str | None = None,
    lens_model: str | None = None,
    focal_length: float | None = None,
    aperture: float | None = None,
    iso: int | None = None,
) -> int:
    conn = get_connection()
    cursor = conn.execute(
        """INSERT INTO images (file_path, file_hash, file_size, width, height, format, taken_at, thumbnail,
           created_at, latitude, longitude, location_name, camera_make, camera_model, lens_model, focal_length, aperture, iso)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (file_path, file_hash, file_size, width, height, fmt, taken_at, thumbnail,
         created_at, latitude, longitude, location_name, camera_make, camera_model, lens_model, focal_length, aperture, iso),
    )
    conn.commit()
    return cursor.lastrowid


def image_exists_by_hash(file_hash: str) -> bool:
    """Check if hash exists AND the file still exists on disk (excluding trashed)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, file_path FROM images WHERE file_hash = ? AND deleted_at IS NULL", (file_hash,)
    ).fetchall()
    for row in rows:
        if os.path.exists(row[1]):
            return True
    return False


def find_trashed_by_hash(file_hash: str) -> int | None:
    """Return id of a trashed image with this hash, or None."""
    conn = get_connection()
    row = conn.execute(
        "SELECT id FROM images WHERE file_hash = ? AND deleted_at IS NOT NULL LIMIT 1", (file_hash,)
    ).fetchone()
    return row[0] if row else None


def image_exists_by_path(file_path: str) -> bool:
    conn = get_connection()
    row = conn.execute(
        "SELECT 1 FROM images WHERE file_path = ? AND deleted_at IS NULL", (file_path,)
    ).fetchone()
    return row is not None


def update_image_metadata(image_id: int, taken_at: str | None, latitude: float | None, longitude: float | None,
                          location_name: str | None = None, camera_make: str | None = None,
                          camera_model: str | None = None, lens_model: str | None = None,
                          focal_length: float | None = None, aperture: float | None = None, iso: int | None = None):
    conn = get_connection()
    conn.execute(
        """UPDATE images SET taken_at = COALESCE(?, taken_at), latitude = ?, longitude = ?, location_name = ?,
           camera_make = COALESCE(?, camera_make), camera_model = COALESCE(?, camera_model),
           lens_model = COALESCE(?, lens_model), focal_length = COALESCE(?, focal_length),
           aperture = COALESCE(?, aperture), iso = COALESCE(?, iso) WHERE id = ?""",
        (taken_at, latitude, longitude, location_name, camera_make, camera_model,
         lens_model, focal_length, aperture, iso, image_id),
    )
    conn.commit()


def get_all_image_paths() -> list[tuple[int, str]]:
    conn = get_connection()
    return conn.execute("SELECT id, file_path FROM images WHERE deleted_at IS NULL").fetchall()


def get_images_paginated(page: int = 1, size: int = 50, sort_by: str = "created_at", sort_order: str = "desc",
                         camera: str | None = None, lens: str | None = None, location: str | None = None,
                         focal_length: str | None = None) -> dict:
    conn = get_connection()
    where = ["deleted_at IS NULL"]
    params: list = []

    def _add_multi(col: str, val: str | None):
        if not val:
            return
        vals = [v.strip() for v in val.split(",") if v.strip()]
        if len(vals) == 1:
            where.append(f"{col} = ?")
            params.append(vals[0])
        elif vals:
            where.append(f"{col} IN ({','.join('?' * len(vals))})")
            params.extend(vals)

    _add_multi("camera_model", camera)
    _add_multi("lens_model", lens)
    _add_multi("location_name", location)
    if focal_length:
        fls = [v.strip() for v in focal_length.split(",") if v.strip()]
        if len(fls) == 1:
            where.append("CAST(focal_length AS INTEGER) = ?")
            params.append(int(fls[0]))
        elif fls:
            where.append(f"CAST(focal_length AS INTEGER) IN ({','.join('?' * len(fls))})")
            params.extend(int(v) for v in fls)

    where_sql = " AND ".join(where)
    total = conn.execute(f"SELECT COUNT(*) FROM images WHERE {where_sql}", params).fetchone()[0]
    pages = max(1, math.ceil(total / size))
    offset = (page - 1) * size

    valid_sort_by = {"created_at", "taken_at", "file_size", "file_path"}
    if sort_by not in valid_sort_by:
        sort_by = "created_at"
    if sort_order not in ("asc", "desc"):
        sort_order = "desc"

    if sort_by == "taken_at":
        order_clause = f"CASE WHEN taken_at IS NULL THEN 1 ELSE 0 END, taken_at {sort_order}"
    else:
        order_clause = f"{sort_by} {sort_order}"

    rows = conn.execute(
        f"SELECT * FROM images WHERE {where_sql} ORDER BY {order_clause} LIMIT ? OFFSET ?",
        params + [size, offset],
    ).fetchall()

    return {"images": [dict(row) for row in rows], "total": total, "page": page, "pages": pages}


def get_image_by_id(image_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM images WHERE id = ?", (image_id,)).fetchone()
    return dict(row) if row else None


def get_all_image_ids() -> list[int]:
    conn = get_connection()
    rows = conn.execute("SELECT id FROM images WHERE deleted_at IS NULL ORDER BY id").fetchall()
    return [r[0] for r in rows]


def delete_image(image_id: int):
    """Permanently delete an image."""
    conn = get_connection()
    conn.execute("DELETE FROM images WHERE id = ?", (image_id,))
    conn.commit()


def soft_delete_image(image_id: int):
    """Move image to trash (soft delete)."""
    conn = get_connection()
    conn.execute("UPDATE images SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", (image_id,))
    conn.commit()


def restore_image(image_id: int):
    """Restore image from trash."""
    conn = get_connection()
    conn.execute("UPDATE images SET deleted_at = NULL WHERE id = ?", (image_id,))
    conn.commit()


def get_trashed_images() -> list[dict]:
    conn = get_connection()
    rows = conn.execute("SELECT * FROM images WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC").fetchall()
    return [dict(r) for r in rows]


def permanently_delete_trashed():
    """Permanently delete all trashed images. Returns list of dicts for cleanup."""
    conn = get_connection()
    rows = conn.execute("SELECT * FROM images WHERE deleted_at IS NOT NULL").fetchall()
    items = [dict(r) for r in rows]
    conn.execute("DELETE FROM images WHERE deleted_at IS NOT NULL")
    conn.commit()
    return items


# Favorite queries
def toggle_favorite(image_id: int) -> int:
    conn = get_connection()
    row = conn.execute(
        "SELECT is_favorite FROM images WHERE id = ?", (image_id,)
    ).fetchone()
    new_state = 0 if row[0] else 1
    conn.execute(
        "UPDATE images SET is_favorite = ? WHERE id = ?", (new_state, image_id)
    )
    conn.commit()
    return new_state


def get_favorite_images() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM images WHERE is_favorite = 1 AND deleted_at IS NULL ORDER BY created_at DESC"
    ).fetchall()
    return [dict(r) for r in rows]


# Album queries
def create_album(name: str) -> int:
    conn = get_connection()
    cursor = conn.execute("INSERT INTO albums (name) VALUES (?)", (name,))
    conn.commit()
    return cursor.lastrowid


def get_albums() -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT a.id, a.name, a.created_at,
                  COUNT(ai.id) as image_count,
                  (SELECT i.thumbnail FROM album_images ai2
                   JOIN images i ON i.id = ai2.image_id
                   WHERE ai2.album_id = a.id
                   ORDER BY ai2.added_at DESC LIMIT 1) as cover_thumbnail
           FROM albums a
           LEFT JOIN album_images ai ON ai.album_id = a.id
           GROUP BY a.id
           ORDER BY a.created_at DESC"""
    ).fetchall()
    return [dict(r) for r in rows]


def get_album_by_id(album_id: int) -> dict | None:
    conn = get_connection()
    row = conn.execute("SELECT * FROM albums WHERE id = ?", (album_id,)).fetchone()
    return dict(row) if row else None


def rename_album(album_id: int, name: str):
    conn = get_connection()
    conn.execute("UPDATE albums SET name = ? WHERE id = ?", (name, album_id))
    conn.commit()


def delete_album(album_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM albums WHERE id = ?", (album_id,))
    conn.commit()


def add_images_to_album(album_id: int, image_ids: list[int]):
    conn = get_connection()
    conn.executemany(
        "INSERT OR IGNORE INTO album_images (album_id, image_id) VALUES (?, ?)",
        [(album_id, img_id) for img_id in image_ids],
    )
    conn.commit()


def remove_images_from_album(album_id: int, image_ids: list[int]):
    conn = get_connection()
    placeholders = ",".join("?" * len(image_ids))
    conn.execute(
        f"DELETE FROM album_images WHERE album_id = ? AND image_id IN ({placeholders})",
        [album_id] + image_ids,
    )
    conn.commit()


def get_album_images(album_id: int) -> list[dict]:
    conn = get_connection()
    rows = conn.execute(
        """SELECT i.* FROM images i
           JOIN album_images ai ON ai.image_id = i.id
           WHERE ai.album_id = ?
           ORDER BY ai.added_at DESC""",
        (album_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# Scan job queries
def create_scan_job(folder_path: str) -> int:
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO scan_jobs (folder_path) VALUES (?)", (folder_path,)
    )
    conn.commit()
    return cursor.lastrowid


def update_scan_job(job_id: int, **kwargs):
    conn = get_connection()
    sets = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [job_id]
    conn.execute(f"UPDATE scan_jobs SET {sets} WHERE id = ?", values)
    conn.commit()


def get_scan_job(job_id: int | None = None) -> dict | None:
    conn = get_connection()
    if job_id:
        row = conn.execute(
            "SELECT * FROM scan_jobs WHERE id = ?", (job_id,)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM scan_jobs ORDER BY id DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None
