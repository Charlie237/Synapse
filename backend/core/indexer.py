"""Vector index management using numpy (exact search)."""
import logging
import os
import threading
import numpy as np

logger = logging.getLogger(__name__)

_lock = threading.Lock()

DINO_DIM = 768
CLIP_DIM = 512

# In-memory storage: {image_id: vector}
_dino_vectors: dict[int, np.ndarray] = {}
_clip_vectors: dict[int, np.ndarray] = {}
_dino_loaded = False
_clip_loaded = False


def _index_path(data_dir: str, name: str) -> str:
    return os.path.join(data_dir, f"{name}.npz")


def _load_index(data_dir: str, name: str) -> dict[int, np.ndarray]:
    path = _index_path(data_dir, name)
    if os.path.exists(path):
        data = np.load(path)
        ids = data["ids"]
        vectors = data["vectors"]
        return {int(ids[i]): vectors[i] for i in range(len(ids))}
    return {}


def _save_index(data_dir: str, name: str, store: dict[int, np.ndarray]):
    if not store:
        return
    path = _index_path(data_dir, name)
    ids = np.array(list(store.keys()), dtype=np.int64)
    vectors = np.array(list(store.values()), dtype=np.float32)
    np.savez(path, ids=ids, vectors=vectors)


def _get_dino(data_dir: str) -> dict[int, np.ndarray]:
    global _dino_vectors, _dino_loaded
    if not _dino_loaded:
        with _lock:
            if not _dino_loaded:
                _dino_vectors = _load_index(data_dir, "dino")
                _dino_loaded = True
    return _dino_vectors


def _get_clip(data_dir: str) -> dict[int, np.ndarray]:
    global _clip_vectors, _clip_loaded
    if not _clip_loaded:
        with _lock:
            if not _clip_loaded:
                _clip_vectors = _load_index(data_dir, "clip")
                _clip_loaded = True
    return _clip_vectors


def add_to_dino_index(data_dir: str, image_id: int, features: np.ndarray):
    store = _get_dino(data_dir)
    store[image_id] = features.flatten().astype(np.float32)
    _save_index(data_dir, "dino", store)


def add_to_clip_index(data_dir: str, image_id: int, features: np.ndarray):
    store = _get_clip(data_dir)
    store[image_id] = features.flatten().astype(np.float32)
    _save_index(data_dir, "clip", store)


def _remove_from_index(data_dir: str, name: str, store: dict[int, np.ndarray], image_id: int) -> bool:
    """Remove a vector from an in-memory index and re-save the NPZ file.

    Returns True if the image_id was present and removed, False otherwise.
    """
    if image_id not in store:
        return False
    del store[image_id]
    if store:
        _save_index(data_dir, name, store)
    else:
        # Store is empty — remove the NPZ file to stay consistent
        path = _index_path(data_dir, name)
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            logger.warning("Failed to remove empty index file %s", path)
    return True


def remove_from_dino_index(data_dir: str, image_id: int) -> bool:
    """Remove a vector from the DINO index. Returns True if actually removed."""
    return _remove_from_index(data_dir, "dino", _get_dino(data_dir), image_id)


def remove_from_clip_index(data_dir: str, image_id: int) -> bool:
    """Remove a vector from the CLIP index. Returns True if actually removed."""
    return _remove_from_index(data_dir, "clip", _get_clip(data_dir), image_id)


def _search(store: dict[int, np.ndarray], query_vec: np.ndarray, limit: int) -> list[tuple[int, float]]:
    if not store:
        return []
    ids = np.array(list(store.keys()), dtype=np.int64)
    matrix = np.array(list(store.values()), dtype=np.float32)
    query = query_vec.flatten().astype(np.float32)

    # Cosine similarity (vectors are already L2-normalized)
    scores = matrix @ query

    # Top-k
    k = min(limit, len(ids))
    top_indices = np.argpartition(scores, -k)[-k:]
    top_indices = top_indices[np.argsort(scores[top_indices])[::-1]]

    return [(int(ids[i]), float(scores[i])) for i in top_indices]


def search_clip_index(data_dir: str, query_vec: np.ndarray, limit: int = 50) -> list[tuple[int, float]]:
    return _search(_get_clip(data_dir), query_vec, limit)


def search_dino_index(data_dir: str, query_vec: np.ndarray, limit: int = 50) -> list[tuple[int, float]]:
    return _search(_get_dino(data_dir), query_vec, limit)


def find_duplicates(
    data_dir: str, image_ids: list[int], threshold: float = 0.80
) -> list[list[tuple[int, float]]]:
    """Find groups of near-duplicate images using DINOv2 features."""
    store = _get_dino(data_dir)
    if len(store) < 2:
        return []

    # Build matrix for batch computation
    valid_ids = [i for i in image_ids if i in store]
    if len(valid_ids) < 2:
        return []

    ids_arr = np.array(valid_ids, dtype=np.int64)
    matrix = np.array([store[i] for i in valid_ids], dtype=np.float32)

    # Full similarity matrix
    sim_matrix = matrix @ matrix.T

    seen = set()
    groups = []

    for idx, img_id in enumerate(valid_ids):
        if img_id in seen:
            continue

        # Find similar images (excluding self)
        group = []
        for j in range(len(valid_ids)):
            other_id = valid_ids[j]
            if other_id == img_id or other_id in seen:
                continue
            if sim_matrix[idx, j] >= threshold:
                group.append((other_id, float(sim_matrix[idx, j])))

        if group:
            seen.add(img_id)
            for cid, _ in group:
                seen.add(cid)
            group.insert(0, (img_id, -1))  # Query image, no score
            groups.append(group)

    return groups
