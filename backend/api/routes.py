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
_models_status = {
    "status": "not_loaded",  # not_loaded / need_download / downloading / loading / ready / error
    "models": {
        "dinov2": "pending",       # pending / loading / ready / error
        "clip_image": "pending",
        "clip_text": "pending",
    },
}
_data_dir_ref: str | None = None


def _load_models():
    """Load models (assumes files already exist)."""
    from core.models import init_models_dir, get_dino_model, get_clip_model

    init_models_dir(_data_dir_ref)

    _models_status["models"]["dinov2"] = "loading"
    get_dino_model()
    _models_status["models"]["dinov2"] = "ready"

    _models_status["models"]["clip_image"] = "loading"
    _models_status["models"]["clip_text"] = "loading"
    get_clip_model()
    _models_status["models"]["clip_image"] = "ready"
    _models_status["models"]["clip_text"] = "ready"

    _models_status["status"] = "ready"


def _preload_models(data_dir: str):
    """Check models, load if present, otherwise signal need_download."""
    global _data_dir_ref
    _data_dir_ref = data_dir
    try:
        from core.models import check_models_available

        if check_models_available(data_dir):
            _models_status["status"] = "loading"
            _load_models()
        else:
            _models_status["status"] = "need_download"
    except Exception as e:
        _models_status["status"] = "error"
        _models_status["error"] = str(e)
        for k, v in _models_status["models"].items():
            if v != "ready":
                _models_status["models"][k] = "error"
        import traceback
        traceback.print_exc()


def start_model_preload(data_dir: str):
    """Start background model preloading."""
    threading.Thread(target=_preload_models, args=(data_dir,), daemon=True).start()


@router.post("/models/download")
async def trigger_model_download():
    """User-triggered model download."""
    if _models_status["status"] not in ("need_download", "error"):
        return {"ok": False, "message": "Models already available or loading"}

    def _download_and_load():
        try:
            from core.models import download_models, get_models_dir
            _models_status["status"] = "downloading"
            models_dir = get_models_dir(_data_dir_ref)
            download_models(models_dir, _data_dir_ref)
            _models_status["status"] = "loading"
            _load_models()
        except Exception as e:
            _models_status["status"] = "error"
            _models_status["error"] = str(e)
            for k, v in _models_status["models"].items():
                if v != "ready":
                    _models_status["models"][k] = "error"
            import traceback
            traceback.print_exc()

    threading.Thread(target=_download_and_load, daemon=True).start()
    return {"ok": True}


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/models/status")
async def models_status():
    from core.models import get_download_progress
    result = dict(_models_status)
    result["models"] = dict(_models_status["models"])
    progress = get_download_progress()
    if progress["downloading"]:
        result["status"] = "downloading"
        result["download"] = progress
    return result
