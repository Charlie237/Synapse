"""User settings stored in data_dir/settings.json."""
import json
import os

_settings_path: str | None = None
_cache: dict | None = None

DEFAULTS = {
    "search_mode": "local",  # "local" or "cloud"
    "openai_api_key": "",
    "openai_base_url": "",
    "openai_model": "gpt-4o-mini",
    "vision_api_key": "",
    "vision_base_url": "",
    "vision_model": "gpt-4o",
    "scan_folders": [],  # list of imported folder paths
    "model_mirror_url": "",  # custom model download URL, supports {version} and {arch}
}


def init_settings(data_dir: str):
    global _settings_path, _cache
    _settings_path = os.path.join(data_dir, "settings.json")
    _cache = None


def _load() -> dict:
    global _cache
    if _cache is not None:
        return _cache
    if _settings_path and os.path.exists(_settings_path):
        with open(_settings_path) as f:
            _cache = {**DEFAULTS, **json.load(f)}
    else:
        _cache = dict(DEFAULTS)
    return _cache


def get(key: str):
    return _load().get(key, DEFAULTS.get(key))


def get_all() -> dict:
    return dict(_load())


def update(data: dict):
    global _cache
    current = _load()
    current.update(data)
    _cache = current
    if _settings_path:
        with open(_settings_path, "w") as f:
            json.dump(current, f, indent=2)
