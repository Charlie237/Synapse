"""Unit tests for remove_from_dino_index and remove_from_clip_index."""
import os
import numpy as np
import pytest

import core.indexer as indexer


@pytest.fixture(autouse=True)
def _reset_indexer_state():
    """Reset the module-level in-memory state before each test."""
    indexer._dino_vectors.clear()
    indexer._clip_vectors.clear()
    indexer._dino_loaded = False
    indexer._clip_loaded = False
    yield
    indexer._dino_vectors.clear()
    indexer._clip_vectors.clear()
    indexer._dino_loaded = False
    indexer._clip_loaded = False


@pytest.fixture
def data_dir(tmp_path):
    return str(tmp_path)


def _random_vector(dim: int) -> np.ndarray:
    v = np.random.randn(dim).astype(np.float32)
    return v / np.linalg.norm(v)


class TestRemoveFromDinoIndex:
    def test_remove_existing_entry(self, data_dir):
        vec = _random_vector(indexer.DINO_DIM)
        indexer.add_to_dino_index(data_dir, 1, vec)
        assert indexer.remove_from_dino_index(data_dir, 1) is True
        store = indexer._get_dino(data_dir)
        assert 1 not in store

    def test_remove_nonexistent_returns_false(self, data_dir):
        """Silently skip when image_id doesn't exist (Req 1.4)."""
        assert indexer.remove_from_dino_index(data_dir, 999) is False

    def test_other_entries_unchanged(self, data_dir):
        vec1 = _random_vector(indexer.DINO_DIM)
        vec2 = _random_vector(indexer.DINO_DIM)
        indexer.add_to_dino_index(data_dir, 1, vec1)
        indexer.add_to_dino_index(data_dir, 2, vec2)

        indexer.remove_from_dino_index(data_dir, 1)

        store = indexer._get_dino(data_dir)
        assert 1 not in store
        assert 2 in store
        np.testing.assert_array_almost_equal(store[2], vec2.flatten())

    def test_npz_persisted_after_remove(self, data_dir):
        """NPZ file is re-saved after removal (Req 1.3)."""
        vec1 = _random_vector(indexer.DINO_DIM)
        vec2 = _random_vector(indexer.DINO_DIM)
        indexer.add_to_dino_index(data_dir, 10, vec1)
        indexer.add_to_dino_index(data_dir, 20, vec2)

        indexer.remove_from_dino_index(data_dir, 10)

        # Reload from disk
        loaded = indexer._load_index(data_dir, "dino")
        assert 10 not in loaded
        assert 20 in loaded

    def test_npz_removed_when_empty(self, data_dir):
        vec = _random_vector(indexer.DINO_DIM)
        indexer.add_to_dino_index(data_dir, 1, vec)
        npz_path = indexer._index_path(data_dir, "dino")
        assert os.path.exists(npz_path)

        indexer.remove_from_dino_index(data_dir, 1)
        assert not os.path.exists(npz_path)


class TestRemoveFromClipIndex:
    def test_remove_existing_entry(self, data_dir):
        vec = _random_vector(indexer.CLIP_DIM)
        indexer.add_to_clip_index(data_dir, 1, vec)
        assert indexer.remove_from_clip_index(data_dir, 1) is True
        store = indexer._get_clip(data_dir)
        assert 1 not in store

    def test_remove_nonexistent_returns_false(self, data_dir):
        assert indexer.remove_from_clip_index(data_dir, 999) is False

    def test_other_entries_unchanged(self, data_dir):
        vec1 = _random_vector(indexer.CLIP_DIM)
        vec2 = _random_vector(indexer.CLIP_DIM)
        indexer.add_to_clip_index(data_dir, 1, vec1)
        indexer.add_to_clip_index(data_dir, 2, vec2)

        indexer.remove_from_clip_index(data_dir, 1)

        store = indexer._get_clip(data_dir)
        assert 1 not in store
        assert 2 in store
        np.testing.assert_array_almost_equal(store[2], vec2.flatten())

    def test_npz_persisted_after_remove(self, data_dir):
        vec1 = _random_vector(indexer.CLIP_DIM)
        vec2 = _random_vector(indexer.CLIP_DIM)
        indexer.add_to_clip_index(data_dir, 10, vec1)
        indexer.add_to_clip_index(data_dir, 20, vec2)

        indexer.remove_from_clip_index(data_dir, 10)

        loaded = indexer._load_index(data_dir, "clip")
        assert 10 not in loaded
        assert 20 in loaded
