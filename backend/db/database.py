"""SQLite database connection management."""
import os
import sqlite3
import sys
import threading

_local = threading.local()
_db_path: str | None = None


def init_db(data_dir: str):
    global _db_path
    _db_path = os.path.join(data_dir, "gallery.db")

    conn = get_connection()
    base = getattr(sys, '_MEIPASS', os.path.dirname(__file__))
    schema_path = os.path.join(base, "db", "schema.sql") if hasattr(sys, '_MEIPASS') else os.path.join(base, "schema.sql")
    with open(schema_path) as f:
        conn.executescript(f.read())
    conn.commit()

    _run_migrations(conn)


def get_connection() -> sqlite3.Connection:
    if not hasattr(_local, "conn") or _local.conn is None:
        if _db_path is None:
            raise RuntimeError("Database not initialized. Call init_db first.")
        _local.conn = sqlite3.connect(_db_path)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA foreign_keys=ON")
    return _local.conn


def _run_migrations(conn: sqlite3.Connection):
    """Run schema migrations for existing databases."""
    columns = {row[1] for row in conn.execute("PRAGMA table_info(images)").fetchall()}
    if "is_favorite" not in columns:
        conn.execute("ALTER TABLE images ADD COLUMN is_favorite INTEGER DEFAULT 0")
        conn.commit()

    # Drop legacy tags table
    conn.execute("DROP TABLE IF EXISTS tags")
    conn.commit()

    # Add GPS columns
    if "latitude" not in columns:
        conn.execute("ALTER TABLE images ADD COLUMN latitude REAL")
        conn.execute("ALTER TABLE images ADD COLUMN longitude REAL")
        conn.commit()

    # Add soft delete column
    if "deleted_at" not in columns:
        conn.execute("ALTER TABLE images ADD COLUMN deleted_at DATETIME")
        conn.commit()

    # Add location name column
    if "location_name" not in columns:
        conn.execute("ALTER TABLE images ADD COLUMN location_name TEXT")
        conn.commit()

    # Add camera info columns
    if "camera_make" not in columns:
        for col in ["camera_make TEXT", "camera_model TEXT", "lens_model TEXT",
                     "focal_length REAL", "aperture REAL", "iso INTEGER"]:
            conn.execute(f"ALTER TABLE images ADD COLUMN {col}")
        conn.commit()

    # Add no_exif counter to scan_jobs
    sj_cols = {row[1] for row in conn.execute("PRAGMA table_info(scan_jobs)").fetchall()}
    if "no_exif" not in sj_cols:
        conn.execute("ALTER TABLE scan_jobs ADD COLUMN no_exif INTEGER DEFAULT 0")
        conn.commit()
