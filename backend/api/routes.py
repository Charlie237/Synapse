"""API route registration."""
import threading
from fastapi import APIRouter

from api.images import router as images_router
from api.search import router as search_router
from api.duplicates import router as duplicates_router
from api.favorites import router as favorites_router
from api.albums import router as albums_router
from api.map import router as map_router
from api.similar import router as similar_router
from api.trash import router as trash_router
from api.settings import router as settings_router
from api.timeline import router as timeline_router
from api.review import router as review_router

router = APIRouter()

router.include_router(images_router)
router.include_router(search_router)
router.include_router(duplicates_router)
router.include_router(favorites_router)
router.include_router(albums_router)
router.include_router(map_router)
router.include_router(similar_router)
router.include_router(trash_router)
router.include_router(settings_router)
router.include_router(timeline_router)
router.include_router(review_router)

# Model loading state
_models_status = {"status": "not_loaded"}  # not_loaded / loading / ready / error


def _preload_models(data_dir: str):
    """Export ONNX (if needed) + load models."""
    _models_status["status"] = "loading"
    try:
        from core.models import init_models_dir, get_dino_model, get_clip_model

        # This exports ONNX on first launch, then is instant
        init_models_dir(data_dir)

        get_dino_model()
        get_clip_model()
        _models_status["status"] = "ready"
    except Exception as e:
        _models_status["status"] = "error"
        _models_status["error"] = str(e)
        import traceback
        traceback.print_exc()


def start_model_preload(data_dir: str):
    """Start background model preloading."""
    threading.Thread(target=_preload_models, args=(data_dir,), daemon=True).start()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/models/status")
async def models_status():
    return _models_status
