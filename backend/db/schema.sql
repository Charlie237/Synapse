CREATE TABLE IF NOT EXISTS images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path   TEXT UNIQUE NOT NULL,
    file_hash   TEXT NOT NULL,
    file_size   INTEGER,
    width       INTEGER,
    height      INTEGER,
    format      TEXT,
    taken_at    DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    thumbnail   TEXT,
    is_favorite INTEGER DEFAULT 0,
    latitude    REAL,
    longitude   REAL,
    location_name TEXT,
    deleted_at  DATETIME,
    camera_make TEXT,
    camera_model TEXT,
    lens_model  TEXT,
    focal_length REAL,
    aperture    REAL,
    iso         INTEGER
);

CREATE TABLE IF NOT EXISTS scan_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_path TEXT NOT NULL,
    status      TEXT DEFAULT 'running',
    total       INTEGER DEFAULT 0,
    processed   INTEGER DEFAULT 0,
    started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_images_hash ON images(file_hash);

CREATE TABLE IF NOT EXISTS albums (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS album_images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    album_id    INTEGER REFERENCES albums(id) ON DELETE CASCADE,
    image_id    INTEGER REFERENCES images(id) ON DELETE CASCADE,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(album_id, image_id)
);
